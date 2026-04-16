---
title: 'MarketPilot — Scale Test + Opportunity Report Pipeline'
type: 'feature'
created: '2026-04-14'
status: 'done'
baseline_commit: 'NO_VCS'
context: ['RESEARCH.md', '_bmad-output/planning-artifacts/product-brief-MarketPilot.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** We have no empirical data on whether the full OF21→P11 pipeline completes within 15 minutes for Gabriel's 31k-product catalog, and no ranked view of which products have beatable competitors — both blockers before the first client go-live.

**Approach:** Build two sequential Node.js scripts: (1) `scale_test.js` paginates OF21, runs concurrent P11 batches, times every stage, and saves raw catalog+competitor data to JSON; (2) `opportunity_report.js` reads that JSON and produces a ranked CSV showing competitive position, gap to 1st place, and winnability at 2%/5% price floors.

## Boundaries & Constraints

**Always:**
- Read credentials from `.env` at project root (`WORTEN_API_KEY`, `WORTEN_BASE_URL`)
- Auth header: `Authorization: {WORTEN_API_KEY}` on every call
- Use `total_price` (not `price`) for all competitive comparisons
- Filter P11 results to `active: true` offers only
- OF21 pagination: `max=100`, step by `offset` until page returns fewer than `max` items
- P11 batch size: 100 EANs max; `product_references=EAN|{ean1},EAN|{ean2},...`; `all_offers=true`
- Concurrency: 10 simultaneous P11 calls; use `Promise.all()` on chunks of 10 batches
- Skip offers with no EAN in `product_references` (type `EAN` may be absent)
- All outputs (JSON, CSV) written to `_bmad-output/` directory

**Ask First:**
- If OF21 returns an unexpected schema (missing `product_references` or `offers` array) — halt and show a sample response before continuing

**Never:**
- Write any prices back to the API (PRI01 is out of scope here)
- Use MiraklConnect or any OAuth flow
- Depend on npm packages beyond Node.js built-ins (`fs`, `https`, `path`) — use native `fetch` (Node 18+)

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Normal OF21 page | `GET /api/offers?max=100&offset=N` → 100 offers | Accumulate, increment offset | Retry once on 5xx; abort on persistent failure |
| Last OF21 page | `GET /api/offers?max=100&offset=N` → <100 offers | Stop pagination | — |
| Offer has no EAN | `product_references` empty or no type=EAN entry | Skip offer, count in `no_ean_count` | — |
| P11 batch — EAN not in catalog | `products` array has no entry for that EAN | Skip silently | — |
| P11 batch — no active offers | All offers have `active: false` | Record `active_competitors: 0` for that product | — |
| P11 HTTP error | 4xx/5xx on a batch | Log error with batch EANs, continue remaining batches | Count in `p11_error_count` |
| Gap to 1st negative | Gabriel's price < 1st place total_price | Gap = negative (we're already cheapest) | Include in report, gap < 0 sorts to top |

</frozen-after-approval>

## Code Map

- `scripts/scale_test.js` — OF21 paginator + P11 concurrent scanner + timing + writes `_bmad-output/catalog_scan.json`
- `scripts/opportunity_report.js` — reads `catalog_scan.json`, computes positions, writes `_bmad-output/opportunity_report.csv`
- `.env` — credentials source (`WORTEN_API_KEY`, `WORTEN_BASE_URL`)
- `_bmad-output/` — output directory (already exists)

## Tasks & Acceptance

**Execution:**
- [x] `scripts/scale_test.js` -- CREATE -- paginate OF21 (max=100 per page, offset loop), collect {shop_sku, ean, current_price, active, product_title}; filter to EAN-valid offers; batch EANs into 100-item groups; run P11 in chunks of 10 concurrent calls; record t0/t1 for OF21 phase and t0/t1 for P11 phase; write `_bmad-output/catalog_scan.json` with `{offers[], p11_results{}, timing{}, summary{}}`; print human-readable summary to stdout
- [x] `scripts/opportunity_report.js` -- CREATE -- read `catalog_scan.json`; for each offer with P11 data and ≥1 active competitor: compute first_price (offers[0].total_price), second_price (offers[1].total_price or null), gap_to_first (current_price - first_price), winnable_2pct (current_price*0.98 < first_price), winnable_5pct (current_price*0.95 < first_price); sort all rows by gap_to_first ascending; write top-100 rows to `_bmad-output/opportunity_report.csv`; print summary header to stdout

