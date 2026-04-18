#!/usr/bin/env node
/**
 * MCP Alignment Probe — read-only
 *
 * Confirms MCP-documented field names against the live Worten Mirakl instance.
 * Hits OF21 (1 small page) and P11 (a handful of EANs from that page).
 * GET only. No writes anywhere. Safe to run.
 *
 * Usage: node scripts/mcp-probe.js
 * Requires: .env with WORTEN_API_KEY and WORTEN_BASE_URL
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.resolve(__dirname, '..')

function loadEnv() {
  const envPath = path.join(PROJECT_ROOT, '.env')
  if (!fs.existsSync(envPath)) {
    console.error('ERROR: .env file not found at', envPath)
    process.exit(1)
  }
  const env = {}
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i === -1) continue
    env[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^["']|["']$/g, '')
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

async function get(endpoint, params) {
  const url = new URL(endpoint, BASE_URL)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  const res = await fetch(url, { headers: HEADERS })
  if (!res.ok) throw new Error(`${endpoint} → HTTP ${res.status} ${res.statusText}`)
  return res.json()
}

function keysOf(obj) {
  return Object.keys(obj).sort().join(', ')
}

function checkFields(obj, label, fields) {
  console.log(`\n[${label}] field presence:`)
  for (const f of fields) {
    let cur = obj
    for (const p of f.split('.')) cur = cur?.[p]
    const present = cur !== undefined
    let type = 'MISSING'
    if (present) {
      if (Array.isArray(cur)) type = `array (len=${cur.length})`
      else if (cur === null) type = 'null'
      else type = typeof cur
    }
    console.log(`  ${present ? '✓' : '✗'} ${f.padEnd(34)} ${type}`)
  }
}

console.log(`\n═══ MCP Alignment Probe ═══`)
console.log(`BASE_URL: ${BASE_URL}`)
console.log(`API_KEY:  ${API_KEY.slice(0, 8)}...${API_KEY.slice(-4)} (len=${API_KEY.length})`)

// ─── OF21 ────────────────────────────────────────────────────────────────────
console.log(`\n━━━ OF21 — GET /api/offers?max=5&offset=0 ━━━`)
const of21 = await get('/api/offers', { max: 5, offset: 0 })

console.log(`response top-level keys: ${keysOf(of21)}`)
console.log(`total_count:             ${of21.total_count}`)
console.log(`offers returned:         ${of21.offers?.length ?? 0}`)

const of21Offer = of21.offers?.[0]
if (!of21Offer) {
  console.log('No OF21 offers returned — cannot continue P11 probe.')
  process.exit(0)
}

console.log(`\nFirst OF21 offer — all keys:\n  ${keysOf(of21Offer)}`)

checkFields(of21Offer, 'OF21 offer', [
  'active',              // MCP claims: boolean, required
  'state',               // not documented in MCP — does it exist?
  'state_code',          // alt
  'product_references',  // MCP claims: used for EAN
  'applicable_pricing',
  'applicable_pricing.price',
  'shop_sku',
  'product_title',
  'channels',            // does OF21 have channel info?
  'channel_code',
])

// Show one product_references entry structure if present
if (of21Offer.product_references?.length) {
  console.log(`\nproduct_references[0]:`, JSON.stringify(of21Offer.product_references[0]))
}

// Extract EANs for P11 probe
const eans = []
for (const o of of21.offers) {
  const ean = o.product_references?.find(r => r.reference_type === 'EAN')?.reference
  if (ean) eans.push(ean)
}
console.log(`\nEANs extracted from OF21 page: ${eans.length > 0 ? eans.slice(0, 3).join(', ') : '(none)'}`)

// ─── P11 ─────────────────────────────────────────────────────────────────────
if (eans.length === 0) {
  console.log('\nNo EANs found — skipping P11 probe.')
  process.exit(0)
}

// Show product_sku from the OF21 offers to understand catalog structure
console.log(`\nSample OF21 offers — (shop_sku, product_sku, EAN):`)
for (const o of of21.offers.slice(0, 3)) {
  const ean = o.product_references?.find(r => r.reference_type === 'EAN')?.reference ?? '(none)'
  console.log(`  shop_sku=${o.shop_sku}  product_sku=${o.product_sku}  EAN=${ean}`)
}

// ── P11 attempt A: product_ids with plain EANs (what BAD's code does) ───────
console.log(`\n━━━ P11-A — product_ids=<plain EANs> (BAD's current approach) ━━━`)
const p11A = await get('/api/products/offers', {
  product_ids: eans.slice(0, 3).join(','),
  channel_codes: 'WRT_PT_ONLINE,WRT_ES_ONLINE',
})
console.log(`  products returned: ${p11A.products?.length ?? 0}`)

// ── P11 attempt B: product_references with EAN|xxx format (scale_test.js) ──
console.log(`\n━━━ P11-B — product_references=EAN|xxx,EAN|yyy (scale_test.js approach) ━━━`)
const p11B = await get('/api/products/offers', {
  product_references: eans.slice(0, 3).map(e => `EAN|${e}`).join(','),
  channel_codes: 'WRT_PT_ONLINE,WRT_ES_ONLINE',
})
console.log(`  products returned: ${p11B.products?.length ?? 0}`)

// ── P11 attempt C: product_ids with product_sku values from OF21 ───────────
const productSkus = of21.offers.slice(0, 3).map(o => o.product_sku).filter(Boolean)
console.log(`\n━━━ P11-C — product_ids=<product_sku values from OF21> ━━━`)
const p11C = await get('/api/products/offers', {
  product_ids: productSkus.join(','),
  channel_codes: 'WRT_PT_ONLINE,WRT_ES_ONLINE',
})
console.log(`  products returned: ${p11C.products?.length ?? 0}`)

// Pick the first successful attempt for field inspection
const p11 = [p11B, p11C, p11A].find(r => (r.products?.length ?? 0) > 0) ?? p11A
console.log(`\n(Inspecting response with products — attempt that returned data)`)
console.log(`response top-level keys:     ${keysOf(p11)}`)
console.log(`products returned:           ${p11.products?.length ?? 0}`)

const p11Product = p11.products?.[0]
if (!p11Product) {
  console.log('No P11 products returned — check channel_codes or EANs.')
  process.exit(0)
}

console.log(`\nFirst P11 product — all keys:\n  ${keysOf(p11Product)}`)
console.log(`product.total_count (offers per product): ${p11Product.total_count}`)
console.log(`product.offers returned:                  ${p11Product.offers?.length ?? 0}`)

const p11Offer = p11Product.offers?.[0]
if (!p11Offer) {
  console.log('\nNo offers for first product — try different EANs. Skipping offer field check.')
  process.exit(0)
}

console.log(`\nFirst P11 product.offers[0] — all keys:\n  ${keysOf(p11Offer)}`)

checkFields(p11Offer, 'P11 offer', [
  'active',            // MCP claims: boolean, required
  'state',             // not documented — does it exist?
  'state_code',        // "Offer condition" in MCP
  'channels',          // MCP claims: array, required
  'channel_code',      // singular — does this exist?
  'total_price',       // MCP claims: price + shipping
  'price',             // alt (price only, no shipping)
  'all_prices',        // MCP: array with channel_code on each entry
  'applicable_pricing',
  'shop_name',
  'shop_id',
])

// If channels exists, show it
if (p11Offer.channels !== undefined) {
  console.log(`\nchannels (if array):`, JSON.stringify(p11Offer.channels))
}

// If all_prices[0] exists, show its channel_code
if (p11Offer.all_prices?.[0]?.channel_code !== undefined) {
  console.log(`all_prices[0].channel_code: ${JSON.stringify(p11Offer.all_prices[0].channel_code)}`)
}

console.log(`\nFirst P11 offer JSON (first 3000 chars):`)
console.log(JSON.stringify(p11Offer, null, 2).slice(0, 3000))

console.log(`\n═══ Probe complete ═══\n`)
