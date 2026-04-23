// tests/nfr-s2-log-safety.invariants.test.js
// Cross-worker runtime invariant: the Mirakl api_key VALUE must never appear
// in captured log output during error scenarios.
//
// Replaces the grep-on-source pattern across epic7-7.1/7.2/7.3 ATDDs with
// runtime capture. Static scans caught literal "api_key" text; runtime capture
// catches aliased, spread, and template-interpolated leaks too.
//
// Scenarios (3 workers × 2 error types = 6):
//   - fetchCatalog + 401, fetchCatalog + 429
//   - scanCompetitors + 401, scanCompetitors + 429
//   - reportWorker.processJob + 401, reportWorker.processJob + 429
//
// Helper self-test ensures captureLogs actually works (prevents a silent
// false-pass if the spy ever breaks).
//
// Run: node --test tests/nfr-s2-log-safety.invariants.test.js

import { test, describe, before, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { captureLogs, assertNoSecretInCaptured } from './helpers/log-capture.js'

// ── env setup — must happen BEFORE any worker import ─────────────────────────
process.env.NODE_ENV        = 'test'
process.env.REDIS_URL       = process.env.REDIS_URL || 'redis://localhost:6379'
process.env.SQLITE_PATH     = ':memory:'
process.env.APP_BASE_URL    = 'http://localhost:3000'
process.env.WORTEN_BASE_URL = 'https://www.worten.pt'
process.env.PORT            = '3000'
process.env.RESEND_API_KEY  = 'test-key-dummy'
// Do NOT set LOG_LEVEL=silent here — this test needs pino to actually emit so
// captureLogs has something to observe. If a real leak existed, silencing pino
// would mask it.

// Sentinel: a unique, recognisable string that no real code path should ever
// emit. The test suite asserts this sentinel never appears in captured output.
const TEST_KEY = 'nfr-s2-test-api-key-sentinel-xyz'

// Shared response factory — same shape as Epic 3.1 / 7.1 / 7.3 stubs.
function makeResponse (status, body = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
    headers: new Map(),
  }
}

// ── helper self-test ─────────────────────────────────────────────────────────
// Proves captureLogs actually captures. Without this, a broken spy would make
// every other test in the file trivially pass.

describe('log-capture helper — self-test', () => {
  test('captures console.error arguments', async () => {
    const { captured } = await captureLogs(() => {
      console.error('sentinel-appears-here:', TEST_KEY)
    })
    assert.throws(
      () => assertNoSecretInCaptured(captured, TEST_KEY, 'self-test'),
      /sentinel "nfr-s2-test-api-key-sentinel-xyz" appeared in log output/
    )
  })

  test('captures process.stdout.write payloads', async () => {
    const { captured } = await captureLogs(() => {
      process.stdout.write(`pino-style line with ${TEST_KEY}\n`)
    })
    assert.throws(() => assertNoSecretInCaptured(captured, TEST_KEY))
  })

  test('passes cleanly when secret is absent', async () => {
    const { captured } = await captureLogs(() => {
      console.warn('innocuous message, no sentinel here')
    })
    assert.doesNotThrow(() => assertNoSecretInCaptured(captured, TEST_KEY))
  })
})

// ── Mirakl leaf-worker scenarios ─────────────────────────────────────────────

describe('NFR-S2 — fetchCatalog does not leak api_key in error paths', () => {
  let fetchCatalog
  let origFetch

  before(async () => {
    ({ fetchCatalog } = await import('../src/workers/mirakl/fetchCatalog.js'))
  })
  beforeEach(() => { origFetch = globalThis.fetch })
  afterEach(() => { globalThis.fetch = origFetch })

  test('401 Unauthorized — sentinel key never appears in logs', async () => {
    globalThis.fetch = async () => makeResponse(401, { message: 'Unauthorized' })
    const { captured } = await captureLogs(async () => {
      try {
        await fetchCatalog('https://example.com', TEST_KEY, undefined, 'nfr-s2-job-fc-401')
      } catch (_) { /* expected */ }
    })
    assertNoSecretInCaptured(captured, TEST_KEY, 'fetchCatalog + 401')
  })

  test('429 rate-limited (exhausted) — sentinel key never appears in logs', async () => {
    globalThis.fetch = async () => makeResponse(429, {})
    const { captured } = await captureLogs(async () => {
      try {
        await fetchCatalog('https://example.com', TEST_KEY, undefined, 'nfr-s2-job-fc-429')
      } catch (_) { /* expected */ }
    })
    assertNoSecretInCaptured(captured, TEST_KEY, 'fetchCatalog + 429')
  })
})

