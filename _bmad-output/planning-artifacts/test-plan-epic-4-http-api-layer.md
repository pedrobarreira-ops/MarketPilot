# Test Plan — Epic 4: HTTP API Layer

**Project:** MarketPilot Free Report
**Author:** Quinn (QA Agent) for Pedro
**Date:** 2026-04-19
**Updated:** 2026-04-20 — Story 4.2a (Polling Progress Contract — Structured Counts) added
**Epic:** 4 — HTTP API Layer
**Stories:** 4.1 POST /api/generate · 4.2 GET /api/jobs/:id polling · 4.2a Polling Progress Contract (retrofit) · 4.3 GET /api/reports/:id + CSV

---

## Scope

This test plan covers all acceptance criteria for Epic 4. Tests are written for the Node.js built-in test runner (`node:test`) — no extra test framework dependencies needed. All tests use Fastify `inject()` (no live port bound). Story 4.1 uses a stub queue and stubbed keyStore; Stories 4.2, 4.2a, and 4.3 use a real SQLite `:memory:` database via `queries.js`. No live Redis or Mirakl API connection required.

---

## Test Files

| File | Stories Covered | Run command |
|------|----------------|-------------|
| `tests/epic4-4.1-post-api-generate.atdd.test.js` | 4.1 | `node --test tests/epic4-4.1-post-api-generate.atdd.test.js` |
| `tests/epic4-4.2-get-api-jobs-polling.atdd.test.js` | 4.2, 4.2a (AC-7 update) | `node --test tests/epic4-4.2-get-api-jobs-polling.atdd.test.js` |
| `tests/epic4-4.2a-polling-progress-contract.additional.test.js` | 4.2a | `node --test tests/epic4-4.2a-polling-progress-contract.additional.test.js` |
| `tests/epic4-4.3-get-api-reports-and-csv.atdd.test.js` | 4.3 | `node --test tests/epic4-4.3-get-api-reports-and-csv.atdd.test.js` |

---

## Story 4.1 — POST /api/generate (`src/routes/generate.js`)

### Acceptance Criteria Mapping

| AC | Description | Test(s) |
|----|-------------|---------|
| AC-1 | Validates `api_key` non-empty — 400 if missing/blank | T1.1, T1.2, T1.3 |
| AC-2 | Validates `email` as valid email format — 400 if missing/invalid | T2.1, T2.2, T2.3 |
| AC-3 | `crypto.randomUUID()` used for `job_id` and `report_id` | T3.1, T3.2, T3.3 |
| AC-4 | `keyStore.set(job_id, api_key)` called exactly once per request | T4.1, T4.2, T4.3 |
| AC-5 | Queue payload has NO `api_key` field; contains `{job_id, report_id, email, marketplace_url}` | T5.1, T5.2, T5.3 |
| AC-6 | `db.createJob` called with correct parameters | T6.1, T6.2 |
| AC-7 | Returns HTTP 202 `{ data: { job_id, report_id } }` | T7.1, T7.2, T7.3, T7.4 |
| AC-8 | Response time target < 2s (NFR-P1) | T8.1 (smoke) |
| AC-9 | `api_key` never appears in response body | T9.1, T9.2 |
| AC-10 (static) | `keyStore.set` called in route handler — not in keyStore.js itself | T10.1, T10.2 |

---

## Story 4.2 — GET /api/jobs/:job_id (`src/routes/jobs.js`)

### Acceptance Criteria Mapping

| AC | Description | Test(s) |
|----|-------------|---------|
| AC-1 | Returns `{ data: { status, phase_message, report_id } }` for known job | T1.1–T1.7 |
| AC-2 | Returns HTTP 404 for unknown `job_id` | T2.1, T2.2, T2.3 |
| AC-3 | `api_key` never in response body | T3.1, T3.2 |
| AC-4 | Response time < 100ms — single SQLite read (NFR) | T4.1 (smoke) |
| AC-5 | `GET /api/jobs` (no id) → 404 — listing NOT registered | T5.1, T5.2 |
| AC-6 | All valid status values representable in response | T6.1–T6.8 |

**Note (4.2a retrofit):** Story 4.2's "exact-fields" assertion at `tests/epic4-4.2-get-api-jobs-polling.atdd.test.js:156` is updated by Story 4.2a (AC-7) to reflect the extended 5-field response shape. This is the only modification to the 4.2 ATDD file.

### Valid Status Values (from spec)

`queued`, `fetching_catalog`, `scanning_competitors`, `building_report`, `complete`, `error`

---

## Story 4.2a — Polling Progress Contract: Structured Counts (retrofit)

**Origin:** Sprint Change Proposal 2026-04-20 — design handoff revealed the progress page requires structured `progress_current` and `progress_total` fields; UX spec already called for them but the shipped endpoint buried counts in prose `phase_message`.

