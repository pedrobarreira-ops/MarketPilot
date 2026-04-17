# Story 2.1: keyStore Module

**Epic:** 2 — API Key Security Layer
**Story:** 2.1
**Story Key:** 2-1-keystore-module
**Status:** done
**Date Created:** 2026-04-17

---

## User Story

As a developer,
I want a dedicated in-memory key store (`src/queue/keyStore.js`) that safely holds API keys indexed by `job_id` without serialising or exporting the backing data structure,
So that the application has a single, auditable security boundary for API key lifetime — preventing keys from leaking into the queue payload, logs, database, or any other persistent medium.

**Satisfies:** Epic 2.1 AC (set/get/delete/has exports, backing Map private, no serialisation, no enumeration, api_key never in queue.add())

---

## Acceptance Criteria

**AC-1: Exported interface**
- `src/queue/keyStore.js` exports exactly four named functions: `set`, `get`, `delete`, `has`
- All four are plain functions (not methods), each accepting `job_id` as first argument
- `set(jobId, apiKey)` — stores the key
- `get(jobId)` — returns the stored key or `undefined` if not found
- `delete(jobId)` — removes the key; no-op and no throw if not found
- `has(jobId)` — returns `true` if key exists, `false` otherwise

**AC-2: Backing Map is NOT exported**
- The `Map` instance used as the backing store must NOT be exported (not named, not default)
- No export from the module may be an `instanceof Map`

**AC-3: No serialisation imports**
- The source file must not contain: `JSON.stringify`, `JSON.parse`, `import 'fs'`, `import 'node:fs'`, `writeFile`, `appendFile`, or any disk write operation
- The API key must only ever exist in memory

**AC-4: No enumeration**
- The source file must not call `.keys()`, `.entries()`, or `.values()` on the backing Map
- No `for...of` iteration over the Map (e.g. `for (const [k, v] of _store)`)
- Preventing bulk extraction of all stored keys is a security requirement

**AC-5: api_key never reaches queue.add()**
- `keyStore.js` must not import `reportQueue` or `bullmq`
- `keyStore.js` must not contain `.add(` calls
- This file is a pure key store with zero queue coupling

**Verified by:** `tests/keystore.atdd.test.js` (already written — see Dev Notes)

---

## Tasks / Subtasks

- [x] Task 1: Create `src/queue/keyStore.js` (AC: 1, 2, 3, 4, 5)
  - [x] Declare a module-scoped `const _store = new Map()` — NOT exported
  - [x] Export `function set(jobId, apiKey) { _store.set(jobId, apiKey) }`
  - [x] Export `function get(jobId) { return _store.get(jobId) }`
  - [x] Export `function del(jobId) { _store.delete(jobId) }` — **export name must be `delete`** (reserved word workaround: use `export { del as delete }` or `export function` with renaming — see Dev Notes)
  - [x] Export `function has(jobId) { return _store.has(jobId) }`
  - [x] Add JSDoc/comment explaining: this is the SOLE api_key store; never export `_store`; never serialise
  - [x] Do NOT import anything — zero imports; this file is self-contained

- [x] Task 2: Delete placeholder `src/queue/.gitkeep` if it still exists
  - [x] Check: `src/queue/.gitkeep` was deleted in Story 1.4 when `reportQueue.js` was created
  - [x] If `.gitkeep` is gone, no action needed
  - [x] If it still exists (unlikely), `git rm src/queue/.gitkeep`

- [x] Task 3: Run existing ATDD tests to verify implementation (AC: all)
  - [x] `node --test tests/keystore.atdd.test.js` — all tests must pass
  - [x] `npm test` — full suite must still pass (no regressions to server/queue/db tests)

---

## Dev Notes

### Critical: Exporting `delete` (reserved word)

`delete` is a JavaScript reserved word. You CANNOT write:

```javascript
export function delete(jobId) { ... }  // SyntaxError
```

**Correct pattern — use a local name and re-export as `delete`:**

```javascript
const _store = new Map()

export const set    = (jobId, apiKey) => { _store.set(jobId, apiKey) }
export const get    = (jobId)         => _store.get(jobId)
export const has    = (jobId)         => _store.has(jobId)

// 'delete' is a reserved word — cannot be a direct export identifier
function del(jobId) { _store.delete(jobId) }
export { del as delete }
```

The ATDD test imports it as:
```javascript
del = keyStoreModule.delete  // works fine — property access, not a declaration
```

**Alternative pattern (also valid):**
```javascript
export { del as delete }
```

Both patterns satisfy the tests. Pick whichever reads more naturally to you.

### Complete Reference Implementation

