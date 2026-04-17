# Test Plan — Epic 2: API Key Security Layer

**Project:** MarketPilot Free Report
**Author:** Quinn (QA Agent) for Pedro
**Date:** 2026-04-17
**Epic:** 2 — API Key Security Layer
**Stories:** 2.1 keyStore module · 2.2 Worker scaffold + key lifecycle

---

## Scope

This test plan covers all acceptance criteria for Epic 2. Tests are written for the Node.js built-in test runner (`node:test`) — no extra dependencies needed. All tests are runnable without a live Redis or Mirakl connection.

---

## Test Files

| File | Stories Covered | Run command |
|------|----------------|-------------|
| `tests/keystore.atdd.test.js` | 2.1 | `node --test tests/keystore.atdd.test.js` |
| `tests/worker-key-lifecycle.atdd.test.js` | 2.2 | `node --test tests/worker-key-lifecycle.atdd.test.js` |

---

## Story 2.1 — keyStore Module (`src/queue/keyStore.js`)

### Acceptance Criteria Mapping

| AC | Description | Test(s) |
|----|-------------|---------|
| AC-1 | Exports `set`, `get`, `delete`, `has` — no other exports | T1.1, T1.2 |
| AC-2 | Backing `Map` is NOT exported | T1.3 |
| AC-3 | No serialisation imports (JSON.stringify, fs, etc.) | T1.4 (static) |
| AC-4 | No `.keys()` or `.entries()` enumeration on the backing map | T1.5 (static) |
| AC-5 | `api_key` never appears in any `queue.add()` call (architectural constraint — verified via source inspection) | T1.6 (static) |

### Test Cases

**T1.1 — Exported interface is exactly {set, get, delete, has}**
- Import the module
- Assert `typeof set === 'function'`, same for get, delete, has

**T1.2 — Functional set/get/delete/has behaviour**
- `set('job1', 'key-abc')` → `get('job1')` returns `'key-abc'`
- `has('job1')` returns `true`
- `delete('job1')` → `get('job1')` returns `undefined`
- `has('job1')` returns `false` after delete
- Multiple jobs: keys are isolated (job1 delete does not affect job2)

**T1.3 — Backing Map is not exported**
- All named exports from the module are functions, not Map instances
- No export matches `instanceof Map`

**T1.4 (static) — No serialisation imports**
- Source file does not contain `JSON.stringify`, `JSON.parse`, `fs.write`, `writeFile`, `serialize`

**T1.5 (static) — No .keys() / .entries() enumeration**
- Source file does not call `_store.keys()` or `_store.entries()`

**T1.6 (static) — api_key never in queue.add() call**
- Source of `keyStore.js` does not contain `.add(`
- Source does not import `reportQueue`

---

## Story 2.2 — Worker Scaffold + Key Lifecycle (`src/workers/reportWorker.js`)

### Acceptance Criteria Mapping

| AC | Description | Test(s) |
|----|-------------|---------|
| AC-1 | Job data: `{job_id, report_id, email, marketplace_url}` — NO `api_key` field | T2.1 (static) |
| AC-2 | `keyStore.get` returns `undefined` → worker fails with session-expired message | T2.2 |
| AC-3 | `finally` block: `keyStore.delete(job_id)` called on both success AND failure | T2.3, T2.4 |
| AC-4 | Error catch logs only `{job_id, error_code, error_type}` — NOT `err.message` | T2.5 (static + runtime) |

### Test Cases

**T2.1 (static) — api_key never in job data object**
- Source of `reportWorker.js` does not pass `api_key` to any `.add(` call
- Worker receives job data and never reads `job.data.api_key`

**T2.2 — Missing key → session-expired failure**
- Invoke worker with a `job_id` that is NOT in `keyStore`
- Assert worker throws / rejects with message: `"A sessão expirou. Por favor, submete o formulário novamente."`

**T2.3 — Key is deleted on success path**
- Set a key via `keyStore.set(job_id, 'test-key')`
- Run worker to successful completion (stub downstream pipeline phases)
- Assert `keyStore.has(job_id)` is `false` after run

**T2.4 — Key is deleted on error path**
- Set a key via `keyStore.set(job_id, 'test-key')`
- Inject an error during pipeline execution
- Assert `keyStore.has(job_id)` is `false` even after the error

**T2.5 (static + runtime) — Error logging never includes err.message**
- Static: source does not log `err.message` or `error.message` in catch blocks
- Runtime: capture log output, trigger an error — assert no raw error message text appears in logs; only `{job_id, error_code, error_type}` keys present

---

## Security Invariants (Cross-Cutting)

These are verified across both stories:

| Invariant | Test approach |
|-----------|---------------|
| `api_key` never in BullMQ job payload | Static source scan of `keyStore.js` + `reportWorker.js` |
| `api_key` never logged | Static scan for `console.log` with api_key + runtime Pino capture |
| DB schema has no `api_key` column | Verified in Story 1.3 tests — referenced here for traceability |
| `keyStore` is the single source of truth | Only `src/queue/keyStore.js` holds keys — no other file stores api_key beyond function scope |

---

## Test Execution

```bash
# Run Epic 2 tests only
node --test tests/keystore.atdd.test.js
node --test tests/worker-key-lifecycle.atdd.test.js

# Run all tests
node --test tests/**/*.test.js
```

No live Redis or Mirakl API required. All tests use in-process mocks and stubs.

---

## Pass Criteria

All tests must pass (zero failures, zero skips) before Story 2.1 and 2.2 are marked `done` in sprint-status.yaml.
