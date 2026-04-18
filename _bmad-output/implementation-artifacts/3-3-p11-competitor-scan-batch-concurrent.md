# Story 3.3: P11 Competitor Scan — Batch Concurrent

<!-- Endpoints verified against MCP-Verified Endpoint Reference (epics-distillate.md, 2026-04-18). -->

**Epic:** 3 — Report Generation Pipeline
**Story:** 3.3
**Story Key:** 3-3-p11-competitor-scan-batch-concurrent
**Status:** review
**Date Created:** 2026-04-18

---

## User Story

As a developer,
I want a competitor scan module (`src/workers/mirakl/scanCompetitors.js`) that takes a list of EANs, queries P11 (`GET /api/products/offers`) in batches of 100 with 10 concurrent calls, extracts `total_price` for the first and second active competitor per channel (`WRT_PT_ONLINE`, `WRT_ES_ONLINE`), and returns a `Map<ean, { pt: { first, second }, es: { first, second } }>`,
So that the scoring module (Story 3.4) and worker orchestration (Story 3.7) have accurate competitor price data per EAN and channel, with partial failures handled gracefully (failed batches → EANs uncontested, job continues).

**Satisfies:** Epic 3.3 AC — batches of 100 EANs; 10 concurrent via `Promise.allSettled()`; filter `active: true`; extract `total_price` (NOT `price`) per channel; capture positions 1+2: `{pt:{first,second},es:{first,second}}`; `onProgress` every 500 EANs; failed batches after 5 retries → logged (type only), EANs → uncontested, job continues; reuse batch+concurrent from `scripts/opportunity_report.js`.

---

## Acceptance Criteria

**AC-1: Batches EANs in groups of 100**
- Split input EAN array into chunks of 100 (constant `BATCH_SIZE = 100`)
- Each P11 call receives at most 100 EANs as `product_ids` comma-separated string
- Last batch may be smaller than 100 — that is correct behavior

**AC-2: 10 concurrent P11 calls via `Promise.allSettled()`**
- Process batches in windows of 10 concurrent calls (constant `CONCURRENCY = 10`)
- Use `Promise.allSettled()` — NOT `Promise.all()` — so one failed batch does not abort others
- Within each window: `await Promise.allSettled(chunk.map(async batchEans => ...))`

**AC-3: Filters `active: true`, uses `total_price` (NOT `price`)**
- From each P11 response, filter `products.offers` where `offer.active === true`
- Extract `offer.total_price` for competitor price — this is price+shipping
- NEVER use `offer.price` alone for competitor comparison
- Active offers are assumed pre-sorted by price ascending (cheapest first)

**AC-4: Captures first and second competitor price per channel**
- For each EAN, capture positions 1 and 2 from active offers per channel
- Return structure: `Map<ean, { pt: { first, second }, es: { first, second } }>`
- `first` = `activeOffers[0]?.total_price ?? null`
- `second` = `activeOffers[1]?.total_price ?? null`
- If a channel has 0 active competitors: `{ first: null, second: null }` (EAN is uncontested for that channel)
- Both channels are always present in the returned map entry

**AC-5: `onProgress(n, total)` called every 500 EANs**
- Call `onProgress(processed, totalEans)` after each completed batch window where cumulative EANs processed crosses a 500-EAN threshold
- `processed` = total EANs dispatched so far (including failed batches)
- Progress must be called at least once per 500 EANs to satisfy Phase B worker progress messages

**AC-6: Failed batches after retry exhaustion → EANs uncontested, job continues**
- `mirAklGet` already handles 5-retry exhaustion and throws `MiraklApiError`
- When `Promise.allSettled` returns `status: 'rejected'` for a batch:
  - Log only: `{ error_type: err.constructor.name, batch_size: batchEans.length }` — NOT `err.message`
  - EANs from the failed batch are NOT added to the result map → they are treated as uncontested downstream
  - Job execution continues with remaining batches

