# Test Plan — Epic 4: HTTP API Layer

**Project:** MarketPilot Free Report
**Author:** Quinn (QA Agent) for Pedro
**Date:** 2026-04-19
**Epic:** 4 — HTTP API Layer
**Stories:** 4.1 POST /api/generate · 4.2 GET /api/jobs/:id polling · 4.3 GET /api/reports/:id + CSV

---

## Scope

This test plan covers all acceptance criteria for Epic 4. Tests are written for the Node.js built-in test runner (`node:test`) — no extra test framework dependencies needed. All tests use Fastify `inject()` (no live port bound). Story 4.1 uses a stub queue and stubbed keyStore; Stories 4.2 and 4.3 use a real SQLite `:memory:` database via `queries.js`. No live Redis or Mirakl API connection required.

---

## Test Files

| File | Stories Covered | Run command |
|------|----------------|-------------|
| `tests/epic4-4.1-post-api-generate.atdd.test.js` | 4.1 | `node --test tests/epic4-4.1-post-api-generate.atdd.test.js` |
| `tests/epic4-4.2-get-api-jobs-polling.atdd.test.js` | 4.2 | `node --test tests/epic4-4.2-get-api-jobs-polling.atdd.test.js` |
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

### Valid Status Values (from spec)

`queued`, `fetching_catalog`, `scanning_competitors`, `building_report`, `complete`, `error`

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

---

## Security Invariants (Cross-Cutting)

| Invariant | Verified in |
|-----------|-------------|
| `api_key` never in BullMQ job payload | Story 4.1 AC-5 |
| `api_key` never in any HTTP response | Story 4.1 AC-9, Story 4.2 AC-3 |
| Listing endpoints not registered (no cross-seller leak) | Story 4.2 AC-5, Story 4.3 AC-8 |
| Report isolation — `WHERE report_id = ?` only | Story 4.3 uses `getReport(reportId, now)` which enforces this |
| Expired reports always 404 | Story 4.3 AC-2, AC-4 |

---

## NFR Coverage

| NFR | Story | Test |
|-----|-------|------|
| NFR-P1: form submit < 2s | 4.1 | AC-8 smoke test |
| NFR-P5: CSV download < 3s | 4.3 | AC-7 smoke test |
| Polling < 100ms | 4.2 | AC-4 smoke test |
| NFR-R4: expired URL → 404 (100%) | 4.3 | AC-2 tests |

---

## Test Execution

```bash
# Run Epic 4 tests individually
node --test tests/epic4-4.1-post-api-generate.atdd.test.js
node --test tests/epic4-4.2-get-api-jobs-polling.atdd.test.js
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
- Story 4.3 uses real `getReport(reportId, now)` from `src/db/queries.js`
- `getReport` returns `null` (not throws) for expired or non-existent reports — handle the null check in the route
