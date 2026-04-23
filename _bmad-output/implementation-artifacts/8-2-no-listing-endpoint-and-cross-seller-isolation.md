# Story 8.2: No Listing Endpoint & Cross-Seller Isolation Verification

<!-- Epic 8 is backend-only. This story verifies the ABSENCE of listing routes and the PRESENCE of isolation invariants. It does NOT touch any Mirakl endpoints. -->

**Epic:** 8 — Data Governance & Cleanup
**Story:** 8.2
**Story Key:** 8-2-no-listing-endpoint-and-cross-seller-isolation
**Status:** ready-for-dev
**Date Created:** 2026-04-23

---

## User Story

As a developer maintaining the MarketPilot backend,
I want to verify that no listing endpoints exist for `/api/reports` or `/api/jobs` and that every report read is isolated to a single `report_id`,
So that users can never enumerate other users' jobs or reports, cross-seller data exposure is architecturally impossible, and the privacy invariants of the single-token access model are confirmed by passing ATDD tests.

**Satisfies:** Epic 8.2 AC (epics-distillate.md:287) — `GET /api/reports` (no id) → 404; `GET /api/jobs` (no id) → 404; every `queries.js` reports read uses `WHERE report_id=?`; no cross-report JOINs in HTTP-accessible queries; `job_id` never in final report URL.

---

## ATDD Test Analysis — CRITICAL: Read Before Implementing

**Test file:** `tests/epic8-8.2-no-listing-endpoint-and-cross-seller-isolation.atdd.test.js` — **DO NOT MODIFY**

Run the tests first before touching any code:
```
node --test tests/epic8-8.2-no-listing-endpoint-and-cross-seller-isolation.atdd.test.js
```

**Current state: 36 pass, 0 fail.** The existing implementation already satisfies all acceptance criteria. This story is a verification story — the dev agent must confirm all 36 tests pass and then mark the story complete. If any test fails, apply the minimum fix described below.

---

## Acceptance Criteria

**AC-1: `GET /api/reports` (no id) → 404 (route NOT registered)**
- `src/routes/reports.js` registers ONLY `/api/reports/:report_id` and `/api/reports/:report_id/csv`
- No bare `GET /api/reports` (without `:report_id`) is registered anywhere in the route file
- Fastify returns 404 naturally because the route does not exist
- `GET /api/reports/` (trailing slash, no id) also returns 404
- No `:report_id?` optional param or wildcard (`*`) that could accidentally match bare `/api/reports`

**AC-2: `GET /api/jobs` (no id) → 404 (route NOT registered)**
- `src/routes/jobs.js` registers ONLY `/api/jobs/:job_id`
- No bare `GET /api/jobs` (without `:job_id`) is registered
- `GET /api/jobs/` (trailing slash) returns 404
- Fastify returns 404 naturally

**AC-3: Every `queries.js` reports read uses `WHERE report_id = ?`**
- `getReport(reportId, now)` uses Drizzle `.where(and(eq(reports.reportId, reportId), gt(reports.expiresAt, now)))` — exact equality on `reportId`
- No bare `.from(reports)` without `.where()` exists (no full-table scan)
- No `LIKE`, `BETWEEN`, or `GLOB` on `report_id` (equality only — prevents prefix-guessing attacks)
- `queries.js` exports NO function named `getAll`, `listReports`, `findReports`, `getAllReports`, or `selectAll`

**AC-4: No cross-report JOINs in HTTP-accessible queries**
- `queries.js` contains no Drizzle `.leftJoin()`, `.innerJoin()`, `.rightJoin()`, `.fullJoin()`, or raw `JOIN` between `reports` and `generation_jobs`
- `src/routes/reports.js` does NOT import or call `getJobStatus`, `updateJobStatus`, `createJob`, or reference `generation_jobs`
- `src/routes/jobs.js` does NOT import or call `getReport`, `insertReport`, or reference `reports` table

**AC-5: `job_id` never appears in the final report URL**
- `src/routes/reports.js` URL parameter is `:report_id` — never `:job_id` or `:id`
- `reports.js` never includes `job_id` in any HTTP response body (no `reply.send({job_id})` line)
- `src/routes/generate.js` returns both `job_id` (for polling at `/api/jobs/:job_id`) and `report_id` (for report access at `/api/reports/:report_id`) in the 202 response — they are distinct identifiers serving distinct purposes

**AC-6: UUIDs only — no sequential or predictable IDs**
- `src/routes/generate.js` uses `randomUUID()` from `node:crypto` for both `job_id` and `report_id`
- No auto-increment integers, raw timestamps, or `Math.random()` used as IDs
- UUID v4 format (`xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx`); 122-bit entropy
- 1,000 consecutive generated IDs are all unique (probabilistic collision impossibility)

