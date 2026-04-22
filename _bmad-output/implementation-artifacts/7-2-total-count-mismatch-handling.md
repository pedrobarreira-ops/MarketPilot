# Story 7.2: total_count Mismatch Handling

Endpoints verified against MCP-Verified Endpoint Reference (epics-distillate.md, 2026-04-18).

**Epic:** 7 — Error Handling & Edge Cases
**Story:** 7.2
**Story Key:** 7-2-total-count-mismatch-handling
**Status:** ready-for-dev
**Date Created:** 2026-04-22

---

## User Story

As a developer,
I want the catalog fetch to throw `CatalogTruncationError` whenever `allOffers.length !== total_count` (pre-filter), set the job to `error` status with the safe Portuguese message via `getSafeErrorMessage`, log structured safe fields `{job_id, fetched, declared, error_type}`, and always clear the API key in `finally`,
So that no partial or silently-truncated report is ever persisted to the database, and the user receives an actionable Portuguese error message.

**Satisfies:** Epic 7.2 AC — `fetched.length !== total_count → CatalogTruncationError`; job status=error; message stored via getSafeErrorMessage; log `{job_id, fetched:N, declared:M, error_type:'CatalogTruncationError'}` — no api_key; keyStore.delete in finally; total_count check BEFORE active filter; no partial report persisted.

---

## Context: What Already Exists (Epic 3 deliverables)

**CRITICAL — Read this before writing any code.**

Stories 3.2 and 3.7 already implemented the full `CatalogTruncationError` path. Story 7.2 is a **verification and gap-closure story** — the ATDD test suite already written at `tests/epic7-7.2-total-count-mismatch.atdd.test.js` must pass against the existing implementation.

**What currently exists and must NOT be reimplemented:**

| File | Status | Relevant to this story |
|---|---|---|
| `src/workers/mirakl/fetchCatalog.js` | Complete (Story 3.2) | Owns `CatalogTruncationError`, truncation check, logging |
| `src/workers/mirakl/apiClient.js` | Complete (Story 3.1 + 3.7) | Owns `getSafeErrorMessage` |
| `src/workers/reportWorker.js` | Complete (Story 3.7) | Owns catch block, `finally` key cleanup |
| `tests/epic7-7.2-total-count-mismatch.atdd.test.js` | Pre-written (locked) | The ATDD contract — DO NOT MODIFY |

**The dev agent's task:** Run the pre-written ATDD tests. If they pass, the story is done. If any test fails, diagnose and fix the root cause in the exact correct file — do NOT create new files or reimport functionality.

---

## Acceptance Criteria

**AC-1: `allOffers.length !== total_count` → throws `CatalogTruncationError` (never silent)**
- `fetchCatalog.js` asserts `allOffers.length === total_count` (pre-filter raw page count)
- On mismatch: throws `new CatalogTruncationError('Catálogo obtido parcialmente. Tenta novamente.')`
- `CatalogTruncationError` extends `Error`; `constructor.name === 'CatalogTruncationError'`
- Export: named export from `fetchCatalog.js`
- Static source: `throw new CatalogTruncationError` literal must appear in source (not just caught and swallowed)

**AC-2: Worker handles `CatalogTruncationError` → job status=`error`; safe message stored**
- `reportWorker.js` catch block calls `getSafeErrorMessage(err)` for ALL errors including `CatalogTruncationError`
- Calls `db.updateJobError(job_id, safeMessage)` — never stores `err.message` directly
- Static: `reportWorker.js` source does NOT contain the string `err.message`
- Static: `reportWorker.js` imports `CatalogTruncationError` or references `TruncationError`

**AC-3: Log on truncation = `{job_id, fetched:N, declared:M, error_type:'CatalogTruncationError'}` — no api_key**
- `fetchCatalog.js` logs before throwing: `log.error({ job_id, fetched: allOffers.length, declared: total_count, error_type: 'CatalogTruncationError' })`
- No log statement in `fetchCatalog.js` includes `api_key`
- No log statement in `fetchCatalog.js` logs `err.message`