**AC-7: Uses `mirAklGet()` — no direct `fetch()` to Mirakl**
- Import `{ mirAklGet, MiraklApiError }` from `./apiClient.js`
- All P11 HTTP calls go through `mirAklGet(baseUrl, '/api/products/offers', params, apiKey)`
- No `fetch()` call in `scanCompetitors.js`

**AC-8: EAN resolution from `product_references`**
- P11 response includes `products[].product_references[]` — use this to match each returned product to its EAN
- Use three-strategy `resolveEanForProduct(product, batchEans)` from `scale_test.js`:
  1. `product.product_references` → find `reference_type === 'EAN'` → `eanRef.reference` if in `batchEans`
  2. `product.product_sku` if it appears in `batchEans`
  3. If `batchEans.length === 1`, return `batchEans[0]` (unambiguous single-EAN batch)
  4. Return `null` — skip product (cannot resolve EAN)

**AC-FUNCTIONAL: Return type**
- `scanCompetitors` must return a `Map<string, { pt: { first: number|null, second: number|null }, es: { first: number|null, second: number|null } }>`
- EANs with no competitor data (failed batches, no active offers) are simply absent from the Map
- Callers check `map.has(ean)` before accessing data

**Verified by:** `tests/epic3-3.3-scan-competitors.atdd.test.js` (already written — DO NOT MODIFY)

---

## Tasks / Subtasks

- [x] Task 1: Create `src/workers/mirakl/scanCompetitors.js` (AC: 1, 2, 3, 4, 5, 6, 7, 8)
  - [x] Define constants: `BATCH_SIZE = 100`, `CONCURRENCY = 10`, `PROGRESS_INTERVAL = 500`
  - [x] Define `resolveEanForProduct(product, batchEans)` — 3-strategy EAN resolver from `scale_test.js`
  - [x] Define and export `async function scanCompetitors(eans, baseUrl, apiKey, onProgress)`
  - [x] Split `eans` into batches of `BATCH_SIZE` using `slice()`
  - [x] Outer loop: `for (let i = 0; i < batches.length; i += CONCURRENCY)`
  - [x] Inner: `const window = batches.slice(i, i + CONCURRENCY)`
  - [x] `const results = await Promise.allSettled(window.map(async batchEans => { ... }))`
  - [x] Inside each batch: call `mirAklGet(baseUrl, '/api/products/offers', { product_ids: batchEans.join(','), channel_codes: 'WRT_PT_ONLINE,WRT_ES_ONLINE' }, apiKey)` — NOTE: see P11 params section below for exact param names per MCP
  - [x] For each resolved product: call `resolveEanForProduct`, filter `active: true`, extract `total_price` for positions 0 and 1 per channel
  - [x] Handle `status: 'rejected'`: log `{ error_type, batch_size }`, skip EANs (uncontested)
  - [x] Track processed count; call `onProgress(processed, total)` when crossing 500-EAN thresholds
  - [x] Return `Map` of EAN → `{ pt: { first, second }, es: { first, second } }`

- [x] Task 2: Verify ATDD tests pass
  - [x] `node --test tests/epic3-3.3-scan-competitors.atdd.test.js` — all tests must pass
  - [x] `npm test` — no regressions (3.3 suite: 24/24 pass; failures in 3.2/3.4-3.7 are pre-existing unimplemented stubs)

---

## Dev Notes

### The ATDD Test File — Read It First

`tests/epic3-3.3-scan-competitors.atdd.test.js` is **already committed**. Read it before writing any code. Key observations:

