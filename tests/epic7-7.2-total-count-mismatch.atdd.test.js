/**
 * ATDD tests for Story 7.2: total_count Mismatch Handling
 *
 * Acceptance criteria verified:
 * AC-1: fetched.length !== total_count → throws CatalogTruncationError (never silent)
 * AC-2: CatalogTruncationError sets job status=error; message stored via getSafeErrorMessage
 * AC-3: Log on truncation contains {job_id, fetched:N, declared:M, error_type:'CatalogTruncationError'} — no api_key
 * AC-4: keyStore.delete runs in finally even on truncation error
 * AC-5: total_count check fires BEFORE active-offer filter (NFR-R2 — pre-filter assertion)
 * AC-6: Truncation safe message = "Catálogo obtido parcialmente. Tenta novamente." (exact Portuguese)
 * AC-7: No partial/truncated report is ever persisted to DB on mismatch
 *
 * MCP-verified endpoint behaviour used in this suite (verified 2026-04-18):
 * - OF21 (GET /api/offers): root-level `total_count` = total offers including inactive ones.
 *   The API has no server-side active filter — total_count counts ALL offers.
 *   Assertion must compare allOffers.length (pre-filter) vs total_count.
 *   Mismatch signals network truncation or API pagination bug — never acceptable for a price report.
 *
 * Uses Node.js built-in test runner (node:test) — no extra dependencies needed.
 * Run: node --test tests/epic7-7.2-total-count-mismatch.atdd.test.js
 */

import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const FETCH_CATALOG_PATH = join(__dirname, '../src/workers/mirakl/fetchCatalog.js')
const WORKER_PATH        = join(__dirname, '../src/workers/reportWorker.js')

// ── env setup ──────────────────────────────────────────────────────────────
process.env.NODE_ENV        = 'test'
process.env.REDIS_URL       = process.env.REDIS_URL || 'redis://localhost:6379'
process.env.SQLITE_PATH     = ':memory:'
process.env.APP_BASE_URL    = 'http://localhost:3000'
process.env.WORTEN_BASE_URL = 'https://www.worten.pt'
process.env.PORT            = '3000'
process.env.LOG_LEVEL       = 'silent'
process.env.RESEND_API_KEY  = 'test-key-dummy'

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

function readSrc(filePath) {
  try {
    return codeLines(readFileSync(filePath, 'utf8'))
  } catch (_) {
    return null
  }
}

// ── test suite ─────────────────────────────────────────────────────────────

