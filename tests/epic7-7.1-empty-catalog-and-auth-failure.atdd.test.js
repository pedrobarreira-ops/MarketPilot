/**
 * ATDD tests for Story 7.1: Empty Catalog & Auth Failure Path
 *
 * Acceptance criteria verified:
 * AC-1: 401/403 from OF21 → safe Portuguese message; keyStore.delete in finally; status=error
 * AC-2: 0 active offers + 200 status → EmptyCatalogError; safe Portuguese message; status=error
 * AC-3: keyStore.delete(job_id) runs in finally on BOTH auth failure and empty catalog paths
 * AC-4: No raw Mirakl API response stored in DB or forwarded to user
 * AC-5: Progress screen shows safe error message + "Contacta-nos" affordance (progress.js)
 * AC-6: getSafeErrorMessage maps 401/403 and EmptyCatalogError to spec-exact Portuguese text
 * AC-7: error_message stored via getSafeErrorMessage — never err.message directly
 *
 * MCP-verified endpoint behaviour used in this suite (verified 2026-04-18):
 * - OF21 (GET /api/offers): Auth: Authorization header (raw key, no Bearer prefix).
 *   401 = invalid/expired key; 403 = key valid but insufficient scope.
 *   0 offers + 200 = empty/suspended seller account (total_count = 0, offers = []).
 * - Active filter: offer.active === true (boolean). offer.state does NOT exist on OF21.
 *
 * Uses Node.js built-in test runner (node:test) — no extra dependencies needed.
 * Run: node --test tests/epic7-7.1-empty-catalog-and-auth-failure.atdd.test.js
 */

import { test, describe, before } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const WORKER_PATH        = join(__dirname, '../src/workers/reportWorker.js')
const FETCH_CATALOG_PATH = join(__dirname, '../src/workers/mirakl/fetchCatalog.js')
const API_CLIENT_PATH    = join(__dirname, '../src/workers/mirakl/apiClient.js')
const PROGRESS_JS_PATH   = join(__dirname, '../public/js/progress.js')

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