**AC-4: `keyStore.delete(job_id)` runs in `finally` — unconditionally on truncation**
- `reportWorker.js` `finally` block contains `keyStore.delete(job_id)`
- Verified integration: after `processJob` exits (any path), `keyStore.has(jobId)` returns `false`

**AC-5: total_count assertion fires BEFORE active-offer filter (NFR-R2)**
- In `fetchCatalog.js` source: `total_count` reference appears BEFORE `.active` filter
- OF21 `total_count` is a pre-filter count — includes ALL offers (active + inactive) — MCP-verified 2026-04-18
- Asserting active-only count vs `total_count` would always fail for sellers with any inactive listings

**AC-6: Truncation safe message = `"Catálogo obtido parcialmente. Tenta novamente."` (exact)**
- `getSafeErrorMessage(new CatalogTruncationError('...'))` returns a string containing `"Catálogo obtido parcialmente"` and `"Tenta novamente"`
- This message is distinct from the 401/403 auth-failure message
- `fetchCatalog.js` source contains `'Catálogo obtido parcialmente'` or `CatalogTruncationError`

**AC-7: No partial/truncated report ever persisted to `reports` table on mismatch**
- `CatalogTruncationError` is thrown in Phase A before Phase D (`buildAndPersistReport`) is reached
- Worker catch block sets job status to `error` — no `insertReport` call happens on this path
- `queries.js` exports `updateJobError` function (schema supports `error_message` column)

---

## Tasks / Subtasks

- [ ] Task 1: Run the ATDD test suite and observe results (AC: all)
  - [ ] `node --test tests/epic7-7.2-total-count-mismatch.atdd.test.js`
  - [ ] Note any failing tests with exact error message
  - [ ] If all tests pass, mark story done (no code changes needed)

- [ ] Task 2: Fix any failing tests by patching the correct file (AC: per failure)
  - [ ] AC-1 failures → fix in `src/workers/mirakl/fetchCatalog.js`
  - [ ] AC-2 failures → fix in `src/workers/reportWorker.js`
  - [ ] AC-3 failures → fix in `src/workers/mirakl/fetchCatalog.js` (log shape)
  - [ ] AC-4 failures → fix in `src/workers/reportWorker.js` (finally block)
  - [ ] AC-5 failures → fix ordering in `fetchCatalog.js` (move total_count check before `.active` filter)
  - [ ] AC-6 failures → fix in `src/workers/mirakl/apiClient.js` (`getSafeErrorMessage` CatalogTruncationError branch)
  - [ ] AC-7 failures → logic already correct if AC-1 is working; verify schema in `src/db/queries.js`

- [ ] Task 3: Run the full test suite to verify no regressions (AC: all)
  - [ ] `npm test` — all previously-passing tests must remain green
  - [ ] Specifically verify: `tests/epic3-3.2-fetch-catalog.atdd.test.js` still passes (Story 3.2 contract)
  - [ ] Specifically verify: `tests/epic3-3.7-worker-orchestration.atdd.test.js` still passes (Story 3.7 contract)

---

## Dev Notes

### The ATDD Test File — Read It First

`tests/epic7-7.2-total-count-mismatch.atdd.test.js` is **pre-written and locked**. DO NOT MODIFY it.

Key observations from the test file:
- **AC-1 functional test:** Stubs `globalThis.fetch` to return `total_count=3` but only 2 offers. Calls `fetchCatalog('https://marketplace.worten.pt', 'test-key', { onProgress: () => {} })` — note: 3-arg form (no jobId). Must throw `CatalogTruncationError`.
- **AC-1 static:** Checks `src.includes('total_count')`, `src.includes('CatalogTruncationError')`, and `src.includes('!==')` or equivalent strict comparison.
- **AC-2 static:** Checks `workerSrc.includes('CatalogTruncationError') || workerSrc.includes('TruncationError')` and `workerSrc.includes('getSafeErrorMessage')`.
- **AC-3 static:** Checks `src.includes('fetched') || src.includes('declared') || src.includes('CatalogTruncationError')` and verifies no log line contains both `log.`/`console.` and `api_key`.
- **AC-4 integration:** Imports `keyStore` and `processJob` directly; sets a key, calls `processJob(job)`, asserts `keyStore.has(jobId) === false` after exit.
- **AC-5 static ordering:** `src.indexOf('total_count') < src.indexOf('.active')` — must hold in source.
- **AC-6 runtime:** Tries to import `getSafeErrorMessage` from `apiClient.js`, `reportWorker.js`, `fetchCatalog.js` in that order.
- **AC-7 static:** Checks `workerSrc.includes('CatalogTruncationError') || workerSrc.includes('error')` and imports `updateJobError` from `queries.js`.