```javascript
// src/queue/keyStore.js
// THE security boundary for API key lifetime in this application.
//
// RULES (non-negotiable):
// 1. _store is NEVER exported — it is module-private.
// 2. API keys are NEVER serialised (no JSON.stringify, no fs writes).
// 3. The Map is NEVER enumerated (no .keys(), .entries(), .values()).
// 4. This file has ZERO imports — pure key store, no queue coupling.
// 5. keyStore.delete(job_id) MUST be called in the worker's finally block (Story 2.2).
//
// Only src/routes/generate.js (Story 4.1) calls set().
// Only src/workers/reportWorker.js (Story 2.2) calls get() and delete().

const _store = new Map()

export const set    = (jobId, apiKey) => { _store.set(jobId, apiKey) }
export const get    = (jobId)         => _store.get(jobId)
export const has    = (jobId)         => _store.has(jobId)

function del(jobId) { _store.delete(jobId) }
export { del as delete }
```

### What Already Exists — Do NOT Touch

| File | State | Note |
|---|---|---|
| `src/queue/reportQueue.js` | EXISTS — do not modify | Already exports `redisConnection` (used by Story 2.2) and `reportQueue` (used by Story 4.1) |
| `src/server.js` | EXISTS — do not modify | Already imports `reportQueue` for fail-fast Redis; no changes needed in this story |
| `src/config.js` | EXISTS — do not modify | Already validates all env vars |
| `src/db/queries.js` | EXISTS — do not modify | Already provides DB operations with no `api_key` column |
| `tests/keystore.atdd.test.js` | EXISTS — DO NOT MODIFY | Pre-written ATDD tests; your implementation must pass them as-is |

**Do NOT create:** `src/workers/reportWorker.js` (Story 2.2), any route files, any changes to `reportQueue.js`.

### Pre-Written ATDD Tests (Already Committed)

The test file `tests/keystore.atdd.test.js` already exists in the repo (committed in `90a4d90`). It covers:

- AC-1: `set`, `get`, `delete`, `has` exported as functions
- AC-2: No named export is a `Map` instance
- AC-3 (static): No `JSON.stringify`, `JSON.parse`, `fs` import, `writeFile`
- AC-4 (static): No `.keys()`, `.entries()`, `.values()`, no `for...of _store`
- AC-5 (static): No `reportQueue` import, no `.add(`, no `bullmq` import
- Functional: set/get/delete/has correctness; key isolation; overwrite; concurrent jobs; no-throw delete of non-existent key

**Run before marking done:**
```bash
node --test tests/keystore.atdd.test.js
npm test
```

### Security Constraint Summary (Non-Negotiable)

| Constraint | Source |
|---|---|
| `api_key` NEVER in BullMQ job data | Architecture; Epic 2 AC |
| `api_key` NEVER in any log entry | Architecture; Pino redact config already active |
| `api_key` NEVER in any DB column | Architecture; Story 1.3 schema has no `api_key` column |
| `keyStore.delete(job_id)` ALWAYS in `finally` block | Architecture; enforced in Story 2.2 |
| `POST /api/generate` is the ONLY place `keyStore.set()` is called | Architecture; enforced in Story 4.1 |
| `src/queue/keyStore.js` is the ONLY file that holds api_key | Architecture hard constraint |

### Why Zero Imports?

`keyStore.js` intentionally has zero imports:
- No `config.js` import — key store needs no configuration
- No `reportQueue.js` import — would create a circular security risk
- No `bullmq` import — pure data store, no queue coupling
- No `node:fs` import — keys must never be written to disk

The ATDD test AC-5 specifically checks that `bullmq` and `reportQueue` are absent from the source. The test AC-3 checks that `fs` is absent.

### What the Worker (Story 2.2) Will Do with keyStore

Story 2.2 (`src/workers/reportWorker.js`) will:
1. Call `keyStore.get(job.data.job_id)` at the START of the worker handler
2. If result is `undefined` (process restarted and key was lost): throw `new Error("A sessão expirou. Por favor, submete o formulário novamente.")`
3. Pass the retrieved key to the Mirakl API client functions
4. In `finally` block (unconditionally): call `keyStore.delete(job.data.job_id)`

This story (2.1) only creates the keyStore. Story 2.2 uses it.

### ESM Module Pattern (Established in Epic 1)

All source files use ESM (`"type": "module"` in `package.json`):
- Use `export const` / `export function` / `export { x as y }`
- Do NOT use `module.exports = ...`
- No `require()` calls

### Installed Library Versions (No New Installs Needed)

This story creates one file with zero dependencies. No `npm install` needed.

| Library | Version |
|---|---|
| `bullmq` | `^5.0.0` (already installed; not used in keyStore.js) |
| `ioredis` | `^5.3.2` (already installed; not used in keyStore.js) |
| Node.js | 22 LTS |

