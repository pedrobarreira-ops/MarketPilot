// src/queue/reportQueue.js
// BullMQ Queue and ioredis connection for the 'report' generation pipeline.
// Importing this module establishes the Redis connection immediately (fail-fast).
// The Queue instance is the ONLY place jobs are enqueued — see POST /api/generate (Story 4.1).
// Security: no credential references, no key store imports, no job-data construction here.

import { Queue } from 'bullmq'
import Redis from 'ioredis'
import { config } from '../config.js'

// ioredis connection — maxRetriesPerRequest: null is required by BullMQ v5
// Without it BullMQ throws a deprecation error at Queue construction time.
// Do NOT use lazyConnect — we want the connection to be established on import
// so a dead Redis fails the process at startup rather than silently at first enqueue.
//
// In test mode ONLY: retryStrategy returns null so ioredis never schedules a
// reconnect timer after a connection failure. This prevents test files that
// import this module (without an explicit after() teardown) from keeping the
// Node event loop alive indefinitely. The instanceof Redis check in
// queue.atdd.test.js is unaffected — a real Redis instance is still created;
// retries are just disabled.
//
// PRODUCTION safety: in any non-test env (development/staging/production),
// the retryStrategy option is omitted entirely so ioredis uses its default
// exponential-backoff reconnect behaviour. Disabling retries in prod would
// be catastrophic (a transient network blip would permanently break the queue)
// — the `isTestEnv` guard ensures that never happens. See .env.example line 4:
// "Coolify deployment: set NODE_ENV=production in Coolify's env UI".
//
// This mirrors the identical `NODE_ENV === 'test'` guard in reportWorker.js
// (which skips BullMQ Worker instantiation in tests for the same reason).
const isTestEnv = process.env.NODE_ENV === 'test'
export const redisConnection = new Redis(config.REDIS_URL, {
  maxRetriesPerRequest: null,
  ...(isTestEnv ? { retryStrategy: () => null } : {}),
})

// Fail fast if Redis is unreachable at startup.
// After the initial connection succeeds, ioredis retries automatically — calling
// process.exit(1) on a transient post-startup error would kill a healthy server.
let redisConnected = false
redisConnection.on('ready', () => { redisConnected = true })

redisConnection.on('error', (err) => {
  process.stderr.write(JSON.stringify({
    error_type: err.constructor.name,
    error_code: err.code,
    msg: redisConnected
      ? 'Redis connection error — ioredis will retry'
      : 'Redis connection failed — server cannot start without Redis',
  }) + '\n')
  if (!redisConnected) {
    process.exit(1)
  }
})

// BullMQ Queue — all report generation jobs flow through this queue.
// Queue name 'report' must match the Worker registration in Story 2.2.
// defaultJobOptions enforce 3 retries with 5s exponential backoff across ALL jobs.
export const reportQueue = new Queue('report', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
  },
})
