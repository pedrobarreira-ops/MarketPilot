# Story 3.4: WOW Score and Quick Wins Scoring

**Epic:** 3 — Report Generation Pipeline
**Story:** 3.4
**Story Key:** 3-4-wow-score-and-quick-wins-scoring
**Status:** done
**Date Created:** 2026-04-18

---

## User Story

As a developer,
I want a pure scoring function `computeReport(catalog, competitors)` in `src/workers/scoring/computeReport.js` that applies the WOW score and Quick Wins formulas across both PT and ES channels,
So that the worker orchestration (Story 3.7) can call it with the outputs of `fetchCatalog` (3.2) and `scanCompetitors` (3.3) to produce structured report data ready for persistence (Story 3.5).

**Satisfies:** Epic 3.4 AC — WOW score formula; Quick Win threshold; winning/uncontested classification; `opportunities_pt/es` sorted by `wow_score DESC`; `summary_pt/es` with `{total, winning, losing, uncontested}`; both channels scored independently; `my_price` from catalog (OF21), not P11.

---

## Acceptance Criteria

**AC-1 & AC-2: WOW score formula**
- `gap = my_price - competitor_first`
- `gap_pct = gap / competitor_first`
- `wow_score = my_price / gap_pct`
- Only computed when `my_price > competitor_first` (losing position)
- `my_price` is taken from the catalog entry (`entry.price`) — NOT from P11 data
- IMPORTANT: `entry.price` from `fetchCatalog` may be a string (e.g. `"9.99"`) — parse with `parseFloat()` before arithmetic

**AC-3: Quick Win flag**
- `is_quick_win = gap_pct <= 0.02`
- Only applies to losing products (where WOW score is computed)
- `quickwins_pt` / `quickwins_es` arrays = subset of losing entries where `is_quick_win === true`

**AC-4: Winning classification**
- `my_price <= competitor_first` → winning (no WOW score assigned)
- Winning products: counted in `summary_*.winning`, NOT included in `opportunities_*`

**AC-5: Uncontested classification**
- No competitor data for that channel → uncontested
- A product is uncontested for a channel when: it is absent from the competitors Map OR `competitors.get(ean).pt.first === null` (for PT)
- Uncontested products: counted in `summary_*.uncontested`, NOT included in `opportunities_*`

**AC-6: Sorted by `wow_score DESC`**
- `opportunities_pt` sorted descending by `wow_score` before returning
- `opportunities_es` sorted descending by `wow_score` before returning

**AC-7: Summary per channel**
- `summary_pt` and `summary_es`: `{ total, winning, losing, uncontested }`
- `total = catalog.length` (all products, both channels use same total)
- `winning + losing + uncontested === total` (exactly, no double-counting)
- `losing` = products where `my_price > competitor_first` (WOW score assigned)

**AC-8: Channel isolation + my_price source**
- PT and ES channels scored independently per product
- A product can be winning in PT and losing in ES simultaneously (or any combination)
- `my_price` comes from `catalog[i].price` (OF21 source) — same value used for both channels

**Verified by:** `tests/epic3-3.4-wow-scoring.atdd.test.js` (already written — DO NOT MODIFY)

---

## Tasks / Subtasks

- [ ] Task 1: Create `src/workers/scoring/computeReport.js` (AC: 1–8)
  - [ ] Export `function computeReport(catalog, competitors)` as named export
  - [ ] For each `entry` in `catalog`: `const my_price = parseFloat(entry.price)` — handle string from OF21
  - [ ] For each entry and each channel (`pt`, `es`): look up `competitors.get(entry.ean)` (may be undefined → uncontested)
  - [ ] Apply classification per channel: uncontested / winning / losing
  - [ ] For losing entries: compute `gap`, `gap_pct`, `wow_score`, `is_quick_win`
  - [ ] Build `opportunities_pt` and `opportunities_es` arrays (losing entries only), each with: `{ ean, shop_sku, product_title, my_price, competitor_first, gap, gap_pct, wow_score, is_quick_win }`
  - [ ] Sort `opportunities_pt` by `wow_score DESC`; sort `opportunities_es` by `wow_score DESC`
  - [ ] Build `quickwins_pt` = `opportunities_pt.filter(o => o.is_quick_win)`
  - [ ] Build `quickwins_es` = `opportunities_es.filter(o => o.is_quick_win)`
  - [ ] Build `summary_pt` and `summary_es`: `{ total: catalog.length, winning, losing, uncontested }`
  - [ ] Return `{ opportunities_pt, opportunities_es, quickwins_pt, quickwins_es, summary_pt, summary_es }`

