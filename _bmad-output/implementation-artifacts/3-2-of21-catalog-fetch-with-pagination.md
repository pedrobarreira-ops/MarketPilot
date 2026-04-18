# Story 3.2: OF21 Catalog Fetch with Pagination

<!-- Endpoints verified against MCP-Verified Endpoint Reference (epics-distillate.md, 2026-04-18). -->

**Epic:** 3 — Report Generation Pipeline
**Story:** 3.2
**Story Key:** 3-2-of21-catalog-fetch-with-pagination
**Status:** ready-for-dev
**Date Created:** 2026-04-18

---

## User Story

As a developer,
I want a `fetchCatalog(baseUrl, apiKey, onProgress, jobId)` function in `src/workers/mirakl/fetchCatalog.js` that paginates OF21 (`GET /api/offers`) with `max=100` per page, filters for `state: 'ACTIVE'` offers, asserts the total fetched count equals `total_count`, and calls `onProgress(n, total)` every 1,000 offers,
So that the report worker (Phase A) can reliably retrieve the full active catalog and detect any silent truncation before proceeding to competitor scanning.

**Satisfies:** Epic 3.2 AC — OF21 pagination; `state: 'ACTIVE'` filter; `total_count` assertion (NFR-R2); `onProgress` every 1,000; returns `[{ean, shop_sku, price, product_title}]`; throws `EmptyCatalogError` on 0 active offers; throws `CatalogTruncationError` on count mismatch.

---

## Acceptance Criteria

**AC-1: Offset pagination with max=100 per page**
- Call `mirAklGet(baseUrl, '/api/offers', { max: 100, offset }, apiKey)` for each page
- Start at `offset=0`; increment by 100 after each page
- Continue until the page returns fewer than `max` offers (end-of-results signal)
- Collect all pages into a single `allOffers` array

**AC-2: total_count assertion — no silent truncation (NFR-R2)**
- Capture `total_count` from the first page response
- After all pages are fetched, assert `activeOffers.length === total_count` (where `activeOffers` is the ACTIVE-filtered set)
- On mismatch: throw `CatalogTruncationError` with message `"Catálogo obtido parcialmente. Tenta novamente."`
- Log safe fields on truncation: `{ job_id, fetched: N, declared: M, error_type: 'CatalogTruncationError' }` — NO `api_key`
- Export `CatalogTruncationError` as a named export (class, extends Error)

**AC-3: Filter for state:'ACTIVE' offers only**
- After collecting all pages, filter: `offer.state === 'ACTIVE'`
- Only ACTIVE offers are included in the return value and counted against `total_count`
- Inactive offers are silently discarded

**AC-4: onProgress callback every 1,000 offers**
- `fetchCatalog` signature: `fetchCatalog(baseUrl, apiKey, onProgress, jobId)`
- Call `onProgress(n, total)` each time cumulative fetched count crosses a 1,000-offer boundary (i.e., every time `Math.floor(allOffers.length / 1000) > Math.floor((allOffers.length - pageOffers.length) / 1000)`)
- `onProgress` is optional — guard with `if (onProgress)` before calling
- `total` is `total_count` from the API response

**AC-5: Return shape `[{ean, shop_sku, price, product_title}]`**
- `ean`: extracted from `offer.product_references` — find entry where `reference_type === 'EAN'`, take `.reference`; if none found, skip the offer (do not include offers with no EAN)
- `shop_sku`: `offer.shop_sku`
- `price`: `offer.applicable_pricing.price` (string, e.g. `"9.99"`)
- `product_title`: `offer.product_title`

**AC-6: Empty catalog → EmptyCatalogError**
- If `total_count === 0` OR the ACTIVE-filtered set is empty: throw `EmptyCatalogError`
- Message: `"Não encontrámos ofertas activas no teu catálogo. Verifica se a tua conta está activa no Worten."`
- Export `EmptyCatalogError` as a named export (class, extends Error)

**AC-7: Uses mirAklGet — no direct fetch()**
- `fetchCatalog.js` MUST import `mirAklGet` from `./apiClient.js`
- `fetchCatalog.js` MUST NOT call `fetch()` directly
- All OF21 HTTP calls go through `mirAklGet()`

**Verified by:** `tests/epic3-3.2-fetch-catalog.atdd.test.js` (already written — DO NOT MODIFY)

---

## Tasks / Subtasks

