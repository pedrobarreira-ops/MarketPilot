# Story 4.3: GET /api/reports & CSV Routes

**Epic:** 4 — HTTP API Layer
**Story:** 4.3
**Story Key:** 4-3-get-api-reports-and-csv
**Status:** ready-for-dev
**Date Created:** 2026-04-19

Endpoints verified against MCP-Verified Endpoint Reference (epics-distillate.md, 2026-04-18). This story reads local SQLite DB only — NO Mirakl API calls of any kind. No MCP verification required for this story.

---

## User Story

As a user who has generated a MarketPilot report,
I want `GET /api/reports/:report_id` to return my report JSON and `GET /api/reports/:report_id/csv` to return a downloadable CSV,
So that the report page can render my data and I can download the full catalog analysis.

**Satisfies:** Epic 4.3 AC — GET /api/reports/:id returns report JSON with 404 for expired/missing; GET /api/reports/:id/csv returns csv_data with correct Content-Type and Content-Disposition headers; GET /api/reports (no id) → 404 (not registered); GET /report/:id → public/report.html.

---

## Acceptance Criteria

**AC-1: GET /api/reports/:report_id — valid non-expired report → 200 JSON**
- Returns HTTP 200 for a report that exists AND `expires_at > now`
- Response body: `{ "data": { "summary": {...}, "opportunities_pt": [...], "opportunities_es": [...], "quickwins_pt": [...], "quickwins_es": [...] } }`
- `data` must contain EXACTLY these five keys — no extra fields
- Each JSON field is parsed from the SQLite TEXT column (not returned as a string)
- Content-Type: `application/json`

**AC-2: GET /api/reports/:report_id — expired report → 404**
- Report with `expires_at <= now` returns HTTP 404
- 404 body: `{ "error": "report_not_found", "message": "Este relatório expirou ou não existe. Gera um novo relatório para obteres dados actualizados." }`
- Message must match character-for-character — no variation, no typos

**AC-3: GET /api/reports/:report_id — non-existent report → 404**
- Unknown `report_id` returns HTTP 404
- Same 404 body shape and message as AC-2

**AC-4: GET /api/reports/:report_id/csv — returns csv_data**
- Valid non-expired report → HTTP 200 with `row.csv_data` as the response body
- Expired or missing → HTTP 404 with same `report_not_found` body as AC-2/AC-3
- Response body matches stored `csv_data` exactly

**AC-5: CSV Content-Type is `text/csv`**
- `Content-Type: text/csv` header must be present on 200 responses

**AC-6: CSV Content-Disposition is `attachment; filename="marketpilot-report.csv"`**
- `Content-Disposition: attachment; filename="marketpilot-report.csv"` header must be present on 200 responses

**AC-7: CSV response time < 3s (NFR-P5)**
- Route returns within 3000ms — single SQLite lookup from TEXT column, no computation

**AC-8: GET /api/reports (no id) → 404 — listing endpoint NOT registered**
- `GET /api/reports` (no `:report_id` segment) returns 404
- `GET /api/reports/` (trailing slash) returns 404
- This is a security invariant (NFR-S3): no report listing endpoint may exist

**AC-9: GET /report/:report_id → serves `public/report.html`**
- Returns HTTP 200
- Response body is HTML (contains `<!DOCTYPE html>` or `<html`)
- Any value of `:report_id` returns `report.html` — the JS in `report.html` fetches the API at runtime
- **This route is already registered in `src/server.js` — DO NOT re-register it**

**AC-10: 404 error body uses `{ error: "report_not_found", message }` exact shape**
- Top-level keys are EXACTLY `["error", "message"]` — no extra keys
- `error` field value is the string `"report_not_found"`
- `message` is the exact Portuguese string (see AC-2)

**Exact 404 message (copy verbatim):**
```
Este relatório expirou ou não existe. Gera um novo relatório para obteres dados actualizados.
```

**Verified by:** `tests/epic4-4.3-get-api-reports-and-csv.atdd.test.js` (pre-existing — DO NOT MODIFY)

---

## CSV Header Contract (CRITICAL — Spec-Locked)

The CSV `csv_data` field stored in SQLite (written by Story 3.5 — `buildReport.js`) already contains the full CSV. This route streams it as-is — it does NOT generate or transform the CSV.

However, the test `"CSV first line is the exact spec header"` asserts that the stored CSV starts with this exact 12-column header in this exact order:

```
EAN,product_title,shop_sku,my_price,pt_first_price,pt_gap_eur,pt_gap_pct,pt_wow_score,es_first_price,es_gap_eur,es_gap_pct,es_wow_score
```

This header is defined in `src/db/queries.js` as `CSV_COLUMNS` (already exists). The route does NOT need to produce or validate the CSV header — it returns `row.csv_data` verbatim. The contract test passes because Story 3.5 already wrote the correct header when building the report.

**DO NOT** alphabetize, reorder, or use a set-based structure for CSV columns. The order is part of the public API contract as documented in `_bmad-output/planning-artifacts/test-plan-epic-4-http-api-layer.md`.

---

## No Mirakl API Calls

This story reads **local SQLite only** — no calls to Mirakl OF21, P11, or any external API. The `getReport(reportId, now)` function in `src/db/queries.js` is the only data access.

---

## Tasks / Subtasks

- [ ] Task 1: Create `src/routes/reports.js` route module (AC: 1–8)
  - [ ] Import `getReport` from `../db/queries.js`
  - [ ] Register `GET /api/reports/:report_id` — JSON report endpoint (AC-1, 2, 3, 10)
  - [ ] Register `GET /api/reports/:report_id/csv` — CSV download endpoint (AC-4, 5, 6, 7)
  - [ ] Do NOT register `GET /api/reports` (listing) — it must remain a 404 (AC-8)
  - [ ] Do NOT re-register `GET /report/:report_id` — it already exists in `src/server.js` (AC-9)
  - [ ] Use `Math.floor(Date.now() / 1000)` for `now` — never `Date.now()` (see getReport gotcha)
  - [ ] Handle `getReport` returning `null` → 404 with exact shape (AC-2, 3, 10)
  - [ ] Parse JSON fields before sending (AC-1)
  - [ ] Set correct CSV headers (AC-5, 6)

- [ ] Task 2: Register the route in `src/server.js` (AC: 1, 4)
  - [ ] Add `import reportsRoute from './routes/reports.js'`
  - [ ] Add `await fastify.register(reportsRoute)` AFTER the existing `await fastify.register(generateRoute)` line
  - [ ] Confirm no conflict with the existing `/report/:report_id` static route

- [ ] Task 3: Validate against pre-existing ATDD tests (AC: all)
  - [ ] Run: `node --test tests/epic4-4.3-get-api-reports-and-csv.atdd.test.js`
  - [ ] All tests pass (36 tests across AC-1 through AC-10)
  - [ ] Run: `npm test` — all existing tests remain green (no regressions)

---

## Dev Notes

### Critical: Do NOT Modify the ATDD Test File

`tests/epic4-4.3-get-api-reports-and-csv.atdd.test.js` is pre-existing and locked. It builds its own minimal Fastify app with an in-memory SQLite database. It verifies the CONTRACT the route must fulfil. The real implementation in `src/routes/reports.js` must satisfy the same contract when integrated in `src/server.js`.

### CRITICAL: getReport now Parameter — Must Be Unix Seconds

```js
// CORRECT:
const now = Math.floor(Date.now() / 1000)
const row = getReport(report_id, now)

// WRONG — passes milliseconds, makes EVERY report appear expired:
const row = getReport(report_id, Date.now())
```

`getReport` uses Drizzle's `gt(reports.expiresAt, now)` which compares integer Unix seconds (~1.7 billion) against `now`. If you pass `Date.now()` (milliseconds, ~1.7 trillion), the comparison `expiresAt (1.7B) > now (1.7T)` is always false — every valid report returns null and triggers a false 404.

This gotcha is documented in `src/db/queries.js` JSDoc. Read it before implementing.

### Route Implementation Reference

The ATDD test (`tests/epic4-4.3-get-api-reports-and-csv.atdd.test.js`) includes the complete inline route implementation in its `buildTestApp()` function (lines 82–148). This is the exact contract. The production route at `src/routes/reports.js` should follow this pattern:

```js
// src/routes/reports.js
import { getReport } from '../db/queries.js'

export default async function reportsRoute(fastify) {

  // GET /api/reports/:report_id — JSON report data
  fastify.get('/api/reports/:report_id', async (request, reply) => {
    const { report_id } = request.params
    const now = Math.floor(Date.now() / 1000)
    const row = getReport(report_id, now)

    if (!row) {
      return reply.status(404).send({
        error:   'report_not_found',
        message: 'Este relatório expirou ou não existe. Gera um novo relatório para obteres dados actualizados.',
      })
    }

    return reply.send({
      data: {
        summary:           JSON.parse(row.summary_json),
        opportunities_pt:  JSON.parse(row.opportunities_pt_json),
        opportunities_es:  JSON.parse(row.opportunities_es_json),
        quickwins_pt:      JSON.parse(row.quickwins_pt_json),
        quickwins_es:      JSON.parse(row.quickwins_es_json),
      },
    })
  })

  // GET /api/reports/:report_id/csv — CSV download
  fastify.get('/api/reports/:report_id/csv', async (request, reply) => {
    const { report_id } = request.params
    const now = Math.floor(Date.now() / 1000)
    const row = getReport(report_id, now)

    if (!row) {
      return reply.status(404).send({
        error:   'report_not_found',
        message: 'Este relatório expirou ou não existe. Gera um novo relatório para obteres dados actualizados.',
      })
    }

    return reply
      .status(200)
      .header('Content-Type', 'text/csv')
      .header('Content-Disposition', 'attachment; filename="marketpilot-report.csv"')
      .send(row.csv_data)
  })

  // NOTE: GET /api/reports (no id) is intentionally NOT registered — Fastify returns 404 automatically.
  // NOTE: GET /report/:report_id is NOT registered here — it already exists in src/server.js.
}
```

### Registering the Route in server.js

Add the route registration AFTER the existing `generateRoute` registration:

```js
// src/server.js — add after existing generateRoute registration
import reportsRoute from './routes/reports.js'

// ... after: await fastify.register(generateRoute)
await fastify.register(reportsRoute)
```

### Route Conflict Warning: `/report/:id` vs `/api/reports/:id`

- `GET /report/:report_id` — static HTML shell — already registered in `src/server.js` (line 63–65). **Do NOT touch it.**
- `GET /api/reports/:report_id` — JSON API — registered in the new `src/routes/reports.js`
- `GET /api/reports/:report_id/csv` — CSV download — registered in the same `src/routes/reports.js`

These three routes are distinct paths. No conflict. No need to modify the existing `/report/:report_id` registration.

### getReport Signature (from src/db/queries.js)

```js
export function getReport(reportId, now)
// Returns: {report_id, generated_at, expires_at, email, summary_json,
//           opportunities_pt_json, opportunities_es_json,
//           quickwins_pt_json, quickwins_es_json, csv_data}
// Returns null — never throws — when reportId not found OR expires_at <= now
```

The function already handles the `WHERE report_id = ? AND expires_at > now` query with `gt(reports.expiresAt, now)`. The route simply checks for null and returns 404.

### JSON Parsing Required

`summary_json`, `opportunities_pt_json`, `opportunities_es_json`, `quickwins_pt_json`, `quickwins_es_json` are stored as TEXT in SQLite. The route must `JSON.parse()` each before including in the response — the API contract returns structured JSON objects/arrays, not strings.

### CSV Streaming — No Generation

The route does NOT generate the CSV. `csv_data` is the pre-computed TEXT field written by `buildReport.js` (Story 3.5). The route returns `row.csv_data` verbatim. No transformation, no re-parsing, no column reordering.

### Exact Portuguese 404 Message (Character-for-Character)

```
Este relatório expirou ou não existe. Gera um novo relatório para obteres dados actualizados.
```

Note: `actualizados` uses `c` (not `z`). This exact string must appear in both routes (JSON and CSV) when `getReport` returns null. It is tested by `"expired report 404 message matches spec exactly"` and `"404 message is the Portuguese expiry message from spec"`.

### What NOT to Do

- Do NOT call `Date.now()` as the `now` argument — must use `Math.floor(Date.now() / 1000)`
- Do NOT register `GET /api/reports` (no id segment) — leave it unregistered so Fastify returns 404
- Do NOT re-register `GET /report/:report_id` — it already exists in server.js
- Do NOT generate or transform the CSV — return `row.csv_data` as-is
- Do NOT include the `email`, `generated_at`, `expires_at`, or `csv_data` fields in the JSON report response (AC-1: exactly 5 keys in `data`)
- Do NOT return JSON strings from the data fields — parse them first
- Do NOT vary the 404 message — it is a character-for-character contract tested by ATDD
- Do NOT modify `src/db/queries.js`, `src/middleware/errorHandler.js`, or any test file

