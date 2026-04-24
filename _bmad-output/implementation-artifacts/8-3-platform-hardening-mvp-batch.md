# Story 8.3: Platform-Hardening MVP Batch

<!-- Endpoints verified against MCP-Verified Endpoint Reference (epics-distillate.md, 2026-04-18). -->
<!-- Epic 8 is backend-only. This story does NOT touch src/workers/**. -->

**Epic:** 8 — Data Governance & Cleanup
**Story:** 8.3
**Story Key:** 8-3-platform-hardening-mvp-batch
**Status:** review
**Date Created:** 2026-04-24

---

## User Story

As the MarketPilot platform operator,
I want rate limiting, Cache-Control headers, UUID-format :id guards, and a byte-level CSV BOM assertion applied to the MVP,
So that the API is hardened against abuse and enumeration, report responses cannot be cached by intermediate proxies, :id route parameters are validated before any DB round-trip, and the no-BOM CSV contract is locked by a test.

**Satisfies:** Epic 8.3 AC (epics-distillate.md:288) — rate-limit plugin + per-route budgets; Cache-Control headers on report routes; CSV no-BOM byte-level assertion; UUID regex guard on :id params; uniform 404 shape for all malformed/oversized/unknown/expired IDs.

---

## ATDD Test Analysis — CRITICAL: Read Before Implementing

**Test file:** `tests/epic8-8.3-platform-hardening-mvp-batch.atdd.test.js` — **DO NOT MODIFY** (once created by Step 2)

Run the tests first before touching any source code:
```
node --test tests/epic8-8.3-platform-hardening-mvp-batch.atdd.test.js
```

**Current state: test file does not yet exist** — it will be created by the ATDD step (Step 2) before the dev step (Step 3). This is a net-new implementation story. Once the test file exists, all tests will be red; the dev agent must implement the ACs to make all tests pass.

---

## Acceptance Criteria

**AC-1: `@fastify/rate-limit` registered globally in `src/server.js`**
- `@fastify/rate-limit` plugin imported and registered via `await fastify.register(rateLimit, { ... })` in `src/server.js`
- Global default: **60 requests / minute / IP**
- Per-route overrides declared on individual routes (see AC-2 to AC-5)
- `/health` route is **excluded** from rate limiting (do not apply a `rateLimit` config on the health route)
- 429 responses are routed through the global `errorHandler` — the plugin's raw `reply.send` is overridden via `errorResponseBuilder` (see Dev Notes)
- No `api_key` value appears in any 429 log line (pino redact config already covers this; do not log request body on 429)

**AC-2: `POST /api/generate` — 5 req/min/IP**
- Route-level override: `{ config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }` on the `fastify.post('/api/generate', ...)` call in `src/routes/generate.js`
- A 6th request within the same minute window from the same IP returns 429 with `{ error: 'too_many_requests', message: '...' }`

**AC-3: `GET /api/reports/:report_id/csv` — 10 req/min/IP**
- Route-level override: `{ config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }` on the `fastify.get('/api/reports/:report_id/csv', ...)` call in `src/routes/reports.js`
- An 11th request within the same window from the same IP returns 429

**AC-4: `GET /api/jobs/:job_id` — 120 req/min/IP**
- Route-level override: `{ config: { rateLimit: { max: 120, timeWindow: '1 minute' } } }` on the `fastify.get('/api/jobs/:job_id', ...)` call in `src/routes/jobs.js`
- A 121st request within the same window from the same IP returns 429
- Rationale: 2s polling × 60 s/min = 30 req/min baseline; 4× headroom for multi-tab/mobile-reconnect/retry-loop

**AC-5: `GET /api/reports/:report_id` — global default (60 req/min/IP)**
- No explicit `rateLimit` override — the global default applies
- Route is not excluded from rate limiting

**AC-6: 429 responses use the global `errorHandler` shape**
- All 429 responses return `{ error: 'too_many_requests', message: 'Demasiados pedidos. Tenta novamente em breve.' }` (or equivalent safe Portuguese message)
- No raw `@fastify/rate-limit` plugin body (e.g. no `{ statusCode, error, message }` with `statusCode` field)
- No `api_key` field in any 429 response or log line

**AC-7: `Cache-Control: private, no-store` on report routes**
- `GET /api/reports/:report_id` — adds `Cache-Control: private, no-store` header on **both** success (200) AND 404 responses
- `GET /api/reports/:report_id/csv` — adds `Cache-Control: private, no-store` header on **both** success (200) AND 404 responses
- `GET /api/jobs/:job_id` — no `Cache-Control` header required
- `POST /api/generate` — no `Cache-Control` header required

**AC-8: UUID-format `:id` guard — `^[0-9a-f-]{36}$` regex**
- A single shared regex constant `UUID_REGEX = /^[0-9a-f-]{36}$/` is defined once and reused across all three guarded routes
- Applied at the top of handler function body, before any DB call:
  - `GET /api/reports/:report_id` in `src/routes/reports.js`
  - `GET /api/reports/:report_id/csv` in `src/routes/reports.js`
  - `GET /api/jobs/:job_id` in `src/routes/jobs.js`
- Any request where the `:id` param does NOT match `UUID_REGEX` returns **404** (not 400) with the route's standard 404 body — same shape as not-found/expired:
  - For reports routes: `{ error: 'report_not_found', message: 'Este relatório expirou ou não existe. Gera um novo relatório para obteres dados actualizados.' }`
  - For jobs route: `{ error: 'job_not_found', message: 'Job não encontrado.' }`
- Malformed, oversized (> 36 chars), undersized (< 36 chars), unknown UUID, and expired report IDs all return the **same 404 shape** — no enumeration oracle
- No DB round-trip occurs for IDs that fail the regex check

**AC-9: CSV `csv_data` does NOT start with UTF-8 BOM (`﻿`)**
- `src/workers/scoring/buildReport.js` is **NOT modified** — the assertion codifies existing behaviour
- The ATDD test asserts: for a real `buildReport()` invocation, the returned object's `csv_data` field does NOT start with `﻿` (`U+FEFF`, UTF-8 BOM bytes `EF BB BF`)
- Assertion form: `!csvData.startsWith('﻿')` — byte-level check, not encoding-level
- This test locks the no-BOM contract so any future change that adds a BOM must deliberately update this test

**AC-10: `src/workers/**` NOT modified**
- Zero diffs to any file under `src/workers/` — rate limiting, Cache-Control, and :id guards are all route/server-layer concerns

**AC-11: All ATDD 8.3 tests pass**
- `node --test tests/epic8-8.3-platform-hardening-mvp-batch.atdd.test.js` → all pass, 0 fail
- No regressions: `npm test` — no new failures vs pre-story baseline

---

## Tasks / Subtasks

- [x] **Task 1: Install `@fastify/rate-limit` dependency** (AC: 1)
  - [x] Run `npm install @fastify/rate-limit` in the worktree
  - [x] Confirm the package appears in `package.json` `dependencies`

- [x] **Task 2: Register rate-limit plugin in `src/server.js`** (AC: 1, 6)
  - [x] Import `rateLimit` from `@fastify/rate-limit`
  - [x] Register with `await fastify.register(rateLimit, { global: true, max: 60, timeWindow: '1 minute', errorResponseBuilder })` before route registration
  - [x] Implement `errorResponseBuilder` that returns `{ error: 'too_many_requests', message: 'Demasiados pedidos. Tenta novamente em breve.' }` (see Dev Notes for exact pattern)
  - [x] Confirm `/health` route has no `rateLimit` config (excluded via plugin config or explicit skip — see Dev Notes)

- [x] **Task 3: Add per-route rate-limit overrides** (AC: 2, 3, 4)
  - [x] `src/routes/generate.js` — add `config: { rateLimit: { max: 5, timeWindow: '1 minute' } }` to route options
  - [x] `src/routes/reports.js` — add `config: { rateLimit: { max: 10, timeWindow: '1 minute' } }` to the `/csv` route options only
  - [x] `src/routes/jobs.js` — add `config: { rateLimit: { max: 120, timeWindow: '1 minute' } }` to route options

- [x] **Task 4: Add `Cache-Control: private, no-store` headers to report routes** (AC: 7)
  - [x] `GET /api/reports/:report_id` — add header on both 200 and 404 reply paths
  - [x] `GET /api/reports/:report_id/csv` — add header on both 200 and 404 reply paths

- [x] **Task 5: Add UUID-format `:id` guard** (AC: 8)
  - [x] Define `const UUID_REGEX = /^[0-9a-f-]{36}$/` once at module top in `src/routes/reports.js`
  - [x] Define the same shared `UUID_REGEX` at module top in `src/routes/jobs.js`
  - [x] Add guard at top of handler body in `GET /api/reports/:report_id`: `if (!UUID_REGEX.test(report_id)) return 404 with standard reports 404 body`
  - [x] Add guard at top of handler body in `GET /api/reports/:report_id/csv`: same guard
  - [x] Add guard at top of handler body in `GET /api/jobs/:job_id`: `if (!UUID_REGEX.test(job_id)) return 404 with standard jobs 404 body`
  - [x] Verify no DB call is made when guard fires (guard must be BEFORE any `getReport` / `getJobStatus` call)

- [x] **Task 6: Verify CSV no-BOM assertion passes** (AC: 9, 10)
  - [x] Run `node --test tests/epic8-8.3-platform-hardening-mvp-batch.atdd.test.js` — the BOM-assertion test must pass without modifying `src/workers/scoring/buildReport.js`
  - [x] If the test fails, the source file already emits a BOM (unexpected); investigate and do NOT add a BOM — do NOT modify workers; raise to Pedro

- [x] **Task 7: Run full test suite** (AC: 11)
  - [x] Run `node --test tests/epic8-8.3-platform-hardening-mvp-batch.atdd.test.js` — all pass
  - [x] Run `npm test` — no new failures vs pre-story baseline

- [x] **Task 8: Mark story complete**
  - [x] Update story Status to `review`
  - [x] Fill in Dev Agent Record section

---

## Dev Notes

### Rate-Limit Plugin Registration Pattern

`@fastify/rate-limit` v9+ for Fastify v5 uses the following pattern:

```javascript
import rateLimit from '@fastify/rate-limit'

// In server.js, before route registration:
await fastify.register(rateLimit, {
  global: true,
  max: 60,
  timeWindow: '1 minute',
  // Override the 429 response body to use our errorHandler shape:
  errorResponseBuilder: (_request, context) => {
    return {
      error: 'too_many_requests',
      message: `Demasiados pedidos. Tenta novamente em breve.`,
    }
  },
  // Exclude /health from rate limiting:
  skipOnError: false,
  keyGenerator: (request) => request.ip,
  allowList: (request) => request.url === '/health',
})
```

**Important:** The `allowList` function (or `skip` function depending on the version — check the installed package's README) is used to exclude `/health`. Check the actual `@fastify/rate-limit` docs at import time. If `allowList` is not supported, use `skip`:
```javascript
skip: (request) => request.url === '/health',
```

### Per-Route Override Pattern

In each route file, add `config: { rateLimit: ... }` to the route options object:

```javascript
// src/routes/generate.js
fastify.post('/api/generate', {
  config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
  schema: { ... },
}, async (request, reply) => { ... })
```

```javascript
// src/routes/reports.js — only on the /csv route:
fastify.get('/api/reports/:report_id/csv', {
  config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
}, async (request, reply) => { ... })
```

```javascript
// src/routes/jobs.js:
fastify.get('/api/jobs/:job_id', {
  config: { rateLimit: { max: 120, timeWindow: '1 minute' } },
}, async (request, reply) => { ... })
```

### UUID Guard Pattern

Define once at module top, use in each handler:

```javascript
// At module top of src/routes/reports.js:
const UUID_REGEX = /^[0-9a-f-]{36}$/

// Inside GET /api/reports/:report_id handler:
const { report_id } = request.params
if (!UUID_REGEX.test(report_id)) {
  return reply.status(404).send({
    error:   'report_not_found',
    message: PT_404_MESSAGE,
  })
}
// DB call follows AFTER the guard:
const now = Math.floor(Date.now() / 1000)
const row = getReport(report_id, now)
```

The same guard must be duplicated in the `/csv` handler (same module, same `UUID_REGEX` constant — just reuse it).

In `src/routes/jobs.js`:
```javascript
const UUID_REGEX = /^[0-9a-f-]{36}$/

// Inside GET /api/jobs/:job_id handler:
const { job_id } = request.params
if (!UUID_REGEX.test(job_id)) {
  return reply.status(404).send({
    error:   'job_not_found',
    message: 'Job não encontrado.',
  })
}
// DB call follows AFTER the guard:
const row = db.getJobStatus(job_id)
```

### Cache-Control Pattern

Apply `Cache-Control: private, no-store` on both 200 and 404 reply paths in the report routes:

```javascript
// Success path:
return reply
  .header('Cache-Control', 'private, no-store')
  .send({ data: { ... } })

// 404 path:
return reply
  .status(404)
  .header('Cache-Control', 'private, no-store')
  .send({ error: 'report_not_found', message: PT_404_MESSAGE })
```

For the CSV route:
```javascript
// Success path:
return reply
  .status(200)
  .header('Cache-Control', 'private, no-store')
  .header('Content-Type', 'text/csv; charset=utf-8')
  .header('Content-Disposition', 'attachment; filename="marketpilot-report.csv"')
  .send(row.csv_data)

// 404 path:
return reply
  .status(404)
  .header('Cache-Control', 'private, no-store')
  .send({ error: 'report_not_found', message: PT_404_MESSAGE })
```

### CSV BOM Assertion — No Worker Changes

The BOM test imports `buildReport` from `src/workers/scoring/buildReport.js` and calls it with a minimal fixture. It then asserts `!result.csv_data.startsWith('﻿')`. This is purely a lock-down test — it codifies the current behaviour that `buildReport.js` does NOT emit a BOM. The dev agent must NOT modify `buildReport.js` to make this test pass. If the test fails, something is emitting a BOM unexpectedly — surface that finding to Pedro rather than adding a BOM removal.

### 429 Error Shape Uniformity

The `errorResponseBuilder` option in `@fastify/rate-limit` allows customising the 429 response body. Without it, the plugin returns its own shape `{ statusCode: 429, error: 'Too Many Requests', message: '...' }` which does not match our `{ error, message }` contract. The `errorResponseBuilder` is the correct hook to override this — it runs before `reply.send()` in the plugin's code, so `errorHandler` itself does not need to handle 429 explicitly.

### Files Modified by This Story

| File | Change |
|---|---|
| `src/server.js` | Import + register `@fastify/rate-limit` with global config and `errorResponseBuilder`; `allowList`/`skip` for `/health` |
| `src/routes/generate.js` | Add `config: { rateLimit: { max: 5, ... } }` to POST route options |
| `src/routes/reports.js` | Add `config: { rateLimit: { max: 10, ... } }` to `/csv` route; add `UUID_REGEX` guard; add `Cache-Control` headers on both routes |
| `src/routes/jobs.js` | Add `config: { rateLimit: { max: 120, ... } }` to GET route; add `UUID_REGEX` guard |
| `package.json` | `@fastify/rate-limit` added to dependencies |
| `package-lock.json` | Updated by `npm install` |

**NOT modified:**
- `src/workers/**` — zero changes to any worker file
- `src/db/**` — no schema or query changes
- `src/middleware/errorHandler.js` — no changes needed; `errorResponseBuilder` in the plugin handles 429 shaping

### ESM Pattern

All source files use ESM (`"type": "module"` in `package.json`). Use `import`/`export` — never `require()` or `module.exports`.

---

## Architecture Guardrails

| Boundary | Rule |
|---|---|
| `src/workers/**` | Zero diffs — this story is route/server layer only |
| `src/db/queries.js` | No changes — UUID guard fires before any DB call |
| `src/middleware/errorHandler.js` | No changes — `errorResponseBuilder` in the plugin handles 429 |
| 429 response body | Must match `{ error: 'too_many_requests', message: '...' }` — no `statusCode` field |
| UUID guard | Must be BEFORE any `getReport`/`getJobStatus` call in every handler |
| Cache-Control | Must be on BOTH success and 404 paths in both report routes |

**Security invariants (non-negotiable):**
1. `api_key` never in any 429 response body or log line (pino redact config + no body logging on 429)
2. UUID guard returns 404 (not 400) — same shape as not-found — prevents enumeration oracle
3. Malformed/oversized/undersized/unknown/expired IDs all return the same 404 — no distinguishing information

---

## Previous Story Intelligence

**From Story 4.2 code review deferred findings:**
- "No rate limiting on polling endpoint" — this story directly addresses that finding
- "Add `@fastify/rate-limit` plugin registration in `src/server.js` with a sane default (60 req/min/IP)" — exact action item now implemented

**From Story 4.3 code review deferred findings:**
- "No Cache-Control header on `/api/reports/:id` or `/api/reports/:id/csv`" — this story adds `private, no-store`
- "No rate limiting on `/api/reports/:id` and `/api/reports/:id/csv`" — addressed by global default (60/min) + per-route override (10/min for `/csv`)

**From PR #45 deferred findings:**
- "Malformed / oversized `job_id` not tested at route boundary" — this story adds the UUID regex guard + tests

**From PR #46 deferred findings:**
- "CSV Byte-Order Mark not asserted" — this story adds the byte-level assertion

**From Epic 7 retrospective Action Item T3:**
- "Platform-hardening MVP batch" created as Story 8.3 to collect these cross-cutting hardening items

**From Epic 8 AC in epics-distillate.md (line 288):**
- Rate-limit limits: 5/generate, 10/csv, 120/jobs, 60 global
- UUID regex: `^[0-9a-f-]{36}$` — one regex, not length+charset pair
- Cache-Control: `private, no-store` on both `/api/reports/:id` and `/csv` (success AND 404)
- BOM: csv_data does NOT start with `﻿`
- NOT modifying `src/workers/**`

---

## Story Dependencies

**This story (8.3) requires:**
- Story 3.5 complete (done) — `src/workers/scoring/buildReport.js` exists (for BOM assertion)
- Story 4.1 complete (done) — `src/routes/generate.js` exists
- Story 4.2 complete (done) — `src/routes/jobs.js` exists
- Story 4.3 complete (done) — `src/routes/reports.js` exists
- Story 8.2 complete (done) — sequenced after 8.2 per Epic arc plan

**Stories that depend on 8.3:**
- `epic-8-retrospective` — this is the last story in Epic 8; retrospective is gated on 8.3

---

## Verification Checklist

After completing all tasks, verify:

- [ ] `node --test tests/epic8-8.3-platform-hardening-mvp-batch.atdd.test.js` → all pass, 0 fail
- [ ] `npm test` → no new failures vs pre-story baseline
- [ ] `@fastify/rate-limit` present in `package.json` dependencies
- [ ] `src/server.js` registers the plugin with global: true, max: 60, 1 minute
- [ ] `/health` is excluded from rate limiting
- [ ] 429 response shape: `{ error: 'too_many_requests', message: '...' }` — no `statusCode` field
- [ ] `POST /api/generate`: 5 req/min/IP limit configured
- [ ] `GET /api/reports/:report_id/csv`: 10 req/min/IP limit configured
- [ ] `GET /api/jobs/:job_id`: 120 req/min/IP limit configured
- [ ] `GET /api/reports/:report_id`: global 60 req/min/IP (no override)
- [ ] `Cache-Control: private, no-store` on `GET /api/reports/:report_id` (200 AND 404)
- [ ] `Cache-Control: private, no-store` on `GET /api/reports/:report_id/csv` (200 AND 404)
- [ ] UUID guard on `GET /api/reports/:report_id` — before DB call, returns 404
- [ ] UUID guard on `GET /api/reports/:report_id/csv` — before DB call, returns 404
- [ ] UUID guard on `GET /api/jobs/:job_id` — before DB call, returns 404
- [ ] `src/workers/**` has zero diffs
- [ ] `buildReport()` output `csv_data` does NOT start with `﻿`

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6 (Step 3 Developer)

### Completion Notes List

- Installed `@fastify/rate-limit` via `npm install @fastify/rate-limit`; package added to dependencies in `package.json`.
- Registered rate-limit plugin in `src/server.js` with `global: true`, `max: 60`, `timeWindow: '1 minute'`, custom `errorResponseBuilder` returning `{ error: 'too_many_requests', message: 'Demasiados pedidos. Tenta novamente em breve.' }`, and `allowList` to exclude `/health`.
- Added per-route rate-limit overrides: POST /api/generate (5/min), GET /api/reports/:id/csv (10/min), GET /api/jobs/:job_id (120/min). GET /api/reports/:id uses global default (60/min) — no override.
- Added `Cache-Control: private, no-store` on all four response paths in `src/routes/reports.js`: both 200 and 404 on both report routes. UUID guard 404 path also sets Cache-Control.
- Added `UUID_REGEX = /^[0-9a-f-]{36}$/` at module top of both `src/routes/reports.js` and `src/routes/jobs.js`. Guard fires BEFORE any `getReport`/`getJobStatus` call. Returns 404 with spec-mandated message — no enumeration oracle.
- CSV no-BOM assertion: `buildReport.js` was NOT modified; ATDD test confirmed existing output has no BOM.
- `src/workers/**` has zero diffs — confirmed.
- Test compatibility: Stories 4.2, 4.2a, and 4.3 test files used `test-<timestamp>-<random>` format IDs which are not UUID-format. UUID guard would have blocked these, causing regressions. Updated `randomId()` in those three test files to use `randomUUID()` from `node:crypto` — all 823 tests now pass (0 fail).
- All 76 ATDD 8.3 tests pass. Full suite: 823 tests, 0 failures.

### File List

- `src/server.js` — added `@fastify/rate-limit` import and plugin registration with global config, errorResponseBuilder, and allowList for /health
- `src/routes/generate.js` — added `config: { rateLimit: { max: 5, timeWindow: '1 minute' } }` to POST route options
- `src/routes/reports.js` — added `UUID_REGEX` guard (before DB calls), `Cache-Control: private, no-store` on all reply paths (200 and 404), `config: { rateLimit: { max: 10, ... } }` on /csv route
- `src/routes/jobs.js` — added `UUID_REGEX` guard (before DB call), `config: { rateLimit: { max: 120, timeWindow: '1 minute' } }` on GET route
- `package.json` — `@fastify/rate-limit` added to dependencies
- `package-lock.json` — updated by `npm install`
- `tests/epic4-4.2-get-api-jobs-polling.atdd.test.js` — updated `randomId()` to use `randomUUID()` for UUID guard compatibility
- `tests/epic4-4.2a-polling-progress-contract.additional.test.js` — updated `randomId()` to use `randomUUID()` for UUID guard compatibility
- `tests/epic4-4.3-get-api-reports-and-csv.atdd.test.js` — updated `randomId()` to use `randomUUID()` for UUID guard compatibility

### Change Log

- 2026-04-24: Story 8.3 created — platform-hardening MVP batch (rate-limit + Cache-Control + CSV BOM assertion + :id UUID guards).
- 2026-04-24: Story 8.3 implemented — all ACs satisfied; 76 ATDD tests pass; 823 full-suite tests pass (0 fail). Status set to review.
