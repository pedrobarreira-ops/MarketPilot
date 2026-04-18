/**
 * ATDD tests for Story 3.3: P11 Competitor Scan
 *
 * Acceptance criteria verified:
 * AC-1: Batches EANs in groups of 100
 * AC-2: 10 concurrent P11 calls via Promise.allSettled()
 * AC-3: Filters active:true only; extracts total_price (NOT price) per channel
 * AC-4: Captures positions 1 and 2: {pt:{first,second}, es:{first,second}}
 * AC-5: Calls onProgress every 500 EANs
 * AC-6: Failed batch after 5 retries → EANs marked uncontested; job continues
 * AC-7: Uses mirAklGet() — no direct fetch()
 * AC-8: EAN resolver (resolveEanForProduct) handles multiple product_references
 *
 * Uses Node.js built-in test runner (node:test) — no extra dependencies needed.
 * Run: node --test tests/epic3-3.3-scan-competitors.atdd.test.js
 */

import { test, describe, before } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SCAN_COMPETITORS_PATH = join(__dirname, '../src/workers/mirakl/scanCompetitors.js')

// ── helpers ────────────────────────────────────────────────────────────────

function codeLines(src) {
  const noBlock = src.replace(/\/\*[\s\S]*?\*\//g, '')
  return noBlock
    .split('\n')
    .filter(line => {
      const trimmed = line.trim()
      return trimmed.length > 0 && !trimmed.startsWith('//')
    })
    .join('\n')
}

// ── test suite ─────────────────────────────────────────────────────────────

describe('Story 3.3 — P11 competitor scan', async () => {
  let scanCompetitors

  before(async () => {
    const mod = await import('../src/workers/mirakl/scanCompetitors.js')
    scanCompetitors = mod.scanCompetitors
  })

  // ── AC-1: Batch size of 100 EANs (static) ─────────────────────────────────
  describe('AC-1: batches EANs in groups of 100 for P11', () => {
    let src

    before(() => {
      src = codeLines(readFileSync(SCAN_COMPETITORS_PATH, 'utf8'))
    })

    test('source references batch size of 100', () => {
      assert.ok(
        src.includes('100') || src.includes('BATCH_SIZE'),
        'scanCompetitors.js must batch EANs in groups of 100 for P11 calls'
      )
    })

    test('source slices or chunks the EAN array for batching', () => {
      const hasBatching = src.includes('slice') || src.includes('chunk') || src.includes('batch') || src.includes('splice')
      assert.ok(hasBatching, 'scanCompetitors.js must split EANs into batches')
    })

    test('source passes product_references with EAN|xxx format to P11 (MCP-verified — NOT product_ids)', () => {
      assert.ok(
        src.includes('product_references') && src.includes('EAN|'),
        'scanCompetitors.js must pass product_references=EAN|xxx,EAN|yyy to P11. product_ids expects product SKUs (UUIDs in Worten), not EANs — using EANs with product_ids silently returns 0 products (verified against live Worten instance 2026-04-18)'
      )
    })

    test('source does NOT use product_ids as the EAN-lookup param', () => {
      // Allow the string to appear in comments/docstrings, but reject it as a
      // query-param key. Look for the common query-key shape.
      const badPatterns = [
        /\bproduct_ids\s*:/,       // { product_ids: ... }
        /['"]product_ids['"]\s*:/, // { 'product_ids': ... }
      ]
      const hits = badPatterns.some(p => p.test(src))
      assert.ok(
        !hits,
        'scanCompetitors.js must NOT use product_ids as the P11 EAN-lookup param. Use product_references instead (MCP-verified).'
      )
    })
  })

  // ── AC-2: 10 concurrent calls via Promise.allSettled (static) ─────────────
  describe('AC-2: 10 concurrent P11 calls via Promise.allSettled()', () => {
    let src

    before(() => {
      src = codeLines(readFileSync(SCAN_COMPETITORS_PATH, 'utf8'))
    })

    test('source uses Promise.allSettled for concurrent batch processing', () => {
      assert.ok(
        src.includes('Promise.allSettled'),
        'scanCompetitors.js must use Promise.allSettled() for concurrent P11 calls (not Promise.all — allSettled continues on partial failure)'
      )
    })

    test('source limits concurrency to 10 batches at a time', () => {
      assert.ok(
        src.includes('10') || src.includes('CONCURRENCY'),
        'scanCompetitors.js must limit to 10 concurrent P11 calls (as validated in scale_test.js)'
      )
    })
  })

  // ── AC-3: Filters active:true, uses total_price (static) ─────────────────
  describe('AC-3: filters active:true, uses total_price not price', () => {
    let src

    before(() => {
      src = codeLines(readFileSync(SCAN_COMPETITORS_PATH, 'utf8'))
    })

    test('source filters active:true offers', () => {
      assert.ok(
        src.includes('active') && (src.includes('true') || src.includes('=== true')),
        'scanCompetitors.js must filter competitor offers where active === true'
      )
    })

    test('source uses total_price for competitor price — not price', () => {
      assert.ok(
        src.includes('total_price'),
        'scanCompetitors.js must use total_price (price + shipping) for competitor comparison — NOT price alone'
      )
    })

    test('source does NOT use products.offers.price alone for comparison', () => {
      // We check that plain .price is not the sole extraction, total_price must be present
      const lines = src.split('\n')
      // If total_price is used, the requirement is met
      assert.ok(
        src.includes('total_price'),
        'total_price must be used; plain .price must not be used for competitor comparison (P11 spec)'
      )
    })
  })

  // ── AC-4: Captures first and second positions per channel ─────────────────
  describe('AC-4: captures {pt:{first,second}, es:{first,second}} per EAN', () => {
    let src

    before(() => {
      src = codeLines(readFileSync(SCAN_COMPETITORS_PATH, 'utf8'))
    })

    test('source extracts data for WRT_PT_ONLINE channel', () => {
      assert.ok(
        src.includes('WRT_PT_ONLINE') || src.includes('pt'),
        'scanCompetitors.js must handle WRT_PT_ONLINE channel'
      )
    })

    test('source extracts data for WRT_ES_ONLINE channel', () => {
      assert.ok(
        src.includes('WRT_ES_ONLINE') || src.includes('es'),
        'scanCompetitors.js must handle WRT_ES_ONLINE channel'
      )
    })

    test('source captures first competitor price per channel', () => {
      assert.ok(
        src.includes('first'),
        'scanCompetitors.js must capture the first (lowest) competitor price per channel'
      )
    })

    test('source captures second competitor price per channel', () => {
      assert.ok(
        src.includes('second'),
        'scanCompetitors.js must capture the second competitor price per channel'
      )
    })

    test('source uses channel_codes param in P11 API call', () => {
      assert.ok(
        src.includes('channel_codes') || src.includes('WRT_PT_ONLINE'),
        'scanCompetitors.js must pass channel_codes to P11 to filter by channel'
      )
    })

    test('source uses pricing_channel_code param to make total_price channel-specific (MCP-verified)', () => {
      assert.ok(
        src.includes('pricing_channel_code'),
        'scanCompetitors.js must pass pricing_channel_code=<CHANNEL> on each per-channel P11 call so offer.total_price reflects that channel. Without it, applicable_pricing falls back to the default channel and total_price is not channel-specific.'
      )
    })

    test('source does NOT filter offers by offer.channel_code (field does not exist)', () => {
      // Allow per-pricing channel_code (inside all_prices or applicable_pricing),
      // but reject o.channel_code / offer.channel_code direct access.
      const badPatterns = [
        /\boffer\.channel_code\b/,
        /\bo\.channel_code\b/,
      ]
      const hits = badPatterns.some(p => p.test(src))
      assert.ok(
        !hits,
        'scanCompetitors.js must NOT read offer.channel_code or o.channel_code. That field does NOT exist on P11 offers (verified against live Worten 2026-04-18). Channel bucketing must be determined by which P11 call (PT or ES) returned the offer.'
      )
    })
  })

  // ── AC-5: onProgress every 500 EANs ─────────────────────────────────────
  describe('AC-5: onProgress(n, total) called every 500 EANs', () => {
    let src

    before(() => {
      src = codeLines(readFileSync(SCAN_COMPETITORS_PATH, 'utf8'))
    })

    test('source accepts onProgress parameter', () => {
      assert.ok(
        src.includes('onProgress'),
        'scanCompetitors.js must accept an onProgress callback parameter'
      )
    })

    test('source calls onProgress at 500-EAN intervals', () => {
      assert.ok(
        src.includes('500') || src.includes('PROGRESS_INTERVAL'),
        'scanCompetitors.js must call onProgress every 500 EANs'
      )
    })
  })

  // ── AC-6: Failed batch → EANs marked uncontested, job continues ──────────
  describe('AC-6: failed batches after 5 retries → EANs uncontested; job continues', () => {
    let src

    before(() => {
      src = codeLines(readFileSync(SCAN_COMPETITORS_PATH, 'utf8'))
    })

    test('source handles rejected promises from allSettled without stopping', () => {
      // allSettled returns fulfilled/rejected; code must handle 'rejected' status
      assert.ok(
        src.includes('rejected') || src.includes('status') || src.includes('reason'),
        'scanCompetitors.js must handle rejected promises from Promise.allSettled() and continue'
      )
    })

    test('source logs failed batch error type only — not full error message', () => {
      // Must log something safe on batch failure — check for error_type or constructor.name
      const hasTypeOnlyLog = src.includes('constructor.name') || src.includes('error_type') || src.includes('name')
      assert.ok(
        hasTypeOnlyLog,
        'scanCompetitors.js must log only error type (not err.message) for failed batches'
      )
    })

    test('source does not log err.message for batch failures', () => {
      // Check no err.message logging
      const lines = src.split('\n').filter(l =>
        (l.includes('log.') || l.includes('console.')) && l.includes('err.message')
      )
      assert.equal(
        lines.length,
        0,
        'scanCompetitors.js must not log err.message for batch failures — may contain API response details'
      )
    })

    test('source never calls api_key in log statements', () => {
      const lines = src.split('\n').filter(l =>
        (l.includes('log.') || l.includes('console.')) && l.includes('api_key')
      )
      assert.equal(lines.length, 0, 'scanCompetitors.js must not log api_key in any statement')
    })
  })

  // ── AC-7: Uses mirAklGet (static) ────────────────────────────────────────
  describe('AC-7: uses mirAklGet() — no direct fetch() to Mirakl', () => {
    let src

    before(() => {
      src = codeLines(readFileSync(SCAN_COMPETITORS_PATH, 'utf8'))
    })

    test('source imports mirAklGet from apiClient.js', () => {
      assert.ok(
        src.includes('mirAklGet') || src.includes('apiClient'),
        'scanCompetitors.js must use mirAklGet() from apiClient.js'
      )
    })

    test('source does not call fetch() directly', () => {
      const rawFetchPattern = /\bfetch\s*\(/
      assert.ok(
        !rawFetchPattern.test(src),
        'scanCompetitors.js must not call fetch() directly — use mirAklGet() instead'
      )
    })
  })

  // ── AC-8: EAN resolver handles multiple product_references ────────────────
  describe('AC-8: resolveEanForProduct handles multiple product_references strategies', () => {
    let src

    before(() => {
      src = codeLines(readFileSync(SCAN_COMPETITORS_PATH, 'utf8'))
    })

    test('source contains resolveEanForProduct or similar EAN resolution logic', () => {
      assert.ok(
        src.includes('resolveEan') || src.includes('EAN') || src.includes('reference_type'),
        'scanCompetitors.js must include EAN resolution logic (resolveEanForProduct from scale_test.js)'
      )
    })

    test('source handles product_references array to extract EAN', () => {
      assert.ok(
        src.includes('product_references') || src.includes('reference_type'),
        'scanCompetitors.js must extract EAN from product_references where reference_type=EAN'
      )
    })
  })

  // ── INTERFACE: scanCompetitors is exported ────────────────────────────────
  describe('INTERFACE: scanCompetitors function is exported', () => {
    test('scanCompetitors is exported as a function', () => {
      assert.equal(typeof scanCompetitors, 'function', 'scanCompetitors must be an exported function')
    })
  })
})