**AC-7: No JOIN between `generation_jobs` and `reports` accessible via HTTP routes**
- `queries.js` has no function that JOINs these two tables
- `src/routes/reports.js` handler only calls `getReport` — never `getJobStatus` or anything from `generationJobs`
- `src/routes/jobs.js` handler only calls `getJobStatus` — never `getReport` or `insertReport`

**AC-8: Cross-seller isolation invariants hold**
- `reports.js` does NOT accept `email` or `marketplace_url` as query/path params (no cross-seller enumeration vector)
- The `reports.js` 404 message is uniform: `"Este relatório expirou ou não existe..."` — same for expired and never-existed (does not leak existence)
- `report_id` (UUID v4, 122-bit entropy) is the sole access token

**AC-9: All 36 ATDD 8.2 tests pass**
- `node --test tests/epic8-8.2-no-listing-endpoint-and-cross-seller-isolation.atdd.test.js` → 36 pass, 0 fail
- No regressions: `npm test` — no new failures

---

## Tasks / Subtasks

- [ ] **Task 1: Verify ATDD tests pass as-is** (AC: 1–9)
  - [ ] Run: `node --test tests/epic8-8.2-no-listing-endpoint-and-cross-seller-isolation.atdd.test.js`
  - [ ] Confirm output: `# pass 36`, `# fail 0`
  - [ ] If all pass → no source changes needed; proceed to Task 2
  - [ ] If any fail → investigate the specific failing test and apply the minimum fix described in Dev Notes

- [ ] **Task 2: Run full test suite for regressions** (AC: 9)
  - [ ] Run: `npm test`
  - [ ] Confirm no new failures vs. pre-story baseline

- [ ] **Task 3: Mark story complete**
  - [ ] Update story Status to `review`
  - [ ] Fill in Dev Agent Record section

---

## Dev Notes

### This Is a Verification Story — No New Code Required

All AC invariants are already satisfied by the existing implementation. The source files were written with these constraints from Epics 4, 2, and 3:

| File | What guarantees the invariant |
|---|---|
| `src/routes/reports.js` | Only registers `:report_id`-parameterised routes; no bare `/api/reports` |
| `src/routes/jobs.js` | Only registers `:job_id`-parameterised route; no bare `/api/jobs` |
| `src/db/queries.js` | `getReport` uses Drizzle `eq(reports.reportId, reportId)` + `gt(reports.expiresAt, now)` — two-condition WHERE, no joins |
| `src/routes/generate.js` | Uses `randomUUID()` from `node:crypto`; 202 response: `{ data: { job_id, report_id } }` |

The ATDD test file at `tests/epic8-8.2-no-listing-endpoint-and-cross-seller-isolation.atdd.test.js` has been scaffolded since commit `90f77cd` and all 36 tests pass against the current implementation.

### If a Test Fails — Minimum Fixes

#### AC-1 fail: bare `/api/reports` route detected
- Remove any route matching `fastify.get('/api/reports', ...)` from `src/routes/reports.js`
- Fastify naturally returns 404 for unregistered routes

#### AC-2 fail: bare `/api/jobs` route detected
- Remove any route matching `fastify.get('/api/jobs', ...)` from `src/routes/jobs.js`

#### AC-3 fail: bare table scan or LIKE/BETWEEN/GLOB
- Ensure `getReport` uses `eq(reports.reportId, reportId)` — Drizzle equality, not `LIKE` or range
- Ensure no `.from(reports)` without `.where()` exists

#### AC-4/AC-7 fail: cross-table JOIN or cross-route query import
- Remove any `.leftJoin`/`.innerJoin`/etc. from `queries.js`
- `reports.js` should only import `getReport` from `queries.js`
- `jobs.js` should only import `getJobStatus` from `queries.js`

#### AC-5 fail: `job_id` in report URL
- Change `:job_id` URL param in `reports.js` to `:report_id`
- Remove any `job_id` from `reply.send()` bodies in `reports.js`

#### AC-6 fail: non-UUID IDs
- Replace any non-`randomUUID()` ID generation with `import { randomUUID } from 'node:crypto'`

### Key Architecture Invariants (Non-Negotiable)

- `report_id` is the sole access token — UUID v4 from `crypto.randomUUID()`
- 48h TTL enforced by `getReport(reportId, now)` with `gt(reports.expiresAt, now)`
- `api_key` NEVER appears in DB, query responses, or logs — verified by NFR-S2 test block
- `queries.js` is the SOLE data-access layer — no raw SQL outside `queries.js` (except `schema.js`)
- Route handlers call `queries.js` named exports only — no direct Drizzle or SQL in route files