- [ ] Task 2: Verify ATDD tests pass
  - [ ] `node --test tests/epic3-3.4-wow-scoring.atdd.test.js` — all tests must pass
  - [ ] `npm test` — no regressions (pre-existing failures in 3.5–3.7 are expected stubs)

---

## Dev Notes

### ATDD Test File — Read It First

`tests/epic3-3.4-wow-scoring.atdd.test.js` is **already committed**. Read it before writing any code.

Key test observations:
- **Module import:** `import('../src/workers/scoring/computeReport.js')` — must export `computeReport` as a named export
- **Test input shape:** `catalog` is an array of `{ ean, shop_sku, price, product_title }` where `price` is a **number** in tests (e.g. `price: 10.00`) — but real `fetchCatalog` returns `price` as `string`; use `parseFloat()` to be safe in both cases
- **Competitor input shape:** `Map<ean, { pt: { first, second }, es: { first, second } }>` — same shape as `scanCompetitors` output
- **Required return keys:** `opportunities_pt`, `opportunities_es`, `quickwins_pt`, `quickwins_es`, `summary_pt`, `summary_es`
- **Static source check (AC-8):** test reads `computeReport.js` source text and checks: `my_price` or `price` is present

### File Location

```
src/workers/scoring/.gitkeep        ← directory already exists (created in Story 1.1)
src/workers/scoring/computeReport.js ← CREATE THIS (Story 3.4)
src/workers/mirakl/fetchCatalog.js  ← EXISTS (Story 3.2) — DO NOT MODIFY
src/workers/mirakl/scanCompetitors.js ← EXISTS (Story 3.3) — DO NOT MODIFY
src/workers/reportWorker.js         ← EXISTS — DO NOT MODIFY (Story 3.7 wires this)
```

### ESM Pattern

```javascript
// src/workers/scoring/computeReport.js
// Pure scoring function — no I/O, no network, no DB.
// No imports needed (pure computation).

export function computeReport(catalog, competitors) {
  // ...
}
```

No imports required. This is a pure function.

### Input/Output Contract

**Input — `catalog`** (from `fetchCatalog` / Story 3.2):
```javascript
[
  { ean: string, shop_sku: string, price: string|number, product_title: string },
  ...
]
```
- `price` may be a string (e.g. `"9.99"`) from the live OF21 API — always `parseFloat(entry.price)`

**Input — `competitors`** (from `scanCompetitors` / Story 3.3):
```javascript
Map<ean, {
  pt: { first: number|null, second: number|null },
  es: { first: number|null, second: number|null }
}>
```
- EAN absent from Map → product is uncontested for both channels
- EAN present but `channel.first === null` → product is uncontested for that channel
- Note: `scanCompetitors` only adds EANs to the Map when at least one channel has data. So `competitors.has(ean) === false` means fully uncontested.

**Output:**
```javascript
{
  opportunities_pt: Array<OpportunityEntry>,  // losing in PT, sorted wow_score DESC
  opportunities_es: Array<OpportunityEntry>,  // losing in ES, sorted wow_score DESC
  quickwins_pt:     Array<OpportunityEntry>,  // subset of opportunities_pt where is_quick_win
  quickwins_es:     Array<OpportunityEntry>,  // subset of opportunities_es where is_quick_win
  summary_pt:       { total, winning, losing, uncontested },
  summary_es:       { total, winning, losing, uncontested },
}

// OpportunityEntry shape:
{
  ean:              string,
  shop_sku:         string,
  product_title:    string,
  my_price:         number,   // parseFloat of catalog price
  competitor_first: number,   // competitor's first (cheapest) total_price
  gap:              number,   // my_price - competitor_first
  gap_pct:          number,   // gap / competitor_first
  wow_score:        number,   // my_price / gap_pct
  is_quick_win:     boolean,  // gap_pct <= 0.02
}
```