- **Static checks** (AC-1 to AC-8): The test reads `scanCompetitors.js` source as text (using `readFileSync`) and checks for presence of specific strings and patterns. Your code MUST contain:
  - `100` or `BATCH_SIZE`
  - `slice` or `chunk` or `batch` or `splice` (for batching)
  - `product_ids` or `join` (for comma-separated param)
  - `Promise.allSettled`
  - `10` or `CONCURRENCY`
  - `active` and `true` or `=== true`
  - `total_price`
  - `WRT_PT_ONLINE` or `pt`
  - `WRT_ES_ONLINE` or `es`
  - `first`, `second`
  - `channel_codes` or `WRT_PT_ONLINE`
  - `onProgress`, `500` or `PROGRESS_INTERVAL`
  - `rejected` or `status` or `reason` (from allSettled results)
  - `constructor.name` or `error_type` or `name` (for type-only logging)
  - No `err.message` in log statements
  - No `api_key` in log statements
  - `mirAklGet` or `apiClient`
  - No bare `fetch(` call
  - `resolveEan` or `EAN` or `reference_type`
  - `product_references` or `reference_type`

- **Runtime check**: `before()` hook does `import('../src/workers/mirakl/scanCompetitors.js')` and checks `typeof scanCompetitors === 'function'`. Export `scanCompetitors` as a named export.

### MCP-Verified P11 Endpoint Details (Authoritative)

**`GET /api/products/offers`**
- **Param name:** `product_ids` — comma-separated EANs (max 100 per call)
- **Channel param:** `channel_codes` — e.g. `WRT_PT_ONLINE,WRT_ES_ONLINE`
- **Active filter:** `products.offers.active === true`
- **Price field:** `products.offers.total_price` — price + shipping — USE THIS
- **DO NOT USE:** `products.offers.price` — price only, not comparable
- **EAN resolution:** `products.product_references[].reference` where `reference_type === 'EAN'`

**IMPORTANT — MCP vs scale_test.js discrepancy:**
The old `scale_test.js` used `product_references: refs` where refs was formatted as `EAN|{ean}` joined with commas. This is the PROTOTYPE pattern. The MCP-verified param is `product_ids` (plain comma-separated EANs, no `EAN|` prefix). Use `product_ids` in `scanCompetitors.js`.

### scanCompetitors Reference Skeleton

```javascript
// src/workers/mirakl/scanCompetitors.js
// P11 competitor scan: batch 100 EANs, 10 concurrent calls, both channels.
// Returns Map<ean, { pt: { first, second }, es: { first, second } }>

import pino from 'pino'
import { mirAklGet, MiraklApiError } from './apiClient.js'
import { config } from '../../config.js'

const log = pino({ level: config.LOG_LEVEL })

const BATCH_SIZE = 100
const CONCURRENCY = 10
const PROGRESS_INTERVAL = 500

function resolveEanForProduct(product, batchEans) {
  // Strategy 1: product.product_references has EAN directly
  const productRefs = product.product_references ?? []
  const eanRef = productRefs.find(r => r.reference_type === 'EAN')
  if (eanRef && batchEans.includes(eanRef.reference)) return eanRef.reference

  // Strategy 2: product_sku matches an EAN
  if (product.product_sku && batchEans.includes(product.product_sku)) {
    return product.product_sku
  }

  // Strategy 3: single-EAN batch — unambiguous
  if (batchEans.length === 1) return batchEans[0]

  return null
}

export async function scanCompetitors(eans, baseUrl, apiKey, onProgress) {
  const total = eans.length
  const batches = []
  for (let i = 0; i < eans.length; i += BATCH_SIZE) {
    batches.push(eans.slice(i, i + BATCH_SIZE))
  }

  const resultMap = new Map()
  let processed = 0
  let lastProgressAt = 0

  for (let i = 0; i < batches.length; i += CONCURRENCY) {
    const window = batches.slice(i, i + CONCURRENCY)

    const results = await Promise.allSettled(
      window.map(async (batchEans) => {
        const data = await mirAklGet(baseUrl, '/api/products/offers', {
          product_ids: batchEans.join(','),
          channel_codes: 'WRT_PT_ONLINE,WRT_ES_ONLINE',
        }, apiKey)
        return { products: data.products ?? [], batchEans }
      })
    )

    for (let j = 0; j < results.length; j++) {
      const batchEans = window[j]

      if (results[j].status === 'rejected') {
        const err = results[j].reason
        log.warn({ error_type: err?.constructor?.name ?? 'UnknownError', batch_size: batchEans.length })
        processed += batchEans.length
        // EANs absent from resultMap → treated as uncontested by scoring
        continue
      }

      const { products } = results[j].value

      for (const product of products) {
        const ean = resolveEanForProduct(product, batchEans)
        if (!ean) continue

        const allOffers = product.offers ?? []
        const ptOffers = allOffers.filter(o => o.active === true && o.channel_code === 'WRT_PT_ONLINE')
        const esOffers = allOffers.filter(o => o.active === true && o.channel_code === 'WRT_ES_ONLINE')

        resultMap.set(ean, {
          pt: { first: ptOffers[0]?.total_price ?? null, second: ptOffers[1]?.total_price ?? null },
          es: { first: esOffers[0]?.total_price ?? null, second: esOffers[1]?.total_price ?? null },
        })
      }

      processed += batchEans.length
    }

    // onProgress every 500 EANs
    if (processed - lastProgressAt >= PROGRESS_INTERVAL) {
      onProgress?.(processed, total)
      lastProgressAt = processed
    }
  }

  return resultMap
}
```

