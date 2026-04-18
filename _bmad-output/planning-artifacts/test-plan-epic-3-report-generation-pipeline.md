# Test Plan — Epic 3: Report Generation Pipeline

**Project:** MarketPilot Free Report
**Author:** Quinn (QA Agent) for Pedro
**Date:** 2026-04-18
**Epic:** 3 — Report Generation Pipeline
**Stories:** 3.1 Mirakl API client · 3.2 OF21 catalog fetch · 3.3 P11 competitor scan · 3.4 WOW+Quick Wins scoring · 3.5 Report persistence+CSV · 3.6 Email dispatch · 3.7 Full worker orchestration

---

## Status at Epic-Start Pass (2026-04-18)

| Story | Implementation | ATDD test file | Status |
|-------|---------------|----------------|--------|
| 3.1 Mirakl API client | done (merged) | `tests/epic3-3.1-api-client.atdd.test.js` | ATDD file pre-existed |
| 3.2 OF21 catalog fetch | done (merged) | `tests/epic3-3.2-fetch-catalog.atdd.test.js` | ATDD file pre-existed |
| 3.3 P11 competitor scan | done (merged) | `tests/epic3-3.3-scan-competitors.atdd.test.js` | ATDD file pre-existed |
| 3.4 WOW+Quick Wins scoring | backlog | `tests/epic3-3.4-wow-scoring.atdd.test.js` | ATDD file pre-existed |
| 3.5 Report persistence+CSV | backlog | `tests/epic3-3.5-report-persistence.atdd.test.js` | ATDD file pre-existed |
| 3.6 Email dispatch | backlog | `tests/epic3-3.6-email-dispatch.atdd.test.js` | ATDD file pre-existed |
| 3.7 Full worker orchestration | backlog | `tests/epic3-3.7-worker-orchestration.atdd.test.js` | ATDD file pre-existed |

All ATDD test files were pre-written (committed before implementation). This is the standard pattern for this project: test files are the contract; implementation must pass them.

---

## Scope

This test plan covers all acceptance criteria for Epic 3 stories 3.4–3.7 (the remaining backlog stories). Stories 3.1–3.3 are done and their tests pass. All tests use Node.js built-in test runner (`node:test`) — no extra test framework dependencies needed.

---

## Test Files

| File | Stories Covered | Run command |
|------|----------------|-------------|
| `tests/epic3-3.1-api-client.atdd.test.js` | 3.1 | `node --test tests/epic3-3.1-api-client.atdd.test.js` |
| `tests/epic3-3.2-fetch-catalog.atdd.test.js` | 3.2 | `node --test tests/epic3-3.2-fetch-catalog.atdd.test.js` |
| `tests/epic3-3.3-scan-competitors.atdd.test.js` | 3.3 | `node --test tests/epic3-3.3-scan-competitors.atdd.test.js` |
| `tests/epic3-3.4-wow-scoring.atdd.test.js` | 3.4 | `node --test tests/epic3-3.4-wow-scoring.atdd.test.js` |
| `tests/epic3-3.5-report-persistence.atdd.test.js` | 3.5 | `node --test tests/epic3-3.5-report-persistence.atdd.test.js` |
| `tests/epic3-3.6-email-dispatch.atdd.test.js` | 3.6 | `node --test tests/epic3-3.6-email-dispatch.atdd.test.js` |
| `tests/epic3-3.7-worker-orchestration.atdd.test.js` | 3.7 | `node --test tests/epic3-3.7-worker-orchestration.atdd.test.js` |

---

## Story 3.1 — Mirakl API Client (`src/workers/mirakl/apiClient.js`)

**Status: done and merged (PR merged 2026-04-18)**

### Acceptance Criteria Mapping

| AC | Description | Test approach |
|----|-------------|---------------|
| AC-1 | `mirAklGet(baseUrl, endpoint, params, apiKey)` signature | Runtime: import + typeof check |
| AC-2 | Exponential backoff 429/5xx: 1s,2s,4s,8s,16s (capped 30s), 5 retries | Runtime: stub fetch to return 429, assert delays |
| AC-3 | Throws `MiraklApiError` after retry exhaustion | Runtime: assert rejects with MiraklApiError |
| AC-4 | `apiKey` as function param — never at module scope | Static: source scan |
| AC-5 | No direct `fetch()` to Mirakl elsewhere | Static: verify no bare `fetch(` in other files |
| AC-6 | No `api_key` in log output | Static: source scan for log statements |

