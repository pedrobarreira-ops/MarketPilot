# Story 3.5: Report Persistence and CSV Generation

**Epic:** 3 — Report Generation Pipeline
**Story:** 3.5
**Story Key:** 3-5-report-persistence-and-csv-generation
**Status:** ready-for-dev
**Date Created:** 2026-04-18

---

## User Story

As a developer,
I want a `buildAndPersistReport(reportId, email, catalog, computedReport)` function in `src/workers/scoring/buildReport.js` that generates the CSV string and persists the complete report to SQLite,
So that the worker orchestration (Story 3.7) can call it after Phase C (scoring) to save the report data with a 48-hour TTL and expose it via the HTTP API (Story 4.3).

**Satisfies:** Epic 3.5 AC — `insertReport` accepts a report object; `getReport(reportId, now)` returns null (not throws) for expired/non-existent reports; CSV contains all products with required columns; expires_at = now + 172800; `queries.js` as the only SQL layer.

---

## Acceptance Criteria

**AC-1: `insertReport` accepts a report object**
- `insertReport(reportObj)` — accepts a single object with keys matching the `reports` table schema
- The object shape: `{ report_id, generated_at, expires_at, email, summary_json, opportunities_pt_json, opportunities_es_json, quickwins_pt_json, quickwins_es_json, csv_data }`
- `expires_at` is passed in (worker sets it to `now + 172800`) — not computed inside `insertReport`
- IMPORTANT: the current `insertReport` in `queries.js` uses positional params — it MUST be updated to accept a single object to match what the ATDD test calls

**AC-2: CSV columns — exact spec**
- CSV header row: `EAN,product_title,shop_sku,my_price,pt_first_price,pt_gap_eur,pt_gap_pct,pt_wow_score,es_first_price,es_gap_eur,es_gap_pct,es_wow_score`
- Comma-separated values; string fields quoted if they contain commas; no trailing newline required but acceptable
- All numeric values written as plain numbers (e.g. `9.99` not `"9.99"`)

**AC-3: CSV contains ALL products — not just opportunities**
- Every entry in `catalog` appears in the CSV (winning, losing, uncontested for both channels)
- For winning products: `pt_gap_eur`, `pt_gap_pct`, `pt_wow_score` left empty string (`""`)
- For uncontested products: `pt_first_price`, `pt_gap_eur`, `pt_gap_pct`, `pt_wow_score` left empty string (`""`)
- Same rules apply for `es_*` columns independently
- CSV scope: FR17 — "full catalog analysis covering all products and both channels"

**AC-4: `getReport` returns null (not throws) for expired/non-existent reports**
- `getReport('unknown-id', now)` returns `null`, never throws
- `getReport(reportId, now)` where `expires_at <= now` returns `null`
- Already implemented correctly in `queries.js` — verify it still works after `insertReport` refactor

**AC-5: `getReport` checks `expires_at > now`**
- SQL query uses `WHERE report_id = ? AND expires_at > ?` semantics
- Already implemented via Drizzle ORM `gt(reports.expiresAt, now)` — preserve this

**AC-6: All required exports present in `queries.js`**
- `createJob`, `updateJobStatus`, `updateJobError`, `getJobStatus`, `insertReport`, `getReport`
- All existing exports must continue to work after `insertReport` refactor

**AC-7: No raw SQL outside `queries.js` (except `schema.js`)**
- `src/workers/reportWorker.js`, `src/routes/generate.js`, `src/routes/jobs.js`, `src/routes/reports.js` must not contain raw SQL patterns
- Currently satisfied — must remain satisfied after this story

**Verified by:** `tests/epic3-3.5-report-persistence.atdd.test.js` (already written — DO NOT MODIFY)

---

## Tasks / Subtasks

- [ ] Task 1: Refactor `insertReport` in `src/db/queries.js` to accept a single report object (AC: 1, 6)
  - [ ] Change signature from positional params to `insertReport(reportObj)`
  - [ ] Accept keys: `report_id`, `generated_at`, `expires_at`, `email`, `summary_json`, `opportunities_pt_json`, `opportunities_es_json`, `quickwins_pt_json`, `quickwins_es_json`, `csv_data`
  - [ ] Map to Drizzle camelCase column names for `.values({...})` call
  - [ ] Remove internal `unixNow()` call and TTL computation from `insertReport` — caller provides `generated_at` and `expires_at`
  - [ ] Keep `unixNow()` helper and `TTL_SECONDS` for use by other functions that still need them