**Files:** `src/db/schema.js`, `src/db/migrate.js`, `src/db/queries.js`, `src/workers/reportWorker.js`, `src/routes/jobs.js`, `tests/epic4-4.2-get-api-jobs-polling.atdd.test.js` (single-line update), `tests/epic4-4.2a-polling-progress-contract.additional.test.js` (new)

### Acceptance Criteria Mapping

| AC | Description | Test(s) |
|----|-------------|---------|
| AC-1 | `generation_jobs` gains `progress_current INTEGER` and `progress_total INTEGER` (nullable) in both Drizzle schema and raw DDL migration | migration idempotency tests (AC-9) |
| AC-2 | `updateJobStatus` signature extends to 5 params; three-state semantic (`undefined` → omit, `null` → clear, value → set) on new params; existing 3-arg callers unaffected | T6 round-trip test |
| AC-3 | `getJobStatus` return shape: `{ status, phase_message, report_id, progress_current, progress_total }` with snake_case keys; null DB values → JS `null` | T6 round-trip tests |
| AC-4 | Route response shape: `{ data: { status, phase_message, progress_current, progress_total, report_id } }`; null DB values → JSON `null`; 404 shape unchanged | T1.1–T5.1 HTTP tests |
| AC-5 | Worker writes counts on `onProgress` for `fetching_catalog` and `scanning_competitors`; explicit `null, null` clear at each phase transition | T3.1, T4.1 (seeded via `updateJobStatus` direct calls) |
| AC-6 | `queued`, `building_report`, `complete` phases: both count fields null | T1.1, T4.1, T5.1 |
| AC-7 | `tests/epic4-4.2-get-api-jobs-polling.atdd.test.js:156` exact-fields array updated to 5 fields: `['phase_message', 'progress_current', 'progress_total', 'report_id', 'status']` | Modified file passes `node --test` |
| AC-8 | `tests/epic4-4.2a-polling-progress-contract.additional.test.js` covers 7 behavioural cases + 1 idempotency test | T1.1–T7.1, T_migr |
| AC-9 | Migration idempotent: fresh DB gets all 11 columns; existing 9-column DB gets ALTER TABLE; running twice does not error | T_migr.1, T_migr.2, T_migr.3 |
| AC-10 | Original 4.2 assertions (status values, 404 shape, api_key invariant, < 100ms) preserved unchanged | All pre-existing 4.2 tests pass |
| AC-11 | `npm test` green — new `.additional.test.js` picked up by existing glob | Full test suite |

### AC-8 Test Case Detail (`tests/epic4-4.2a-polling-progress-contract.additional.test.js`)

| Test ID | Scenario | Expected |
|---------|----------|----------|
| T1.1 | Fresh job (status: queued) — HTTP GET | `progress_current: null`, `progress_total: null` |
| T2.1 | `fetching_catalog` seeded with counts (7200, 31179) — HTTP GET | `progress_current: 7200`, `progress_total: 31179` |
| T3.1 | `scanning_competitors` seeded with counts (15427, 28440) — HTTP GET | `progress_current: 15427`, `progress_total: 28440` (no bleed from previous phase) |
| T4.1 | `building_report` seeded with explicit `null, null` — HTTP GET | Both null |
| T5.1 | `complete` seeded with explicit `null, null` — HTTP GET | Both null |
| T6.1 | Round-trip: `updateJobStatus` → `getJobStatus` with counts (7200, 31179) | DB reads back `progress_current: 7200`, `progress_total: 31179` |
| T6.2 | Round-trip: overwrite with (0, 28440) → values overwritten | `progress_current: 0`, `progress_total: 28440` |
| T6.3 | Round-trip: omit 5th arg → `progress_total` preserved at 28440 (`undefined` → omit from SET) | `progress_total` unchanged |
| T6.4 | Round-trip: `updateJobStatus(id, 'complete', '…', null, null)` → both NULL | Both null |
| T_migr.1 | Fresh DB via `runMigrations()` — `PRAGMA table_info` check | All 11 columns present |
| T_migr.2 | Pre-existing 9-column DB via `runMigrations()` — ALTER TABLE path | 2 new columns added; no error; existing data intact |
| T_migr.3 | Run `runMigrations()` twice on same DB | No error (idempotency) |

### New Response Contract (supersedes 4.2 original)

```json
{
  "data": {
    "status": "fetching_catalog",
    "phase_message": "A obter catálogo… (7.200 de 31.179 produtos)",
    "progress_current": 7200,
    "progress_total": 31179,
    "report_id": "uuid-string"
  }
}
```

**Null phase examples:**
- `queued` → `progress_current: null, progress_total: null`
- `building_report` → `progress_current: null, progress_total: null`
- `complete` → `progress_current: null, progress_total: null`
- `error` → counts preserved at last-written value (not cleared) — aids debugging

---

## Story 4.3 — GET /api/reports/:id + CSV (`src/routes/reports.js`)