- [ ] Task 1: Create `src/workers/mirakl/fetchCatalog.js` (AC: 1–7)
  - [ ] Export `class EmptyCatalogError extends Error` with correct constructor name
  - [ ] Export `class CatalogTruncationError extends Error` with correct constructor name
  - [ ] Export `async function fetchCatalog(baseUrl, apiKey, onProgress, jobId)`
  - [ ] Import `mirAklGet` from `./apiClient.js` — no direct `fetch()`
  - [ ] Implement pagination loop: `while (true)` or `do/while`; params `{ max: 100, offset }`; break when `page.offers.length < 100`
  - [ ] Capture `total_count` from first page response
  - [ ] Push page offers to `allOffers` array; call `onProgress` at 1,000-offer boundaries
  - [ ] After loop: filter `allOffers` for `state === 'ACTIVE'`
  - [ ] Check empty catalog (filtered length === 0 or total_count === 0): throw `EmptyCatalogError`
  - [ ] Assert `activeOffers.length === total_count`: throw `CatalogTruncationError` on mismatch with safe log
  - [ ] Map `activeOffers` to `[{ean, shop_sku, price, product_title}]`, skip offers without EAN
  - [ ] EAN extraction: `offer.product_references.find(r => r.reference_type === 'EAN')?.reference`
  - [ ] Price: `offer.applicable_pricing.price`

- [ ] Task 2: Wire Phase A in `src/workers/reportWorker.js`
  - [ ] Import `fetchCatalog` from `./mirakl/fetchCatalog.js`
  - [ ] Import `* as db` from `'../db/queries.js'` (add to existing imports at top of `reportWorker.js`; path is relative to `src/workers/`)
  - [ ] Replace `// Phase A — fetch catalog (Story 3.2)` stub with real call
  - [ ] Pass `onProgress` (sync, not async) that calls `db.updateJobStatus(job_id, 'fetching_catalog', progressMessage)` with Portuguese message — `updateJobStatus` is synchronous (better-sqlite3)
  - [ ] Progress message format: `"A obter catálogo… ({n} de {total} produtos)"`
  - [ ] First update before pagination starts: `"A obter catálogo…"` (no count yet)
  - [ ] Wrap Phase A with 401/403 error detection → `getSafeErrorMessage` (see Dev Notes)

- [ ] Task 3: Verify ATDD tests pass
  - [ ] `node --test tests/epic3-3.2-fetch-catalog.atdd.test.js` — all tests must pass
  - [ ] `npm test` — full suite must pass (no regressions in 3.1 tests; 3.3–3.7 failures are expected pre-existing stubs)

---

## Dev Notes

### The ATDD Test File — Read It First

`tests/epic3-3.2-fetch-catalog.atdd.test.js` is **already committed**. Read it before writing any code.

Key test observations:
- **Module imports:** The test does `import('../src/workers/mirakl/fetchCatalog.js')` and expects named exports: `fetchCatalog`, `CatalogTruncationError`, `EmptyCatalogError`
- **Static source checks (AC-1–7, NFR):** The test reads the file via `readFileSync` and checks for keywords: `offset`, `max`, `100`, `allOffers` (or equivalent), `total_count`, `CatalogTruncationError`, `EmptyCatalogError`, `ACTIVE`, `onProgress`, `1000`, `ean`, `shop_sku`, `price`, `product_title`, `product_references`, `applicable_pricing`, `mirAklGet` or `apiClient`
- **No direct fetch():** The test uses a regex `\bfetch\s*\(` to assert `fetchCatalog.js` never calls `fetch()` directly
- **Class constructor names:** `CatalogTruncationError.name` and `EmptyCatalogError.name` are checked — must extend Error and `constructor.name` must match exactly
- **No api_key in logs:** Static check scans for lines containing both `log` and `api_key`

### OF21 MCP-Verified Field Mapping (Authoritative)

From the MCP-Verified Endpoint Reference (epics-distillate.md, 2026-04-18):