**Acceptance Criteria:**
- Given valid `.env` credentials, when `node scripts/scale_test.js` completes, then stdout shows total_products, eans_found, p11_calls_made, of21_time_sec, p11_time_sec, total_time_sec, error_count
- Given `catalog_scan.json` exists, when `node scripts/opportunity_report.js` runs, then `opportunity_report.csv` contains columns: ean, product_title, current_price, first_place_price, second_place_price, gap_to_first, active_competitors, winnable_2pct, winnable_5pct
- Given the full 31k catalog, when both scripts run sequentially, then total elapsed time is logged and observable against the 15-minute benchmark
- Given an offer with no EAN in `product_references`, when scale_test runs, then that offer is counted in `no_ean_count` and excluded from P11 batches
- Given a P11 batch returns HTTP error, when scale_test runs, then the error is logged with the batch EANs and execution continues

## Design Notes

**P11 response structure for total_price:**
```js
// Each product in P11 response:
// data.products[i].offers — sorted by bestPrice (cheapest total_price first)
// offer.total_price — use this (includes shipping)
// offer.active — filter to true only
// offer.shop_name — visible (shop_id is null)
```

**OF21 EAN extraction:**
```js
// offer.product_references = [{type: "EAN", reference: "3386460076265"}, ...]
const ean = offer.product_references?.find(r => r.type === 'EAN')?.reference
```

**Concurrency pattern (10 parallel batches):**
```js
for (let i = 0; i < batches.length; i += 10) {
  const chunk = batches.slice(i, i + 10)
  await Promise.all(chunk.map(batch => fetchP11(batch)))
}
```

## Verification

**Manual checks (if no CLI):**
- After `scale_test.js`: confirm `_bmad-output/catalog_scan.json` exists and `summary.total_products` ≈ 31177
- After `opportunity_report.js`: confirm `_bmad-output/opportunity_report.csv` has header row + ≤100 data rows, sorted by `gap_to_first` ascending
- Check stdout summary shows 6 required timing fields and counts

## Suggested Review Order

**ES Module Setup**

- Node 18+ ESM required; both scripts use top-level `import`
  [`package.json:3`](../../package.json#L3)

**OF21 Catalog Scan (scale_test.js)**

- Entry point: pagination loop with `max=100` offset stepping and progress display
  [`scale_test.js:75`](../../scripts/scale_test.js#L75)

- EAN extraction from `product_references`; price from `applicable_pricing` with fallback
  [`scale_test.js:116`](../../scripts/scale_test.js#L116)

**P11 EAN Mapping — highest-risk logic**

- EAN→product resolution: 4-strategy cascade; Strategy 1 finds Gabriel's EZ-prefix shop_sku
  [`scale_test.js:225`](../../scripts/scale_test.js#L225)

- Concurrent scan: 10-batch chunks via `Promise.allSettled`; errors logged with batch EANs
  [`scale_test.js:131`](../../scripts/scale_test.js#L131)

- Result storage: active offers filtered, `total_price` used for first/second place
  [`scale_test.js:200`](../../scripts/scale_test.js#L200)

**Opportunity Calculation (opportunity_report.js)**

- Schema guard + JSON.parse safety before any processing
  [`opportunity_report.js:27`](../../scripts/opportunity_report.js#L27)

- win2/win5 logic: `current_price × 0.98/0.95 < first_price`; gap ascending sort
  [`opportunity_report.js:63`](../../scripts/opportunity_report.js#L63)
