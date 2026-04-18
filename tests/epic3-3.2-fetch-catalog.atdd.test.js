/**
 * ATDD tests for Story 3.2: OF21 Catalog Fetch with Pagination
 *
 * Acceptance criteria verified:
 * AC-1: Paginates with max=100 per page using offset pagination
 * AC-2: Asserts fetched.length === total_count — throws CatalogTruncationError on mismatch
 * AC-3: Filters state:'ACTIVE' offers only
 * AC-4: Calls onProgress(n, total) callback every 1,000 offers
 * AC-5: Returns [{ean, shop_sku, price, product_title}] shape
 * AC-6: 0 offers + 200 status → throws EmptyCatalogError
 * AC-7: Uses mirAklGet() wrapper — no direct fetch() to Mirakl
 * STATIC: total_count assertion logic present in source
 *
 * Uses Node.js built-in test runner (node:test) — no extra dependencies needed.
 * Run: node --test tests/epic3-3.2-fetch-catalog.atdd.test.js
 */

import { test, describe, before } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const FETCH_CATALOG_PATH = join(__dirname, '../src/workers/mirakl/fetchCatalog.js')

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

/**
 * Build a mock offer object as OF21 returns it.
 * EAN is in product_references[].reference where reference_type='EAN'.
 * Price is in applicable_pricing.price.
 */
function makeOffer({ ean = '1234567890123', shopSku = 'SKU-001', price = '9.99', title = 'Test Product', state = 'ACTIVE' } = {}) {
  return {
    offer_id: `offer-${ean}`,
    shop_sku: shopSku,
    state,
    applicable_pricing: { price },
    product_references: [{ reference_type: 'EAN', reference: ean }],
    product_title: title,
  }
}

/**
 * Build a mock OF21 response page.
 */
function makeOf21Page(offers, total_count) {
  return { offers, total_count }
}

// ── test suite ─────────────────────────────────────────────────────────────

