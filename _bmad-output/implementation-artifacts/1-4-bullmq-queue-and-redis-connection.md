# Story 1.4: BullMQ Queue and Redis Connection

**Epic:** 1 — Project Foundation & Infrastructure
**Story:** 1.4
**Story Key:** 1-4-bullmq-queue-and-redis-connection
**Status:** ready-for-dev
**Date Created:** 2026-04-17

---

## User Story

As a developer,
I want a BullMQ `Queue` instance connected to Redis with the correct queue name, job options, and fail-fast startup behaviour,
So that the generation pipeline has a reliable, pre-configured job queue that enforces retry logic from day one and refuses to start if Redis is unreachable.

**Satisfies:** Epic 1.4 AC (queue named `'report'`, Redis at `REDIS_URL`, fail-fast if unreachable, `defaultJobOptions`)

---

## Acceptance Criteria

**Given** the server starts
**When** `src/queue/reportQueue.js` is imported
**Then** a BullMQ `Queue` is instantiated with:
- `name: 'report'`
- `connection` pointing to `config.REDIS_URL` via an `ioredis` `Redis` instance
- `defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 5000 } }`

**And** if Redis is unreachable at startup (invalid URL or refused connection)
**Then** the process exits with a clear error message — fail-fast, not silent retry

**And** the `Queue` instance is exported as a named export `reportQueue` from `src/queue/reportQueue.js`

**And** `src/queue/reportQueue.js` does NOT contain any `api_key` reference, any `keyStore` import, or any job-data construction — those belong to Story 2.1 and the route in Story 4.1

**And** the existing `src/server.js` imports `reportQueue` so the Redis connection is established at server startup (fail-fast behaviour is triggered at boot, not on first job submission)

**Verification:** Start server with `REDIS_URL=redis://localhost:9999` (nothing listening) — the process must exit immediately with an error, not hang.

---

## Tasks / Subtasks

- [ ] Task 1: Create `src/queue/reportQueue.js` — BullMQ Queue + ioredis connection (AC: all)
  - [ ] Import `Queue` from `bullmq` and `Redis` from `ioredis`
  - [ ] Import `config` from `../config.js`
  - [ ] Create an `ioredis` `Redis` instance from `config.REDIS_URL`
  - [ ] Set `maxRetriesPerRequest: null` on the ioredis connection (required by BullMQ v5 — see Dev Notes)
  - [ ] Attach an `'error'` event listener on the Redis instance that logs the error type and exits the process
  - [ ] Instantiate `Queue('report', { connection, defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 5000 } } })`
  - [ ] Export the queue instance as `export const reportQueue`
  - [ ] Export the Redis connection as `export const redisConnection` (needed by the BullMQ Worker in Story 2.2)

- [ ] Task 2: Wire `reportQueue` import into `src/server.js` (AC: fail-fast at startup)
  - [ ] Add `import { reportQueue } from './queue/reportQueue.js'` near the top of `src/server.js`, after config import
  - [ ] Do NOT call any `reportQueue` methods in `server.js` — the import side-effect alone establishes the connection
  - [ ] No other changes to `server.js` are required

- [ ] Task 3: Fix regression in `tests/server.atdd.test.js` + write `tests/queue.atdd.test.js` (AC: verification)
  - [ ] **First**: Update `tests/server.atdd.test.js` to suppress the Redis error listener (see "CRITICAL REGRESSION" in Dev Notes) — do this before Task 2 so the existing 17 tests don't break
  - [ ] Set ALL required env vars (`REDIS_URL`, `SQLITE_PATH`, `APP_BASE_URL`, `WORTEN_BASE_URL`, `PORT`, `LOG_LEVEL`) at the TOP of the test file, before any imports that trigger `config.js`
  - [ ] After setting env vars, import `reportQueue` and `redisConnection` from `../src/queue/reportQueue.js`
  - [ ] Immediately suppress the error listener to prevent `process.exit(1)` if Redis is unreachable in CI: `redisConnection.removeAllListeners('error'); redisConnection.on('error', () => {})`
  - [ ] Test: `reportQueue` is a BullMQ `Queue` instance (use `instanceof Queue`)
  - [ ] Test: queue name is `'report'` (`reportQueue.name === 'report'`)
  - [ ] Test: `defaultJobOptions` has `attempts: 3` and `backoff.type === 'exponential'` and `backoff.delay === 5000`
  - [ ] Test: exported `redisConnection` is an ioredis `Redis` instance (use `instanceof Redis`)
  - [ ] In `after()` hook: call `await reportQueue.close()` and `await redisConnection.quit()` to avoid open handles warning

