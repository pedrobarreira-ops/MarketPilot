/**
 * ATDD tests for Story 1.4: BullMQ Queue and Redis Connection
 *
 * These tests verify all acceptance criteria from the story spec:
 * AC-1: reportQueue is a BullMQ Queue instance named 'report'
 * AC-2: defaultJobOptions has attempts:3, exponential backoff, delay:5000
 * AC-3: redisConnection is an ioredis Redis instance
 * AC-4: reportQueue.js exports ONLY reportQueue and redisConnection — no api_key, no keyStore
 * AC-5: redisConnection uses maxRetriesPerRequest: null (BullMQ v5 requirement)
 *
 * Uses Node.js built-in test runner (node:test) — no extra dependencies needed.
 * Run: node --test tests/queue.atdd.test.js
 *
 * Tests verify configuration properties synchronously — no live Redis required.
 * The error listener is suppressed in before() to prevent process.exit(1) in CI
 * where Redis may be unavailable.
 */

import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'

// ── env setup ──────────────────────────────────────────────────────────────
// Set required env vars BEFORE any import that touches config.js.
// These must be at the top-level, not inside a before() hook, because
// module imports are hoisted and config.js validates at evaluation time.
process.env.REDIS_URL       = process.env.REDIS_URL       || 'redis://localhost:6379'
process.env.SQLITE_PATH     = process.env.SQLITE_PATH     || '/tmp/test.db'
process.env.APP_BASE_URL    = process.env.APP_BASE_URL    || 'http://localhost:3000'
process.env.WORTEN_BASE_URL = process.env.WORTEN_BASE_URL || 'https://www.worten.pt'
process.env.PORT            = process.env.PORT            || '3000'
process.env.LOG_LEVEL       = process.env.LOG_LEVEL       || 'silent'

// ── test suite ─────────────────────────────────────────────────────────────