### Files to Inspect (No Modification Expected)

| File | Invariant it holds |
|---|---|
| `src/routes/reports.js` | AC-1, AC-4, AC-5, AC-7, AC-8 |
| `src/routes/jobs.js` | AC-2, AC-4, AC-7 |
| `src/db/queries.js` | AC-3, AC-4, AC-7 |
| `src/routes/generate.js` | AC-5, AC-6 |

### ESM Pattern

All source files use ESM (`"type": "module"` in `package.json`). Use `import`/`export` — never `require()` or `module.exports`.

### How `codeLines()` Works in the ATDD Test

The ATDD test strips source before static assertions:
```javascript
function codeLines(src) {
  const noBlock = src.replace(/\/\*[\s\S]*?\*\//g, '')  // strips /* ... */ block comments
  return noBlock
    .split('\n')
    .filter(line => {
      const trimmed = line.trim()
      return trimmed.length > 0 && !trimmed.startsWith('//')
    })
    .join('\n')
}
```

This means:
- `/* block comment */` is stripped — keywords in block comments don't satisfy static checks
- Full-line `// comment` lines are stripped
- Inline `// comment` at end of a code line IS preserved

---

## Architecture Guardrails

| Boundary | Rule |
|---|---|
| `src/routes/reports.js` | Only `getReport` import from `queries.js` — never `getJobStatus` |
| `src/routes/jobs.js` | Only `getJobStatus` import from `queries.js` — never `getReport` |
| `src/db/queries.js` | No JOIN between `reports` and `generationJobs` in any exported function |
| `src/routes/generate.js` | `randomUUID()` from `node:crypto` for both IDs — never sequential |
| Any route handler | Never accept `email`/`marketplace_url` as report access param |

**Security invariants (non-negotiable):**
1. `report_id` is the sole access token — no email-based or job-based report lookup via HTTP
2. `api_key` not in any `log` or `reply` call in governance-layer files (NFR-S2)
3. 404 message is uniform — never distinguish "expired" vs "never existed"

---

## Previous Story Intelligence

**From Story 4.3 (GET /api/reports + CSV — done):**
- `reports.js` was authored to have only parameterised routes from the start
- The `PT_404_MESSAGE` constant `'Este relatório expirou ou não existe...'` is already defined and used uniformly for both expired and not-found cases
- `getReport(reportId, now)` returns `null` (not throws) on miss — route handler checks `if (!row)` before using data

**From Story 4.2 (GET /api/jobs polling — done):**
- `jobs.js` only registers the parameterised `/api/jobs/:job_id` route

**From Epic 2 (Key Security — done):**
- `generate.js` was written with `randomUUID()` as the ONLY ID generator — sequential IDs were explicitly forbidden from day one

**From Epic 7 retrospective:**
- Pre-written ATDD tests are the contract — implement to pass them exactly
- Static source checks (`readFileSync`) are part of the ATDD suite — code structure matters, not just runtime

---

## Story Dependencies

**This story (8.2) requires:**
- Story 4.3 complete (done) — `src/routes/reports.js` and `src/routes/jobs.js` exist
- Story 4.1 complete (done) — `src/routes/generate.js` with `randomUUID()` IDs

**Stories that depend on 8.2:**
- None — this is the final story in Epic 8 (8.1 runs in parallel)

---

## Verification Checklist

After completing all tasks, verify:

- [ ] `node --test tests/epic8-8.2-no-listing-endpoint-and-cross-seller-isolation.atdd.test.js` → 36 pass, 0 fail
- [ ] `npm test` → no new failures vs. pre-story baseline
- [ ] `src/routes/reports.js`: no bare `/api/reports` route registered
- [ ] `src/routes/jobs.js`: no bare `/api/jobs` route registered
- [ ] `src/db/queries.js`: `getReport` uses `eq(reports.reportId, reportId)` equality — no LIKE/BETWEEN/GLOB
- [ ] `src/db/queries.js`: no JOIN between `reports` and `generationJobs`
- [ ] `src/routes/generate.js`: `randomUUID()` used for both `job_id` and `report_id`
- [ ] `api_key` does NOT appear in any `log` or `reply` call in governance-layer files

---

## Dev Agent Record

### Agent Model Used

_to be filled by dev agent_

### Completion Notes List

_to be filled by dev agent_

### File List

_to be filled by dev agent — expected: no source files modified (verification-only story)_

### Change Log

- 2026-04-23: Story 8.2 created — no listing endpoint + cross-seller isolation verification. All 36 ATDD tests already pass against existing implementation.
