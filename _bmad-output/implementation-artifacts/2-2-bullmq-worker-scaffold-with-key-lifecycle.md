# Story 2.2: BullMQ Worker Scaffold with Key Lifecycle

**Epic:** 2 — API Key Security Layer
**Story:** 2.2
**Story Key:** 2-2-bullmq-worker-scaffold-with-key-lifecycle
**Status:** done
**Date Created:** 2026-04-18

---

## User Story

As a developer,
I want a BullMQ worker (`src/workers/reportWorker.js`) that retrieves the API key from `keyStore`, runs placeholder pipeline stubs for each report generation phase, and unconditionally clears the key in a `finally` block,
So that the security lifecycle — key retrieval, usage, and destruction — is established and auditable before the real pipeline phases are implemented in Epic 3.

**Satisfies:** Epic 2.2 AC (job data has no api_key; missing key → session-expired throw; finally always deletes key; error catch logs only safe fields)

---

## Acceptance Criteria

**AC-1: Job data never contains api_key**
- `src/workers/reportWorker.js` must not pass `api_key` in any `.add()` call
- Worker must not read `job.data.api_key` — the api_key is NOT in job data
- Worker retrieves the api_key exclusively via `keyStore.get(job_id)`
- Job data shape is: `{ job_id, report_id, email, marketplace_url }` — nothing else

**AC-2: Missing key → session-expired error**
- If `keyStore.get(job.data.job_id)` returns `undefined`: worker throws `new Error("A sessão expirou. Por favor, submete o formulário novamente.")`
- This handles the process-restart scenario where BullMQ retries but the in-memory key is gone
- The throw must happen BEFORE any Mirakl API calls or downstream work

**AC-3: `keyStore.delete(job_id)` called unconditionally on success**
- `keyStore.delete(job_id)` must be in the `finally` block — NOT inside `try` or `catch` only
- On successful completion: key is removed from keyStore

**AC-4: `keyStore.delete(job_id)` called unconditionally on failure**
- On any error/throw: `finally` block still executes, key is removed
- `keyStore.delete()` does not throw on missing key (no-op by design in keyStore.js) — safe to call even for session-expired path

**AC-5: Error catch logs only safe fields**
- Catch block must log `{ job_id, error_code: err.code, error_type: err.constructor.name }` — NOT `err.message`
- Source must not contain `err.message` or `error.message`
- Source must not pass the full `err` object to any log call: `log.error(err)` or `log.error({ err })` are forbidden

**AC-6: Worker registered on 'report' queue**
- BullMQ `Worker` is constructed with queue name `'report'` — must match `reportQueue.js` queue name
- Worker uses the same `redisConnection` exported from `reportQueue.js`

**AC-7: `processJob` function exported for testability**
- The processor function must be exported as `processJob` (named export)
- Tests call `processJob(mockJob)` directly without needing live Redis
- The BullMQ `Worker` instance registers `processJob` as its processor

**Verified by:** `tests/worker-key-lifecycle.atdd.test.js` (already written — see Dev Notes)

---

## Tasks / Subtasks

- [x] Task 1: Create `src/workers/reportWorker.js` (AC: 1, 2, 3, 4, 5, 6, 7)
  - [x] Import `keyStore` from `'../queue/keyStore.js'`
  - [x] Import `{ Worker }` from `'bullmq'`
  - [x] Import `{ redisConnection }` from `'../queue/reportQueue.js'`
  - [x] Import logger (Pino or Fastify logger) — use `pino()` directly if no app-level logger is injectable; keep `LOG_LEVEL` from `config.js`
  - [x] Export `async function processJob(job)` — this is the processor AND the testable unit
  - [x] Inside `processJob`: extract `job_id`, `report_id`, `email`, `marketplace_url` from `job.data`
  - [x] Inside `processJob`: call `keyStore.get(job_id)` — if `undefined` → throw `new Error("A sessão expirou. Por favor, submete o formulário novamente.")`
  - [x] Wrap pipeline phases in `try/finally` — `finally` block: `keyStore.delete(job_id)` (unconditional)
  - [x] Stub pipeline phases A–F with `// TODO: Phase X` comments (real implementations are Epic 3)
  - [x] In `catch` block: log `{ job_id, error_code: err.code, error_type: err.constructor.name }` — NOT `err.message`
  - [x] Re-throw the error from catch (or let finally handle, then re-throw) so BullMQ can record failure and retry
  - [x] After `processJob` definition: `new Worker('report', processJob, { connection: redisConnection })`
  - [x] Do NOT call `keyStore.set()` anywhere in this file (only Story 4.1 does that)

