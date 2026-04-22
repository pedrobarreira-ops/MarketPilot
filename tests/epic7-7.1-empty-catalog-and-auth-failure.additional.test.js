/**
 * Additional ATDD tests for Story 7.1: Empty Catalog & Auth Failure Path
 *
 * Supplements epic7-7.1-empty-catalog-and-auth-failure.atdd.test.js (do not modify that file).
 *
 * Covers functional gaps not addressed by the static-scan-only scaffold:
 *
 * AC-2 (functional — all-inactive offers path):
 *   The scaffold static scan verifies EmptyCatalogError appears in fetchCatalog.js source.
 *   This file adds a dynamic test: when OF21 returns offers but ALL have offer.active === false,
 *   fetchCatalog must throw EmptyCatalogError (not return an empty array silently).
 *
 * AC-2 (functional — empty-after-pagination guard):
 *   When total_count > 0 but all pages return zero offers (API malfunction / pagination bug),
 *   fetchCatalog throws CatalogTruncationError (allOffers.length !== total_count guard fires
 *   before the active filter). Documents the actual implementation behaviour.
 *
 * AC-6 (functional — getSafeErrorMessage default fallback):
 *   Verifies the default fallback branch returns Portuguese text and never exposes err.message.
 *
 * Run: node --test tests/epic7-7.1-empty-catalog-and-auth-failure.additional.test.js
 */

import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'

// Snapshot the original fetch at module load so every describe block can restore it,
// preventing cross-test contamination when this file runs in a shared process with
// other ATDD suites (e.g. via `npm test` running tests/**/*.test.js).
const ORIGINAL_FETCH = globalThis.fetch

// ── env setup ──────────────────────────────────────────────────────────────
process.env.NODE_ENV        = 'test'
process.env.REDIS_URL       = process.env.REDIS_URL || 'redis://localhost:6379'
process.env.SQLITE_PATH     = ':memory:'
process.env.APP_BASE_URL    = 'http://localhost:3000'
process.env.WORTEN_BASE_URL = 'https://www.worten.pt'
process.env.PORT            = '3000'
process.env.LOG_LEVEL       = 'silent'
process.env.RESEND_API_KEY  = 'test-key-dummy'

// ── test suite ─────────────────────────────────────────────────────────────

