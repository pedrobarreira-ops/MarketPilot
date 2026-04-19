/**
 * ATDD tests for Story 3.7: Full Worker Orchestration and Phase Updates
 *
 * Acceptance criteria verified:
 * AC-1: Phase messages update at each transition (queued → fetching_catalog → scanning_competitors
 *        → building_report → complete)
 * AC-2: finally block: keyStore.delete(job_id) always runs (success AND failure)
 * AC-3: 0 offers + 200 status → throws EmptyCatalogError → job status = error
 * AC-4: 401/403 → MiraklApiError → job status = error
 * AC-5: total_count mismatch → CatalogTruncationError → job status = error
 * AC-6: error_message always from getSafeErrorMessage() — never raw error text
 * AC-7: Portuguese phase messages match spec exactly
 * AC-8: getSafeErrorMessage exports correct Portuguese safe messages per error type
 *
 * Uses Node.js built-in test runner (node:test) — no extra dependencies needed.
 * Run: node --test tests/epic3-3.7-worker-orchestration.atdd.test.js
 */

import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const WORKER_PATH = join(__dirname, '../src/workers/reportWorker.js')

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

function makeMockJob({ job_id, report_id, email, marketplace_url } = {}) {
  return {
    id: job_id || 'test-orchestration-job',
    data: {
      job_id: job_id || 'test-orchestration-job',
      report_id: report_id || 'test-report-id',
      email: email || 'test@example.com',
      marketplace_url: marketplace_url || 'https://marketplace.worten.pt',
    },
    updateProgress: async () => {},
    log: async () => {},
  }
}

// ── test suite ─────────────────────────────────────────────────────────────