### P11 Response Structure — Channel Data

The MCP-verified P11 response structure is:
```
{
  "products": [
    {
      "product_references": [{ "reference_type": "EAN", "reference": "..." }],
      "product_sku": "...",
      "offers": [
        {
          "active": true,
          "channel_code": "WRT_PT_ONLINE",
          "total_price": 49.99,
          "price": 44.99
        },
        ...
      ]
    }
  ]
}
```

Each offer has a `channel_code` field. Filter offers by both `active === true` AND `channel_code === 'WRT_PT_ONLINE'` (or `'WRT_ES_ONLINE'`) before selecting positions 0 and 1.

### pino Logger Pattern

Follow the pattern from `src/workers/reportWorker.js`:
```javascript
import pino from 'pino'
import { config } from '../../config.js'
const log = pino({ level: config.LOG_LEVEL })
```

Log only on batch failure (warn level), with `{ error_type, batch_size }` — NEVER `err.message`.

### File Location

```
src/workers/mirakl/apiClient.js       ← EXISTS (Story 3.1 — do NOT touch)
src/workers/mirakl/scanCompetitors.js ← CREATE THIS (Story 3.3)
src/workers/mirakl/fetchCatalog.js    ← Story 3.2 (may not exist yet — do not depend on it)
```

### What Already Exists — Do NOT Touch

| File | State | Note |
|---|---|---|
| `src/workers/mirakl/apiClient.js` | EXISTS — do not modify | Story 3.1 complete; exports `mirAklGet`, `MiraklApiError` |
| `src/workers/reportWorker.js` | EXISTS — do not modify | Phase B stub: `// Phase B — scan competitors (Story 3.3)` |
| `src/queue/keyStore.js` | EXISTS — do not modify | THE SOLE api_key store |
| `src/config.js` | EXISTS — do not modify | Env var validation |
| `tests/epic3-3.3-scan-competitors.atdd.test.js` | EXISTS — DO NOT MODIFY | Pre-written ATDD tests |

### No New Dependencies Required

All required functionality uses:
- `pino` — already installed (used in reportWorker.js)
- `src/workers/mirakl/apiClient.js` — already exists (Story 3.1)
- `src/config.js` — already exists

No `npm install` needed for this story.

### ESM Module Pattern

```javascript
// ESM — no require(), no module.exports
import { mirAklGet, MiraklApiError } from './apiClient.js'
export async function scanCompetitors(eans, baseUrl, apiKey, onProgress) { ... }
```

`"type": "module"` in `package.json` — use `import/export` throughout.

### apiKey Security Rules (Non-Negotiable)