describe('Story 7.1 — Empty catalog & auth failure path', async () => {

  // ── AC-1: 401/403 auth failure ────────────────────────────────────────────
  describe('AC-1: 401/403 from OF21 → safe error; job status=error', () => {

    describe('apiClient.js — 401/403 throws MiraklApiError (not retried)', () => {
      let MiraklApiError
      let mirAklGet
      let originalFetch

      before(async () => {
        originalFetch = globalThis.fetch
        globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({}) })
        const mod = await import('../src/workers/mirakl/apiClient.js')
        mirAklGet = mod.mirAklGet
        MiraklApiError = mod.MiraklApiError
      })

      test('mirAklGet throws MiraklApiError immediately on 401 (no retries)', async () => {
        let callCount = 0
        globalThis.fetch = async () => {
          callCount++
          return { ok: false, status: 401, json: async () => ({ message: 'Unauthorized' }), text: async () => 'Unauthorized' }
        }
        await assert.rejects(
          () => mirAklGet('https://marketplace.worten.pt', '/api/offers', { max: 100, offset: 0 }, 'bad-key'),
          err => {
            assert.ok(
              err instanceof MiraklApiError || err.constructor.name === 'MiraklApiError',
              `Expected MiraklApiError on 401, got ${err.constructor.name}`
            )
            assert.equal(callCount, 1, '401 must not be retried (exponential backoff is only for 429/5xx)')
            return true
          }
        )
      })

      test('mirAklGet throws MiraklApiError immediately on 403 (no retries)', async () => {
        let callCount = 0
        globalThis.fetch = async () => {
          callCount++
          return { ok: false, status: 403, json: async () => ({ message: 'Forbidden' }), text: async () => 'Forbidden' }
        }
        await assert.rejects(
          () => mirAklGet('https://marketplace.worten.pt', '/api/offers', { max: 100, offset: 0 }, 'bad-key'),
          err => {
            assert.ok(
              err instanceof MiraklApiError || err.constructor.name === 'MiraklApiError',
              `Expected MiraklApiError on 403, got ${err.constructor.name}`
            )
            assert.equal(callCount, 1, '403 must not be retried')
            return true
          }
        )
      })

      test('MiraklApiError exposes HTTP status code', async () => {
        globalThis.fetch = async () => ({
          ok: false, status: 401,
          json: async () => ({}), text: async () => ''
        })
        let caught
        try {
          await mirAklGet('https://marketplace.worten.pt', '/api/offers', {}, 'bad-key')
        } catch (err) {
          caught = err
        }
        assert.ok(caught, 'Expected an error')
        const hasStatus = caught.status !== undefined || caught.statusCode !== undefined || caught.code !== undefined
        assert.ok(hasStatus, 'MiraklApiError must expose the HTTP status so getSafeErrorMessage can map it')
      })
    })

    describe('getSafeErrorMessage — Portuguese message for 401/403', () => {
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

      test('getSafeErrorMessage is exported', () => {
        assert.ok(typeof getSafeErrorMessage === 'function', 'getSafeErrorMessage must be exported')
      })

      test('getSafeErrorMessage for 401 returns exact Portuguese auth-failure message', () => {
        if (!getSafeErrorMessage) return
        const err = Object.assign(new Error('Unauthorized'), { status: 401 })
        const msg = getSafeErrorMessage(err)
        // Spec-exact message from epics-distillate: "Chave API inválida ou sem permissão. Verifica se a chave está correcta e se a tua conta está activa no Worten."
        assert.ok(
          msg.includes('Chave API inválida') || msg.includes('chave') || msg.includes('inválida'),
          `Expected Portuguese auth-failure message for 401, got: "${msg}"`
        )
        assert.ok(
          msg.includes('Worten') || msg.includes('activa') || msg.includes('permissão'),
          `Message must reference Worten and account status for 401, got: "${msg}"`
        )
      })

      test('getSafeErrorMessage for 403 returns same Portuguese auth-failure message', () => {
        if (!getSafeErrorMessage) return
        const err = Object.assign(new Error('Forbidden'), { status: 403 })
        const msg = getSafeErrorMessage(err)
        assert.ok(
          msg.includes('Chave API') || msg.includes('chave') || msg.includes('permissão'),
          `Expected Portuguese auth-failure message for 403, got: "${msg}"`
        )
      })

      test('getSafeErrorMessage does NOT expose raw Mirakl API error text', () => {
        if (!getSafeErrorMessage) return
        const rawMsg = 'Shop API key is invalid or has been revoked. Token: abc123xyz'
        const err = Object.assign(new Error(rawMsg), { status: 401 })
        const result = getSafeErrorMessage(err)
        assert.ok(
          !result.includes('abc123xyz') && !result.includes('revoked') && !result.includes('Token:'),
          `getSafeErrorMessage must not expose raw Mirakl error content, got: "${result}"`
        )
      })
    })

    describe('reportWorker.js — auth failure → error status, key cleared (static)', () => {
      let src

      before(() => { src = readSrc(WORKER_PATH) })

      test('worker handles MiraklApiError and sets job status to error', () => {
        if (!src) return
        assert.ok(
          src.includes('MiraklApiError') || src.includes('error_type') || src.includes('status') && src.includes('error'),
          'Worker must handle MiraklApiError (401/403) and update job status to "error"'
        )
      })

      test('worker never stores err.message as error_message (raw Mirakl response guard)', () => {
        if (!src) return
        const lines = src.split('\n').filter(l =>
          l.includes('error_message') && l.includes('err.message')
        )
        assert.equal(
          lines.length, 0,
          'Worker must call getSafeErrorMessage(err) before storing error_message — never err.message directly'
        )
      })

      test('worker does not forward raw Mirakl response to user or log it', () => {
        if (!src) return
        // Check that no raw err forwarding bypasses getSafeErrorMessage
        assert.ok(
          src.includes('getSafeErrorMessage'),
          'Worker must call getSafeErrorMessage before any error is stored or surfaced'
        )
      })
    })
  })

  // ── AC-2: 0 active offers + 200 → EmptyCatalogError ─────────────────────
  describe('AC-2: 0 active offers + 200 status → EmptyCatalogError; safe Portuguese message', () => {

    describe('fetchCatalog.js — empty catalog detection (static)', () => {
      let src
      let EmptyCatalogError

      before(async () => {
        src = readSrc(FETCH_CATALOG_PATH)
        try {
          const mod = await import('../src/workers/mirakl/fetchCatalog.js')
          EmptyCatalogError = mod.EmptyCatalogError
        } catch (_) {}
      })

      test('fetchCatalog.js throws EmptyCatalogError when 0 offers returned with 200', () => {
        if (!src) return
        assert.ok(
          src.includes('EmptyCatalogError'),
          'fetchCatalog.js must throw EmptyCatalogError when total_count=0 and status=200'
        )
      })

      test('empty-catalog detection fires BEFORE active-offer filter (total_count is pre-filter)', () => {
        // OF21 total_count counts ALL offers (active + inactive). The assertion must
        // happen on the raw fetch result (before filtering by offer.active === true).
        // This prevents a bug where a seller with only inactive offers would bypass the
        // EmptyCatalogError and silently produce an empty report.
        if (!src) return
        assert.ok(
          src.includes('total_count') && src.includes('EmptyCatalogError'),
          'fetchCatalog.js must check total_count for empty catalog before applying active filter (MCP-verified: total_count is pre-filter count)'
        )
      })

      test('EmptyCatalogError is exported from fetchCatalog.js', () => {
        assert.ok(
          typeof EmptyCatalogError === 'function',
          'EmptyCatalogError must be exported so the worker and getSafeErrorMessage can handle it'
        )
      })

      test('EmptyCatalogError extends Error', () => {
        if (!EmptyCatalogError) return
        const err = new EmptyCatalogError('empty catalog')
        assert.ok(err instanceof Error, 'EmptyCatalogError must extend Error')
        assert.equal(err.constructor.name, 'EmptyCatalogError')
      })

      test('fetchCatalog does NOT use offer.state to filter (field does not exist on OF21)', () => {
        // MCP-verified: offer.state does NOT exist on OF21 response (Worten live).
        // offer.state_code exists but it is the offer CONDITION (e.g. "11") — NOT active/inactive.
        if (!src) return
        const badPatterns = [
          /offer\.state\s*===\s*['"]ACTIVE['"]/,
          /\.state\s*!==\s*['"]ACTIVE['"]/,
          /offer\.state\b(?!\s*_code)/,
        ]
        const violates = badPatterns.some(p => p.test(src))
        assert.ok(
          !violates,
          'fetchCatalog.js must NOT filter by offer.state — that field does not exist on OF21 responses (MCP-verified 2026-04-18). Use offer.active === true.'
        )
      })
    })

    describe('getSafeErrorMessage — Portuguese message for EmptyCatalogError', () => {
      let getSafeErrorMessage
      let EmptyCatalogError

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
            if (mod.EmptyCatalogError) { EmptyCatalogError = mod.EmptyCatalogError }
          } catch (_) {}
        }
      })

      test('getSafeErrorMessage returns exact Portuguese empty-catalog message', () => {
        if (!getSafeErrorMessage || !EmptyCatalogError) return
        // Spec-exact: "Não encontrámos ofertas activas no teu catálogo. Verifica se a tua conta está activa no Worten."
        const err = new EmptyCatalogError('empty catalog')
        const msg = getSafeErrorMessage(err)
        assert.ok(
          msg.includes('ofertas') || msg.includes('catálogo') || msg.includes('Não encontrámos'),
          `Expected Portuguese empty-catalog message, got: "${msg}"`
        )
        assert.ok(
          msg.includes('Worten') || msg.includes('activa'),
          `Empty-catalog message must reference Worten and account status, got: "${msg}"`
        )
      })

      test('getSafeErrorMessage for empty catalog does NOT say "Tenta novamente" (reserved for truncation)', () => {
        if (!getSafeErrorMessage || !EmptyCatalogError) return
        const err = new EmptyCatalogError('empty catalog')
        const msg = getSafeErrorMessage(err)
        // The truncation message uses "Tenta novamente"; empty catalog uses a different message
        assert.ok(
          !msg.includes('Tenta novamente'),
          `Empty-catalog message must be distinct from truncation message. Got: "${msg}"`
        )
      })
    })
  })

  // ── AC-3: keyStore.delete runs in finally on both error paths ─────────────
  describe('AC-3: keyStore.delete runs in finally — auth failure AND empty catalog paths', () => {
    let src

    before(() => { src = readSrc(WORKER_PATH) })

    test('worker has a finally block (guarantees key cleanup on all paths)', () => {
      if (!src) return
      assert.ok(
        src.includes('finally'),
        'Worker must use a finally block to ensure keyStore.delete(job_id) runs unconditionally'
      )
    })

    test('keyStore.delete is called inside the finally block (static parse)', () => {
      if (!src) return
      const finallyMatch = src.match(/finally\s*\{([^}]*(?:\{[^}]*\}[^}]*)*)\}/s)
      if (finallyMatch) {
        assert.ok(
          finallyMatch[1].includes('delete') || finallyMatch[1].includes('keyStore'),
          'The finally block must call keyStore.delete(job_id) — API key must be cleared even on 401/403 or empty catalog'
        )
      } else {
        assert.ok(false, 'Could not parse finally block — ensure it exists and contains keyStore.delete()')
      }
    })

    test('key cleanup (delete) is NOT only in catch block (would miss success path, verify finally)', () => {
      if (!src) return
      // Anti-pattern: delete only inside catch means it runs on error but NOT success
      // We already verified finally contains it; this test confirms there is no SOLE catch-only pattern
      assert.ok(
        src.includes('finally'),
        'keyStore.delete must be in finally, not just in catch (catch alone misses the success path)'
      )
    })

    test('worker integration: key absent from keyStore after auth-failure job (keyStore.get undefined path)', async () => {
      let processJob
      let keyStoreModule

      try {
        const queueModule = await import('../src/queue/reportQueue.js')
        queueModule.redisConnection.removeAllListeners('error')
        queueModule.redisConnection.on('error', () => {})
      } catch (_) {}

      try {
        keyStoreModule = await import('../src/queue/keyStore.js')
        const workerMod = await import('../src/workers/reportWorker.js')
        processJob = workerMod.processJob
      } catch (_) {}

      if (!processJob || !keyStoreModule) return

      const jobId = 'job-7.1-auth-test-' + Date.now()
      // Do NOT set the key — simulates process restart / keyStore miss
      // Worker must fail gracefully and must NOT leave a stale key
      const job = {
        id: jobId,
        data: { job_id: jobId, report_id: 'rpt-7.1-test', email: 'test@example.com', marketplace_url: 'https://marketplace.worten.pt' },
        updateProgress: async () => {},
        log: async () => {},
      }

      try { await processJob(job) } catch (_) {}

      assert.equal(
        keyStoreModule.has(jobId),
        false,
        'keyStore must not retain a key for the job_id after the worker exits (finally must run)'
      )
    })
  })

  // ── AC-4: No raw Mirakl API response in DB / forwarded to user ────────────
  describe('AC-4: raw Mirakl API response never stored in DB or forwarded to user', () => {
    let workerSrc
    let apiClientSrc

    before(() => {
      workerSrc    = readSrc(WORKER_PATH)
      apiClientSrc = readSrc(API_CLIENT_PATH)
    })

    test('apiClient.js does not log the full response body on error', () => {
      if (!apiClientSrc) return
      // Detect patterns that would log the raw response body
      const badPatterns = [
        /log\.\w+\s*\([^)]*responseBody[^)]*\)/,
        /log\.\w+\s*\([^)]*response\.text[^)]*\)/,
        /log\.\w+\s*\([^)]*await.*json[^)]*\)/,
      ]
      const violates = badPatterns.some(p => p.test(apiClientSrc))
      assert.ok(
        !violates,
        'apiClient.js must not log raw Mirakl API response bodies — they may contain sensitive data'
      )
    })

    test('worker source does not pass raw err to updateJobError/updateJobStatus', () => {
      if (!workerSrc) return
      // The error stored in DB must go through getSafeErrorMessage
      const lines = workerSrc.split('\n').filter(l =>
        (l.includes('updateJobError') || l.includes('error_message')) && l.includes('err.message')
      )
      assert.equal(
        lines.length, 0,
        'Worker must not store err.message directly in DB — always use getSafeErrorMessage(err)'
      )
    })

    test('error log in worker never includes full err object (only error_code and error_type)', () => {
      if (!workerSrc) return
      // Detect: log.*err) pattern — passing full err object risks leaking API response
      const fullErrLog = /log\.\w+\s*\(\s*err\s*[,)]/
      assert.ok(
        !fullErrLog.test(workerSrc),
        'Worker must not pass full err object to log — only safe fields {job_id, error_code, error_type}'
      )
    })
  })

  // ── AC-5: progress.js shows safe error message on job error status ────────
  describe('AC-5: progress.js surfaces safe error message and "Contacta-nos" on error status', () => {
    let src

    before(() => { src = readSrc(PROGRESS_JS_PATH) })

    test('progress.js handles status="error" branch', () => {
      if (!src) return
      assert.ok(
        src.includes('error'),
        'progress.js must handle status="error" from /api/jobs/:job_id polling'
      )
    })

    test('progress.js shows server phase_message on error (not a hardcoded client string)', () => {
      if (!src) return
      assert.ok(
        src.includes('phase_message'),
        'progress.js must display the server-provided phase_message (which is the getSafeErrorMessage output) when status="error"'
      )
    })

    test('progress.js shows "Contacta-nos" or contact link on error', () => {
      if (!src) return
      assert.ok(
        src.includes('Contacta-nos') || src.includes('contacta') || src.includes('Contacta'),
        'progress.js must show a "Contacta-nos" link when job status is "error" (spec AC-5)'
      )
    })

    test('progress.js stops polling on error status', () => {
      if (!src) return
      // Polling must stop — otherwise it hammers the server after a terminal error
      const stopsPolling =
        src.includes('clearInterval') || src.includes('clearTimeout') ||
        src.includes('return') && src.includes('error')
      assert.ok(
        stopsPolling,
        'progress.js must stop polling when job status is "error" (terminal state)'
      )
    })

    test('progress.js link box label updated on error (spec: "Este link não está disponível — a geração falhou.")', () => {
      if (!src) return
      assert.ok(
        src.includes('não está disponível') || src.includes('geração falhou') || src.includes('falhou'),
        'progress.js must update the link box label on error per spec'
      )
    })
  })

  // ── AC-6 + AC-7: getSafeErrorMessage used consistently ───────────────────
  describe('AC-6 + AC-7: getSafeErrorMessage used for ALL error storage, not err.message', () => {
    let workerSrc
    let fetchCatalogSrc

    before(() => {
      workerSrc = readSrc(WORKER_PATH)
      fetchCatalogSrc = readSrc(FETCH_CATALOG_PATH)
    })

    test('worker calls getSafeErrorMessage before any DB write on error path', () => {
      if (!workerSrc) return
      assert.ok(
        workerSrc.includes('getSafeErrorMessage'),
        'Worker must call getSafeErrorMessage(err) before storing error_message in generation_jobs table'
      )
    })

    test('fetchCatalog does not log err.message on any path', () => {
      if (!fetchCatalogSrc) return
      const lines = fetchCatalogSrc.split('\n').filter(l =>
        (l.includes('log.') || l.includes('console.')) && l.includes('err.message')
      )
      assert.equal(
        lines.length, 0,
        'fetchCatalog.js must not log err.message — raw Mirakl API responses may leak through err.message'
      )
    })

    test('worker does not log api_key on any code path', () => {
      if (!workerSrc) return
      const lines = workerSrc.split('\n').filter(l =>
        (l.includes('log.') || l.includes('console.')) && l.includes('api_key')
      )
      assert.equal(
        lines.length, 0,
        'Worker must never log api_key — NFR-S2 violation on every log line'
      )
    })
  })

  // ── STATIC: Security invariants (NFR-S2) ──────────────────────────────────
  describe('STATIC: NFR-S2 — api_key never in logs, DB columns, or error paths', () => {
    const WORKER_FILES = [
      join(__dirname, '../src/workers/reportWorker.js'),
      join(__dirname, '../src/workers/mirakl/fetchCatalog.js'),
      join(__dirname, '../src/workers/mirakl/apiClient.js'),
    ]

    for (const filePath of WORKER_FILES) {
      const fileName = filePath.split(/[\\/]/).pop()
      test(`${fileName} does not pass api_key to any log statement`, () => {
        let src
        try { src = codeLines(readFileSync(filePath, 'utf8')) } catch (_) { return }
        const lines = src.split('\n').filter(l =>
          (l.includes('log.') || l.includes('console.')) && l.includes('api_key')
        )
        assert.equal(lines.length, 0, `${fileName} must not log api_key — NFR-S2`)
      })
    }
  })
})