describe('Story 3.7 — Full worker orchestration and phase updates', async () => {
  let processJob
  let keyStoreModule
  let set, get, del, has
  let getSafeErrorMessage
  let redisConnection
  let reportQueue

  before(async () => {
    // Silence Redis fail-fast listener
    const queueModule = await import('../src/queue/reportQueue.js')
    redisConnection = queueModule.redisConnection
    reportQueue = queueModule.reportQueue
    redisConnection.removeAllListeners('error')
    redisConnection.on('error', () => {})

    // Import keyStore for inspection
    keyStoreModule = await import('../src/queue/keyStore.js')
    set = keyStoreModule.set
    get = keyStoreModule.get
    del = keyStoreModule.delete
    has = keyStoreModule.has

    // Import the worker
    const workerMod = await import('../src/workers/reportWorker.js')
    processJob = workerMod.processJob

    // Try to import getSafeErrorMessage if exported
    try {
      const errMod = await import('../src/workers/mirakl/apiClient.js')
      getSafeErrorMessage = errMod.getSafeErrorMessage
    } catch (_) {
      try {
        const errMod = await import('../src/workers/reportWorker.js')
        getSafeErrorMessage = errMod.getSafeErrorMessage
      } catch (_) {}
    }
  })

  after(async () => {
    try {
      await Promise.race([
        reportQueue.close(),
        new Promise(resolve => setTimeout(resolve, 1000)),
      ])
    } catch (_) {}
    try { redisConnection.disconnect() } catch (_) {}
  })

  // ── AC-1: Phase messages (static) ─────────────────────────────────────────
  describe('AC-1: phase messages update at each transition (static)', () => {
    let src

    before(() => {
      src = codeLines(readFileSync(WORKER_PATH, 'utf8'))
    })

    test('worker source transitions to fetching_catalog status', () => {
      assert.ok(
        src.includes('fetching_catalog'),
        'Worker must update job status to "fetching_catalog" when starting OF21 phase'
      )
    })

    test('worker source transitions to scanning_competitors status', () => {
      assert.ok(
        src.includes('scanning_competitors'),
        'Worker must update job status to "scanning_competitors" when starting P11 phase'
      )
    })

    test('worker source transitions to building_report status', () => {
      assert.ok(
        src.includes('building_report'),
        'Worker must update job status to "building_report" when computing scores'
      )
    })

    test('worker source transitions to complete status', () => {
      assert.ok(
        src.includes("'complete'") || src.includes('"complete"'),
        'Worker must update job status to "complete" on success'
      )
    })

    test('worker source transitions to error status on failure', () => {
      assert.ok(
        src.includes("'error'") || src.includes('"error"'),
        'Worker must update job status to "error" on failure'
      )
    })
  })

  // ── AC-2: finally block always deletes key ────────────────────────────────
  describe('AC-2: finally block runs keyStore.delete(job_id) unconditionally', () => {
    let src

    before(() => {
      src = codeLines(readFileSync(WORKER_PATH, 'utf8'))
    })

    test('worker source has a finally block', () => {
      assert.ok(
        src.includes('finally'),
        'Worker must have a finally block to ensure keyStore cleanup always runs'
      )
    })

    test('keyStore.delete is called inside the finally block (static)', () => {
      // The finally block must contain keyStore.delete
      const finallyMatch = src.match(/finally\s*\{([^}]*(?:\{[^}]*\}[^}]*)*)\}/s)
      if (finallyMatch) {
        assert.ok(
          finallyMatch[1].includes('delete') || finallyMatch[1].includes('keyStore'),
          'The finally block must call keyStore.delete(job_id) to clear the API key'
        )
      } else {
        assert.ok(false, 'Could not parse finally block — ensure it contains keyStore.delete()')
      }
    })

    test('key is removed from keyStore after worker runs (integration)', async () => {
      if (!processJob) {
        return // processJob not exported — skip integration test
      }

      const jobId = 'job-finally-test-' + Date.now()
      set(jobId, 'test-api-key-orchestration')
      assert.equal(has(jobId), true, 'precondition: key must be in keyStore')

      const job = makeMockJob({ job_id: jobId })

      try {
        await processJob(job)
      } catch (_) {
        // Worker may fail due to stubbed dependencies — finally must still run
      }

      assert.equal(
        has(jobId),
        false,
        'keyStore.delete must have been called by the finally block — key must be gone'
      )
    })
  })

  // ── AC-3: EmptyCatalogError → job status = error ──────────────────────────
  describe('AC-3: 0 offers + 200 status → EmptyCatalogError → job error status', () => {
    let src

    before(() => {
      src = codeLines(readFileSync(WORKER_PATH, 'utf8'))
    })

    test('worker handles EmptyCatalogError and sets job to error status', () => {
      assert.ok(
        src.includes('EmptyCatalogError'),
        'Worker must handle EmptyCatalogError from fetchCatalog and set job status to error'
      )
    })

    test('worker uses getSafeErrorMessage for EmptyCatalogError message', () => {
      // Must not forward raw error to DB
      assert.ok(
        src.includes('getSafeErrorMessage') || src.includes('Não encontrámos'),
        'Worker must use getSafeErrorMessage() to get the Portuguese error message for empty catalog'
      )
    })
  })

  // ── AC-4: 401/403 → MiraklApiError → job error ───────────────────────────
  describe('AC-4: 401/403 → MiraklApiError → job error status with safe message', () => {
    let src

    before(() => {
      src = codeLines(readFileSync(WORKER_PATH, 'utf8'))
    })

    test('worker handles MiraklApiError and sets job to error status', () => {
      assert.ok(
        src.includes('MiraklApiError') || src.includes('error_type') || src.includes('401'),
        'Worker must handle MiraklApiError (401/403) and update job status to error'
      )
    })

    test('worker never exposes raw Mirakl error response to user/DB', () => {
      // Check that err.message is not directly stored as error_message
      const lines = src.split('\n').filter(l =>
        l.includes('error_message') && l.includes('err.message')
      )
      assert.equal(
        lines.length,
        0,
        'Worker must not store err.message as error_message — use getSafeErrorMessage() instead'
      )
    })
  })

  // ── AC-5: CatalogTruncationError → job error ─────────────────────────────
  describe('AC-5: total_count mismatch → CatalogTruncationError → job error', () => {
    let src

    before(() => {
      src = codeLines(readFileSync(WORKER_PATH, 'utf8'))
    })

    test('worker handles CatalogTruncationError', () => {
      assert.ok(
        src.includes('CatalogTruncationError') || src.includes('TruncationError'),
        'Worker must handle CatalogTruncationError from fetchCatalog'
      )
    })
  })

  // ── AC-6: error_message always from getSafeErrorMessage ───────────────────
  describe('AC-6: error_message always from getSafeErrorMessage() — never raw error', () => {
    let src

    before(() => {
      src = codeLines(readFileSync(WORKER_PATH, 'utf8'))
    })

    test('worker calls getSafeErrorMessage before storing error_message', () => {
      assert.ok(
        src.includes('getSafeErrorMessage'),
        'Worker must call getSafeErrorMessage(err) before storing any error_message to DB'
      )
    })

    test('worker does not log err.message directly', () => {
      assert.ok(
        !src.includes('err.message'),
        'Worker must not log err.message — raw Mirakl error messages may contain sensitive data'
      )
    })
  })

  // ── AC-7: Portuguese phase messages exact text ─────────────────────────────
  describe('AC-7: Portuguese phase messages match spec exactly', () => {
    let src

    before(() => {
      src = codeLines(readFileSync(WORKER_PATH, 'utf8'))
    })

    test('phase message "A preparar…" present (queued)', () => {
      assert.ok(
        src.includes('A preparar'),
        'Worker must use "A preparar…" as the queued phase message'
      )
    })

    test('phase message "A obter catálogo…" present (fetching_catalog start)', () => {
      assert.ok(
        src.includes('A obter catálogo'),
        'Worker must use "A obter catálogo…" as the fetching_catalog phase message'
      )
    })

    test('phase message "A verificar concorrentes…" present (scanning_competitors start)', () => {
      assert.ok(
        src.includes('A verificar concorrentes'),
        'Worker must use "A verificar concorrentes…" as the scanning_competitors phase message'
      )
    })

    test('phase message "A construir relatório…" present (building_report)', () => {
      assert.ok(
        src.includes('A construir relatório'),
        'Worker must use "A construir relatório…" as the building_report phase message'
      )
    })

    test('phase message "Relatório pronto!" present (complete)', () => {
      assert.ok(
        src.includes('Relatório pronto'),
        'Worker must use "Relatório pronto!" as the completion phase message'
      )
    })
  })

  // ── AC-8: getSafeErrorMessage maps errors to Portuguese ───────────────────
  describe('AC-8: getSafeErrorMessage returns correct Portuguese messages per error type', () => {
    let safeErrModule

    before(async () => {
      // getSafeErrorMessage may be in apiClient.js or reportWorker.js or a separate utils file
      const candidates = [
        '../src/workers/mirakl/apiClient.js',
        '../src/workers/reportWorker.js',
        '../src/workers/mirakl/fetchCatalog.js',
        '../src/middleware/errorHandler.js',
      ]
      for (const candidate of candidates) {
        try {
          const mod = await import(candidate)
          if (mod.getSafeErrorMessage) {
            safeErrModule = mod
            break
          }
        } catch (_) {}
      }
    })

    test('getSafeErrorMessage is exported from the codebase', () => {
      assert.ok(
        safeErrModule && typeof safeErrModule.getSafeErrorMessage === 'function',
        'getSafeErrorMessage must be exported so it can be used across worker phases'
      )
    })

    test('getSafeErrorMessage returns Portuguese message for 401 errors', () => {
      if (!safeErrModule) return
      const { getSafeErrorMessage: fn } = safeErrModule

      const err401 = Object.assign(new Error('Unauthorized'), { status: 401 })
      const msg = fn(err401)

      assert.ok(typeof msg === 'string', 'getSafeErrorMessage must return a string')
      // Must contain Portuguese content
      const isPortuguese = msg.includes('chave') || msg.includes('API') || msg.includes('Worten') || msg.includes('inválida')
      assert.ok(
        isPortuguese,
        `getSafeErrorMessage for 401 must return a Portuguese message about invalid API key, got: "${msg}"`
      )
    })

    test('getSafeErrorMessage returns Portuguese message for 403 errors', () => {
      if (!safeErrModule) return
      const { getSafeErrorMessage: fn } = safeErrModule

      const err403 = Object.assign(new Error('Forbidden'), { status: 403 })
      const msg = fn(err403)

      assert.ok(typeof msg === 'string', 'getSafeErrorMessage must return a string')
      const isPortuguese = msg.includes('chave') || msg.includes('API') || msg.includes('Worten') || msg.includes('inválida') || msg.includes('permissão')
      assert.ok(
        isPortuguese,
        `getSafeErrorMessage for 403 must return a Portuguese message about permissions, got: "${msg}"`
      )
    })

    test('getSafeErrorMessage returns Portuguese message for EmptyCatalogError', async () => {
      if (!safeErrModule) return
      const { getSafeErrorMessage: fn } = safeErrModule

      let emptyErr
      try {
        const fetchMod = await import('../src/workers/mirakl/fetchCatalog.js').catch(() => null)
        if (fetchMod && fetchMod.EmptyCatalogError) {
          emptyErr = new fetchMod.EmptyCatalogError('empty catalog')
        }
      } catch (_) {}

      if (!emptyErr) {
        emptyErr = Object.assign(new Error('empty'), { constructor: { name: 'EmptyCatalogError' } })
      }

      const msg = fn(emptyErr)
      assert.ok(typeof msg === 'string', 'getSafeErrorMessage must return a string')
      const isPortuguese = msg.includes('catálogo') || msg.includes('ofertas') || msg.includes('activas')
      assert.ok(
        isPortuguese,
        `getSafeErrorMessage for EmptyCatalogError must return a Portuguese message about empty catalog, got: "${msg}"`
      )
    })

    test('getSafeErrorMessage returns a fallback Portuguese message for unknown errors', () => {
      if (!safeErrModule) return
      const { getSafeErrorMessage: fn } = safeErrModule

      const unknownErr = new Error('Something completely unexpected')
      const msg = fn(unknownErr)

      assert.ok(typeof msg === 'string', 'getSafeErrorMessage must always return a string')
      assert.ok(msg.length > 0, 'getSafeErrorMessage fallback must not be empty')
      // Must not expose the raw error message
      assert.ok(
        !msg.includes('Something completely unexpected'),
        'getSafeErrorMessage must not expose raw error messages to users'
      )
    })
  })

  // ── STATIC: API key never logged in worker ─────────────────────────────────
  describe('STATIC: api_key / apiKey never appears in worker log calls', () => {
    let src

    before(() => {
      src = codeLines(readFileSync(WORKER_PATH, 'utf8'))
    })

    test('worker source does not log api_key in any log statement', () => {
      const lines = src.split('\n').filter(l =>
        (l.includes('log.') || l.includes('console.')) && l.includes('api_key')
      )
      assert.equal(
        lines.length,
        0,
        `Worker must not log api_key. Violating lines:\n${lines.join('\n')}`
      )
    })

    test('worker source does not log the full err object', () => {
      // Prevents accidental logging of API responses or keys via err
      const fullErrLog = /log\.\w+\s*\(\s*err\s*[,)]/
      assert.ok(
        !fullErrLog.test(src),
        'Worker must not pass full err object to log — only safe fields {job_id, error_code, error_type}'
      )
    })
  })
})