### Known Review Findings from Story 3.2 (Two patches deferred to 7.2)

These were flagged in the Story 3.2 post-merge review as not-yet-fixed patches:

**Patch 1 — Wrong error type when first page returns 0 offers with non-zero total_count**

Current order in `fetchCatalog.js`:
1. Check `total_count === 0` → throw `EmptyCatalogError` ✓
2. Check `allOffers.length !== total_count` → throw `CatalogTruncationError` ✓
3. Filter active offers
4. Check `activeOffers.length === 0` → throw `EmptyCatalogError`

If `allOffers.length === 0` AND `total_count > 0` (e.g., API returned empty page with non-zero total_count), the truncation check fires correctly — this is correct behavior.

Actually re-reading the source, the current order IS correct: `total_count === 0` check first (genuinely empty), then `allOffers.length !== total_count` (truncation), then active filter, then `activeOffers.length === 0`. The deferred patch was about a scenario that the current code actually handles correctly already. Verify by running the ATDD tests.

**Patch 2 — null total_count guard**

Current code: `if (total_count !== null && allOffers.length !== total_count)` — the null guard already exists in the current implementation. This was the fix, and it's already in place.

### Critical: fetchCatalog Signature vs ATDD Test

The ATDD test calls `fetchCatalog` with 3 args: `fetchCatalog(baseUrl, apiKey, { onProgress: () => {} })`.

Current `fetchCatalog` signature: `fetchCatalog(baseUrl, apiKey, onProgress, jobId)`

The test passes an **object** `{ onProgress: () => {} }` as the third argument (not a function). This means `onProgress` in the function will be an object, and the guard `if (onProgress && total_count !== null)` will be `true` (objects are truthy), but calling `onProgress(newCount, totalCount)` will throw `TypeError: onProgress is not a function`.

**This is a potential failure point.** If tests are failing on AC-1's functional test due to this mismatch, fix `fetchCatalog.js` to accept either:
- A function directly (existing callers in `reportWorker.js` pass a function)
- An object with `onProgress` property (ATDD test calls it this way)

Safe fix — normalize at the top of `fetchCatalog`:
```javascript
export async function fetchCatalog(baseUrl, apiKey, onProgressOrOpts, jobId) {
  const onProgress = typeof onProgressOrOpts === 'function'
    ? onProgressOrOpts
    : (onProgressOrOpts && typeof onProgressOrOpts.onProgress === 'function' ? onProgressOrOpts.onProgress : undefined)
  // rest of function unchanged
}
```

This fix is backward-compatible with `reportWorker.js` (which passes a function) and forward-compatible with the ATDD test (which passes `{ onProgress: () => {} }`).

### getSafeErrorMessage Location

`getSafeErrorMessage` is exported from `src/workers/mirakl/apiClient.js`. The ATDD AC-6 test tries candidates in order: `apiClient.js`, `reportWorker.js`, `fetchCatalog.js`. The canonical location is `apiClient.js` — do not duplicate it.

Current `getSafeErrorMessage` in `apiClient.js` already has a `CatalogTruncationError` branch returning `'Catálogo obtido parcialmente. Tenta novamente.'` — this should satisfy AC-6 without changes.

### File Map — What to Read, What NOT to Touch