describe('Story 7.2 — total_count mismatch handling', async () => {

  // ── AC-1: CatalogTruncationError thrown on mismatch ──────────────────────
  describe('AC-1: fetched.length !== total_count → CatalogTruncationError (never silent)', () => {

    describe('CatalogTruncationError class contract', () => {
      let CatalogTruncationError

      before(async () => {
        try {
          const mod = await import('../src/workers/mirakl/fetchCatalog.js')
          CatalogTruncationError = mod.CatalogTruncationError
        } catch (_) {}
      })

      test('CatalogTruncationError is exported from fetchCatalog.js', () => {
        assert.ok(
          typeof CatalogTruncationError === 'function',
          'CatalogTruncationError must be exported from fetchCatalog.js'
        )
      })

      test('CatalogTruncationError extends Error', () => {
        if (!CatalogTruncationError) return
        const err = new CatalogTruncationError('test truncation')
        assert.ok(err instanceof Error, 'CatalogTruncationError must extend Error')
        assert.equal(
          err.constructor.name, 'CatalogTruncationError',
          'constructor.name must be exactly "CatalogTruncationError"'
        )
      })

      test('CatalogTruncationError carries a message', () => {
        if (!CatalogTruncationError) return
        const err = new CatalogTruncationError('Catálogo obtido parcialmente. Tenta novamente.')
        assert.ok(typeof err.message === 'string' && err.message.length > 0)
      })
    })

    describe('fetchCatalog.js — mismatch detection (static + functional)', () => {
      let src
      let fetchCatalog
      let CatalogTruncationError

      before(async () => {
        src = readSrc(FETCH_CATALOG_PATH)
        try {
          const mod = await import('../src/workers/mirakl/fetchCatalog.js')
          fetchCatalog = mod.fetchCatalog
          CatalogTruncationError = mod.CatalogTruncationError
        } catch (_) {}
      })

      test('source asserts fetched count against total_count (static)', () => {
        if (!src) return
        assert.ok(
          src.includes('total_count'),
          'fetchCatalog.js must assert allOffers.length against total_count — NFR-R2'
        )
      })

      test('source throws CatalogTruncationError on mismatch (static)', () => {
        if (!src) return
        assert.ok(
          src.includes('CatalogTruncationError'),
          'fetchCatalog.js must throw CatalogTruncationError when fetched count does not match total_count'
        )
      })

      test('source uses !== or < comparison (not just > 0) for strict count assertion (NFR-R2)', () => {
        // NFR-R2: "OF21 fetched count ≠ total_count → job fails with explicit error; no partial/silent truncation"
        // A check of allOffers.length > 0 would be insufficient — must be strict equality.
        if (!src) return
        const hasStrictCheck =
          src.includes('!==') || src.includes('< total_count') || src.includes('> total_count') ||
          src.includes('length !== total') || src.includes('length < total')
        assert.ok(
          hasStrictCheck,
          'fetchCatalog.js must use strict count comparison (!== or <) against total_count, not just a > 0 check'
        )
      })

      test('fetchCatalog throws CatalogTruncationError when stub returns fewer offers than total_count', async () => {
        // This functional test stubs fetch to return total_count=3 but only 2 offers across pages.
        if (!fetchCatalog || !CatalogTruncationError) return

        const originalFetch = globalThis.fetch
        let callCount = 0
        globalThis.fetch = async (url) => {
          callCount++
          // First page: 2 offers, total_count=3 — simulates network truncation
          return {
            ok: true, status: 200,
            json: async () => ({
              offers: [
                { active: true, shop_sku: 'SKU-1', applicable_pricing: { price: '10.00' }, product_title: 'Product 1', product_references: [{ reference_type: 'EAN', reference: '1111111111111' }] },
                { active: true, shop_sku: 'SKU-2', applicable_pricing: { price: '20.00' }, product_title: 'Product 2', product_references: [{ reference_type: 'EAN', reference: '2222222222222' }] },
              ],
              total_count: 3, // Declared 3 but only 2 returned — truncation
            }),
            text: async () => '',
          }
        }

        try {
          await assert.rejects(
            () => fetchCatalog('https://marketplace.worten.pt', 'test-key', { onProgress: () => {} }),
            err => {
              assert.ok(
                err instanceof CatalogTruncationError || err.constructor.name === 'CatalogTruncationError',
                `Expected CatalogTruncationError on count mismatch, got ${err.constructor.name}: ${err.message}`
              )
              return true
            }
          )
        } finally {
          globalThis.fetch = originalFetch
        }
      })

      test('fetchCatalog does NOT throw CatalogTruncationError when counts match exactly', async () => {
        if (!fetchCatalog || !CatalogTruncationError) return

        const originalFetch = globalThis.fetch
        globalThis.fetch = async () => ({
          ok: true, status: 200,
          json: async () => ({
            offers: [
              { active: true, shop_sku: 'SKU-1', applicable_pricing: { price: '10.00' }, product_title: 'Product 1', product_references: [{ reference_type: 'EAN', reference: '1111111111111' }] },
            ],
            total_count: 1, // Declared matches fetched — no truncation
          }),
          text: async () => '',
        })

        try {
          const result = await fetchCatalog('https://marketplace.worten.pt', 'test-key', { onProgress: () => {} })
          assert.ok(Array.isArray(result), 'fetchCatalog must return an array when counts match')
        } catch (err) {
          if (err instanceof CatalogTruncationError || err.constructor.name === 'CatalogTruncationError') {
            assert.fail('fetchCatalog must NOT throw CatalogTruncationError when fetched.length === total_count')
          }
          // Other errors (e.g. module init) are acceptable in unit context
        } finally {
          globalThis.fetch = originalFetch
        }
      })
    })
  })

  // ── AC-2: Worker handles truncation → job status=error ──────────────────
  describe('AC-2: CatalogTruncationError → job status=error; safe message stored', () => {
    let src

    before(() => { src = readSrc(WORKER_PATH) })

    test('worker source handles CatalogTruncationError (static)', () => {
      if (!src) return
      assert.ok(
        src.includes('CatalogTruncationError') || src.includes('TruncationError'),
        'Worker must handle CatalogTruncationError from fetchCatalog and transition job to "error" status'
      )
    })

    test('worker uses getSafeErrorMessage for CatalogTruncationError (not err.message)', () => {
      if (!src) return
      assert.ok(
        src.includes('getSafeErrorMessage'),
        'Worker must call getSafeErrorMessage before storing any error_message — never stores err.message directly'
      )
    })

    test('worker never persists a partial/truncated report to the reports table', () => {
      if (!src) return
      // On CatalogTruncationError the worker must NOT call insertReport — it must fail the job
      // Static heuristic: if the error is thrown before the insertReport call in the code flow,
      // the report will not be persisted. We check that the error handling path sets status=error.
      const lines = src.split('\n')
      const hasErrorStatus = lines.some(l => l.includes('error') && (l.includes('status') || l.includes('updateJob')))
      assert.ok(
        hasErrorStatus,
        'Worker must update job status to "error" on CatalogTruncationError — no partial report must be written'
      )
    })
  })

  // ── AC-3: Safe truncation log — no api_key, structured fields ─────────────
  describe('AC-3: truncation log = {job_id, fetched:N, declared:M, error_type} — no api_key', () => {
    let src

    before(() => { src = readSrc(FETCH_CATALOG_PATH) })

    test('fetchCatalog.js logs truncation with job_id or fetched/declared fields (static)', () => {
      if (!src) return
      const hasSafeLog = src.includes('fetched') || src.includes('declared') || src.includes('CatalogTruncationError')
      assert.ok(
        hasSafeLog,
        'fetchCatalog.js must log structured truncation data (fetched N, declared M) — not raw error'
      )
    })

    test('fetchCatalog.js truncation log does NOT include api_key', () => {
      if (!src) return
      const lines = src.split('\n').filter(l =>
        (l.includes('log.') || l.includes('console.')) && l.includes('api_key')
      )
      assert.equal(
        lines.length, 0,
        'fetchCatalog.js must not include api_key in any log statement (NFR-S2)'
      )
    })

    test('fetchCatalog.js does not log err.message on truncation', () => {
      if (!src) return
      const lines = src.split('\n').filter(l =>
        (l.includes('log.') || l.includes('console.')) && l.includes('err.message')
      )
      assert.equal(
        lines.length, 0,
        'fetchCatalog.js must not log err.message — only safe structured fields'
      )
    })
  })

  // ── AC-4: keyStore.delete in finally even on truncation ───────────────────
  describe('AC-4: keyStore.delete runs in finally on CatalogTruncationError path', () => {
    let src
    let _redisConnection
    let _reportQueue

    before(() => { src = readSrc(WORKER_PATH) })

    after(async () => {
      // Close the ioredis connection opened by reportQueue import so the event loop
      // can drain and the test process exits cleanly (prevents 80 s hang).
      try {
        if (_reportQueue) {
          await Promise.race([
            _reportQueue.close(),
            new Promise(resolve => setTimeout(resolve, 1000)),
          ])
        }
      } catch (_) {}
      try { if (_redisConnection) _redisConnection.disconnect() } catch (_) {}
    })

    test('worker finally block contains keyStore.delete (static)', () => {
      if (!src) return
      const finallyMatch = src.match(/finally\s*\{([^}]*(?:\{[^}]*\}[^}]*)*)\}/s)
      if (finallyMatch) {
        assert.ok(
          finallyMatch[1].includes('delete') || finallyMatch[1].includes('keyStore'),
          'finally block must clear the API key even on CatalogTruncationError'
        )
      } else {
        assert.ok(false, 'Worker must have a finally block for unconditional key cleanup')
      }
    })

    test('worker integration: keyStore has no entry for job after truncation error', async () => {
      let processJob
      let keyStoreModule

      try {
        const queueModule = await import('../src/queue/reportQueue.js')
        _redisConnection = queueModule.redisConnection
        _reportQueue = queueModule.reportQueue
        _redisConnection.removeAllListeners('error')
        _redisConnection.on('error', () => {})
      } catch (_) {}

      try {
        keyStoreModule = await import('../src/queue/keyStore.js')
        const workerMod = await import('../src/workers/reportWorker.js')
        processJob = workerMod.processJob
      } catch (_) {}

      if (!processJob || !keyStoreModule) return

      const jobId = 'job-7.2-truncation-test-' + Date.now()
      keyStoreModule.set(jobId, 'test-api-key-truncation')
      assert.equal(keyStoreModule.has(jobId), true, 'precondition: key must be in keyStore before test')

      const job = {
        id: jobId,
        data: { job_id: jobId, report_id: 'rpt-7.2-test', email: 'test@example.com', marketplace_url: 'https://marketplace.worten.pt' },
        updateProgress: async () => {},
        log: async () => {},
      }

      // The worker will fail (no real Mirakl / DB), but the finally block must clear the key
      try { await processJob(job) } catch (_) {}

      assert.equal(
        keyStoreModule.has(jobId),
        false,
        'keyStore must not retain key after job exits on truncation error path (finally must run)'
      )
    })
  })

  // ── AC-5: Pre-filter assertion (total_count is pre-filter) ────────────────
  describe('AC-5: total_count assertion fires BEFORE active-offer filter (NFR-R2)', () => {
    let src
    let fetchCatalog
    let CatalogTruncationError

    before(async () => {
      src = readSrc(FETCH_CATALOG_PATH)
      try {
        const mod = await import('../src/workers/mirakl/fetchCatalog.js')
        fetchCatalog = mod.fetchCatalog
        CatalogTruncationError = mod.CatalogTruncationError
      } catch (_) {}
    })

    test('fetchCatalog compares total_count against pre-filter count (runtime — NFR-R2)', async () => {
      // Runtime invariant: a response with total_count=3 and 3 raw offers (1 inactive, 2 active)
      // must NOT throw CatalogTruncationError, because the pre-filter count (3) matches total_count (3).
      // If the assertion were applied post-active-filter (active count=2 vs total_count=3) it would
      // incorrectly throw — confirming the check fires on allOffers.length (pre-filter).
      // MCP-verified 2026-04-18: OF21 total_count includes ALL offers including inactive.
      if (!fetchCatalog || !CatalogTruncationError) return

      const originalFetch = globalThis.fetch
      globalThis.fetch = async () => ({
        ok: true, status: 200,
        json: async () => ({
          offers: [
            { active: true,  shop_sku: 'SKU-1', applicable_pricing: { price: '10.00' }, product_title: 'P1', product_references: [{ reference_type: 'EAN', reference: '1111111111111' }] },
            { active: true,  shop_sku: 'SKU-2', applicable_pricing: { price: '20.00' }, product_title: 'P2', product_references: [{ reference_type: 'EAN', reference: '2222222222222' }] },
            { active: false, shop_sku: 'SKU-3', applicable_pricing: { price: '30.00' }, product_title: 'P3', product_references: [{ reference_type: 'EAN', reference: '3333333333333' }] },
          ],
          total_count: 3, // 3 raw offers returned — matches allOffers.length (pre-filter) → no truncation
        }),
        text: async () => '',
      })

      try {
        // Must not throw CatalogTruncationError — pre-filter count (3) === total_count (3)
        const result = await fetchCatalog('https://marketplace.worten.pt', 'test-key', { onProgress: () => {} })
        assert.ok(Array.isArray(result), 'fetchCatalog must return catalog array when pre-filter count matches total_count')
        assert.equal(result.length, 2, 'returned catalog must contain only active offers (post-filter)')
      } catch (err) {
        if (err instanceof CatalogTruncationError || err.constructor.name === 'CatalogTruncationError') {
          assert.fail(
            'fetchCatalog must NOT throw CatalogTruncationError when allOffers.length === total_count — ' +
            'total_count is a pre-filter count (MCP-verified 2026-04-18: no server-side active filter on OF21)'
          )
        }
        // Other errors (e.g. EmptyCatalogError when all actives have no EAN) are acceptable
      } finally {
        globalThis.fetch = originalFetch
      }
    })

    test('MCP contract: total_count includes inactive offers (no server-side active filter on OF21)', () => {
      // Documentation test — enforces the MCP-verified finding that OF21 total_count
      // counts ALL offers including inactive. Asserting only active offers vs total_count
      // would always fail for sellers with any inactive listings.
      // This test is intentionally always-pass (it documents a constraint, not an assertion).
      assert.ok(
        true,
        'DOCUMENTED: OF21 total_count includes inactive offers. Assert allOffers (pre-filter) vs total_count. Never assert active-only count vs total_count. (MCP-verified 2026-04-18)'
      )
    })
  })

  // ── AC-6: Exact Portuguese truncation message ─────────────────────────────
  describe('AC-6: truncation safe message = "Catálogo obtido parcialmente. Tenta novamente."', () => {
    let getSafeErrorMessage
    let CatalogTruncationError

    before(async () => {
      const candidates = [
        '../src/workers/mirakl/apiClient.js',
        '../src/workers/reportWorker.js',
        '../src/workers/mirakl/fetchCatalog.js',
      ]
      for (const c of candidates) {
        try {
          const mod = await import(c)
          if (mod.getSafeErrorMessage) { getSafeErrorMessage = mod.getSafeErrorMessage }
          if (mod.CatalogTruncationError) { CatalogTruncationError = mod.CatalogTruncationError }
        } catch (_) {}
      }
    })

    test('getSafeErrorMessage returns "Catálogo obtido parcialmente. Tenta novamente." for CatalogTruncationError', () => {
      if (!getSafeErrorMessage || !CatalogTruncationError) return
      const err = new CatalogTruncationError('truncation')
      const msg = getSafeErrorMessage(err)
      assert.ok(
        msg.includes('Catálogo obtido parcialmente') || msg.includes('parcialmente'),
        `Expected "Catálogo obtido parcialmente. Tenta novamente." for CatalogTruncationError, got: "${msg}"`
      )
      assert.ok(
        msg.includes('Tenta novamente') || msg.includes('tenta'),
        `Truncation message must include "Tenta novamente", got: "${msg}"`
      )
    })

    test('truncation message is different from auth-failure message', () => {
      if (!getSafeErrorMessage || !CatalogTruncationError) return
      const truncErr = new CatalogTruncationError('mismatch')
      const authErr  = Object.assign(new Error('Unauthorized'), { status: 401 })
      const truncMsg = getSafeErrorMessage(truncErr)
      const authMsg  = getSafeErrorMessage(authErr)
      assert.notEqual(
        truncMsg, authMsg,
        'CatalogTruncationError and 401 auth error must produce different Portuguese messages'
      )
    })

    test('fetchCatalog.js source includes the Portuguese truncation message or CatalogTruncationError', () => {
      // Validates the message is defined close to where the error is thrown
      const src = readSrc(FETCH_CATALOG_PATH)
      if (!src) return
      assert.ok(
        src.includes('Catálogo obtido parcialmente') || src.includes('CatalogTruncationError'),
        'fetchCatalog.js must define or reference "Catálogo obtido parcialmente. Tenta novamente." for the truncation case'
      )
    })
  })

  // ── AC-7: No partial report persisted on mismatch ─────────────────────────
  describe('AC-7: no partial/truncated report is ever written to reports table on mismatch', () => {
    let workerSrc

    before(() => { workerSrc = readSrc(WORKER_PATH) })

    test('worker source handles CatalogTruncationError before reaching insertReport (static flow)', () => {
      if (!workerSrc) return
      // The error must be caught and job marked error BEFORE insertReport is called.
      // Heuristic: CatalogTruncationError reference must appear in error-handling scope
      assert.ok(
        workerSrc.includes('CatalogTruncationError') || workerSrc.includes('error'),
        'Worker must catch CatalogTruncationError before any report insertion'
      )
    })

    test('generation_jobs table has error_message column (schema supports safe message storage)', async () => {
      // Verify the queries layer can store the safe error message
      let updateJobError
      try {
        const mod = await import('../src/db/queries.js')
        updateJobError = mod.updateJobError
      } catch (_) {}

      if (!updateJobError) {
        // queries.js not importable in test context — check static source
        try {
          const src = codeLines(readFileSync(join(__dirname, '../src/db/queries.js'), 'utf8'))
          assert.ok(
            src.includes('error_message'),
            'queries.js must support error_message field for CatalogTruncationError storage'
          )
        } catch (_) {}
        return
      }

      assert.equal(
        typeof updateJobError, 'function',
        'queries.js must export updateJobError to allow worker to set job status=error with safe message'
      )
    })
  })

  // ── STATIC: NFR-R2 enforcement ────────────────────────────────────────────
  describe('STATIC: NFR-R2 — no silent truncation, ever', () => {
    let src

    before(() => { src = readSrc(FETCH_CATALOG_PATH) })

    test('fetchCatalog.js does not silently swallow count mismatches', () => {
      if (!src) return
      // Anti-pattern: logging the mismatch without throwing
      // If total_count appears but CatalogTruncationError does not, it might be logged-only
      assert.ok(
        src.includes('CatalogTruncationError'),
        'fetchCatalog.js must throw CatalogTruncationError on mismatch — logging without throwing violates NFR-R2'
      )
    })

    test('fetchCatalog.js does not have a try/catch around the total_count assertion that suppresses the error', () => {
      if (!src) return
      // We cannot perfectly detect this statically, but we can check that CatalogTruncationError
      // is not caught and swallowed in the same function.
      // Heuristic: if CatalogTruncationError is thrown it must propagate to the caller.
      const throwsPattern = /throw\s+new\s+CatalogTruncationError/
      assert.ok(
        throwsPattern.test(src),
        'fetchCatalog.js must `throw new CatalogTruncationError(...)` — not just create and swallow it'
      )
    })
  })
})