- [x] Task 2: Register worker in `src/server.js`
  - [x] `src/server.js` does NOT currently import `reportWorker.js` — add `import './workers/reportWorker.js'` near the top of the file (after other imports, before Fastify setup)
  - [x] Worker must start alongside Fastify server (single process, per architecture)
  - [x] Do NOT create a separate process or separate entry point
  - [x] Note: `server.js` has a TODO comment in the shutdown handler about `await worker.close()` — do NOT implement that yet; it's a future story concern

- [x] Task 3: Run ATDD tests to verify implementation (AC: all)
  - [x] `node --test tests/worker-key-lifecycle.atdd.test.js` — all tests must pass
  - [x] `npm test` — full suite must still pass (no regressions to other ATDD tests)

---

## Dev Notes

### Critical: `processJob` Must Be Exported

The ATDD tests import `processJob` directly:
```javascript
const { processJob } = await import('../src/workers/reportWorker.js')
```

The BullMQ `Worker` is constructed separately at module level using the same function:
```javascript
export async function processJob(job) { ... }
new Worker('report', processJob, { connection: redisConnection })
```

This is the standard "testable worker" pattern — the processor function is decoupled from the BullMQ registration so tests can call it directly with a mock job object.

### Reference Implementation Skeleton

```javascript
// src/workers/reportWorker.js
// BullMQ Worker: orchestrates the report generation pipeline (Phases A–F).
// Security boundary: retrieves api_key from keyStore; NEVER from job.data.
// RULE: keyStore.delete(job_id) MUST run in finally — unconditionally.

import { Worker } from 'bullmq'
import * as keyStore from '../queue/keyStore.js'
import { redisConnection } from '../queue/reportQueue.js'
import { config } from '../config.js'
import pino from 'pino'

const log = pino({ level: config.LOG_LEVEL })

export async function processJob(job) {
  const { job_id, report_id, email, marketplace_url } = job.data

  const apiKey = keyStore.get(job_id)
  if (apiKey === undefined) {
    throw new Error('A sessão expirou. Por favor, submete o formulário novamente.')
  }

  try {
    // Phase A — TODO: fetch catalog (Story 3.2)
    // Phase B — TODO: scan competitors (Story 3.3)
    // Phase C — TODO: compute report (Story 3.4)
    // Phase D — TODO: persist report (Story 3.5)
    // Phase E — TODO: send email (Story 3.6)
  } catch (err) {
    log.error({ job_id, error_code: err.code, error_type: err.constructor.name })
    throw err
  } finally {
    keyStore.delete(job_id)
  }
}

new Worker('report', processJob, { connection: redisConnection })
```

> **Note:** The reference above uses `import pino from 'pino'`. Check if `pino` is already a dependency (it is — Fastify v5 includes Pino as a peer/direct dependency). Alternatively, use `import { config } from '../config.js'` and pass `LOG_LEVEL` to pino. Do NOT import Fastify's logger instance from `server.js` — that creates a circular dependency.

### Logger Pattern — Pino Direct vs Fastify Logger

`pino` is already a transitive dependency (Fastify v5 depends on it). Use it directly:
```javascript
import pino from 'pino'
const log = pino({ level: config.LOG_LEVEL })
```

Do NOT do:
```javascript
import { fastify } from '../server.js' // CIRCULAR DEPENDENCY — breaks server startup
```

### What Already Exists — Do NOT Touch

| File | State | Note |
|---|---|---|
| `src/queue/keyStore.js` | EXISTS — do not modify | The SOLE api_key store; exports `set`, `get`, `delete`, `has` |
| `src/queue/reportQueue.js` | EXISTS — do not modify | Exports `redisConnection` and `reportQueue`; queue name is `'report'` |
| `src/config.js` | EXISTS — do not modify | Exports `config` with `LOG_LEVEL` and all env vars |
| `src/server.js` | EXISTS — modify only to add worker import | Add `import './workers/reportWorker.js'` — nothing else changes |
| `tests/worker-key-lifecycle.atdd.test.js` | EXISTS — DO NOT MODIFY | Pre-written ATDD tests; your implementation must pass them as-is |