- `scanCompetitors.js` receives `apiKey` as a function parameter — never store at module scope
- NEVER log `apiKey` or `api_key` in any log statement
- Pass `apiKey` only to `mirAklGet()` — it is used solely for the request header

### onProgress Callback Contract

```javascript
// Called every 500 EANs (or at end if remainder < 500):
onProgress?.(processed, total)
// processed = cumulative EANs dispatched (including failed batches)
// total = eans.length (the total passed in)
// Callback is optional — use optional chaining onProgress?.()
```

### Handling Channels: Two Separate Calls vs One Combined Call

The architecture distillate specifies calling P11 for both `WRT_PT_ONLINE` and `WRT_ES_ONLINE` channels. The most efficient approach (single call) is to pass both channels in one `channel_codes` parameter:

```javascript
channel_codes: 'WRT_PT_ONLINE,WRT_ES_ONLINE'
```

This returns offers for both channels in a single API call. Each offer has a `channel_code` field to distinguish them. This is the recommended approach per the architecture pattern (validated at 31,179 products).

---

## Architecture Guardrails

| Boundary | Rule |
|---|---|
| `src/workers/mirakl/scanCompetitors.js` | Import `mirAklGet` from `./apiClient.js` — never `fetch()` directly |
| `scanCompetitors.js` | `apiKey` as function parameter only — never at module scope |
| `scanCompetitors.js` | Log only `{ error_type, batch_size }` on failure — never `err.message` or `api_key` |
| `scanCompetitors.js` | Use `total_price` for competitor comparison — never `price` alone |
| `scanCompetitors.js` | Failed batches: EANs absent from result Map → caller treats as uncontested |
| `src/workers/reportWorker.js` | Do NOT modify — Phase B stub remains until Story 3.7 |

**Security invariants (non-negotiable):**
1. `apiKey` received as function param — never stored at module scope
2. `apiKey` never appears in any log statement
3. `MiraklApiError` not re-thrown verbatim — batch failures are logged (type only) and swallowed

---

## Previous Story Intelligence

**From Story 3.1 (Mirakl API client — done 2026-04-18):**
- `apiClient.js` exports: `mirAklGet(baseUrl, endpoint, params, apiKey)` and `MiraklApiError`
- `mirAklGet` handles 5-retry exhaustion, transport errors, 4xx non-retryable — all result in thrown `MiraklApiError`
- `params ?? {}` null-guard already in `mirAklGet` — safe to pass any params object
- `MiraklApiError` has `.status` (HTTP code, or `0` for transport errors) and `.name === 'MiraklApiError'`
- Static ATDD checks read source file text — naming conventions in source code matter

**From Story 2.2 (Worker scaffold — done 2026-04-18):**
- ESM pattern confirmed: `export async function`, `import { }` — no CommonJS anywhere
- `import * as keyStore` namespace import pattern used for reserved-word exports — not relevant here
- `reportWorker.js` Phase B stub: `// Phase B — scan competitors (Story 3.3)` — do NOT modify until Story 3.7

**From Epic 2 retrospective (2026-04-18):**
- Pre-written ATDD tests are the contract — implement to pass them exactly
- Static source checks (`readFileSync`) are part of the ATDD suite — code structure matters, not just runtime
- Budget for 2 code-review passes per story

**From Epic 1 retrospective (2026-04-17):**
- Security architecture held perfectly — zero violations
- Never modify existing test files — implement to pass them

---

## Story Dependencies

**This story (3.3) requires:**
- Story 3.1 complete (done) — `src/workers/mirakl/apiClient.js` with `mirAklGet` + `MiraklApiError`
- Story 2.2 complete (done) — `src/workers/reportWorker.js` exists (Phase B stub)
- Story 2.1 complete (done) — `src/queue/keyStore.js` exists

**Note on Story 3.2:** Story 3.3 does NOT depend on Story 3.2 (`fetchCatalog.js`). The `scanCompetitors` function takes a plain `eans` array — it doesn't import `fetchCatalog`. Story 3.3 can be developed in parallel with or before Story 3.2.