describe('NFR-S2 — scanCompetitors does not leak api_key in error paths', () => {
  let scanCompetitors
  let origFetch

  before(async () => {
    ({ scanCompetitors } = await import('../src/workers/mirakl/scanCompetitors.js'))
  })
  beforeEach(() => { origFetch = globalThis.fetch })
  afterEach(() => { globalThis.fetch = origFetch })

  test('401 Unauthorized — sentinel key never appears in logs', async () => {
    globalThis.fetch = async () => makeResponse(401, { message: 'Unauthorized' })
    const { captured } = await captureLogs(async () => {
      try {
        await scanCompetitors('https://example.com', TEST_KEY, ['1234567890123'])
      } catch (_) { /* expected */ }
    })
    assertNoSecretInCaptured(captured, TEST_KEY, 'scanCompetitors + 401')
  })

  test('429 rate-limited — sentinel key never appears in logs', async () => {
    globalThis.fetch = async () => makeResponse(429, {})
    const { captured } = await captureLogs(async () => {
      try {
        await scanCompetitors('https://example.com', TEST_KEY, ['1234567890123'])
      } catch (_) { /* expected */ }
    })
    assertNoSecretInCaptured(captured, TEST_KEY, 'scanCompetitors + 429')
  })
})

// ── reportWorker end-to-end scenarios ────────────────────────────────────────
// Exercises the catch-block logging at src/workers/reportWorker.js:103
// (log.error sanitised) and the finally keyStore.delete — driven via processJob.

describe('NFR-S2 — reportWorker.processJob does not leak api_key in error paths', () => {
  let processJob
  let keyStore
  let redisConnection

  before(async () => {
    // Silence Redis fail-fast listener (pattern from epic3-3.7 ATDD).
    const queueModule = await import('../src/queue/reportQueue.js')
    redisConnection = queueModule.redisConnection
    redisConnection.removeAllListeners('error')
    redisConnection.on('error', () => {})

    keyStore = await import('../src/queue/keyStore.js')
    ;({ processJob } = await import('../src/workers/reportWorker.js'))
  })

  function makeMockJob (job_id) {
    return {
      id: job_id,
      data: {
        job_id,
        report_id: `report-${job_id}`,
        email: 'test@example.com',
        marketplace_url: 'https://marketplace.worten.pt',
      },
      updateProgress: async () => {},
      log: async () => {},
    }
  }

  let origFetch
  beforeEach(() => { origFetch = globalThis.fetch })
  afterEach(() => { globalThis.fetch = origFetch })

  test('401 Unauthorized — sentinel key never appears in logs', async () => {
    const jobId = 'nfr-s2-job-rw-401'
    keyStore.set(jobId, TEST_KEY)
    globalThis.fetch = async () => makeResponse(401, { message: 'Unauthorized' })
    const { captured } = await captureLogs(async () => {
      try {
        await processJob(makeMockJob(jobId))
      } catch (_) { /* processJob catches internally but guard anyway */ }
    })
    assertNoSecretInCaptured(captured, TEST_KEY, 'reportWorker.processJob + 401')
  })

  test('429 rate-limited — sentinel key never appears in logs', async () => {
    const jobId = 'nfr-s2-job-rw-429'
    keyStore.set(jobId, TEST_KEY)
    globalThis.fetch = async () => makeResponse(429, {})
    const { captured } = await captureLogs(async () => {
      try {
        await processJob(makeMockJob(jobId))
      } catch (_) { /* processJob catches internally */ }
    })
    assertNoSecretInCaptured(captured, TEST_KEY, 'reportWorker.processJob + 429')
  })
})