### Scoring Formulas (from epics-distillate.md — Authoritative)

```
gap         = my_price - competitor_total_price_first
gap_pct     = gap / competitor_total_price_first
wow_score   = my_price / gap_pct
is_quick_win = gap_pct <= 0.02

Winning     = my_price <= competitor_total_price_first  (no WOW score)
Uncontested = no competitor data for that channel
```

### Reference Implementation Skeleton

```javascript
export function computeReport(catalog, competitors) {
  const opportunities_pt = []
  const opportunities_es = []

  let summary_pt = { total: catalog.length, winning: 0, losing: 0, uncontested: 0 }
  let summary_es = { total: catalog.length, winning: 0, losing: 0, uncontested: 0 }

  for (const entry of catalog) {
    const my_price = parseFloat(entry.price)
    const comp = competitors.get(entry.ean)

    // ── PT channel ──────────────────────────────────────────────────────────
    const ptFirst = comp?.pt?.first ?? null

    if (ptFirst === null) {
      summary_pt.uncontested++
    } else if (my_price <= ptFirst) {
      summary_pt.winning++
    } else {
      // losing — compute WOW score
      const gap      = my_price - ptFirst
      const gap_pct  = gap / ptFirst
      const wow_score = my_price / gap_pct
      opportunities_pt.push({
        ean: entry.ean,
        shop_sku: entry.shop_sku,
        product_title: entry.product_title,
        my_price,
        competitor_first: ptFirst,
        gap,
        gap_pct,
        wow_score,
        is_quick_win: gap_pct <= 0.02,
      })
      summary_pt.losing++
    }

    // ── ES channel ──────────────────────────────────────────────────────────
    const esFirst = comp?.es?.first ?? null
    // ... same pattern as PT ...
  }

  // Sort by wow_score DESC
  opportunities_pt.sort((a, b) => b.wow_score - a.wow_score)
  opportunities_es.sort((a, b) => b.wow_score - a.wow_score)

  // Quick Wins = losing entries with gap_pct <= 0.02
  const quickwins_pt = opportunities_pt.filter(o => o.is_quick_win)
  const quickwins_es = opportunities_es.filter(o => o.is_quick_win)

  return { opportunities_pt, opportunities_es, quickwins_pt, quickwins_es, summary_pt, summary_es }
}
```

### Critical: `my_price` type safety

`fetchCatalog` returns `price: offer.applicable_pricing?.price` which in the live Mirakl API is a string (e.g. `"9.99"`). The ATDD test passes numeric prices for simplicity. Always use `parseFloat(entry.price)` to handle both. If `parseFloat` returns `NaN` (null/undefined `price`), the product should be silently skipped or treated as uncontested for both channels (deferred edge case noted in deferred-work.md).

### No Dependencies Required

`computeReport` is pure computation — no imports needed at all. No pino, no config, no DB, no Mirakl API client.

### Deferred Work Awareness

From `deferred-work.md` (3-2 review):
- `Nullable applicable_pricing.price` — `offer.applicable_pricing?.price` can be undefined; **downstream scoring must handle gracefully**. Use `parseFloat(entry.price)` and guard: if `isNaN(my_price)` → treat as uncontested for both channels (log-free skip is fine for MVP).

---

## Architecture Guardrails

| Boundary | Rule |
|---|---|
| `src/workers/scoring/computeReport.js` | Pure function — no I/O, no network, no DB calls |
| `computeReport.js` | Named export only: `export function computeReport(...)` |
| `computeReport.js` | No module-scope state — stateless function |
| `computeReport.js` | `my_price` always from catalog entry (OF21) — never from competitor data |
| `src/workers/reportWorker.js` | DO NOT MODIFY — Phase C stub wired in Story 3.7 |
| `fetchCatalog.js` / `scanCompetitors.js` | DO NOT MODIFY — already done; read-only reference |

---

## Story Dependencies

**This story (3.4) requires:**
- Story 3.2 complete (done) — `fetchCatalog` output shape `[{ean, shop_sku, price, product_title}]`
- Story 3.3 complete (done) — `scanCompetitors` output shape `Map<ean, {pt,es}>` with `{first,second}` per channel

**Note:** Story 3.4 is pure scoring logic. It does NOT import `fetchCatalog` or `scanCompetitors` — it consumes their output via function parameters. No Mirakl API calls in this story.