**Stories that depend on 3.3:**
- Story 3.4 (WOW scoring) — consumes `Map<ean, {...}>` returned by `scanCompetitors`
- Story 3.7 (Full worker orchestration) — wires Phase B into `reportWorker.js`
- Story 7.3 (P11 rate limit and partial data recovery) — extends error handling from this story

---

## Verification Checklist

After completing all tasks, verify:

- [ ] `src/workers/mirakl/scanCompetitors.js` exists
- [ ] `scanCompetitors` is exported as a named async function with 4 params: `(eans, baseUrl, apiKey, onProgress)`
- [ ] Constant `BATCH_SIZE = 100` defined
- [ ] Constant `CONCURRENCY = 10` defined
- [ ] Constant `PROGRESS_INTERVAL = 500` defined
- [ ] `resolveEanForProduct(product, batchEans)` defined with 3-strategy EAN resolution
- [ ] EANs split into batches via `slice()`
- [ ] `Promise.allSettled()` used (not `Promise.all()`)
- [ ] Concurrency window of 10 batches applied
- [ ] P11 call uses `product_ids` param (comma-sep EANs) and `channel_codes: 'WRT_PT_ONLINE,WRT_ES_ONLINE'`
- [ ] Active filter: `offer.active === true`
- [ ] Price extraction uses `offer.total_price` (NOT `offer.price`)
- [ ] Both channels extracted: `pt` and `es` with `{ first, second }` structure
- [ ] Failed batches: log `{ error_type, batch_size }` only — no `err.message`, no `api_key`
- [ ] `onProgress?.(processed, total)` called every 500 EANs
- [ ] Returns `Map<string, { pt, es }>` — not a plain object
- [ ] `apiKey` NOT at module scope
- [ ] No `fetch()` direct call
- [ ] `mirAklGet` imported from `./apiClient.js`
- [ ] `node --test tests/epic3-3.3-scan-competitors.atdd.test.js` — all tests pass
- [ ] `npm test` — no regressions

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Dev Notes / Implementation Summary

Implemented `src/workers/mirakl/scanCompetitors.js` exactly per story spec. The module:
- Batches EANs into groups of 100 using `slice()` and processes windows of 10 concurrently via `Promise.allSettled()`
- Calls P11 `GET /api/products/offers` with `product_ids` (comma-sep EANs) and `channel_codes: 'WRT_PT_ONLINE,WRT_ES_ONLINE'` in a single call per batch
- Extracts `total_price` (not `price`) for positions 0 and 1 per channel after filtering `active === true`
- Implements `resolveEanForProduct` with the 3-strategy EAN resolver (product_references, product_sku, single-EAN batch fallback)
- Handles rejected batches: logs only `{ error_type, batch_size }` — never `err.message` or `api_key`
- Fires `onProgress?.(processed, total)` every 500 EANs using a lastProgressAt threshold tracker
- Returns `Map<ean, { pt: { first, second }, es: { first, second } }>`

All 24 ATDD tests pass. Pre-existing failures in test suite (stories 3.2, 3.4-3.7) are unimplemented future stories — confirmed no new regressions introduced.

### Completion Notes List

- ✅ Task 1 complete: `src/workers/mirakl/scanCompetitors.js` created with all AC-1 through AC-8 satisfied
- ✅ Task 2 complete: ATDD test suite passes 24/24; no new regressions
- ✅ Security invariants upheld: apiKey only as function param, never logged, never at module scope
- ✅ No new dependencies required (pino and apiClient.js already installed/present)

### File List

- src/workers/mirakl/scanCompetitors.js (new)
- _bmad-output/implementation-artifacts/3-3-p11-competitor-scan-batch-concurrent.md (story file)

### Change Log

- 2026-04-18: Story 3.3 created — P11 competitor scan batch concurrent.
- 2026-04-18: Story 3.3 implemented — `scanCompetitors.js` created; all 24 ATDD tests pass; status → review.