---

## Architecture Guardrails

| Boundary | Rule |
|---|---|
| `src/routes/` | HTTP concerns only — no business logic |
| `src/workers/` | All business logic, all Mirakl API calls |
| `src/queue/keyStore.js` | THE ONLY file that ever holds an API key |
| `src/db/queries.js` | ALL SQLite reads/writes — no `api_key` column |

**Key security invariants:**
1. `api_key` must NEVER appear in BullMQ job data (`{ job_id, report_id, email, marketplace_url }` only)
2. `api_key` must NEVER appear in any log entry (Pino redact already active in `server.js`)
3. `api_key` must NEVER be written to any DB column (schema verified in Story 1.3)
4. `keyStore.delete(job_id)` must ALWAYS be in a `finally` block (Story 2.2 concern)
5. All Mirakl API calls must go through `src/workers/mirakl/apiClient.js` (Story 3.1 concern)

---

## Previous Story Intelligence (Epic 1 + Retro)

**From Epic 1 retrospective (2026-04-17):**
- Security architecture held perfectly in Epic 1 — zero violations. This story is the foundation of Epic 2 (the most security-critical epic). Extra scrutiny warranted.
- Multi-pass code reviews are the norm — budget for 2 review passes.
- ATDD tests already written and committed — you implement to pass the pre-written tests, not write new tests.

**From Story 1.4 patterns:**
- `src/queue/reportQueue.js` already exists. Its `_store` variable naming convention was established there; use `_store` for the Map in `keyStore.js` for consistency (the ATDD test's static checks look for `_store` in `for...of` pattern: `/for\s*\(.*of\s+_store/`).
- ESM export patterns: `export const foo = ...` is the established convention.
- `src/queue/.gitkeep` was deleted in Story 1.4 when `reportQueue.js` was created. No action needed.

**From Story 1.2 patterns:**
- Zero-import files are valid and used (`errorHandler.js` has minimal imports).
- Comments explain "why", not "what" — keep this convention.

**Git history context:**
- Latest commit `90a4d90`: "Add Epic 2 ATDD test plan and test files for API Key Security Layer" — adds `tests/keystore.atdd.test.js` and `tests/worker-key-lifecycle.atdd.test.js`. These are pre-written and must pass unchanged.
- `src/queue/reportQueue.js` was created in Story 1.4 and updated with the `redisConnected` flag fix in commit `972f14c`.

---

## Story Dependencies

**This story (2.1) requires:**
- Story 1.4 complete (✅ done) — `src/queue/reportQueue.js` exists and exports `redisConnection`

**Stories that depend on 2.1:**
- Story 2.2 (Worker scaffold) — imports `keyStore` from `./keyStore.js` within the queue directory
- Story 4.1 (POST /api/generate) — imports `keyStore` to call `keyStore.set(job_id, api_key)`

---

## Verification Checklist

After completing all tasks, verify:

- [x] `src/queue/keyStore.js` exists
- [x] Exports exactly: `set`, `get`, `delete`, `has` (all functions)
- [x] No named export is an instance of `Map`
- [x] Zero imports in the file (no `import` statements at all)
- [x] Source does NOT contain: `JSON.stringify`, `JSON.parse`, `writeFile`, `from 'fs'`, `from 'node:fs'`
- [x] Source does NOT contain: `.keys()`, `.entries()`, `.values()`, `for...of _store`
- [x] Source does NOT contain: `reportQueue`, `.add(`, `bullmq`
- [x] `delete('nonexistent-id')` does not throw
- [x] `node --test tests/keystore.atdd.test.js` — all tests pass
- [x] `npm test` — full suite passes (no regressions)

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6 (2026-04-17)

### Completion Notes List

- Created `src/queue/keyStore.js` — module-scoped `_store` Map with four named exports: `set`, `get`, `has`, and `delete` (via `export { del as delete }` to handle reserved word).
- Zero imports in the file — pure in-memory key store with no dependencies.
- All security constraints satisfied: no serialisation, no enumeration, no queue coupling.
- ATDD tests: 27/27 pass (`node --test tests/keystore.atdd.test.js`).
- Full regression suite: no new failures introduced. Pre-existing Story 2.2 failures (5 tests in `worker-key-lifecycle.atdd.test.js`) require `src/workers/reportWorker.js` which is Story 2.2's scope — not a regression.
- `.gitkeep` was already removed in Story 1.4 — no action required for Task 2.

### File List

- src/queue/keyStore.js (new)

### Change Log

- 2026-04-17: Implemented `src/queue/keyStore.js` — in-memory API key store with set/get/delete/has exports, zero imports, all ACs satisfied.