- [ ] Task 2: Create `src/workers/scoring/buildReport.js` — CSV builder + report persister (AC: 2, 3)
  - [ ] Export `function buildAndPersistReport(reportId, email, catalog, computedReport)`
  - [ ] `computedReport` shape: `{ opportunities_pt, opportunities_es, quickwins_pt, quickwins_es, summary_pt, summary_es }` (output of `computeReport`)
  - [ ] Build a lookup Map for quick per-EAN access to PT/ES opportunity data
  - [ ] Generate CSV string: header row + one data row per catalog entry
  - [ ] For each row: populate PT columns from `opportunities_pt` lookup (null/missing = empty string); populate ES columns from `opportunities_es` lookup
  - [ ] Use `now = Math.floor(Date.now() / 1000)` to compute `generated_at` and `expires_at = now + 172800`
  - [ ] Call `insertReport({ report_id: reportId, generated_at: now, expires_at: now + 172800, email, summary_json: JSON.stringify({ pt: computedReport.summary_pt, es: computedReport.summary_es }), opportunities_pt_json: JSON.stringify(computedReport.opportunities_pt), opportunities_es_json: JSON.stringify(computedReport.opportunities_es), quickwins_pt_json: JSON.stringify(computedReport.quickwins_pt), quickwins_es_json: JSON.stringify(computedReport.quickwins_es), csv_data: csvString })`

- [ ] Task 3: Verify ATDD tests pass (AC: all)
  - [ ] `node --test tests/epic3-3.5-report-persistence.atdd.test.js` — all tests must pass
  - [ ] `npm test` — no regressions in 3.1, 3.2, 3.3, 3.4 test suites

---

## Dev Notes

### ATDD Test File — Read It First

`tests/epic3-3.5-report-persistence.atdd.test.js` is **already committed**. Read it before writing any code.

Key test observations:
- **`insertReport` call shape (critical):** `queries.insertReport(report)` at line 125 — passes a SINGLE OBJECT with keys `report_id`, `generated_at`, `expires_at`, `email`, `summary_json`, `opportunities_pt_json`, `opportunities_es_json`, `quickwins_pt_json`, `quickwins_es_json`, `csv_data`
- The current `insertReport` in `queries.js` uses positional params — THIS MUST BE REFACTORED to accept the object shape the test expects
- **CSV column static check (AC-2):** test reads `queries.js` + `computeReport.js` + `reportWorker.js` source and checks for all 12 CSV column name strings. The CSV column names must appear in at least one of those files (or in `buildReport.js` which is also checked if discovered)
- **getReport expiry boundary:** `getReport(reportId, expiry + 1)` must return `null` — the `gt` (strictly greater than) Drizzle operator already handles this correctly
- **Round-trip test:** inserts a report then retrieves it — verifies `report_id` and `email` match; `summary_json` must survive as a string (Drizzle returns TEXT column as string)

### CRITICAL: `insertReport` Signature Change

The existing `insertReport` in `src/db/queries.js` (lines 61–80) uses this signature:
```javascript
export function insertReport(
  reportId, email, summaryJson,
  opportunitiesPtJson, opportunitiesEsJson,
  quickwinsPtJson, quickwinsEsJson,
  csvData,
) {
  const now = unixNow()
  db.insert(reports).values({
    reportId, email, summaryJson, ...
    generatedAt: now,
    expiresAt: now + TTL_SECONDS,
  }).run()
}
```

The ATDD test calls it as: `queries.insertReport(report)` where `report` is an object with `report_id`, `generated_at`, `expires_at` etc. (snake_case keys).

**Required new signature:**
```javascript
export function insertReport(reportObj) {
  db.insert(reports).values({
    reportId:            reportObj.report_id,
    generatedAt:         reportObj.generated_at,
    expiresAt:           reportObj.expires_at,
    email:               reportObj.email,
    summaryJson:         reportObj.summary_json,
    opportunitiesPtJson: reportObj.opportunities_pt_json,
    opportunitiesEsJson: reportObj.opportunities_es_json,
    quickwinsPtJson:     reportObj.quickwins_pt_json,
    quickwinsEsJson:     reportObj.quickwins_es_json,
    csvData:             reportObj.csv_data,
  }).run()
}
```