---

## Story 3.2 — OF21 Catalog Fetch (`src/workers/mirakl/fetchCatalog.js`)

**Status: done and merged (PR merged 2026-04-18)**

### Acceptance Criteria Mapping

| AC | Description | Test approach |
|----|-------------|---------------|
| AC-1 | Paginates OF21 with `max=100`, `offset=0,100,…` | Runtime: stub `mirAklGet`, verify pagination calls |
| AC-2 | Asserts `allOffers.length === total_count` BEFORE active filter | Runtime: inject mismatch → assert `CatalogTruncationError` |
| AC-3 | Filters `offer.active === true` (NOT `offer.state`) | Runtime + static: assert active filter; assert `offer.state` not used |
| AC-4 | `onProgress(n, total)` called every 1,000 offers | Runtime: stub 2000 offers, verify 2 progress calls |
| AC-5 | Returns `[{ean, shop_sku, price, product_title}]` | Runtime: verify return shape |
| AC-6 | EAN from `product_references[]` where `reference_type === 'EAN'` | Runtime: verify EAN extraction |
| AC-7 | `CatalogTruncationError` thrown with correct message on mismatch | Runtime: inject mismatch, check error class + message |

### MCP-Verified Field Notes (informational, for dev reference)
- `offer.state` does NOT exist on OF21 (verified live Worten) — use `offer.active`
- `total_count` is at response root; counts ALL offers (no server-side active filter)
- EAN: `offer.product_references[].reference` where `reference_type === 'EAN'`
- Seller price: `offer.applicable_pricing.price`

---

## Story 3.3 — P11 Competitor Scan (`src/workers/mirakl/scanCompetitors.js`)

**Status: done and merged (PR merged 2026-04-18)**

### Post-Merge MCP Corrections (critical — embedded in ATDD tests)

Three production bugs were found via live MCP probe after initial merge and fixed in the same PR:

1. **Wrong param**: `product_ids` was used with plain EANs. Correct param is `product_references` with format `EAN|<ean1>,EAN|<ean2>` (pipe-delimited type prefix). Using `product_ids` with EANs silently returns 0 products.
2. **Nonexistent `offer.channel_code`**: channel bucketing must be by which P11 call (PT or ES) returned the offer — NOT by reading any field on the offer object (`offer.channel_code` does not exist; `offer.channels` is typically empty).
3. **Non-channel-specific `total_price`**: Each batch now makes TWO parallel P11 calls — one per channel — each with `pricing_channel_code=<CHANNEL>` so `offer.total_price` reflects that channel's shipping-inclusive price.

### Acceptance Criteria Mapping

| AC | Description | Test approach |
|----|-------------|---------------|
| AC-1 | Batches EANs in groups of 100 (`BATCH_SIZE = 100`) | Static: source contains `100`/`BATCH_SIZE`/`slice` |
| AC-2 | 10 concurrent P11 calls via `Promise.allSettled()` | Static + runtime: assert `Promise.allSettled`, concurrency=10 |
| AC-3 | Filters `active: true`, uses `total_price` (NOT `price`) | Static: assert `total_price` present, `offer.price` not used for comparison |
| AC-4 | Captures first+second competitor per channel | Runtime: stub data, verify `{pt:{first,second},es:{first,second}}` |
| AC-5 | `onProgress(n, total)` every 500 EANs | Runtime: verify progress fired at 500-EAN intervals |
| AC-6 | Failed batches → log `{error_type, batch_size}` only, EANs uncontested | Runtime: inject `MiraklApiError`, assert job continues + EANs absent from map |
| AC-7 | Uses `mirAklGet()` — no direct `fetch()` | Static: no bare `fetch(` in source |
| AC-8 | EAN resolution from `product_references` (3-strategy resolver) | Runtime: verify resolver logic; static: assert `resolveEan`/`reference_type` present |
| AC-FUNC | Returns `Map<ean, {pt:{first,second},es:{first,second}}>` | Runtime: verify Map type and entry shape |