---

## Dev Notes

### What Already Exists (do NOT recreate)

| File | State | Note |
|---|---|---|
| `src/config.js` | **EXISTS** — import this | `config.REDIS_URL` is the ioredis connection URL; already validated as a valid URL at startup |
| `src/server.js` | **EXISTS** — minimal edit needed | Only add one import line; do NOT restructure or change any other code |
| `src/middleware/errorHandler.js` | EXISTS | No changes |
| `src/queue/.gitkeep` | Placeholder | Delete implicitly by creating the real file alongside it — git will show it as deleted, which is expected |

**Do NOT create:** `src/queue/keyStore.js` (Story 2.1), any route files, any worker files, any DB files — all out of scope.

### BullMQ v5 + ioredis: Critical Requirements

**`maxRetriesPerRequest: null` is MANDATORY for BullMQ v5:**

```javascript
const connection = new Redis(config.REDIS_URL, {
  maxRetriesPerRequest: null,  // BullMQ v5 requires this — omitting it causes a startup error
})
```

Without `maxRetriesPerRequest: null`, BullMQ v5 throws:
```
BullMQError [Error]: DEPRECATION: ioredis maxRetriesPerRequest must be null for BullMQ
```

**`lazyConnect` is NOT recommended** — we want fail-fast at startup. Without `lazyConnect`, ioredis connects immediately on construction.

### Fail-Fast Pattern via ioredis error event

The fail-fast requirement is satisfied by listening to the `'error'` event on the Redis instance:

```javascript
connection.on('error', (err) => {
  // Log error type only — not full message (may contain URLs with credentials)
  console.error({
    error_type: err.constructor.name,
    error_code: err.code,
  }, 'Redis connection failed — exiting')
  process.exit(1)
})
```

**Why `console.error` here instead of `fastify.log`?** The Redis connection is established before the Fastify logger is available in server.js (the import happens at module evaluation time). `console.error` to stderr is acceptable for this startup-time error.

**Why `process.exit(1)` and not throw?** The `'error'` event fires asynchronously. A thrown error in an event listener becomes an unhandled exception. `process.exit(1)` is the correct pattern for fail-fast infrastructure connections.

### Complete `src/queue/reportQueue.js` Implementation

```javascript
// src/queue/reportQueue.js
// BullMQ Queue and ioredis connection for the 'report' generation pipeline.
// Importing this module establishes the Redis connection immediately (fail-fast).
// The Queue instance is the ONLY place jobs are enqueued — see POST /api/generate (Story 4.1).
// This file must NEVER import keyStore or hold api_key references.

import { Queue } from 'bullmq'
import Redis from 'ioredis'
import { config } from '../config.js'

// ioredis connection — maxRetriesPerRequest: null is required by BullMQ v5
// Without it BullMQ throws a deprecation error at Queue construction time.
// Do NOT use lazyConnect — we want the connection to be established on import
// so a dead Redis fails the process at startup rather than silently at first enqueue.
export const redisConnection = new Redis(config.REDIS_URL, {
  maxRetriesPerRequest: null,
})

// Fail fast if Redis is unreachable — exit the process rather than hang or retry silently.
// Log error type/code only (not full message which may contain connection URL details).
redisConnection.on('error', (err) => {
  console.error(JSON.stringify({
    error_type: err.constructor.name,
    error_code: err.code,
    msg: 'Redis connection failed — server cannot start without Redis',
  }))
  process.exit(1)
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
```

### Adding the import to `src/server.js`

Add this import line immediately after the `config` import:

```javascript
import { config } from './config.js'
import { reportQueue } from './queue/reportQueue.js'  // ← ADD THIS LINE
import { errorHandler } from './middleware/errorHandler.js'
```