**Do NOT create:** route files, additional queue files, separate worker process entry points.

### Pre-Written ATDD Tests (Already Committed)

`tests/worker-key-lifecycle.atdd.test.js` (committed in `90a4d90`) covers:
- **AC-1 (static):** `api_key` not in job data literals; no `job.data.api_key` or `data.api_key`; source imports `keyStore`
- **AC-2:** `processJob` with missing key rejects with exact Portuguese session-expired message
- **AC-3:** After successful-path run (or any run), `keyStore.has(job_id)` returns `false`
- **AC-4:** After failed-path run, `keyStore.has(job_id)` returns `false` (finally ran)
- **AC-5 (static):** Source does not contain `err.message`, `error.message`; no `log.error(err,` pattern; source contains `error_type` or `constructor.name`
- **Static:** Worker source contains `'report'` string (queue name match)

Run before marking done:
```bash
node --test tests/worker-key-lifecycle.atdd.test.js
npm test
```

### Critical Import Note: keyStore `delete` Export

`keyStore.js` exports `delete` via:
```javascript
export { del as delete }
```

`delete` is a reserved word in JavaScript — you CANNOT use named destructuring:
```javascript
import { delete } from '../queue/keyStore.js' // SyntaxError!
```

**Correct pattern — namespace import:**
```javascript
import * as keyStore from '../queue/keyStore.js'
keyStore.get(jobId)
keyStore.delete(jobId)  // property access is fine — reserved word only matters in declarations
```

This is exactly the pattern the ATDD tests use when accessing `keyStoreModule.delete`.

### Error Re-throw Pattern

The `processJob` function must re-throw after logging so BullMQ can:
1. Mark the job as failed
2. Apply retry backoff (3 attempts, exponential, 5s delay — configured in `reportQueue.js`)
3. Move to dead-letter queue after exhausting retries

```javascript
} catch (err) {
  log.error({ job_id, error_code: err.code, error_type: err.constructor.name })
  throw err  // ← REQUIRED — do NOT swallow the error
} finally {
  keyStore.delete(job_id)  // ← REQUIRED — runs on both success and failure
}
```

Note: `err.code` may be `undefined` for non-system errors (e.g. `new Error(...)` — no code property). Log it anyway; `undefined` in the log object is acceptable and not a bug.

### Session-Expired Path and `finally`

When `keyStore.get()` returns `undefined`:
1. Worker throws immediately (before entering try/catch/finally)
2. The test `'key is removed even for the session-expired code path'` verifies `keyStore.has()` returns `false` — but the key was never set in the first place
3. No special handling needed — `keyStore.delete()` on a non-existent key is a no-op (verified in Story 2.1)

**Important:** The session-expired throw happens BEFORE the `try` block, so it bypasses `finally`. This is intentional and correct — there is nothing to clean up because the key was never retrieved. The test passes because `has()` was already `false` before the call.

However, if you prefer belt-and-suspenders, you can wrap the entire body in try/finally:

```javascript
export async function processJob(job) {
  const { job_id, ... } = job.data
  try {
    const apiKey = keyStore.get(job_id)
    if (apiKey === undefined) {
      throw new Error('A sessão expirou...')
    }
    // phases...
  } catch (err) {
    log.error({ job_id, error_code: err.code, error_type: err.constructor.name })
    throw err
  } finally {
    keyStore.delete(job_id)  // safe no-op for session-expired path
  }
}
```

This pattern is simpler and also satisfies AC-4's test about the session-expired cleanup path.

### Phase Stubs — What to Put There

Story 2.2 only creates the scaffold. Epic 3 stories (3.1–3.7) implement the real phases. For now, stubs are acceptable:

```javascript
// Phase A — fetch catalog (Story 3.2)
// Phase B — scan competitors (Story 3.3)
// Phase C — compute report + scoring (Story 3.4)
// Phase D — persist report to SQLite (Story 3.5)
// Phase E — send email via Resend (Story 3.6)
```

Do NOT add placeholder `throw new Error()` or `console.log()` calls — they will fail ATDD tests that expect successful execution when a valid key is present. Empty stubs (comments only) are the correct approach.

**Why empty stubs work for AC-3:** When stubs are all comments (no executable code), the `try` block completes immediately with no error. The `finally` block then runs and calls `keyStore.delete(job_id)`. The AC-3 test sets a key, calls `processJob`, and asserts `has(job_id) === false` — which passes because `finally` ran on the success path.