---

## Story 3.4 — WOW Score and Quick Wins (`src/workers/scoring/computeReport.js`)

### Acceptance Criteria Mapping

| AC | Description | Test(s) |
|----|-------------|---------|
| AC-1 | `gap = my_price - competitor_total_price_first`; `gap_pct = gap / competitor_total_price_first` | T4.1, T4.2 |
| AC-2 | `wow_score = my_price / gap_pct` — only when `my_price > competitor_first` | T4.3, T4.4 |
| AC-3 | `is_quick_win = gap_pct <= 0.02` | T4.5, T4.6, T4.7 (boundary) |
| AC-4 | Winning: `my_price <= competitor_first` — no WOW score, not in opportunities | T4.8, T4.9 |
| AC-5 | Uncontested: no competitor data for that channel | T4.10, T4.11, T4.12 |
| AC-6 | `opportunities_pt/es` sorted by `wow_score DESC` | T4.13, T4.14 |
| AC-7 | Summary: `{total, winning, losing, uncontested}` per channel; winning+losing+uncontested = total | T4.15–T4.18 |
| AC-8 | `my_price` from OF21 catalog (not P11); PT/ES channels scored independently | T4.19, T4.20 |

### Key Test Cases

**T4.1–T4.3 — WOW score formula precision**
- Input: `my_price=10.00`, `ptFirst=9.00` → `gap=1.00`, `gap_pct=1/9=0.111`, `wow_score=90`
- Tolerance: `< 0.001` for gap, `< 0.0001` for gap_pct, `< 0.01` for wow_score

**T4.5–T4.7 — Quick Win boundary**
- `gap_pct = 0.019` (< 0.02) → `is_quick_win = true`; appears in `quickwins_pt`
- `gap_pct = 0.333` (> 0.02) → `is_quick_win = false`; NOT in `quickwins_pt`
- `gap_pct = 0.02` (exactly) → `is_quick_win = true` (boundary inclusive)

**T4.12 — Uncontested products excluded from opportunities**
- No competitor data → not in `opportunities_pt` or `opportunities_es`

**T4.18 — winning+losing+uncontested === total**
- Arithmetic integrity check across all 3 categories

**T4.20 — Channel independence**
- `my_price=10, ptFirst=9 (losing), esFirst=11 (winning)` → in PT opps, NOT in ES opps, ES winning count incremented

### Result Shape Requirements

`computeReport(catalog, competitors)` must return:
```
{
  opportunities_pt: Array,
  opportunities_es: Array,
  quickwins_pt: Array,
  quickwins_es: Array,
  summary_pt: { total, winning, losing, uncontested },
  summary_es: { total, winning, losing, uncontested },
}
```

---

## Story 3.5 — Report Persistence + CSV (`src/db/queries.js` + CSV generation)

### Acceptance Criteria Mapping

| AC | Description | Test(s) |
|----|-------------|---------|
| AC-1 | `insertReport` stores row with `expires_at = now + 172800` | T5.1–T5.3 |
| AC-2 | CSV columns: EAN, product_title, shop_sku, my_price, pt_first_price, pt_gap_eur, pt_gap_pct, pt_wow_score, es_first_price, es_gap_eur, es_gap_pct, es_wow_score | T5.4 (static) |
| AC-3 | CSV contains ALL products (including 1st-place + uncontested) — not just opportunities | T5.5 |
| AC-4 | `getReport` returns `null` (not throws) for expired or non-existent reports | T5.6–T5.8 |
| AC-5 | `getReport` uses `WHERE expires_at > now` check | T5.9 (static), T5.10 (boundary) |
| AC-6 | `queries.js` exports: `createJob`, `updateJobStatus`, `updateJobError`, `getJobStatus`, `insertReport`, `getReport` | T5.11–T5.16 |
| AC-7 | No raw SQL outside `queries.js` (except `schema.js`) — worker, route files clean | T5.17 (static, multi-file) |

### Key Test Cases

**T5.8 — Expired report returns null**
- Insert with `expires_at = now - 1`; query with `now` → must return `null`