The variable `reportQueue` will appear unused (no lint warning expected in this project — no ESLint config), but the import is intentional: it triggers the Redis connection at server boot. Do NOT add `/* eslint-disable */` or similar — just add the import.

### ioredis Redis constructor with URL string

`new Redis(url, options)` accepts a full Redis URL string (e.g. `redis://localhost:6379`) as the first argument. This is the correct v5 API — do NOT use `new Redis({ host, port })` decomposed form; use `config.REDIS_URL` directly.

### Queue name consistency

The queue is named `'report'` (string literal). This exact name MUST also be used in:
- Story 2.2: `new Worker('report', handler, { connection: redisConnection })`
- Story 4.1: `reportQueue.add('generate', { ... })` — the queue name is already on the Queue instance

**Do NOT change the queue name** — it must match exactly for BullMQ to route jobs correctly.

### `redisConnection` export rationale

The Worker (Story 2.2) needs its own reference to the same ioredis `Redis` instance. BullMQ documentation recommends sharing one connection between Queue and Worker rather than creating multiple connections. Exporting `redisConnection` makes this straightforward in Story 2.2.

### Testing without a live Redis

The ATDD tests can verify the queue configuration (name, options, instance type) without a live Redis by checking properties synchronously before the connection is established. Use `await reportQueue.close()` in test cleanup — this gracefully closes the queue without requiring an active connection. Similarly `await redisConnection.quit()`.

If tests are run in CI without Redis, the error listener will fire. To prevent process exit during tests, you can temporarily override the listener:

```javascript
// In test setup only — suppress exit for config-only tests
redisConnection.removeAllListeners('error')
redisConnection.on('error', () => {}) // no-op for tests
```

### CRITICAL REGRESSION: `server.atdd.test.js` will trigger Redis after Task 2

**After you add the `reportQueue` import to `server.js` (Task 2)**, the existing `tests/server.atdd.test.js` will trigger a Redis connection attempt every time it imports `server.js` via `buildApp()`. The current test file already sets `REDIS_URL = 'redis://localhost:6379'` as a fallback — but if Redis is unreachable, the `redisConnection.on('error', ...)` listener will call `process.exit(1)` and kill the test runner.

**Solution — update `tests/server.atdd.test.js` to suppress the Redis error listener:**

Add these lines to `tests/server.atdd.test.js` immediately after the env var setup block (before `buildApp()`), using dynamic import to avoid loading `reportQueue.js` before env vars are set:

```javascript
// Suppress Redis error listener so server.atdd tests don't process.exit(1)
// if Redis is unavailable. This MUST come after the REDIS_URL env var is set.
// Dynamic import needed because reportQueue.js runs at module evaluation time.
const { redisConnection } = await import('../src/queue/reportQueue.js')
redisConnection.removeAllListeners('error')
redisConnection.on('error', () => {}) // no-op — connection errors are expected in unit tests
```

Place this suppression inside the `before()` hook of `tests/server.atdd.test.js`, after env setup but before `buildApp()`. This ensures all 17 existing tests continue to pass without Redis.

**If `tests/server.atdd.test.js` does NOT already have this suppression** when you run `npm test` after Task 2, the test suite will hang or exit with code 1. Fix it before considering Task 2 complete.

### Installed library versions

| Library | Version in `package.json` |
|---|---|
| `bullmq` | `^5.0.0` |
| `ioredis` | `^5.3.2` |

Both are already installed — do NOT run `npm install bullmq ioredis`.

### Security Constraint — No api_key in Queue

`src/queue/reportQueue.js` MUST NOT contain:
- Any import of `keyStore`
- Any variable named `api_key` or `apiKey`
- Any job data construction (`queue.add(...)` calls)

Those are in `POST /api/generate` route (Story 4.1) which calls `reportQueue.add('generate', { job_id, report_id, email, marketplace_url })` — never with an `api_key` field.

---

## Architecture Guardrails

These apply to ALL stories and were established in Story 1.1:

| Boundary | Rule |
|---|---|
| `src/routes/` | HTTP concerns only — no business logic, no Mirakl calls |
| `src/workers/` | All business logic, all Mirakl API calls |
| `src/queue/keyStore.js` | THE ONLY file that ever holds an API key (Story 2.1) |
| `src/db/queries.js` | ALL SQLite reads/writes |