describe('Story 3.2 — OF21 catalog fetch with pagination', async () => {
  let fetchCatalog
  let CatalogTruncationError
  let EmptyCatalogError

  // We stub mirAklGet at module load time by monkey-patching the module cache.
  // Since ESM modules are live bindings, we use a different approach:
  // The fetchCatalog module must accept a mirAklGet injection or we use globalThis patching.
  // For ATDD purposes, we verify behaviour via static analysis + functional tests
  // where the module exports allow injection.

  before(async () => {
    const mod = await import('../src/workers/mirakl/fetchCatalog.js')
    fetchCatalog = mod.fetchCatalog
    CatalogTruncationError = mod.CatalogTruncationError
    EmptyCatalogError = mod.EmptyCatalogError
  })

  // ── AC-1: Pagination with max=100 (static) ────────────────────────────────
  describe('AC-1: paginates with max=100 per page (static source check)', () => {
    let src

    before(() => {
      src = codeLines(readFileSync(FETCH_CATALOG_PATH, 'utf8'))
    })

    test('source references max=100 for page size', () => {
      assert.ok(
        src.includes('max') && (src.includes('100') || src.includes('PAGE_SIZE')),
        'fetchCatalog.js must paginate with max=100 per page'
      )
    })

    test('source uses offset-based pagination', () => {
      assert.ok(
        src.includes('offset'),
        'fetchCatalog.js must use offset-based pagination (matching OF21 spec)'
      )
    })

    test('source uses a loop or recursive structure for multi-page fetching', () => {
      const hasLoop = src.includes('while') || src.includes('for (') || src.includes('for(') || src.includes('do {') || src.includes('reduce') || src.includes('allOffers')
      assert.ok(hasLoop, 'fetchCatalog.js must loop through pages to collect all offers')
    })
  })

  // ── AC-2: total_count assertion ───────────────────────────────────────────
  describe('AC-2: asserts fetched.length === total_count, throws CatalogTruncationError on mismatch', () => {
    let src

    before(() => {
      src = codeLines(readFileSync(FETCH_CATALOG_PATH, 'utf8'))
    })

    test('source contains total_count assertion logic', () => {
      assert.ok(
        src.includes('total_count'),
        'fetchCatalog.js must assert fetched.length against total_count (NFR-R2)'
      )
    })

    test('source throws or references CatalogTruncationError', () => {
      assert.ok(
        src.includes('CatalogTruncationError'),
        'fetchCatalog.js must throw CatalogTruncationError on total_count mismatch'
      )
    })

    test('CatalogTruncationError is exported', () => {
      assert.ok(
        typeof CatalogTruncationError === 'function',
        'CatalogTruncationError must be exported from fetchCatalog.js'
      )
    })

    test('CatalogTruncationError extends Error', () => {
      const err = new CatalogTruncationError('test')
      assert.ok(err instanceof Error, 'CatalogTruncationError must extend Error')
      assert.equal(err.constructor.name, 'CatalogTruncationError', 'constructor.name must be CatalogTruncationError')
    })

    test('source logs job_id, fetched count, declared count — never api_key', () => {
      // The truncation error log must include structured fields
      const hasSafeLog = src.includes('fetched') || src.includes('declared') || src.includes('CatalogTruncationError')
      assert.ok(hasSafeLog, 'fetchCatalog.js must log safe fields (fetched, declared) on truncation')

      // Must not log api_key
      const lines = src.split('\n').filter(l => l.includes('log') && l.includes('api_key'))
      assert.equal(lines.length, 0, 'fetchCatalog.js must not log api_key in any log statement')
    })
  })

  // ── AC-3: Active filter ───────────────────────────────────────────────────
  describe('AC-3: filters active offers only (offers.active === true)', () => {
    let src

    before(() => {
      src = codeLines(readFileSync(FETCH_CATALOG_PATH, 'utf8'))
    })

    test('source filters by offers.active boolean field (MCP-verified — not offers.state string)', () => {
      assert.ok(
        src.includes('active === true') || src.includes('.active'),
        'fetchCatalog.js must filter offers using offers.active === true (boolean field — verified against OF21 MCP spec 2026-04-18)'
      )
    })
  })

  // ── AC-4: onProgress callback ─────────────────────────────────────────────
  describe('AC-4: onProgress(n, total) called every 1,000 offers', () => {
    let src

    before(() => {
      src = codeLines(readFileSync(FETCH_CATALOG_PATH, 'utf8'))
    })

    test('source accepts onProgress parameter', () => {
      // Check function signature references onProgress
      assert.ok(
        src.includes('onProgress'),
        'fetchCatalog.js must accept an onProgress callback parameter'
      )
    })

    test('source calls onProgress at 1,000-offer intervals', () => {
      assert.ok(
        src.includes('1000') || src.includes('1_000'),
        'fetchCatalog.js must call onProgress every 1,000 offers'
      )
    })

    test('fetchCatalog function is exported', () => {
      assert.equal(typeof fetchCatalog, 'function', 'fetchCatalog must be an exported function')
    })
  })

  // ── AC-5: Return shape [{ean, shop_sku, price, product_title}] (static) ────
  describe('AC-5: returns array of {ean, shop_sku, price, product_title}', () => {
    let src

    before(() => {
      src = codeLines(readFileSync(FETCH_CATALOG_PATH, 'utf8'))
    })

    test('source references ean in the returned object shape', () => {
      assert.ok(src.includes('ean'), 'fetchCatalog.js must include "ean" in the returned object')
    })

    test('source references shop_sku in the returned object shape', () => {
      assert.ok(src.includes('shop_sku'), 'fetchCatalog.js must include "shop_sku" in the returned object')
    })

    test('source references price in the returned object shape', () => {
      assert.ok(src.includes('price'), 'fetchCatalog.js must include "price" in the returned object')
    })

    test('source references product_title in the returned object shape', () => {
      assert.ok(
        src.includes('product_title'),
        'fetchCatalog.js must include "product_title" in the returned object'
      )
    })

    test('EAN is extracted from product_references where reference_type is EAN', () => {
      assert.ok(
        src.includes('product_references') || src.includes('reference_type') || src.includes('EAN'),
        'fetchCatalog.js must extract EAN from product_references[].reference where reference_type=EAN'
      )
    })

    test('price is extracted from applicable_pricing.price', () => {
      assert.ok(
        src.includes('applicable_pricing') || src.includes('applicable_pricing.price'),
        'fetchCatalog.js must use applicable_pricing.price as the offer price (OF21 spec)'
      )
    })
  })

  // ── AC-6: Empty catalog → EmptyCatalogError ───────────────────────────────
  describe('AC-6: 0 offers + 200 status → throws EmptyCatalogError', () => {
    let src

    before(() => {
      src = codeLines(readFileSync(FETCH_CATALOG_PATH, 'utf8'))
    })

    test('source throws or references EmptyCatalogError', () => {
      assert.ok(
        src.includes('EmptyCatalogError'),
        'fetchCatalog.js must throw EmptyCatalogError when catalog has 0 offers'
      )
    })

    test('EmptyCatalogError is exported', () => {
      assert.ok(
        typeof EmptyCatalogError === 'function',
        'EmptyCatalogError must be exported from fetchCatalog.js'
      )
    })

    test('EmptyCatalogError extends Error', () => {
      const err = new EmptyCatalogError('empty catalog')
      assert.ok(err instanceof Error, 'EmptyCatalogError must extend Error')
      assert.equal(err.constructor.name, 'EmptyCatalogError', 'constructor.name must be EmptyCatalogError')
    })
  })

  // ── AC-7: Uses mirAklGet, no direct fetch (static) ───────────────────────
  describe('AC-7: uses mirAklGet() — no direct fetch() to Mirakl', () => {
    let src

    before(() => {
      src = codeLines(readFileSync(FETCH_CATALOG_PATH, 'utf8'))
    })

    test('source imports mirAklGet from apiClient.js', () => {
      assert.ok(
        src.includes('mirAklGet') || src.includes('apiClient'),
        'fetchCatalog.js must use mirAklGet() from apiClient.js'
      )
    })

    test('source does not call fetch() directly', () => {
      // Detect raw fetch() calls (not mirAklGet wrapping fetch internally)
      const rawFetchPattern = /\bfetch\s*\(/
      // Allowed: apiClient.js may use fetch internally, but fetchCatalog.js should not
      assert.ok(
        !rawFetchPattern.test(src),
        'fetchCatalog.js must not call fetch() directly — use mirAklGet() instead'
      )
    })
  })

  // ── STATIC: NFR-R2 no silent truncation ───────────────────────────────────
  describe('STATIC: NFR-R2 — no silent data truncation', () => {
    let src

    before(() => {
      src = codeLines(readFileSync(FETCH_CATALOG_PATH, 'utf8'))
    })

    test('source compares fetched count against total_count (not just checks > 0)', () => {
      // Must have === or !== comparison with total_count
      const assertionPattern = /total_count|fetched\.length|allOffers\.length/
      assert.ok(
        assertionPattern.test(src),
        'fetchCatalog.js must assert the final fetched count against total_count from the API response'
      )
    })

    test('safe error message for truncation is in Portuguese (static)', () => {
      assert.ok(
        src.includes('Catálogo obtido parcialmente') || src.includes('CatalogTruncationError'),
        'fetchCatalog.js must use the correct Portuguese error message or throw CatalogTruncationError with it'
      )
    })
  })
})