**T5.10 — Boundary: `expires_at === now` is expired**
- Insert with `expires_at = now + 1`; query with `now + 2` → must return `null`
- Confirms `WHERE expires_at > now` semantics (not `>=`)

**T5.17 — Multi-file static scan**
- Files checked: `reportWorker.js`, `routes/generate.js`, `routes/jobs.js`, `routes/reports.js`
- Patterns forbidden: `.prepare(`, `.exec(`, `SELECT * FROM`, `INSERT INTO`, `UPDATE ... SET`, `DELETE FROM`

---

## Story 3.6 — Email Dispatch (`src/email/sendReportEmail.js`)

### Acceptance Criteria Mapping

| AC | Description | Test(s) |
|----|-------------|---------|
| AC-1 | Subject: `"O teu relatório MarketPilot está pronto"` | T6.1 (static), T6.2 |
| AC-2 | Body HTML includes `APP_BASE_URL/report/{reportId}` + summary | T6.3–T6.5 (static) |
| AC-3 | `try/catch` — exceptions caught + logged (type only), NOT re-thrown | T6.6–T6.9 |
| AC-4 | Worker marks job `complete` BEFORE calling `sendReportEmail` | T6.10 (static order check) |
| AC-5 | Email failure → status remains `complete` (no status rollback) | T6.11 |
| AC-6 | `RESEND_API_KEY` unset → logs warning and returns gracefully | T6.12–T6.14 |
| AC-7 | Uses Resend v4 SDK — no nodemailer/raw SMTP | T6.15–T6.17 (static) |

### Key Test Cases

**T6.9 — No `err.message` in catch logs**
- Static: source does not contain `err.message` or `error.message`

**T6.10 — Static order check (critical)**
- In `reportWorker.js` source: index of `'complete'` string must precede index of `sendReportEmail` call
- Ensures DB mark-complete happens before email attempt

**T6.14 — Graceful degradation runtime**
- Temporarily unset `RESEND_API_KEY`; call `sendReportEmail()` — must not throw
- ESM module caching means the function itself must check env at call time

---

## Story 3.7 — Full Worker Orchestration (`src/workers/reportWorker.js`)

### Acceptance Criteria Mapping

| AC | Description | Test(s) |
|----|-------------|---------|
| AC-1 | Phase transitions: queued→fetching_catalog→scanning_competitors→building_report→complete | T7.1–T7.5 (static) |
| AC-2 | `finally` block: `keyStore.delete(job_id)` always runs on success AND failure | T7.6–T7.8 |
| AC-3 | 0 offers + 200 → `EmptyCatalogError` → job status `error` | T7.9, T7.10 |
| AC-4 | 401/403 → `MiraklApiError` → job status `error`, raw error never exposed | T7.11, T7.12 |
| AC-5 | `total_count` mismatch → `CatalogTruncationError` | T7.13 |
| AC-6 | `error_message` always from `getSafeErrorMessage()` — never raw `err.message` | T7.14, T7.15 |
| AC-7 | Portuguese phase messages match spec exactly (8 messages) | T7.16–T7.20 |
| AC-8 | `getSafeErrorMessage` maps error types to correct Portuguese messages | T7.21–T7.25 |

### Key Test Cases

**T7.8 — Integration: key removed after processJob (success or failure)**
- `keyStore.set(jobId, 'test-key')` → call `processJob(job)` (may fail due to stubs) → `keyStore.has(jobId) === false`
- Verifies `finally` actually runs even when worker throws

**T7.12 — Raw error message never in DB**
- Static: no line in `reportWorker.js` that sets `error_message` to `err.message`

**T7.15 — `err.message` never logged**
- Static: source does not contain `err.message` in any line
- Prevents accidentally leaking Mirakl API response details

**T7.21–T7.25 — `getSafeErrorMessage` runtime**
- 401 error → message contains `chave`/`API`/`Worten`/`inválida`
- 403 error → message contains `permissão`
- `EmptyCatalogError` → message contains `catálogo`/`ofertas`/`activas`
- Unknown error → fallback string, does NOT contain the raw error message text

### Phase Messages (exact strings required)