### Acceptance Criteria Mapping

| AC | Description | Test(s) |
|----|-------------|---------|
| AC-1 | Valid non-expired report → 200 JSON `{ data: { summary, opportunities_pt, opportunities_es, quickwins_pt, quickwins_es } }` | T1.1–T1.10 |
| AC-2 | Expired report → 404 with correct Portuguese message | T2.1, T2.2, T2.3 |
| AC-3 | Non-existent report → 404 with `report_not_found` error | T3.1, T3.2, T3.3 |
| AC-4 | `GET /api/reports/:id/csv` returns `csv_data`; 404 if expired/missing | T4.1–T4.6 |
| AC-5 | CSV `Content-Type: text/csv` | T5.1 |
| AC-6 | CSV `Content-Disposition: attachment; filename="marketpilot-report.csv"` | T6.1 |
| AC-7 | CSV response time < 3s (NFR-P5) | T7.1 (smoke) |
| AC-8 | `GET /api/reports` (no id) → 404 — listing NOT registered | T8.1, T8.2 |
| AC-9 | `GET /report/:id` → `public/report.html` (static shell) | T9.1, T9.2, T9.3 |
| AC-10 | 404 body: `{ error: "report_not_found", message: "Este relatório..." }` exact shape | T10.1, T10.2, T10.3 |

### Spec contract notes

> **CSV header contract**: First line of every CSV response MUST be the exact 12-column header `EAN,product_title,shop_sku,my_price,pt_first_price,pt_gap_eur,pt_gap_pct,pt_wow_score,es_first_price,es_gap_eur,es_gap_pct,es_wow_score` in this exact order. Test: `tests/epic4-4.3-get-api-reports-and-csv.atdd.test.js → "CSV first line is the exact spec header"`. Refactoring to alphabetize or use a set-based structure is forbidden.

---

## Security Invariants (Cross-Cutting)

| Invariant | Verified in |
|-----------|-------------|
| `api_key` never in BullMQ job payload | Story 4.1 AC-5 |
| `api_key` never in any HTTP response | Story 4.1 AC-9, Story 4.2 AC-3 |
| Listing endpoints not registered (no cross-seller leak) | Story 4.2 AC-5, Story 4.3 AC-8 |
| Report isolation — `WHERE report_id = ?` only | Story 4.3 uses `getReport(reportId, now)` which enforces this |
| Expired reports always 404 | Story 4.3 AC-2, AC-4 |
| Count fields are integers or null — no string bleed from `phase_message` | Story 4.2a AC-4, AC-8 |
| Stale counts from previous phase do not bleed into next phase response | Story 4.2a AC-5 (explicit null-clear at every phase transition) |

---

## NFR Coverage

| NFR | Story | Test |
|-----|-------|------|
| NFR-P1: form submit < 2s | 4.1 | AC-8 smoke test |
| NFR-P5: CSV download < 3s | 4.3 | AC-7 smoke test |
| Polling < 100ms | 4.2 | AC-4 smoke test (preserved; two extra columns are negligible) |
| NFR-R4: expired URL → 404 (100%) | 4.3 | AC-2 tests |

---

## Test Execution

```bash
# Run Epic 4 tests individually
node --test tests/epic4-4.1-post-api-generate.atdd.test.js
node --test tests/epic4-4.2-get-api-jobs-polling.atdd.test.js
node --test tests/epic4-4.2a-polling-progress-contract.additional.test.js
node --test tests/epic4-4.3-get-api-reports-and-csv.atdd.test.js

# Run all tests (including Epic 4)
node --test tests/**/*.test.js
```

No live Redis, Mirakl API, or external services required. All tests are hermetic.

---

## Pass Criteria

All tests must pass (zero failures, zero skips) before the corresponding story is marked `done` in `sprint-status.yaml`. The ATDD files are the contract — implementation must be written to pass them.

---

## Implementation Notes for Dev

- Route files expected at: `src/routes/generate.js`, `src/routes/jobs.js`, `src/routes/reports.js`
- Routes must be registered in `src/server.js` (or via Fastify plugin pattern)
- Story 4.1 test uses a stub queue/keyStore — the real route must import `reportQueue` from `src/queue/reportQueue.js` and `keyStore` from `src/queue/keyStore.js`
- Story 4.2 uses real `getJobStatus(job_id)` from `src/db/queries.js`
- Story 4.2a extends `getJobStatus` return shape to 5 fields; extends `updateJobStatus` to 5 params with three-state semantics; adds two nullable INTEGER columns to `generation_jobs` via idempotent PRAGMA-based migration; see `_bmad-output/implementation-artifacts/4-2a-polling-progress-contract.md` for full dev detail
- Story 4.3 uses real `getReport(reportId, now)` from `src/db/queries.js`
- `getReport` returns `null` (not throws) for expired or non-existent reports — handle the null check in the route