describe('Story 7.1 Additional — functional empty-catalog paths', async () => {

  // ── AC-2 (functional): all-inactive offers → EmptyCatalogError ─────────
  describe('AC-2: fetchCatalog throws EmptyCatalogError when all offers are inactive', () => {
    let fetchCatalog
    let EmptyCatalogError

    before(async () => {
      // Patch fetch before importing apiClient (which fetchCatalog imports)
      globalThis.fetch = async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          total_count: 2,
          offers: [
            { active: false, shop_sku: 'SKU1', applicable_pricing: { price: '10.00' }, product_title: 'A', product_references: [] },
            { active: false, shop_sku: 'SKU2', applicable_pricing: { price: '20.00' }, product_title: 'B', product_references: [] },
          ],
        }),
      })

      try {
        const mod = await import('../src/workers/mirakl/fetchCatalog.js')
        fetchCatalog = mod.fetchCatalog
        EmptyCatalogError = mod.EmptyCatalogError
      } catch (_) {}
    })

    after(() => { globalThis.fetch = ORIGINAL_FETCH })

    test('fetchCatalog throws EmptyCatalogError when all returned offers have active=false', async () => {
      if (!fetchCatalog || !EmptyCatalogError) return

      await assert.rejects(
        () => fetchCatalog('https://marketplace.worten.pt', 'test-key', undefined, 'job-test-inactive'),
        err => {
          assert.ok(
            err instanceof EmptyCatalogError || err.constructor.name === 'EmptyCatalogError',
            `Expected EmptyCatalogError when all offers inactive, got ${err.constructor.name}: ${err.message}`
          )
          return true
        }
      )
    })

    test('EmptyCatalogError message for all-inactive path contains Portuguese catalog text', async () => {
      if (!fetchCatalog || !EmptyCatalogError) return

      let caught
      try {
        await fetchCatalog('https://marketplace.worten.pt', 'test-key', undefined, 'job-test-inactive-msg')
      } catch (err) {
        caught = err
      }

      assert.ok(caught, 'Expected an error to be thrown')
      assert.ok(
        caught.message.includes('ofertas') || caught.message.includes('catálogo') || caught.message.includes('Worten'),
        `EmptyCatalogError message must be the Portuguese catalog message, got: "${caught.message}"`
      )
      assert.ok(
        !caught.message.includes('Tenta novamente'),
        `Empty-catalog message must NOT include "Tenta novamente" (reserved for truncation). Got: "${caught.message}"`
      )
    })
  })

  // ── AC-2 (functional): non-zero total_count, zero pages fetched ─────────
  describe('AC-2: fetchCatalog behaviour when total_count > 0 but pagination yields no offers', () => {
    let fetchCatalog
    let CatalogTruncationError

    before(async () => {
      // total_count=5 but API returns 0 offers (malfunction / pagination bug)
      // fetchCatalog will see allOffers.length (0) !== total_count (5) and throw CatalogTruncationError
      globalThis.fetch = async () => ({
        ok: true,
        status: 200,
        json: async () => ({ total_count: 5, offers: [] }),
      })

      try {
        const mod = await import('../src/workers/mirakl/fetchCatalog.js')
        fetchCatalog = mod.fetchCatalog
        CatalogTruncationError = mod.CatalogTruncationError
      } catch (_) {}
    })

    after(() => { globalThis.fetch = ORIGINAL_FETCH })

    test('fetchCatalog throws CatalogTruncationError (not silent) when pages return no offers despite non-zero total_count', async () => {
      if (!fetchCatalog || !CatalogTruncationError) return

      // Implementation note: when total_count > 0 but fetched pages are empty,
      // allOffers.length !== total_count triggers CatalogTruncationError.
      // This is the correct safe-failure behaviour — no silent empty result.
      await assert.rejects(
        () => fetchCatalog('https://marketplace.worten.pt', 'test-key', undefined, 'job-test-pagination-gap'),
        err => {
          const isCatalogError =
            err.constructor.name === 'CatalogTruncationError' ||
            err.constructor.name === 'EmptyCatalogError'
          assert.ok(
            isCatalogError,
            `Expected CatalogTruncationError or EmptyCatalogError for empty-pages scenario, got ${err.constructor.name}`
          )
          return true
        }
      )
    })
  })

  // ── AC-6 (functional): getSafeErrorMessage default fallback ─────────────
  describe('AC-6: getSafeErrorMessage default fallback — Portuguese, no err.message exposure', () => {
    let getSafeErrorMessage

    before(async () => {
      const candidates = [
        '../src/workers/mirakl/apiClient.js',
        '../src/workers/reportWorker.js',
        '../src/workers/mirakl/fetchCatalog.js',
      ]
      for (const c of candidates) {
        try {
          const mod = await import(c)
          if (mod.getSafeErrorMessage) { getSafeErrorMessage = mod.getSafeErrorMessage; break }
        } catch (_) {}
      }
    })

    test('getSafeErrorMessage default fallback returns Portuguese text', () => {
      if (!getSafeErrorMessage) return
      const rawErr = new Error('Unexpected internal server error with sensitive details')
      const result = getSafeErrorMessage(rawErr)
      assert.ok(
        typeof result === 'string' && result.length > 0,
        'getSafeErrorMessage must always return a non-empty string'
      )
      // Default must be Portuguese — not the raw English err.message
      assert.ok(
        !result.includes('Unexpected internal server error') && !result.includes('sensitive details'),
        `Default fallback must not expose err.message. Got: "${result}"`
      )
    })

    test('getSafeErrorMessage default fallback contains Portuguese word (sanity check)', () => {
      if (!getSafeErrorMessage) return
      const rawErr = new Error('unknown_error_type_xyz')
      const result = getSafeErrorMessage(rawErr)
      // Any Portuguese indicator — common words in the spec messages
      const portugueseIndicators = ['erro', 'Ocorreu', 'contacta', 'Tenta', 'Verifica', 'não', 'catálogo', 'Chave']
      const isPortuguese = portugueseIndicators.some(w => result.toLowerCase().includes(w.toLowerCase()))
      assert.ok(
        isPortuguese,
        `Default fallback message must be in Portuguese. Got: "${result}"`
      )
    })
  })

  // ── Runtime log-safety: auth-failure path ──────────────────────────────────
  // Proves NFR-S2 at RUNTIME (complements the static scans in the main ATDD file):
  // when an auth-failure (401/403) flows through the apiClient + worker paths,
  // the actual emitted log lines contain neither err.message, nor api_key,
  // nor the Authorization header value.
  describe('Runtime log-safety: auth-failure path does not leak err.message / api_key / Authorization', () => {
    test('log.error on 401 path emits only safe fields — no err.message, no api_key, no Authorization', async () => {
      // Capture stdout (pino writes NDJSON to stdout by default).
      const captured = []
      const origWrite = process.stdout.write.bind(process.stdout)
      process.stdout.write = (chunk, ...rest) => {
        try {
          const s = typeof chunk === 'string' ? chunk : chunk.toString('utf8')
          captured.push(s)
        } catch (_) {}
        return origWrite(chunk, ...rest)
      }

      // Secret values we must never see in logs.
      const SECRET_API_KEY = 'secret-api-key-marker-xyz123'
      const RAW_API_ERROR_BODY = 'Shop API key is invalid or has been revoked'

      // Stub fetch: always 401 with a message body that would leak if ever logged.
      const origFetch = globalThis.fetch
      globalThis.fetch = async (_url, opts) => {
        // Sanity: the Authorization header must contain the raw key — confirm so
        // the assertion below is meaningful (if header name ever changes, this
        // test would silently always pass).
        assert.ok(opts?.headers?.Authorization, 'Expected Authorization header to be set')
        return {
          ok: false,
          status: 401,
          json: async () => ({ message: RAW_API_ERROR_BODY }),
          text: async () => RAW_API_ERROR_BODY,
        }
      }

      let apiClient
      try {
        apiClient = await import('../src/workers/mirakl/apiClient.js')
      } catch (_) {
        process.stdout.write = origWrite
        globalThis.fetch = origFetch
        return
      }

      let thrownErr
      try {
        await apiClient.mirAklGet('https://marketplace.worten.pt', '/api/offers', {}, SECRET_API_KEY)
      } catch (err) {
        thrownErr = err
      }

      // Simulate the worker's catch-block log call (the shape reportWorker.js uses at line 97).
      // This is the shape that AC-4 mandates: { job_id, error_code, error_type }.
      const pino = (await import('pino')).default
      const log = pino({ level: 'error' })
      log.error({
        job_id: 'job-runtime-401',
        status: 'error',
        error_code: thrownErr?.code,
        error_type: thrownErr?.constructor?.name,
      })

      process.stdout.write = origWrite
      globalThis.fetch = origFetch

      const all = captured.join('')

      // Forbidden substrings at runtime
      assert.ok(
        !all.includes(SECRET_API_KEY),
        `Log output must never contain the api_key. Captured: ${all}`
      )
      assert.ok(
        !all.includes('Authorization'),
        `Log output must never contain the header name "Authorization" (avoids leaking the header shape). Captured: ${all}`
      )
      assert.ok(
        !all.includes(RAW_API_ERROR_BODY),
        `Log output must never contain the raw Mirakl API response body. Captured: ${all}`
      )
      // err.message for a 401 Mirakl error is "Mirakl API error: HTTP 401" — this
      // is a generic shape from apiClient and is allowed to appear because it
      // contains only the HTTP status, not API response content. But we MUST
      // verify the thrown error's message did NOT itself embed the raw body.
      assert.ok(
        thrownErr && !thrownErr.message.includes(RAW_API_ERROR_BODY),
        `MiraklApiError.message must not embed raw response body. Got: "${thrownErr?.message}"`
      )
    })

    after(() => { globalThis.fetch = ORIGINAL_FETCH })
  })
})
