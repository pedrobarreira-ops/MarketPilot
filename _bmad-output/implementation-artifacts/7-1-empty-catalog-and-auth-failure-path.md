Endpoints verified against MCP-Verified Endpoint Reference (epics-distillate.md, 2026-04-18).

# Story 7.1: Empty Catalog & Auth Failure Path

**Epic:** 7 — Error Handling & Edge Cases
**Story:** 7.1
**Story Key:** 7-1-empty-catalog-and-auth-failure-path
**Status:** ready-for-dev
**Date Created:** 2026-04-22

---

## User Story

As a Worten marketplace seller submitting their API key,
I want the system to show a clear Portuguese error message when my key is invalid (401/403) or my catalog has no active offers,
So that I understand what went wrong and am not shown raw API errors or left with a spinning progress screen.

**Satisfies:** Epic 7.1 AC — 401/403 → safe auth-failure message; 0 active offers + 200 → EmptyCatalogError safe message; keyStore.delete in finally on both paths; progress.js shows safe message + "Contacta-nos"; no raw API response stored in DB.

---

## Acceptance Criteria

**AC-1: 401/403 from OF21 → safe Portuguese message; job status = `error`**
- `mirAklGet()` in `src/workers/mirakl/apiClient.js` throws `MiraklApiError` immediately on 401 or 403 — NO retry (exponential backoff is only for 429/5xx)
- `MiraklApiError` exposes the HTTP status code on the error object (`.status` or `.statusCode` or `.code`) so `getSafeErrorMessage` can branch on it
- `getSafeErrorMessage(err)` maps 401/403 to exactly: `"Chave API inválida ou sem permissão. Verifica se a chave está correcta e se a tua conta está activa no Worten."`
- Worker calls `getSafeErrorMessage(err)` and stores its output in `generation_jobs.error_message` — NEVER `err.message` directly
- Worker updates job to `status = 'error'` via `db.updateJobError(job_id, safeMessage)`
- Raw Mirakl error text (e.g. `"Shop API key is invalid or has been revoked"`) must NOT appear in DB or logs