**Security constraints (non-negotiable):**
1. `api_key` must NEVER appear in BullMQ job data
2. `api_key` must NEVER appear in any log entry
3. `api_key` must NEVER be written to any DB column
4. `keyStore.delete(job_id)` must ALWAYS be in a `finally` block
5. All Mirakl API calls must go through `src/workers/mirakl/apiClient.js`

---

## Previous Story Intelligence (Stories 1.1 + 1.2)

**Applied in this story:**

- `config.REDIS_URL` is validated as a valid URL at startup (config.js validates `urlVars` including `REDIS_URL`) — but "valid URL" ≠ "Redis reachable". The fail-fast ioredis error listener handles the runtime connection failure case.
- ESM pattern: use `import` everywhere — `import { Queue } from 'bullmq'`, `import Redis from 'ioredis'` (ioredis has a default export for `Redis`)
- `__dirname` equivalent in ESM: `path.dirname(fileURLToPath(import.meta.url))` — needed if the file uses paths, but `reportQueue.js` doesn't need it
- Test pattern: use Node.js built-in `node:test` and `node:assert/strict` — no Jest, no Mocha, no extra deps
- Test setup: set `process.env.REDIS_URL`, `process.env.SQLITE_PATH`, etc. before any import that touches `config.js`
- `better-sqlite3` is v11.0.0 (NOT v9) — relevant for Story 1.3 but noted here for context
- `src/middleware/errorHandler.js` convention: log `error_type` and `error_code`, never full `err.message` — apply the same pattern in the Redis error listener
- `server.js` already imports `config` at the top — place the `reportQueue` import right after it, before `errorHandler`

**Patterns from git history:**
- Story 1.2 ATDD tests use `before()` / `after()` hooks to build and close the Fastify app
- Tests use `fastify.inject()` for HTTP testing — for queue tests, direct property inspection is sufficient (no HTTP needed)
- Comments explain "why", not "what"

---

## Story Dependencies

**This story (1.4) requires Story 1.3 to be complete** (Story 1.3 creates `src/db/database.js`, `src/db/schema.js`, and `src/db/queries.js`). However, Story 1.4 does NOT import from `src/db/` — the dependency is ordering-only (both stories are in Epic 1 Foundation; 1.3 establishes the DB foundation before the queue setup). Story 1.4 can proceed if 1.3's files exist (even as stubs).

**Stories that depend on 1.4:**
- Story 2.1 (`keyStore.js`) — imports nothing from queue but must be created before 2.2
- Story 2.2 (Worker scaffold) — imports `redisConnection` from `reportQueue.js`
- Story 4.1 (POST /api/generate route) — imports `reportQueue` to call `reportQueue.add(...)`

---

## Verification Checklist

After completing all tasks, verify:

- [ ] `src/queue/reportQueue.js` exists and exports both `reportQueue` and `redisConnection`
- [ ] Queue name is exactly `'report'` (string, no typo)
- [ ] `defaultJobOptions.attempts === 3` and `backoff.type === 'exponential'` and `backoff.delay === 5000`
- [ ] `ioredis` `Redis` instance uses `maxRetriesPerRequest: null`
- [ ] `src/server.js` imports `reportQueue` (even if unused — for fail-fast side effect)
- [ ] `reportQueue.js` has NO `api_key`, `keyStore`, or `queue.add(...)` calls
- [ ] Start server with bad `REDIS_URL` → process exits immediately (not hang)
- [ ] `npm test` passes all tests (runs `node --test tests/**/*.test.js` — includes both `server.atdd.test.js` and `queue.atdd.test.js`)
- [ ] `node --test tests/queue.atdd.test.js` passes all tests in isolation
- [ ] `src/queue/.gitkeep` is deleted (git will show it as deleted — this is expected and correct)

---

## Dev Agent Record

### Agent Model Used

_To be filled by dev agent_

### Completion Notes List

_To be filled by dev agent_

### File List

_To be filled by dev agent_

### Change Log

_To be filled by dev agent_