| Phase | Status field | Message |
|-------|-------------|---------|
| Queued | `queued` | `"A preparar…"` |
| OF21 start | `fetching_catalog` | `"A obter catálogo…"` |
| OF21 progress | `fetching_catalog` | `"A obter catálogo… ({n} de {total} produtos)"` |
| P11 start | `scanning_competitors` | `"A verificar concorrentes…"` |
| P11 progress | `scanning_competitors` | `"A verificar concorrentes ({n} de {total} produtos)…"` |
| P11 rate-limit wait | `scanning_competitors` | `"A verificar concorrentes — a aguardar limite de pedidos…"` |
| Building | `building_report` | `"A construir relatório…"` |
| Complete | `complete` | `"Relatório pronto!"` |

---

## Cross-Cutting Security Invariants (All Stories)

These are verified across multiple stories:

| Invariant | Verified in |
|-----------|-------------|
| `api_key` never in BullMQ job payload | 3.7 static scan |
| `api_key` never logged | 3.3, 3.7 static scan |
| `keyStore.delete` in `finally` unconditionally | 3.7 static + integration |
| Raw Mirakl error never forwarded to user or DB | 3.7 static (AC-6) |
| DB schema has no `api_key` column | Carried over from Epic 1/2 — confirmed in 3.5 |
| `getSafeErrorMessage` wraps all user-facing error text | 3.7 AC-6, AC-8 |

---

## Test Execution

```bash
# Run Epic 3 tests for remaining backlog stories (3.4–3.7):
node --test tests/epic3-3.4-wow-scoring.atdd.test.js
node --test tests/epic3-3.5-report-persistence.atdd.test.js
node --test tests/epic3-3.6-email-dispatch.atdd.test.js
node --test tests/epic3-3.7-worker-orchestration.atdd.test.js

# Run full Epic 3 suite (all 7 stories):
node --test tests/epic3-*.atdd.test.js

# Run all project tests:
node --test tests/**/*.test.js
```

**Infrastructure requirements:**
- Stories 3.1, 3.2, 3.3, 3.4: no Redis, no live Mirakl — pure in-process mocks
- Story 3.5: real SQLite in-memory database (`SQLITE_PATH=:memory:`) — no Redis needed
- Story 3.6: no live Resend — Resend SDK calls are not awaited in tests; RESEND_API_KEY set to dummy
- Story 3.7: Redis connection attempted but silenced (`removeAllListeners('error')`) — gracefully degraded

---

## Pass Criteria

All tests must pass (zero failures, zero skips) before a story is marked `done` in `sprint-status.yaml`. Stories 3.5 and 3.7 use in-memory SQLite — no setup required beyond setting `SQLITE_PATH=:memory:` in env (already done in test file).

---

## Open Questions / Warnings for Phase 2

1. **Story 3.3 P11 channel-bucketing**: The post-merge MCP corrections changed the architecture (2 parallel P11 calls per batch instead of 1 combined call). The ATDD test for 3.3 has been updated to match. Story 3.4 consumes the `Map<ean, {pt,es}>` from 3.3 — no change needed to 3.4 interface, only the internal P11 channel-bucketing changed.

2. **`getSafeErrorMessage` location**: The 3.7 ATDD test looks for `getSafeErrorMessage` in `apiClient.js`, `reportWorker.js`, `fetchCatalog.js`, and `middleware/errorHandler.js`. Dev must export it from one of these locations. Recommend `apiClient.js` since it is the Mirakl error boundary.

3. **CSV generation location**: The 3.5 ATDD test checks for CSV column names across `queries.js`, `computeReport.js`, and `reportWorker.js`. CSV builder may live in any of these — but the `csv_data` column must be stored in the `reports` table row (queries.js handles INSERT).

4. **Story 3.7 `processJob` export**: The integration test in 3.7 (T7.8) requires `processJob` to be exported as a named export from `reportWorker.js`. If BullMQ registers the worker internally, `processJob` must still be separately exported for testability.

5. **Mirakl endpoint verification (CLAUDE.md requirement)**: No new Mirakl endpoints are introduced in stories 3.4–3.7. Scoring (3.4) is pure computation. Email (3.6) uses Resend, not Mirakl. Orchestration (3.7) wires existing modules. No MCP verification needed for 3.4–3.7 beyond what was already done for 3.2+3.3.