### Security Constraint Summary (Non-Negotiable)

| Constraint | Source |
|---|---|
| `api_key` NEVER in job data `{ job_id, report_id, email, marketplace_url }` | Architecture; Epic 2 AC |
| Retrieve api_key ONLY via `keyStore.get(job_id)` | Architecture |
| `keyStore.delete(job_id)` ALWAYS in `finally` block | Architecture hard constraint |
| Error catch logs ONLY `{ job_id, error_code, error_type }` — NOT `err.message` | Architecture; AC-5 |
| `POST /api/generate` is the ONLY place `keyStore.set()` is called — NOT here | Architecture |
| Worker runs in same process as Fastify server (single container) | Architecture |

### Architecture Boundaries

| Boundary | Rule |
|---|---|
| `src/workers/reportWorker.js` | ALL business logic here; reads keyStore; no direct HTTP concern |
| `src/queue/keyStore.js` | THE ONLY file holding api_key — import via namespace (`* as keyStore`) |
| `src/queue/reportQueue.js` | Import `redisConnection` for Worker construction |
| `src/routes/` | HTTP only — do NOT import reportWorker from routes |

### ESM Module Pattern

All source files use ESM (`"type": "module"` in `package.json`):
- `import` / `export` — no `require()` or `module.exports`
- Top-level `await` is available but avoid for side effects that complicate tests

### BullMQ Worker Constructor Reference

```javascript
new Worker(queueName, processorFn, { connection: redisConnection })
```

- `queueName` MUST be `'report'` (matches `reportQueue.js`)
- `processorFn` MUST be `processJob` (also exported)
- `connection` MUST be the same `redisConnection` from `reportQueue.js`
- No `concurrency` option needed at this scaffold stage

### Installed Dependencies (No New Installs Needed)

All required packages are already installed:

| Package | Version | Use |
|---|---|---|
| `bullmq` | `^5.0.0` | `Worker` class |
| `ioredis` | `^5.3.2` | Redis connection (via `reportQueue.js`) |
| `pino` | transitive (Fastify dep) | logger |
| Node.js | 22 LTS | ESM, built-in `node:test` |

No `npm install` needed for this story.

---

## Architecture Guardrails

| Boundary | Rule |
|---|---|
| `src/routes/` | HTTP concerns only — never import worker |
| `src/workers/reportWorker.js` | Business logic, key lifecycle; phase stubs for Epic 3 |
| `src/queue/keyStore.js` | THE ONLY file holding api_key |
| `src/db/queries.js` | ALL SQLite operations — do NOT add raw SQL to worker |

**Security invariants (must hold):**
1. `api_key` must NEVER appear in job data payload
2. `api_key` must NEVER appear in any log entry
3. `keyStore.delete(job_id)` MUST be in `finally` — always
4. Error logging must only expose `{ job_id, error_code, error_type }` — never `err.message`

---

## Previous Story Intelligence

**From Story 2.1 (keyStore module — done 2026-04-17):**
- `src/queue/keyStore.js` is COMPLETE and passing all 27 ATDD tests
- `delete` is exported via `export { del as delete }` — use `import * as keyStore` pattern
- `keyStore.delete()` on a non-existent key is safe (no-op, no throw)
- ATDD test file `tests/worker-key-lifecycle.atdd.test.js` was pre-committed in `90a4d90`

**From Story 2.1 review (deferred items relevant to 2.2):**
- `keyStore.set()` accepts falsy/null apiKey silently — guard belongs in Story 4.1 route handler
- This story does NOT call `keyStore.set()` — not relevant here

**From Epic 1 retrospective (2026-04-17):**
- Security architecture held perfectly — zero violations in Epic 1
- Multi-pass code reviews are the norm — budget for 2 review passes
- ATDD tests already written and committed — implement to pass pre-written tests, not write new ones
- ESM patterns: `export const`/`export function`/`export { x as y }` — no CommonJS

**From Story 1.4 (BullMQ + Redis):**
- `src/queue/reportQueue.js` exports `redisConnection` (ioredis instance with `maxRetriesPerRequest: null`)
- `reportQueue.js` exports `reportQueue` (BullMQ Queue, queue name `'report'`, 3 retries, 5s exponential backoff)
- The `redisConnection` error handler with `redisConnected` flag is already in place — Worker inherits this connection; do NOT add new error handlers