| File | Action |
|---|---|
| `src/workers/mirakl/fetchCatalog.js` | READ FIRST; patch if AC-1/3/5 fail |
| `src/workers/mirakl/apiClient.js` | READ; patch only if AC-6 fails |
| `src/workers/reportWorker.js` | READ; patch only if AC-2/4 fail |
| `src/db/queries.js` | READ; verify `updateJobError` export |
| `src/queue/keyStore.js` | DO NOT TOUCH |
| `tests/epic7-7.2-total-count-mismatch.atdd.test.js` | DO NOT MODIFY |
| `tests/epic3-3.2-fetch-catalog.atdd.test.js` | DO NOT MODIFY — regression check |
| `tests/epic3-3.7-worker-orchestration.atdd.test.js` | DO NOT MODIFY — regression check |

### ESM Pattern (Mandatory)

All source files use ESM (`"type": "module"` in package.json). Use `import`/`export`, never `require`/`module.exports`.

### No New Dependencies

All required modules already exist. Do not add any npm packages.

### Security Invariants (Non-Negotiable)

- `api_key` NEVER appears in any log statement in `fetchCatalog.js`
- `err.message` NEVER stored directly to DB or logged verbatim
- `keyStore.delete(job_id)` runs in `finally` unconditionally
- `CatalogTruncationError` always thrown (never just logged) on count mismatch

### MCP-Verified OF21 Behavior (Single Source of Truth)

From MCP-Verified Endpoint Reference (epics-distillate.md, 2026-04-18):
- `total_count` is at the ROOT of the OF21 response
- `total_count` counts ALL offers including inactive (no server-side active filter on OF21)
- Assertion: `allOffers.length === total_count` — compared BEFORE active filter
- Mismatch signals network truncation or API pagination bug — never acceptable

### Test Commands

```bash
# Story ATDD only:
node --test tests/epic7-7.2-total-count-mismatch.atdd.test.js

# Full suite (must remain green):
npm test

# Specific regression checks:
node --test tests/epic3-3.2-fetch-catalog.atdd.test.js
node --test tests/epic3-3.7-worker-orchestration.atdd.test.js
```

### Project Structure Notes

- No new files to create in this story
- No new directories to create
- All changes confined to existing files in `src/workers/mirakl/` or `src/workers/` (if patches needed)

### References

- [Source: tests/epic7-7.2-total-count-mismatch.atdd.test.js] — locked ATDD contract, all AC groups
- [Source: src/workers/mirakl/fetchCatalog.js] — primary implementation target
- [Source: src/workers/mirakl/apiClient.js] — getSafeErrorMessage canonical location
- [Source: src/workers/reportWorker.js] — catch block + finally key cleanup
- [Source: src/db/queries.js] — updateJobError function
- [Source: _bmad-output/planning-artifacts/epics-distillate.md §MCP-Verified Endpoint Reference] — OF21 total_count behavior
- [Source: _bmad-output/planning-artifacts/epics-distillate.md §7.2 AC] — story acceptance criteria
- [Source: _bmad-output/implementation-artifacts/3-2-of21-catalog-fetch-with-pagination.md §Review Findings] — deferred patches
- [Source: _bmad-output/implementation-artifacts/3-7-full-worker-orchestration-and-phase-updates.md] — worker catch/finally pattern

---

## Architecture Guardrails

| Boundary | Rule |
|---|---|
| `fetchCatalog.js` | Uses `mirAklGet()` exclusively — no `fetch()` calls |
| `fetchCatalog.js` | Logs only safe fields — never `api_key` or `err.message` |
| `reportWorker.js` | `finally` block runs `keyStore.delete(job_id)` unconditionally |
| `apiClient.js` | Canonical location for `getSafeErrorMessage` — do not duplicate |
| Test files | LOCKED — DO NOT MODIFY any `.atdd.test.js` files |

---

## Story Dependencies

**This story (7.2) requires:**
- Story 3.2 complete (done) — `fetchCatalog.js` + `CatalogTruncationError`
- Story 3.7 complete (done) — `reportWorker.js` catch/finally pattern + `getSafeErrorMessage`

**Stories that depend on 7.2:** None (Epic 7 stories are independent edge-case closures)

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

### File List