### No Mirakl Calls — Confirmed

This story touches only `src/routes/reports.js` (new) and `src/server.js` (one registration line). No Mirakl endpoints, no BullMQ, no keyStore, no email, no worker files.

### Security Invariants

- `GET /api/reports` (no id) must return 404 — enforced by not registering the route (NFR-S3)
- `getReport` uses `WHERE report_id = ?` — no cross-seller data access (NFR-S5)
- No `api_key` field anywhere in this story
- Expired reports always return 404 — TTL double-enforcement (read-time + hourly cron from Story 8.1)

### Previous Story Context (4.1 — POST /api/generate)

Story 4.1 established the route module pattern: a default export async function that registers routes on the Fastify instance. Follow the same pattern:

```js
export default async function reportsRoute(fastify) {
  fastify.get('/api/reports/:report_id', async (request, reply) => { ... })
  fastify.get('/api/reports/:report_id/csv', async (request, reply) => { ... })
}
```

Story 4.1 also confirmed that `src/middleware/errorHandler.js` is already wired in `server.js`. It handles Fastify schema errors → 400 and all other errors → 500. For this route, errors from JSON.parse failures would be caught by the global error handler. The routes themselves don't throw — `getReport` returns null on not-found/expired, never throws.

### Test Commands

```bash
# Story ATDD only:
node --test tests/epic4-4.3-get-api-reports-and-csv.atdd.test.js

# Full suite (all existing tests must remain green):
npm test
```

### Project Structure Notes

- Create: `src/routes/reports.js` (new file)
- Modify: `src/server.js` (add one `await fastify.register(reportsRoute)` line)
- Do NOT modify: `src/db/queries.js`, `src/middleware/errorHandler.js`, `src/server.js` beyond route registration, any test file
- Existing route files: `src/routes/generate.js` (Story 4.1 — complete)

### Git Context (Recent Commits)

- `3528f4e` — Phase 0: update dependency graph — PR #44 merged, 4.2/4.3/5.1 unblocked
- `5cc83ab` — Set story 4-1-post-api-generate-route to done in sprint-status (post-merge reconciliation)
- `a8e9c62` — story-4.1-post-api-generate-route - fixes #16 (#44) — Story 4.1 implementation merged
- `b0a7e9d` — Pre-Phase-2 Epic 4: add CSV header exact-match test, log deferred-work gaps — this commit added the locked ATDD test file including the CSV header contract test

The ATDD test at `tests/epic4-4.3-get-api-reports-and-csv.atdd.test.js` was created in commit `b0a7e9d` and defines the contract this story must implement.

### NFR Compliance

- **NFR-P5:** `< 3s` — single SQLite row lookup on an indexed column (`report_id TEXT PK`). `csv_data` is a TEXT column returned as a string. No computation. Well under 3s.
- **NFR-R4:** expired URL → 404 on 100% of requests — `getReport` enforces `expires_at > now` at read time.
- **NFR-S3:** no public index/list endpoint — `GET /api/reports` is not registered.

### References

- [Source: epics-distillate.md §HTTP API Routes] — GET /api/reports/:id and /csv exact spec
- [Source: epics-distillate.md §CSV Schema] — 12-column header order (spec contract)
- [Source: epics-distillate.md §Epic 4 AC 4.3] — compressed acceptance criteria
- [Source: tests/epic4-4.3-get-api-reports-and-csv.atdd.test.js] — pre-existing locked ATDD contract (AC-1 through AC-10, 36 tests)
- [Source: src/db/queries.js] — getReport signature, CSV_COLUMNS constant, unix seconds gotcha in JSDoc
- [Source: src/middleware/errorHandler.js] — error shape (400/500 mapping)
- [Source: src/server.js] — existing route registrations; /report/:report_id already registered at line 63
- [Source: _bmad-output/planning-artifacts/test-plan-epic-4-http-api-layer.md §Spec contract notes] — CSV header order is spec-locked; alphabetization forbidden
- [Source: architecture-distillate.md §API Routes] — GET /api/reports listing NOT registered

---

## Dev Agent Record

### Agent Model Used

_to be filled by dev agent_

### Debug Log References

_to be filled by dev agent_

### Completion Notes List

_to be filled by dev agent_

### File List

_to be filled by dev agent_

### Change Log

- 2026-04-19: Story 4.3 spec created — create-story workflow, comprehensive developer guide.