| What we need | OF21 response field |
|---|---|
| Active filter | `offer.state === 'ACTIVE'` (NOT `offer.active`) |
| EAN | `offer.product_references[].reference` where `reference_type === 'EAN'` |
| Price (seller's own) | `offer.applicable_pricing.price` |
| Total count | `response.total_count` (root level) |
| Pagination | `offset` param, `max=100` per page |

**CRITICAL:** The active filter is `state === 'ACTIVE'` — NOT `active === true`. `active === true` is the P11 filter (Story 3.3). Using the wrong field will silently include/exclude wrong offers.

### Reference Implementation Pattern (from scripts/scale_test.js)

The `fetchCatalog()` function in `scale_test.js` provides the exact pagination pattern to reuse:

```javascript
// From scripts/scale_test.js — adapt this pattern
const allOffers = []
let offset = 0
const pageSize = 100
let totalCount = null

while (true) {
  const data = await mirAklGet(baseUrl, '/api/offers', { max: pageSize, offset }, apiKey)
  
  if (totalCount === null && data.total_count != null) {
    totalCount = data.total_count
  }
  
  allOffers.push(...data.offers)
  // call onProgress at 1000-offer boundaries here
  
  if (data.offers.length < pageSize) break
  offset += pageSize
}
// then filter, assert, map
```

Key differences from scale_test.js:
1. Use `mirAklGet()` (not the local `apiGet()` from scale_test)
2. Filter `state === 'ACTIVE'` (scale_test doesn't filter)
3. Assert `total_count` after all pages (scale_test does not assert)
4. Call `onProgress` callback instead of `console.log`
5. Export error classes instead of `process.exit()`
6. Return mapped array `[{ean, shop_sku, price, product_title}]` instead of raw offers

### Error Classes Reference

```javascript
export class EmptyCatalogError extends Error {
  constructor(message) {
    super(message)
    this.name = 'EmptyCatalogError'
  }
}

export class CatalogTruncationError extends Error {
  constructor(message) {
    super(message)
    this.name = 'CatalogTruncationError'
  }
}
```

### Safe Logging for Truncation

When throwing `CatalogTruncationError`, log BEFORE throwing:
```javascript
log.error({ job_id, fetched: activeOffers.length, declared: totalCount, error_type: 'CatalogTruncationError' })
throw new CatalogTruncationError('Catálogo obtido parcialmente. Tenta novamente.')
```
- Never log `api_key` in any log statement in this file

### Phase A in reportWorker.js

Replace the Phase A stub with:
```javascript
// Phase A — fetch catalog
db.updateJobStatus(job_id, 'fetching_catalog', 'A obter catálogo…')
const catalog = await fetchCatalog(
  marketplace_url,
  apiKey,
  (n, total) => {
    const msg = `A obter catálogo… (${n.toLocaleString('pt-PT')} de ${total.toLocaleString('pt-PT')} produtos)`
    db.updateJobStatus(job_id, 'fetching_catalog', msg)
  },
  job_id
)
```

**Note:** `db.updateJobStatus()` is synchronous (better-sqlite3 is synchronous) — do NOT `await` it.

### getSafeErrorMessage — Pattern for Phase A Errors

The `getSafeErrorMessage` utility does not exist yet as a standalone module (it will be created in Story 3.7). For Story 3.2, handle 401/403 from `mirAklGet` inline in `reportWorker.js` Phase A catch logic OR let the outer `catch (err)` in `processJob` propagate — the worker already has a catch block that logs safely. Do NOT implement `getSafeErrorMessage` as a separate file in this story.

### Pino Logger Pattern — Match Existing reportWorker.js

`fetchCatalog.js` needs a logger for the truncation log:
```javascript
import pino from 'pino'
import { config } from '../../config.js'
const log = pino({ level: config.LOG_LEVEL })
```
The `config` import path from `src/workers/mirakl/` to `src/config.js` is `../../config.js`.

### File Location

```
src/workers/mirakl/apiClient.js     ← EXISTS (Story 3.1) — DO NOT MODIFY
src/workers/mirakl/fetchCatalog.js  ← CREATE THIS (Story 3.2)
src/workers/mirakl/scanCompetitors.js ← Story 3.3 (does NOT exist yet)
```

### ESM Pattern — Mandatory

```javascript
// ESM — no require(), no module.exports
import { mirAklGet } from './apiClient.js'
import pino from 'pino'
import { config } from '../../config.js'

export class EmptyCatalogError extends Error { ... }
export class CatalogTruncationError extends Error { ... }
export async function fetchCatalog(baseUrl, apiKey, onProgress, jobId) { ... }
```

### onProgress Boundary Logic

Call `onProgress` when the cumulative count crosses a 1,000-offer boundary. Simple approach:

```javascript
const prevCount = allOffers.length
allOffers.push(...data.offers)
const newCount = allOffers.length

if (onProgress && totalCount !== null) {
  const prevBucket = Math.floor(prevCount / 1000)
  const newBucket = Math.floor(newCount / 1000)
  if (newBucket > prevBucket) {
    onProgress(newCount, totalCount)
  }
}
```

---

## Architecture Guardrails

| Boundary | Rule |
|---|---|
| `fetchCatalog.js` | Uses `mirAklGet()` exclusively — no `fetch()` calls |
| `fetchCatalog.js` | Exports `fetchCatalog`, `EmptyCatalogError`, `CatalogTruncationError` — nothing else |
| `fetchCatalog.js` | Logs only safe fields — never `api_key` or raw error messages |
| `reportWorker.js` | Phase A stub replaced with real `fetchCatalog()` call |
| `apiClient.js` | DO NOT MODIFY — Story 3.1 complete |

**Security invariants (non-negotiable):**
1. `apiKey` is a function parameter — never stored at module scope in `fetchCatalog.js`
2. `apiKey` never appears in any log statement
3. BullMQ job data never contains `api_key` — `fetchCatalog` receives it as a function param from `reportWorker`
4. Error messages in thrown exceptions are user-safe Portuguese strings — no raw API response bodies

---

## Story Dependencies

**This story (3.2) requires:**
- Story 3.1 complete (done) — `src/workers/mirakl/apiClient.js` exists with `mirAklGet` + `MiraklApiError`
- Story 2.2 complete (done) — `src/workers/reportWorker.js` exists with Phase A stub
- Story 2.1 complete (done) — `src/queue/keyStore.js` exists (used by reportWorker; fetchCatalog does NOT import it)

**Stories that depend on 3.2:**
- Story 3.3 (P11 competitor scan) — consumes catalog output `[{ean, ...}]` from fetchCatalog
- Story 3.4 (scoring) — transitively depends
- Story 3.7 (full orchestration) — replaces Phase A stub with real call (Task 2 in this story starts that integration)

---

## Previous Story Intelligence

**From Story 3.1 (Mirakl API Client — done 2026-04-18):**
- `apiClient.js` exports: `mirAklGet(baseUrl, endpoint, params, apiKey)` (4 params), `MiraklApiError`
- Transport errors (network-level) are retried internally by `mirAklGet` — `fetchCatalog` does not need its own retry logic
- `mirAklGet` throws `MiraklApiError` after 5 retries exhausted — `fetchCatalog` should let this propagate to `reportWorker` catch block
- The `params ?? {}` null-guard is already in `mirAklGet` — pass params dict directly
- `sleep()` helper is internal to `apiClient.js` — not exported

**From Story 2.2 (BullMQ Worker scaffold — done 2026-04-18):**
- `reportWorker.js` Phase A stub: `// Phase A — fetch catalog (Story 3.2)` — replace this exact comment/stub
- `processJob(job)` already extracts `{ job_id, report_id, email, marketplace_url }` from `job.data`
- `apiKey` already retrieved via `keyStore.get(job_id)` at the top of `processJob` — pass it to `fetchCatalog`
- Logger in `reportWorker.js`: `const log = pino({ level: config.LOG_LEVEL })` — same pattern for `fetchCatalog.js`
- The `finally` block runs `keyStore.delete(job_id)` unconditionally — Story 3.2 does NOT touch this

**From Epic 2 Retrospective (2026-04-18):**
- Pre-written ATDD tests are the contract — implement to pass them exactly as written, never modify test files
- Static source checks (readFileSync) are part of the ATDD suite — code structure and keyword presence matter, not just runtime behavior
- Story spec file MUST be committed to the worktree branch — not left untracked (retrospective action item)
- BAD pipeline autonomy is high — no Pedro intervention needed for well-specified stories

**From Epic 1 Retrospective / deferred-work.md:**
- No new `npm` dependencies needed — `pino` already installed; `fetch` is Node.js 22 global
- Error classes: use `.name = 'ClassName'` in constructor — ATDD checks `err.constructor.name`
- ESM pattern confirmed: `export async function`, `export class`, `import` — no CommonJS

---

## Verification Checklist

After completing all tasks, verify:

- [ ] `src/workers/mirakl/fetchCatalog.js` exists
- [ ] `fetchCatalog` is exported as a named export (async function)
- [ ] `EmptyCatalogError` is exported as a named export (class, extends Error, `.name === 'EmptyCatalogError'`)
- [ ] `CatalogTruncationError` is exported as a named export (class, extends Error, `.name === 'CatalogTruncationError'`)
- [ ] `fetchCatalog.js` imports `mirAklGet` from `./apiClient.js`
- [ ] `fetchCatalog.js` does NOT call `fetch()` directly
- [ ] Pagination uses `max=100` and `offset` params
- [ ] Active filter: `state === 'ACTIVE'` (not `active === true`)
- [ ] EAN extracted from `product_references` where `reference_type === 'EAN'`
- [ ] Price from `applicable_pricing.price`
- [ ] `total_count` asserted after all pages — `CatalogTruncationError` on mismatch
- [ ] `EmptyCatalogError` thrown on 0 active offers with Portuguese message
- [ ] `onProgress(n, total)` called every 1,000 offers
- [ ] No log statement references `api_key`
- [ ] `apiKey` is NOT assigned to any module-scope `const/let/var`
- [ ] `reportWorker.js` Phase A stub replaced with real `fetchCatalog()` call
- [ ] `node --test tests/epic3-3.2-fetch-catalog.atdd.test.js` — all tests pass
- [ ] `node --test tests/epic3-3.1-api-client.atdd.test.js` — still 27/27 (no regression)
- [ ] `npm test` — no new regressions in passing tests

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Completion Notes List

_To be filled by dev agent after implementation._

### File List

_To be filled by dev agent after implementation._

### Change Log

- 2026-04-18: Story 3.2 created — OF21 catalog fetch with pagination.