describe('Story 1.4 — BullMQ Queue and Redis Connection', async () => {
  let Queue
  let Redis
  let reportQueue
  let redisConnection

  before(async () => {
    // Import Queue and Redis constructors for instanceof checks
    const bullmq = await import('bullmq')
    Queue = bullmq.Queue

    const ioredis = await import('ioredis')
    // ioredis has a default export
    Redis = ioredis.default

    // Import the queue module — this establishes the Redis connection immediately.
    // The dynamic import MUST come after env vars are set (config.js reads them).
    const queueModule = await import('../src/queue/reportQueue.js')
    reportQueue = queueModule.reportQueue
    redisConnection = queueModule.redisConnection

    // Suppress the fail-fast error listener so tests don't call process.exit(1)
    // when Redis is unavailable (e.g. in CI). We replace it with a no-op.
    redisConnection.removeAllListeners('error')
    redisConnection.on('error', () => {
      // no-op — connection errors are expected in unit tests without a live Redis
    })
  })

  after(async () => {
    // Graceful cleanup to avoid open handles warning from the test runner.
    // Each step is wrapped with a 2s timeout — close() can hang if BullMQ is
    // mid-reconnect against an unreachable Redis, which would pin the runner.
    try {
      await Promise.race([
        reportQueue.close(),
        new Promise(resolve => setTimeout(resolve, 2000)),
      ])
    } catch (_) { /* ignore */ }
    try {
      await Promise.race([
        redisConnection.quit(),
        new Promise(resolve => setTimeout(resolve, 2000)),
      ])
    } catch (_) { /* ignore */ }
    // Ensure the socket is destroyed even if quit() did not drain cleanly —
    // otherwise the open ioredis socket keeps node --test alive.
    try { redisConnection.disconnect() } catch (_) { /* ignore */ }
  })

  // ── AC-1: Queue instance and name ─────────────────────────────────────────
  describe('AC-1: reportQueue is a BullMQ Queue instance named "report"', () => {
    test('reportQueue is an instance of BullMQ Queue', () => {
      assert.ok(
        reportQueue instanceof Queue,
        'reportQueue must be an instance of BullMQ Queue'
      )
    })

    test('queue name is exactly "report"', () => {
      assert.equal(
        reportQueue.name,
        'report',
        'queue name must be the string "report" — must match the Worker in Story 2.2'
      )
    })
  })

  // ── AC-2: defaultJobOptions ───────────────────────────────────────────────
  describe('AC-2: defaultJobOptions enforce retry logic', () => {
    test('defaultJobOptions.attempts is 3', () => {
      const opts = reportQueue.defaultJobOptions
      assert.equal(
        opts.attempts,
        3,
        'attempts must be 3 — every job gets three chances before failing permanently'
      )
    })

    test('defaultJobOptions.backoff.type is "exponential"', () => {
      const opts = reportQueue.defaultJobOptions
      assert.equal(
        opts.backoff?.type,
        'exponential',
        'backoff type must be "exponential"'
      )
    })

    test('defaultJobOptions.backoff.delay is 5000', () => {
      const opts = reportQueue.defaultJobOptions
      assert.equal(
        opts.backoff?.delay,
        5000,
        'backoff delay must be 5000ms'
      )
    })
  })

  // ── AC-3: redisConnection is an ioredis Redis instance ───────────────────
  describe('AC-3: redisConnection is an ioredis Redis instance', () => {
    test('redisConnection is an instance of ioredis Redis', () => {
      assert.ok(
        redisConnection instanceof Redis,
        'redisConnection must be an instance of ioredis Redis'
      )
    })

    test('redisConnection has maxRetriesPerRequest set to null (BullMQ v5 requirement)', () => {
      // BullMQ v5 requires maxRetriesPerRequest: null — omitting it causes startup error.
      // We verify behaviorally: if the Queue was constructed successfully (no deprecation
      // error thrown), the option was set correctly. We also check via the connector options
      // which ioredis exposes on the instance (not a private symbol, it is the public API).
      // ioredis stores the merged options as `redisConnection.options` (documented property).
      assert.equal(
        redisConnection.options.maxRetriesPerRequest,
        null,
        'maxRetriesPerRequest must be null — required by BullMQ v5 (omitting it throws a deprecation error)'
      )
    })
  })

  // ── AC-4: Security constraint — no api_key or keyStore ───────────────────
  describe('AC-4: reportQueue.js has no api_key, keyStore, or job.add() calls', () => {
    /**
     * Helper: return only non-comment, non-blank lines from source.
     * Strips // line comments and /* block comments * / so that AC-4 assertions
     * are not falsely triggered by explanatory comments referencing these identifiers.
     */
    function codeLines(src) {
      // Remove block comments first, then filter out line comments
      const noBlock = src.replace(/\/\*[\s\S]*?\*\//g, '')
      return noBlock
        .split('\n')
        .filter(line => {
          const trimmed = line.trim()
          return trimmed.length > 0 && !trimmed.startsWith('//')
        })
        .join('\n')
    }

    test('reportQueue module source does not contain "api_key"', async () => {
      const { readFileSync } = await import('node:fs')
      const { fileURLToPath } = await import('node:url')
      const { dirname, join } = await import('node:path')

      // Resolve the path relative to this test file
      const __dirname = dirname(fileURLToPath(import.meta.url))
      const src = readFileSync(join(__dirname, '../src/queue/reportQueue.js'), 'utf8')

      assert.ok(
        !codeLines(src).includes('api_key'),
        'reportQueue.js must NOT contain "api_key" in executable code — api_key belongs in Story 4.1 route'
      )
    })

    test('reportQueue module source does not import keyStore', async () => {
      const { readFileSync } = await import('node:fs')
      const { fileURLToPath } = await import('node:url')
      const { dirname, join } = await import('node:path')

      const __dirname = dirname(fileURLToPath(import.meta.url))
      const src = readFileSync(join(__dirname, '../src/queue/reportQueue.js'), 'utf8')

      assert.ok(
        !codeLines(src).includes('keyStore'),
        'reportQueue.js must NOT import keyStore in executable code — keyStore is Story 2.1'
      )
    })

    test('reportQueue module source does not contain queue.add() job-data construction', async () => {
      const { readFileSync } = await import('node:fs')
      const { fileURLToPath } = await import('node:url')
      const { dirname, join } = await import('node:path')

      const __dirname = dirname(fileURLToPath(import.meta.url))
      const src = readFileSync(join(__dirname, '../src/queue/reportQueue.js'), 'utf8')

      // .add() calls belong to POST /api/generate route (Story 4.1), not here
      assert.ok(
        !codeLines(src).includes('.add('),
        'reportQueue.js must NOT contain .add() calls in executable code — job enqueuing belongs in Story 4.1'
      )
    })
  })
})
