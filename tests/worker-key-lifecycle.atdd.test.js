/**
 * ATDD tests for Story 2.2: Worker scaffold + key lifecycle
 *
 * These tests verify all acceptance criteria from the story spec:
 * AC-1: Job data never contains api_key field (static source check)
 * AC-2: keyStore.get returns undefined → worker fails with session-expired message
 * AC-3: finally block calls keyStore.delete(job_id) on SUCCESS
 * AC-4: finally block calls keyStore.delete(job_id) on FAILURE (unconditional)
 * AC-5: Error catch logs only {job_id, error_code, error_type} — NOT err.message (static)
 *
 * Uses Node.js built-in test runner (node:test) — no extra dependencies needed.
 * Run: node --test tests/worker-key-lifecycle.atdd.test.js
 *
 * The worker is tested by calling its exported processor function directly with
 * a mock BullMQ job object — no live Redis or Mirakl connection required.
 *
 * Implementation note: the worker processor function must be exported for
 * testability. Story 2.2 implementation should export a `processJob` function
 * (or similar name) in addition to registering it with BullMQ Worker.
 */

import { test, describe, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const WORKER_PATH = join(__dirname, '../src/workers/reportWorker.js')

// ── env setup ──────────────────────────────────────────────────────────────
process.env.NODE_ENV        = 'test'  // prevents BullMQ Worker from connecting at import time
process.env.REDIS_URL       = process.env.REDIS_URL       || 'redis://localhost:6379'
process.env.SQLITE_PATH     = process.env.SQLITE_PATH     || ':memory:'
process.env.APP_BASE_URL    = process.env.APP_BASE_URL    || 'http://localhost:3000'
process.env.WORTEN_BASE_URL = process.env.WORTEN_BASE_URL || 'https://www.worten.pt'
process.env.PORT            = process.env.PORT            || '3000'
process.env.LOG_LEVEL       = 'silent'

// ── helpers ────────────────────────────────────────────────────────────────

/**
 * Strip single-line and block comments from source so static assertions
 * are not falsely triggered by comments mentioning these identifiers.
 */
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
 * Build a mock BullMQ job object.
 * The data intentionally excludes api_key — as the spec requires.
 */
function makeMockJob({ job_id, report_id, email, marketplace_url } = {}) {
  return {
    id: job_id || 'test-job-id',
    data: {
      job_id: job_id || 'test-job-id',
      report_id: report_id || 'test-report-id',
      email: email || 'test@example.com',
      marketplace_url: marketplace_url || 'https://marketplace.worten.pt',
      // api_key intentionally absent — it is NEVER in job data
    },
    // BullMQ-compatible mock methods
    updateProgress: async () => {},
    log: async () => {},
  }
}

// ── test suite ─────────────────────────────────────────────────────────────

describe('Story 2.2 — Worker scaffold + key lifecycle', async () => {
  let keyStoreModule
  let set, get, del, has
  let reportQueue
  let redisConnection

  before(async () => {
    // Import keyStore for seeding and inspection
    keyStoreModule = await import('../src/queue/keyStore.js')
    set  = keyStoreModule.set
    get  = keyStoreModule.get
    del  = keyStoreModule.delete
    has  = keyStoreModule.has

    // Suppress Redis fail-fast listener — reportWorker.js imports reportQueue.
    // Must silence BEFORE importing reportWorker.js to prevent process.exit(1).
    // NODE_ENV=test (set above) prevents the BullMQ Worker from being instantiated,
    // so only the Queue's ioredis connection needs silencing.
    const queueModule = await import('../src/queue/reportQueue.js')
    redisConnection = queueModule.redisConnection
    reportQueue     = queueModule.reportQueue
    redisConnection.removeAllListeners('error')
    redisConnection.on('error', () => {}) // no-op in test env
  })

  after(async () => {
    // Close the queue then disconnect immediately — skip quit() which hangs on
    // pending commands when Redis is unavailable.
    try {
      await Promise.race([
        reportQueue.close(),
        new Promise(resolve => setTimeout(resolve, 1000)),
      ])
    } catch (_) { /* ignore */ }
    try { redisConnection.disconnect() } catch (_) { /* ignore */ }
  })

  // ── AC-1: api_key never in job data (static) ──────────────────────────────
  describe('AC-1: worker source never passes api_key in job data', () => {
    let src

    before(() => {
      src = codeLines(readFileSync(WORKER_PATH, 'utf8'))
    })

    test('worker source does not include api_key in any job data object literal', () => {
      // Pattern to catch: { job_id, ..., api_key, ... } or api_key: ...
      // We scan code lines only (comments stripped)
      const lines = src.split('\n')
      const violatingLines = lines.filter(line => {
        // Check for api_key being passed as a job data property
        return /api_key\s*:/.test(line) || /data\.api_key/.test(line)
      })
      assert.equal(
        violatingLines.length,
        0,
        `Worker must not put api_key in job data. Violating lines:\n${violatingLines.join('\n')}`
      )
    })

    test('worker reads api_key from keyStore — not from job.data', () => {
      // job.data.api_key must never appear
      assert.ok(
        !src.includes('job.data.api_key'),
        'Worker must never read api_key from job.data — only from keyStore.get(job_id)'
      )
      assert.ok(
        !src.includes('data.api_key'),
        'Worker must never access data.api_key — api_key is not in job data'
      )
    })

    test('worker source imports keyStore to retrieve the api_key', () => {
      assert.ok(
        src.includes('keyStore') || src.includes('keystore'),
        'Worker must import keyStore to retrieve the api_key by job_id'
      )
    })
  })

  // ── AC-2: Missing key → job transitions to 'error' status with session-expired message ─
  //
  // NOTE (Story 3.7 contract change): the original AC-2 tests asserted that
  // processJob REJECTS with the session-expired message. Story 3.7 changed the
  // catch block in reportWorker.js to SWALLOW errors and surface them via
  // db.updateJobError(job_id, getSafeErrorMessage(err)) instead — so BullMQ sees
  // the job as succeeded and does not retry a permanent error. These tests now
  // verify the new non-throwing contract: processJob resolves, and the job row
  // in generation_jobs has status='error'.
  describe('AC-2: keyStore.get returns undefined → job status=error, processJob does not throw', () => {
    test('processJob resolves (does not throw) when key is missing; status set to error in DB', async () => {
      const { processJob } = await import('../src/workers/reportWorker.js')
      const db = await import('../src/db/queries.js')

      const jobId = 'job-key-missing-' + Date.now()
      const reportId = 'report-' + Date.now()
      db.createJob(jobId, reportId, 'test@example.com', 'https://www.worten.pt')

      // Deliberately do NOT call keyStore.set for this job_id
      assert.equal(has(jobId), false, 'precondition: key must not be in keyStore')

      const job = makeMockJob({ job_id: jobId })

      await assert.doesNotReject(
        async () => processJob(job),
        'Story 3.7 contract: processJob must not throw — errors are surfaced via db.updateJobError'
      )

      const status = db.getJobStatus(jobId)
      assert.ok(status, 'job row must exist after processJob')
      assert.equal(
        status.status,
        'error',
        'Job status must be "error" when key is missing (new non-throwing contract)'
      )
    })

    test('finally block cleans up keyStore on missing-key code path', async () => {
      const { processJob } = await import('../src/workers/reportWorker.js')
      const db = await import('../src/db/queries.js')

      const jobId = 'job-cleanup-' + Date.now()
      const reportId = 'report-' + Date.now()
      db.createJob(jobId, reportId, 'test@example.com', 'https://www.worten.pt')

      const job = makeMockJob({ job_id: jobId })
      await processJob(job)

      assert.equal(has(jobId), false, 'finally block must run keyStore.delete even on error path')
    })
  })

  // ── AC-3: Key deleted on SUCCESS ──────────────────────────────────────────
  describe('AC-3: keyStore.delete(job_id) called unconditionally on success', () => {
    test('key is removed from keyStore after worker completes successfully', async () => {
      const { processJob } = await import('../src/workers/reportWorker.js')

      const successJobId = 'job-success-cleanup-' + Date.now()
      set(successJobId, 'test-api-key-success')
      assert.equal(has(successJobId), true, 'precondition: key must be in keyStore')

      const job = makeMockJob({ job_id: successJobId })

      // The worker may succeed or throw — either way, key must be gone
      try {
        await processJob(job)
      } catch (_) {
        // Worker may throw due to missing downstream stubs — that's fine for this test
      }

      assert.equal(
        has(successJobId),
        false,
        'keyStore.delete must have been called — key must be gone after worker runs (success path)'
      )
    })
  })

  // ── AC-4: Key deleted on FAILURE ──────────────────────────────────────────
  describe('AC-4: keyStore.delete(job_id) called unconditionally on failure', () => {
    test('key is removed from keyStore even when worker throws an error', async () => {
      const { processJob } = await import('../src/workers/reportWorker.js')

      const failJobId = 'job-fail-cleanup-' + Date.now()
      set(failJobId, 'test-api-key-fail')
      assert.equal(has(failJobId), true, 'precondition: key must be in keyStore')

      const job = makeMockJob({ job_id: failJobId })

      // Trigger the worker — it will fail at some point (no live Mirakl), but
      // the finally block must still delete the key regardless
      try {
        await processJob(job)
      } catch (_) {
        // Expected to throw — we only care that the key was cleaned up
      }

      assert.equal(
        has(failJobId),
        false,
        'keyStore.delete must have been called — key must be gone after worker throws (failure path, finally block)'
      )
    })

    test('key is removed even for the session-expired code path', async () => {
      const { processJob } = await import('../src/workers/reportWorker.js')

      // A missing-key job_id should still not "leak" — nothing to delete,
      // but delete must be called safely (no throw on unknown key)
      const noKeyJobId = 'job-session-expired-cleanup-' + Date.now()
      assert.equal(has(noKeyJobId), false, 'precondition: key is absent')

      const job = makeMockJob({ job_id: noKeyJobId })

      try {
        await processJob(job)
      } catch (_) {
        // Expected session-expired throw
      }

      // Key was never set, so has() returns false — the important thing is no crash
      assert.equal(
        has(noKeyJobId),
        false,
        'has() must return false — key was never set and delete in finally must not throw'
      )
    })
  })

  // ── AC-5: Error logging never exposes err.message (static) ────────────────
  describe('AC-5: error catch logs only {job_id, error_code, error_type} — not err.message', () => {
    let src

    before(() => {
      src = codeLines(readFileSync(WORKER_PATH, 'utf8'))
    })

    test('worker source does not log err.message', () => {
      assert.ok(
        !src.includes('err.message'),
        'Worker catch block must not log err.message — raw error messages may contain API secrets'
      )
    })

    test('worker source does not log error.message', () => {
      assert.ok(
        !src.includes('error.message'),
        'Worker catch block must not log error.message'
      )
    })

    test('worker source does not log the full err object directly', () => {
      // Catch patterns like: log.error(err) or log.error({ err })
      // We allow log.error({ job_id, error_code, error_type }) only
      const fullErrLogPattern = /log\.(error|warn|info)\s*\(\s*err\s*[,)]/
      assert.ok(
        !fullErrLogPattern.test(src),
        'Worker must not pass the full err object to log calls — only safe fields {job_id, error_code, error_type}'
      )
    })

    test('worker source logs error_type (safe field)', () => {
      assert.ok(
        src.includes('error_type') || src.includes('constructor.name'),
        'Worker catch block must log error_type (e.g. err.constructor.name)'
      )
    })
  })

  // ── STATIC: BullMQ Worker is named 'report' ───────────────────────────────
  describe('STATIC: BullMQ Worker queue name matches reportQueue name "report"', () => {
    let src

    before(() => {
      src = codeLines(readFileSync(WORKER_PATH, 'utf8'))
    })

    test('Worker is constructed with queue name "report"', () => {
      assert.ok(
        src.includes("'report'") || src.includes('"report"'),
        'Worker must be registered on the "report" queue — must match reportQueue.js queue name'
      )
    })
  })
})