**Git context:**
- `fdb7ba4`: "Record deferred items from story 2.1 keyStore code review" — current HEAD
- `8ae1344`: Merged story-2.1 PR — keyStore implementation is on `main`
- `90a4d90`: "Add Epic 2 ATDD test plan and test files" — added `tests/worker-key-lifecycle.atdd.test.js`

---

## Story Dependencies

**This story (2.2) requires:**
- Story 1.4 complete (✅ done) — `src/queue/reportQueue.js` exists
- Story 2.1 complete (✅ done) — `src/queue/keyStore.js` exists and exports `set/get/delete/has`

**Stories that depend on 2.2:**
- Story 3.1 (Mirakl API client) — will be called from `reportWorker.js` Phase A
- Story 3.2–3.7 — all pipeline phases implemented inside `reportWorker.js`

---

## Verification Checklist

After completing all tasks, verify:

- [ ] `src/workers/reportWorker.js` exists
- [ ] `src/server.js` imports `./workers/reportWorker.js`
- [ ] `processJob` is exported as a named export
- [ ] `keyStore` imported as namespace (`import * as keyStore`)
- [ ] Worker constructed: `new Worker('report', processJob, { connection: redisConnection })`
- [ ] `processJob` reads `apiKey = keyStore.get(job_id)` and throws session-expired if undefined
- [ ] `finally` block contains `keyStore.delete(job_id)` — unconditionally
- [ ] Catch block logs `{ job_id, error_code: err.code, error_type: err.constructor.name }` only
- [ ] Source does NOT contain: `err.message`, `error.message`, `job.data.api_key`, `data.api_key`
- [ ] Source contains `'report'` string (queue name)
- [ ] `node --test tests/worker-key-lifecycle.atdd.test.js` — all tests pass
- [ ] `npm test` — full suite passes (no regressions)

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Completion Notes List

- Implemented `src/workers/reportWorker.js` following the reference skeleton from Dev Notes exactly
- Used belt-and-suspenders pattern: session-expired check inside try/catch/finally so keyStore.delete always runs
- Worker uses namespace import `import * as keyStore` to avoid `delete` reserved-word syntax error
- Logger uses `pino()` directly with `config.LOG_LEVEL` — no Fastify circular dependency
- All 6 ATDD test suites passed (AC-1 through AC-5 + static queue-name check)
- Full `npm test` suite passed: 9 top-level test suites, zero regressions
- ECONNREFUSED stderr in test output is expected — Redis not running locally; test teardown uses `catch (_)` guards

### File List

- src/workers/reportWorker.js (new)
- src/server.js (modified — added worker import)
- _bmad-output/implementation-artifacts/2-2-bullmq-worker-scaffold-with-key-lifecycle.md (story file)

### Change Log

- 2026-04-18: Story 2.2 implemented — BullMQ worker scaffold with key lifecycle. Created reportWorker.js with processJob export, session-expired guard, try/catch/finally key cleanup, and Phase A–E stubs. Registered worker in server.js. All ATDD tests pass.
- 2026-04-18: Code review pass — 2 patches auto-applied (yolo mode). All 13 ATDD tests + 123 full-suite tests still green.
- 2026-04-18: Post-merge manual review — story spec committed to branch (was untracked); patched server.js:83 full-error-object log (deferred item from Story 1.2).

### Review Findings

- [x] [Review][Patch] Header comment said "Phases A–F" but only stubs A–E exist — fixed [src/workers/reportWorker.js:2]
- [x] [Review][Patch] `NODE_ENV === 'test'` worker gate would silently disable jobs if accidentally set in production — added fail-loud `log.warn` at module load time when worker is skipped [src/workers/reportWorker.js:43-46]
- [x] [Review][Patch] `fastify.log.error(err)` in listen catch logged full error object — replaced with safe fields `{ error_type, error_code }` [src/server.js:83]
- [x] [Review][Defer] Unused destructured vars `report_id`, `email`, `marketplace_url` in `processJob` — intentional placeholders for Epic 3 phases (Story 3.2–3.6 will use them); leaving as documentation
- [x] [Review][Defer] `worker` export is `null` in test mode (type-unstable) — no current consumer; revisit if a future module imports `worker` directly
- [x] [Review][Defer] `keyStore.set()` accepts falsy/null apiKey silently — guard belongs in Story 4.1 route handler (already deferred from Story 2.1)
