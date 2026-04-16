#!/usr/bin/env node
/**
 * MarketPilot Scale Test
 * Paginates Gabriel's full OF21 catalog, runs concurrent P11 competitor scans,
 * measures timing at every stage, and saves results to _bmad-output/catalog_scan.json
 *
 * Usage: node scripts/scale_test.js
 * Requires: .env with WORTEN_API_KEY and WORTEN_BASE_URL
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.resolve(__dirname, '..')

// ─── Load .env ───────────────────────────────────────────────────────────────

function loadEnv() {
  const envPath = path.join(PROJECT_ROOT, '.env')
  if (!fs.existsSync(envPath)) {
    console.error('ERROR: .env file not found at', envPath)
    process.exit(1)
  }
  const lines = fs.readFileSync(envPath, 'utf8').split('\n')
  const env = {}
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const idx = trimmed.indexOf('=')
    if (idx === -1) continue
    const key = trimmed.slice(0, idx).trim()
    const value = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '')
    env[key] = value
  }
  return env
}

const ENV = loadEnv()
const API_KEY = ENV.WORTEN_API_KEY
const BASE_URL = ENV.WORTEN_BASE_URL

if (!API_KEY || !BASE_URL) {
  console.error('ERROR: WORTEN_API_KEY and WORTEN_BASE_URL must be set in .env')
  process.exit(1)
}

const HEADERS = { Authorization: API_KEY }
const OUTPUT_DIR = path.join(PROJECT_ROOT, '_bmad-output')
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'catalog_scan.json')

// ─── HTTP helper ─────────────────────────────────────────────────────────────

async function apiGet(endpoint, params = {}) {
  const url = new URL(BASE_URL + endpoint)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)

  let lastError
  for (let attempt = 1; attempt <= 2; attempt++) {
    const res = await fetch(url.toString(), { headers: HEADERS })
    if (res.ok) return res.json()
    if (res.status >= 500 && attempt === 1) {
      lastError = new Error(`HTTP ${res.status} on ${url}`)
      await new Promise(r => setTimeout(r, 1000))
      continue
    }
    throw new Error(`HTTP ${res.status} on ${url}: ${await res.text()}`)
  }
  throw lastError
}

// ─── Phase 1: OF21 — paginate full catalog ───────────────────────────────────

async function fetchCatalog() {
  console.log('\n[OF21] Starting catalog pagination...')
  const t0 = Date.now()
  const allOffers = []
  let offset = 0
  const pageSize = 100
  let totalCount = null
  let page = 0

  while (true) {
    page++
    const data = await apiGet('/api/offers', { max: pageSize, offset })

    if (!data.offers) {
      console.error('[OF21] Unexpected schema — no .offers array. Sample:', JSON.stringify(data).slice(0, 500))
      process.exit(1)
    }

    if (totalCount === null && data.total_count != null) {
      totalCount = data.total_count
      console.log(`[OF21] Total offers in catalog: ${totalCount.toLocaleString()}`)
    }

    allOffers.push(...data.offers)

    const pct = totalCount ? Math.round((allOffers.length / totalCount) * 100) : '?'
    process.stdout.write(`\r[OF21] Page ${page} | fetched ${allOffers.length.toLocaleString()} / ${totalCount?.toLocaleString() ?? '?'} (${pct}%)  `)

    if (data.offers.length < pageSize) break
    offset += pageSize
  }

  const t1 = Date.now()
  const elapsed = ((t1 - t0) / 1000).toFixed(1)
  console.log(`\n[OF21] Done — ${allOffers.length.toLocaleString()} offers in ${elapsed}s`)

  return { offers: allOffers, t0, t1 }
}

// ─── Extract EAN from offer ───────────────────────────────────────────────────

function extractEan(offer) {
  if (!offer.product_references || offer.product_references.length === 0) return null
  const ref = offer.product_references.find(r => r.reference_type === 'EAN')
  return ref?.reference ?? null
}

function extractPrice(offer) {
  // Use applicable_pricing if available, else first all_prices entry
  if (offer.applicable_pricing?.price != null) return offer.applicable_pricing.price
  if (offer.all_prices?.length > 0) return offer.all_prices[0].price
  return null
}

// ─── Phase 2: P11 — concurrent competitor price scan ────────────────────────

async function runP11ScanMapped(catalogEntries) {
  const eans = catalogEntries.map(e => e.ean)
  const batches = []
  for (let i = 0; i < eans.length; i += 100) {
    batches.push(eans.slice(i, i + 100))
  }

  console.log(`\n[P11] ${eans.length.toLocaleString()} EANs → ${batches.length} batches of ≤100`)
  console.log(`[P11] Running with 10 concurrent calls...`)

  const t0 = Date.now()
  const p11Results = {}  // keyed by EAN
  let p11ErrorCount = 0
  let batchesDone = 0
  const CONCURRENCY = 10

  for (let i = 0; i < batches.length; i += CONCURRENCY) {
    const chunk = batches.slice(i, i + CONCURRENCY)

    const results = await Promise.allSettled(
      chunk.map(async (batchEans) => {
        const refs = batchEans.map(e => `EAN|${e}`).join(',')
        const data = await apiGet('/api/products/offers', {
          product_references: refs,
          all_offers: 'true',
        })
        // Map products back to EANs
        // P11 returns products in an array; each product maps to a requested EAN.
        // The products[] order does NOT necessarily match input order.
        // We match via product's offers which contain the product_id/sku.
        // However, the most reliable field is to check offer.product_references if present,
        // OR we can use the fact that Worten's product_sku = EAN or EZ{EAN}.
        // Empirically from RESEARCH.md: shop_sku = EZ{EAN}, but product_sku (Mirakl internal) != EAN.
        //
        // BEST APPROACH: For each product returned, iterate its offers and find any
        // offer whose shop_sku starts with 'EZ' — extract the EAN from that.
        // Gabriel's offers have shop_sku = EZ{EAN}.
        // BUT: competitor offers may use different shop_sku formats.
        //
        // FALLBACK: Since we only requested specific EANs, and P11 typically returns
        // one product per EAN, and batchEans.length matches the returned products count
        // in the common case, we map by iterating products and checking which EAN
        // from the batch this product's sku relates to.
        //
        // PRAGMATIC: Send each product back with its batchEans context and
        // resolve by the product_references field that P11 should include.

        return { products: data.products ?? [], batchEans }
      })
    )

    for (let j = 0; j < results.length; j++) {
      batchesDone++

      if (results[j].status === 'rejected') {
        p11ErrorCount++
        const batchEansForLog = chunk[j]
        console.error(`\n[P11] Batch ${batchesDone} ERROR: ${results[j].reason?.message}`)
        console.error(`  EANs: ${batchEansForLog.slice(0, 5).join(', ')}${batchEansForLog.length > 5 ? ` ... (+${batchEansForLog.length - 5} more)` : ''}`)
        continue
      }

      const { products, batchEans } = results[j].value

      for (const product of products) {
        // Find the matching EAN from the batch for this product
        const ean = resolveEanForProduct(product, batchEans)
        if (!ean) continue

        const activeOffers = (product.offers ?? []).filter(o => o.active === true)

        p11Results[ean] = {
          active_competitors: activeOffers.length,
          first_price: activeOffers[0]?.total_price ?? null,
          second_price: activeOffers[1]?.total_price ?? null,
          first_shop: activeOffers[0]?.shop_name ?? null,
        }
      }
    }

    const pct = Math.round((batchesDone / batches.length) * 100)
    process.stdout.write(`\r[P11] ${batchesDone}/${batches.length} batches (${pct}%) | errors: ${p11ErrorCount}  `)
  }

  const t1 = Date.now()
  const elapsed = ((t1 - t0) / 1000).toFixed(1)
  const withCompetitors = Object.values(p11Results).filter(r => r.active_competitors > 0).length
  console.log(`\n[P11] Done — ${Object.keys(p11Results).length.toLocaleString()} products have P11 data (${withCompetitors.toLocaleString()} with active competitors) in ${elapsed}s | errors: ${p11ErrorCount}`)

  return { p11Results, p11ErrorCount, batchCount: batches.length, t0, t1 }
}

// ─── Resolve which EAN a P11 product corresponds to ─────────────────────────

function resolveEanForProduct(product, batchEans) {
  // Strategy 1 (primary): product.product_references has the EAN directly on the product node
  const productRefs = product.product_references ?? []
  const eanRef = productRefs.find(r => r.reference_type === 'EAN')
  if (eanRef && batchEans.includes(eanRef.reference)) return eanRef.reference

  // Strategy 2: product_sku matches an EAN (some Mirakl instances use EAN as product_sku)
  if (product.product_sku && batchEans.includes(product.product_sku)) {
    return product.product_sku
  }

  // Strategy 3: single-EAN batch — unambiguous
  if (batchEans.length === 1) return batchEans[0]

  return null  // Cannot resolve — product will be skipped
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const runStart = Date.now()
  console.log('═══════════════════════════════════════════════════════')
  console.log('  MarketPilot Scale Test')
  console.log(`  Base URL: ${BASE_URL}`)
  console.log(`  Started:  ${new Date().toISOString()}`)
  console.log('═══════════════════════════════════════════════════════')

  // Phase 1: OF21
  const { offers, t0: of21t0, t1: of21t1 } = await fetchCatalog()

  // Extract & filter catalog entries
  let noEanCount = 0
  const catalogEntries = []

  for (const offer of offers) {
    const ean = extractEan(offer)
    if (!ean) {
      noEanCount++
      continue
    }
    const price = extractPrice(offer)
    catalogEntries.push({
      shop_sku: offer.shop_sku,
      ean,
      current_price: price,
      active: offer.active ?? false,
      product_title: offer.product_title ?? offer.shop_sku,
    })
  }

  console.log(`\n[Catalog] ${offers.length.toLocaleString()} total offers | ${catalogEntries.length.toLocaleString()} with EAN | ${noEanCount} skipped (no EAN)`)

  // Phase 2: P11
  const { p11Results, p11ErrorCount, batchCount, t0: p11t0, t1: p11t1 } = await runP11ScanMapped(catalogEntries)

  // Build output
  const runEnd = Date.now()
  const of21Sec = ((of21t1 - of21t0) / 1000).toFixed(1)
  const p11Sec = ((p11t1 - p11t0) / 1000).toFixed(1)
  const totalSec = ((runEnd - runStart) / 1000).toFixed(1)

  const summary = {
    total_products: offers.length,
    eans_found: catalogEntries.length,
    no_ean_count: noEanCount,
    p11_calls_made: batchCount,
    p11_error_count: p11ErrorCount,
    products_with_p11_data: Object.keys(p11Results).length,
    products_with_active_competitors: Object.values(p11Results).filter(r => r.active_competitors > 0).length,
    of21_time_sec: parseFloat(of21Sec),
    p11_time_sec: parseFloat(p11Sec),
    total_time_sec: parseFloat(totalSec),
    run_at: new Date().toISOString(),
  }

  const output = {
    summary,
    timing: {
      of21_start: new Date(of21t0).toISOString(),
      of21_end: new Date(of21t1).toISOString(),
      p11_start: new Date(p11t0).toISOString(),
      p11_end: new Date(p11t1).toISOString(),
      run_end: new Date(runEnd).toISOString(),
    },
    offers: catalogEntries,
    p11_results: p11Results,
  }

  // Write JSON
  fs.mkdirSync(OUTPUT_DIR, { recursive: true })
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2))

  // Print summary
  console.log('\n╔═══════════════════════════════════════════════════════╗')
  console.log('║  SCALE TEST RESULTS                                   ║')
  console.log('╠═══════════════════════════════════════════════════════╣')
  console.log(`║  Total products (OF21):     ${String(summary.total_products.toLocaleString()).padStart(10)}                ║`)
  console.log(`║  EANs found:                ${String(summary.eans_found.toLocaleString()).padStart(10)}                ║`)
  console.log(`║  Skipped (no EAN):          ${String(summary.no_ean_count.toLocaleString()).padStart(10)}                ║`)
  console.log(`║  P11 batches (100 EAN/ea):  ${String(summary.p11_calls_made.toLocaleString()).padStart(10)}                ║`)
  console.log(`║  P11 errors:                ${String(summary.p11_error_count.toLocaleString()).padStart(10)}                ║`)
  console.log(`║  Products with competitors: ${String(summary.products_with_active_competitors.toLocaleString()).padStart(10)}                ║`)
  console.log('╠═══════════════════════════════════════════════════════╣')
  console.log(`║  OF21 phase:          ${String(of21Sec + 's').padStart(8)}                          ║`)
  console.log(`║  P11 phase:           ${String(p11Sec + 's').padStart(8)}                          ║`)
  console.log(`║  Total elapsed:       ${String(totalSec + 's').padStart(8)}                          ║`)
  console.log(`║  15-min window:           ${totalSec <= 900 ? '✅ FITS' : '❌ OVER 15 MIN'}                      ║`)
  console.log('╚═══════════════════════════════════════════════════════╝')
  console.log(`\nOutput saved to: _bmad-output/catalog_scan.json`)
  console.log('Run opportunity_report.js next to generate the report.\n')
}

main().catch(err => {
  console.error('\nFATAL:', err.message)
  process.exit(1)
})