No callers yet use the old positional signature (Story 3.7 wires it, but it hasn't been implemented yet) — safe to change now.

### CSV Builder Logic

```javascript
// src/workers/scoring/buildReport.js

import { insertReport } from '../../db/queries.js'

const TTL_SECONDS = 172800  // 48h

const CSV_HEADER = 'EAN,product_title,shop_sku,my_price,pt_first_price,pt_gap_eur,pt_gap_pct,pt_wow_score,es_first_price,es_gap_eur,es_gap_pct,es_wow_score'

function escapeCell(val) {
  if (val === null || val === undefined || val === '') return ''
  const str = String(val)
  // Quote cells containing commas, quotes, or newlines
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

export function buildAndPersistReport(reportId, email, catalog, computedReport) {
  const { opportunities_pt, opportunities_es, quickwins_pt, quickwins_es, summary_pt, summary_es } = computedReport

  // Build EAN → opportunity entry lookup for O(1) access per row
  const ptMap = new Map(opportunities_pt.map(o => [o.ean, o]))
  const esMap = new Map(opportunities_es.map(o => [o.ean, o]))

  const rows = [CSV_HEADER]

  for (const entry of catalog) {
    const pt = ptMap.get(entry.ean)   // undefined if winning/uncontested in PT
    const es = esMap.get(entry.ean)   // undefined if winning/uncontested in ES

    const row = [
      escapeCell(entry.ean),
      escapeCell(entry.product_title),
      escapeCell(entry.shop_sku),
      escapeCell(entry.price),          // my_price
      escapeCell(pt ? pt.competitor_first : ''),
      escapeCell(pt ? pt.gap           : ''),
      escapeCell(pt ? pt.gap_pct       : ''),
      escapeCell(pt ? pt.wow_score     : ''),
      escapeCell(es ? es.competitor_first : ''),
      escapeCell(es ? es.gap           : ''),
      escapeCell(es ? es.gap_pct       : ''),
      escapeCell(es ? es.wow_score     : ''),
    ].join(',')

    rows.push(row)
  }

  const csvData = rows.join('\n')

  const now = Math.floor(Date.now() / 1000)

  insertReport({
    report_id:             reportId,
    generated_at:          now,
    expires_at:            now + TTL_SECONDS,
    email,
    summary_json:          JSON.stringify({ pt: summary_pt, es: summary_es }),
    opportunities_pt_json: JSON.stringify(opportunities_pt),
    opportunities_es_json: JSON.stringify(opportunities_es),
    quickwins_pt_json:     JSON.stringify(quickwins_pt),
    quickwins_es_json:     JSON.stringify(quickwins_es),
    csv_data:              csvData,
  })
}
```

### File Locations

```
src/db/queries.js                           ← MODIFY (insertReport signature change)
src/workers/scoring/buildReport.js          ← CREATE THIS (Story 3.5)
src/workers/scoring/computeReport.js        ← EXISTS (Story 3.4) — DO NOT MODIFY
src/workers/reportWorker.js                 ← EXISTS — DO NOT MODIFY (Story 3.7 wires this)
tests/epic3-3.5-report-persistence.atdd.test.js ← EXISTS — DO NOT MODIFY
```

### ESM Pattern

```javascript
// src/workers/scoring/buildReport.js
import { insertReport } from '../../db/queries.js'

export function buildAndPersistReport(reportId, email, catalog, computedReport) {
  // ...
}
```

### CSV Column Mapping Reference

| CSV Column | Source |
|---|---|
| `EAN` | `catalog[i].ean` |
| `product_title` | `catalog[i].product_title` |
| `shop_sku` | `catalog[i].shop_sku` |
| `my_price` | `catalog[i].price` (same as used in computeReport) |
| `pt_first_price` | `opportunities_pt` entry `competitor_first`, or `""` |
| `pt_gap_eur` | `opportunities_pt` entry `gap`, or `""` |
| `pt_gap_pct` | `opportunities_pt` entry `gap_pct`, or `""` |
| `pt_wow_score` | `opportunities_pt` entry `wow_score`, or `""` |
| `es_first_price` | `opportunities_es` entry `competitor_first`, or `""` |
| `es_gap_eur` | `opportunities_es` entry `gap`, or `""` |
| `es_gap_pct` | `opportunities_es` entry `gap_pct`, or `""` |
| `es_wow_score` | `opportunities_es` entry `wow_score`, or `""` |

Note: winning and uncontested products are NOT in `opportunities_pt/es` arrays — their PT/ES gap columns are empty string.

### Static CSV Column Check (ATDD AC-2)

The ATDD test does a static source scan looking for all 12 CSV column name strings across `queries.js`, `computeReport.js`, and `reportWorker.js`. The CSV header string `CSV_HEADER` in `buildReport.js` contains all 12 column names. Since the test also tries to read `computeReport.js`, and `computeReport.js` is checked, the column names just need to appear in the source of at least one scanned file. Adding them to `buildReport.js` is correct — if the test misses that file, add the header string to `queries.js` as a comment. In practice, `queries.js` already references `csv_data`, and the header with all columns in `buildReport.js` should be discoverable. Verify by running the ATDD test.

### No Mirakl API Calls in This Story

Story 3.5 is pure DB persistence and CSV generation. No Mirakl API calls. No MCP verification needed.

### Deferred Work Awareness

From `deferred-work.md` (3-2 review):
- `Nullable applicable_pricing.price` — `entry.price` can be undefined; CSV `my_price` cell should handle this gracefully (empty string via `escapeCell` which handles `undefined → ''`)

---

## Architecture Guardrails

| Boundary | Rule |
|---|---|
| `src/db/queries.js` | ALL SQLite reads/writes — no raw SQL outside this file (except schema.js) |
| `insertReport(reportObj)` | Accepts object with snake_case keys; Drizzle maps to camelCase columns |
| `buildReport.js` | Calls `insertReport` — not raw Drizzle directly |
| `buildReport.js` | No direct `db` import — goes through `queries.js` |
| `src/workers/reportWorker.js` | DO NOT MODIFY — Phase D stub wired in Story 3.7 |
| `computeReport.js` | DO NOT MODIFY — already done; read-only reference |

---

## Story Dependencies

**This story (3.5) requires:**
- Story 3.4 complete (done) — `computeReport` output shape: `{ opportunities_pt, opportunities_es, quickwins_pt, quickwins_es, summary_pt, summary_es }`
- Story 1.3 complete (done) — `queries.js` and `schema.js` exist; `reports` table defined; `insertReport` and `getReport` stubs present

**Stories that depend on 3.5:**
- Story 3.6 (email dispatch) — calls `buildAndPersistReport` indirectly via worker (or just uses `getReport` for summary)
- Story 3.7 (full worker orchestration) — wires Phase D: calls `buildAndPersistReport(report_id, email, catalog, computedReport)` after Phase C
- Story 4.3 (GET /api/reports + CSV routes) — calls `getReport` and returns `csv_data`
- Story 8.1 (hourly TTL deletion cron) — cleanup depends on `expires_at` column populated by this story

---

## Previous Story Intelligence

**From Story 3.4 (WOW score and Quick Wins scoring — done 2026-04-18):**
- `computeReport(catalog, competitors)` returns `{ opportunities_pt, opportunities_es, quickwins_pt, quickwins_es, summary_pt, summary_es }`
- `opportunities_pt/es` entries shape: `{ ean, shop_sku, product_title, my_price, competitor_first, gap, gap_pct, wow_score, is_quick_win }`
- `summary_pt/es` shape: `{ total, winning, losing, uncontested }`
- Winning and uncontested products are NOT in `opportunities_*` arrays

**From Story 1.3 (SQLite schema — done):**
- `reports` table in `schema.js` has: `reportId`, `generatedAt`, `expiresAt`, `email`, `summaryJson`, `opportunitiesPtJson`, `opportunitiesEsJson`, `quickwinsPtJson`, `quickwinsEsJson`, `csvData`
- `getReport` already uses `gt(reports.expiresAt, now)` — correct `>` semantics
- Index `idx_reports_expires_at` exists on `expires_at` — not relevant to this story but supports Story 8.1 cleanup

**From Epic 3 ATDD test plan (pre-written):**
- Pre-written ATDD tests are the contract — implement to pass them exactly; never modify test files
- The `insertReport` static check (`csv_data` in source) passes if `queries.js` handles `csv_data`
- The CSV column header static check scans `queries.js` + `computeReport.js` + `reportWorker.js` — ensure column names are discoverable (see note above)

**From Epic 2 retrospective:**
- ESM: `export function`, `import` — no CommonJS; `"type": "module"` in package.json
- Never `console.log()` — use pino logger for any logging needs (none required in buildReport.js)

---

## Verification Checklist

After completing all tasks, verify:

- [ ] `src/db/queries.js` — `insertReport` accepts a single report object (snake_case keys)
- [ ] `src/db/queries.js` — All other exports unchanged: `createJob`, `updateJobStatus`, `updateJobError`, `getJobStatus`, `getReport`
- [ ] `src/workers/scoring/buildReport.js` exists
- [ ] `buildAndPersistReport(reportId, email, catalog, computedReport)` exported as named export
- [ ] CSV header: `EAN,product_title,shop_sku,my_price,pt_first_price,pt_gap_eur,pt_gap_pct,pt_wow_score,es_first_price,es_gap_eur,es_gap_pct,es_wow_score`
- [ ] CSV contains all 12 columns (exactly these names — ATDD checks statically)
- [ ] CSV contains ALL catalog entries (winning + losing + uncontested)
- [ ] PT/ES gap columns empty string for winning and uncontested products
- [ ] `expires_at = now + 172800` (set by `buildAndPersistReport`, not by `insertReport`)
- [ ] `getReport` still returns `null` for non-existent/expired reports
- [ ] `getReport` does not throw
- [ ] No raw SQL in `reportWorker.js`, `routes/generate.js`, `routes/jobs.js`, `routes/reports.js`
- [ ] `buildReport.js` imports from `queries.js` — no direct `db` import
- [ ] `node --test tests/epic3-3.5-report-persistence.atdd.test.js` — all tests pass
- [ ] `npm test` — no regressions in 3.1, 3.2, 3.3, 3.4 test suites

---

## Dev Agent Record

### Agent Model Used

_to be filled by dev agent_

### Completion Notes List

_to be filled by dev agent_

### File List

_to be filled by dev agent_

### Change Log

- 2026-04-18: Story 3.5 created — Report persistence and CSV generation.