**AC-2: 0 active offers + 200 status → `EmptyCatalogError`; safe Portuguese message**
- `fetchCatalog.js` checks `total_count === 0` on the raw OF21 response (before active-offer filter) and throws `EmptyCatalogError`
- Also detects the case where `total_count` is non-zero but `allOffers.length === 0` after pagination (API returned nothing, can't filter) — also throws `EmptyCatalogError`
- Detection fires on raw result, BEFORE `offer.active === true` filter
- `getSafeErrorMessage` maps `EmptyCatalogError` (by `err.constructor.name`) to exactly: `"Não encontrámos ofertas activas no teu catálogo. Verifica se a tua conta está activa no Worten."`
- Empty-catalog message does NOT include `"Tenta novamente"` (that phrase is reserved for the truncation error)
- Worker catches `EmptyCatalogError` and stores `getSafeErrorMessage(err)` in DB

**AC-3: `keyStore.delete(job_id)` runs in `finally` on BOTH error paths**
- The `try/catch/finally` block in `processJob` contains `keyStore.delete(job_id)` in the `finally` clause
- Runs unconditionally on success AND on auth-failure AND on empty-catalog failure
- After `processJob` resolves or rejects, `keyStore.has(job_id)` returns `false`
- Delete is NOT only in `catch` (catch-only misses the success path)

**AC-4: No raw Mirakl API response stored in DB or forwarded to user**
- `apiClient.js` does NOT log the raw response body on error
- Worker does NOT pass full `err` object to logger — only safe shape: `{ job_id, error_code: err.code, error_type: err.constructor.name }`
- `updateJobError` / `error_message` column is ALWAYS populated via `getSafeErrorMessage(err)` — never `err.message`
- Pattern `log.*(err)` is absent from worker source (would risk leaking API response details)

**AC-5: `progress.js` surfaces safe error message and "Contacta-nos" on `status = 'error'`**
- `progress.js` handles the `status: "error"` branch from `GET /api/jobs/:job_id` polling
- Displays the server-provided `phase_message` (which IS the `getSafeErrorMessage` output) — not a hardcoded client string
- Shows a "Contacta-nos" link on error
- Stops polling on error (terminal state — no more interval/timeout calls)
- Updates link box label to: `"Este link não está disponível — a geração falhou."`

**AC-6: `getSafeErrorMessage` is the sole gateway for error DB writes**
- `getSafeErrorMessage(err)` is exported from `src/workers/mirakl/apiClient.js`
- Worker imports and calls it before ANY `db.updateJobError()` or equivalent DB write
- `fetchCatalog.js` does NOT log `err.message` on any path
- Worker does NOT log `api_key` on any code path (NFR-S2)

**AC-7: ATDD pre-scaffolded tests pass**
- Run: `node --test tests/epic7-7.1-empty-catalog-and-auth-failure.atdd.test.js`
- All tests must pass (the suite was scaffolded in commit `69b64f3` and is reported fully green as of that commit)
- Do NOT modify the ATDD test file — it is the source of truth for acceptance

---

## Tasks / Subtasks

- [ ] **Task 1: Verify ATDD tests pass as-is** (AC: 7)
  - [ ] Run: `node --test tests/epic7-7.1-empty-catalog-and-auth-failure.atdd.test.js`
  - [ ] If all pass → no source changes needed; proceed to Task 5
  - [ ] If any fail → investigate the specific failing test and apply the minimum fix described below

- [ ] **Task 2: Harden `mirAklGet` 401/403 handling if needed** (AC: 1)
  - [ ] Verify `src/workers/mirakl/apiClient.js`: 401 and 403 throw `MiraklApiError` immediately (callCount = 1, no retry)
  - [ ] Verify `MiraklApiError` instance exposes `.status` property (integer HTTP status code)
  - [ ] If 401/403 is currently retried — add explicit check before the retry loop: `if (res.status === 401 || res.status === 403) throw new MiraklApiError(..., res.status)` (no retry)

- [ ] **Task 3: Verify `EmptyCatalogError` detection in `fetchCatalog.js`** (AC: 2)
  - [ ] Check: `total_count === 0` check fires on raw `data.total_count` BEFORE `offer.active === true` filter
  - [ ] Check: second guard (`allOffers.length === 0` after pagination) also throws `EmptyCatalogError`
  - [ ] Verify `EmptyCatalogError` is exported: `export class EmptyCatalogError extends Error`
  - [ ] Confirm `offer.state` is NOT used anywhere — only `offer.active === true` (MCP-verified: `offer.state` does not exist on OF21)

- [ ] **Task 4: Verify `getSafeErrorMessage` mappings in `apiClient.js`** (AC: 1, 2, 6)
  - [ ] 401 or 403 → `"Chave API inválida ou sem permissão. Verifica se a chave está correcta e se a tua conta está activa no Worten."`
  - [ ] `EmptyCatalogError` (by `err.constructor.name === 'EmptyCatalogError'`) → `"Não encontrámos ofertas activas no teu catálogo. Verifica se a tua conta está activa no Worten."`
  - [ ] `CatalogTruncationError` → `"Catálogo obtido parcialmente. Tenta novamente."`
  - [ ] Default fallback → Portuguese generic (must NOT expose `err.message`)
  - [ ] Function must be exported: `export function getSafeErrorMessage(err)`

- [ ] **Task 5: Verify worker `finally` block and safe error storage** (AC: 3, 4, 6)
  - [ ] `src/workers/reportWorker.js`: `try/catch/finally` wraps `processJob`; `finally` contains `keyStore.delete(job_id)`
  - [ ] All `catch` branches call `getSafeErrorMessage(err)` — no `err.message` in `updateJobError` calls
  - [ ] No `log.*(err)` pattern (full error object) — only `{ job_id, error_code: err.code, error_type: err.constructor.name }`
  - [ ] No `api_key` in any log call

- [ ] **Task 6: Verify `progress.js` error-state handling** (AC: 5)
  - [ ] `public/js/progress.js` handles `status: "error"` response from polling
  - [ ] Shows `phase_message` from server response (not a hardcoded string)
  - [ ] Shows "Contacta-nos" link
  - [ ] Stops polling on `status === "error"`
  - [ ] Link box label updated to: `"Este link não está disponível — a geração falhou."`

- [ ] **Task 7: Full test suite regression check**
  - [ ] Run: `npm test`
  - [ ] All previously passing tests remain passing

---

## Dev Notes

### CRITICAL: This Is Primarily a Verification Story

All core implementations were built in Epic 3 (pipeline) and Epic 5 (frontend):
- **Auth failure (401/403):** `mirAklGet` + `MiraklApiError` implemented in Story 3.1
- **EmptyCatalogError:** `fetchCatalog.js` implemented in Story 3.2
- **getSafeErrorMessage:** Exported from `apiClient.js` in Story 3.7
- **Worker finally block:** `keyStore.delete` in finally implemented in Story 3.7
- **progress.js error state:** Implemented in Story 5.2

The ATDD suite (commit `69b64f3`) was run against the existing implementation and reported **fully green** for story 7.1. This means the primary task is to run the ATDD tests and confirm they pass — **no source changes may be needed at all**.

If a test fails, apply a surgical fix. Do not refactor existing code.

### Files to Possibly Modify (Only If ATDD Tests Fail)

- `src/workers/mirakl/apiClient.js` — only if 401/403 retry guard or `getSafeErrorMessage` mapping is incorrect
- `src/workers/mirakl/fetchCatalog.js` — only if `EmptyCatalogError` export or detection is wrong
- `src/workers/reportWorker.js` — only if `finally` block or safe error storage is missing
- `public/js/progress.js` — only if error-state handling (Contacta-nos, stop polling, label update) is missing

### Files That Must NOT Be Modified

- `tests/epic7-7.1-empty-catalog-and-auth-failure.atdd.test.js` — pre-scaffolded ATDD, read-only
- `public/index.html`, `public/progress.html`, `public/report.html` — HTML is locked
- `src/db/schema.js`, `src/db/queries.js` — no schema changes in this story

### MCP-Verified OF21 Endpoint Behaviour (Critical Anti-Patterns)

- **Auth:** `Authorization: <api_key>` header — raw key, NO `Bearer` prefix
- **401** = invalid or expired key; **403** = key valid but insufficient scope
- **Neither 401 nor 403 should be retried** (exponential backoff is for 429/5xx only)
- **`offer.state` does NOT exist** on OF21 responses (verified live on Worten) — use `offer.active === true`
- **`offer.state_code`** exists but is the offer CONDITION (e.g. `"11"` = new), NOT active/inactive status
- **`total_count`** at response root = ALL offers before any filtering (active + inactive)
- Empty catalog: `total_count = 0` with `offers = []` and HTTP 200

### getSafeErrorMessage — Exact Portuguese Messages

```js
// 401 or 403:
"Chave API inválida ou sem permissão. Verifica se a chave está correcta e se a tua conta está activa no Worten."

// EmptyCatalogError:
"Não encontrámos ofertas activas no teu catálogo. Verifica se a tua conta está activa no Worten."

// CatalogTruncationError:
"Catálogo obtido parcialmente. Tenta novamente."

// Default fallback:
"Ocorreu um erro inesperado. Tenta novamente ou contacta o suporte."
```

### Worker Error Logging Pattern (NFR-S2 Compliant)

```js
// CORRECT — safe shape only:
log.error({ job_id, error_code: err.code, error_type: err.constructor.name })

// WRONG — forbidden patterns:
log.error(err)                           // full err object leaks API response
log.error({ job_id, message: err.message })  // err.message leaks Mirakl response
log.error({ job_id, api_key })           // NFR-S2 violation
```

### Worker `finally` Pattern

```js
// CORRECT:
try {
  // processJob body
} catch (err) {
  const safeMsg = getSafeErrorMessage(err)
  await db.updateJobError(job_id, safeMsg)
  log.error({ job_id, error_code: err.code, error_type: err.constructor.name })
} finally {
  keyStore.delete(job_id)  // ← MUST be here, not only in catch
}
```

### `fetchCatalog.js` Empty Catalog Detection (Order Matters)

```js
// BEFORE active filter — correct order:
// 1. Collect all pages into allOffers[]
// 2. Check total_count === 0 FIRST → throw EmptyCatalogError
// 3. Assert allOffers.length === total_count → throw CatalogTruncationError
// 4. Filter: activeOffers = allOffers.filter(offer => offer.active === true)
// 5. If activeOffers.length === 0 (all inactive) → throw EmptyCatalogError
```

### `progress.js` Error State Requirements

The progress page polls `GET /api/jobs/:job_id` every 2 seconds. On `status: "error"`:
1. Stop polling (clear the interval)
2. Set progress bar fill to current position with red color (`#DC2626`)
3. Hide `"PROCESSAMENTO EM TEMPO REAL"` label
4. Display `phase_message` from server (this IS the `getSafeErrorMessage` output — Portuguese text)
5. Update link box label to: `"Este link não está disponível — a geração falhou."`
6. Show `"Tentar novamente"` button (→ `/`) + `"Contacta-nos"` link

The server `phase_message` on error is whatever `getSafeErrorMessage(err)` returned — e.g.:
- `"Chave API inválida ou sem permissão. Verifica se a chave está correcta e se a tua conta está activa no Worten."`
- `"Não encontrámos ofertas activas no teu catálogo. Verifica se a tua conta está activa no Worten."`

### Architecture Boundaries

- `src/routes/` — HTTP only; no Mirakl calls; calls `src/db/queries.js` only
- `src/workers/` — all business logic, all Mirakl calls; reads/clears keyStore
- `src/queue/keyStore.js` — ONLY place API key is stored; delete always in `finally`
- `src/db/queries.js` — ALL SQLite reads/writes; no raw SQL outside this file (except schema.js)
- `getSafeErrorMessage` — canonical export location is `src/workers/mirakl/apiClient.js`

### NFR Compliance

- **NFR-R1:** ≥ 98% success for valid keys — auth errors are correctly surfaced, not silently ignored
- **NFR-I2:** `getSafeErrorMessage()` ensures all errors are mapped to Portuguese before being stored or displayed
- **NFR-S2:** api_key never in logs — enforced by ATDD static scan tests
- **NFR-S4:** Pino redact paths include `'*.api_key'` — belt-and-suspenders on top of code checks

### Testing Commands

```bash
# Primary: Story 7.1 ATDD suite (pre-scaffolded, fully green in commit 69b64f3):
node --test tests/epic7-7.1-empty-catalog-and-auth-failure.atdd.test.js

# Full unit/ATDD suite (regression check):
npm test

# Worker-specific tests (context for related suite):
node --test tests/epic3-3.7-worker-orchestration.atdd.test.js
node --test tests/epic3-3.2-fetch-catalog.atdd.test.js
node --test tests/epic3-3.1-api-client.atdd.test.js
```

### Previous Story Context (What Was Built)

- **Story 3.1** (`done`) — `mirAklGet()` with exponential backoff (1s,2s,4s,8s,16s max 30s) for 429/5xx; `MiraklApiError` class with `.status`
- **Story 3.2** (`done`) — `fetchCatalog.js` with `EmptyCatalogError` and `CatalogTruncationError`; `total_count` assertion before active filter; `offer.active === true` filter (NOT `offer.state`)
- **Story 3.7** (`done`) — Full worker orchestration; `getSafeErrorMessage` exported from `apiClient.js`; `finally` block with `keyStore.delete`; safe error logging pattern established
- **Story 5.2** (`done`) — `progress.js` error-state handling: stop polling, red bar, show phase_message, "Contacta-nos" link, link box label update

### Git Context

- Commit `69b64f3` ("Epic 7 test plan"): scaffolded `tests/epic7-7.1-empty-catalog-and-auth-failure.atdd.test.js` — 582 lines, 7 AC describe blocks; described as "fully green" in commit message for 7.1
- All upstream implementations merged to `main` via Epic 3 and Epic 5 PRs
- Story 7.1 worktree branch: `story-7.1-empty-catalog-and-auth-failure`

### Cross-Story Dependencies

- Depends on: 3.2 (OF21 pagination + EmptyCatalogError), 3.7 (worker orchestration + getSafeErrorMessage + finally)
- Also depends on: 5.2 (progress.js error state)
- Parallel to: 7.2 (total_count mismatch — `CatalogTruncationError`), 7.3 (P11 rate limit)
- This story does NOT add new database columns or change any schema

---

## Dev Agent Record

### Agent Model Used

_To be filled by dev agent_

### Debug Log References

None — primarily a verification story; no new implementation expected.

### Completion Notes List

_To be filled by dev agent_

### File List

_To be filled by dev agent after implementation_

### Change Log

- 2026-04-22: Story 7.1 spec created — empty catalog & auth failure path verification story. (claude-sonnet-4-6)