**Stories that depend on 3.4:**
- Story 3.5 (report persistence + CSV) — consumes `computeReport` output to build `reports` DB row and CSV
- Story 3.7 (full worker orchestration) — wires Phase C: calls `computeReport(catalog, competitorMap)` after Phase B

---

## Previous Story Intelligence

**From Story 3.3 (P11 competitor scan — done 2026-04-18):**
- `scanCompetitors` returns `Map<ean, { pt: {first, second}, es: {first, second} }>`
- EANs with ALL null values for both channels are NOT added to the Map (see `scanCompetitors.js:160` — `if (pt.first !== null || ...)`). So `competitors.has(ean) === false` means fully uncontested.
- Failed P11 batches → EANs absent from Map → uncontested downstream. Scoring handles this correctly with `comp?.pt?.first ?? null` pattern.
- `total_price` (not `price`) used for competitor comparison — already done in scanCompetitors; scoring receives correct `first`/`second` values.

**From Story 3.2 (OF21 catalog fetch — done 2026-04-18):**
- `price` field: `offer.applicable_pricing?.price` — raw API value, likely a string. Use `parseFloat()`.
- Deferred review finding: `Nullable applicable_pricing.price` — guard against `NaN` in scoring.
- `fetchCatalog` only returns entries WITH a valid EAN — no null-EAN entries to handle.

**From Epic 3 ATDD test plan (pre-written):**
- Pre-written ATDD tests are the contract — implement to pass them exactly; never modify test files
- Static source checks (`readFileSync`) verify code structure — ensure `my_price` and `price` appear in source
- All tests are pure unit tests — no network, no Redis required

**From Epic 2 retrospective:**
- ESM: `export function`, `import` — no CommonJS; `"type": "module"` in package.json
- `.gitkeep` in `src/workers/scoring/` already exists; creating `computeReport.js` there is correct

---

## Verification Checklist

After completing all tasks, verify:

- [ ] `src/workers/scoring/computeReport.js` exists
- [ ] `computeReport` exported as a named function
- [ ] No imports in the file (pure computation — none needed)
- [ ] `parseFloat(entry.price)` used for `my_price` (not raw `.price`)
- [ ] NaN guard: if `isNaN(my_price)` → product treated as uncontested for both channels
- [ ] Uncontested: `competitors.get(ean)` absent OR `channel.first === null`
- [ ] Winning: `my_price <= competitor_first`
- [ ] Losing: `my_price > competitor_first` → `gap`, `gap_pct`, `wow_score`, `is_quick_win` computed
- [ ] `is_quick_win = gap_pct <= 0.02` (boundary inclusive)
- [ ] `opportunities_pt` sorted `wow_score DESC`
- [ ] `opportunities_es` sorted `wow_score DESC`
- [ ] `quickwins_pt = opportunities_pt.filter(o => o.is_quick_win)`
- [ ] `quickwins_es = opportunities_es.filter(o => o.is_quick_win)`
- [ ] `summary_pt.total === catalog.length`
- [ ] `summary_pt.winning + summary_pt.losing + summary_pt.uncontested === summary_pt.total`
- [ ] Same invariants for `summary_es`
- [ ] PT and ES scored independently (dual channel per product)
- [ ] `node --test tests/epic3-3.4-wow-scoring.atdd.test.js` — all tests pass
- [ ] `npm test` — no regressions in 3.1, 3.2, 3.3 test suites

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Completion Notes List

- `computeReport` implemented as pure function with no imports, no I/O
- `scoreChannel` helper extracted for per-channel classification (uncontested/winning/losing)
- NaN guard added for null/undefined/non-numeric catalog prices (AC-1 dev note)
- Negative competitor price guard added to prevent false quick-win classification
- All 37 tests pass (24 ATDD + 13 unit)

### File List

- `src/workers/scoring/computeReport.js` — new file (pure scoring function)
- `tests/epic3-3.4-wow-scoring.unit.test.js` — new file (13 unit tests for edge cases)

### Change Log

- 2026-04-18: Story 3.4 created — WOW score and Quick Wins scoring.
- 2026-04-18: Story 3.4 implemented — 37/37 tests passing. Status set to done.
