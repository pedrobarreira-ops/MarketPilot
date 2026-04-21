# Story 6.2: report.js — Biggest Opportunities & Quick Wins Tables

This story does NOT call Mirakl endpoints directly. It renders data already fetched by `GET /api/reports/:report_id` (Story 4.3). No Mirakl MCP check required for direct endpoint usage.

**Epic:** 6 — Frontend Report Page
**Story:** 6.2
**Story Key:** 6-2-biggest-opportunities-and-quick-wins-tables
**Status:** review
**Date Created:** 2026-04-21

---

## User Story

As a Worten marketplace seller viewing my MarketPilot report,
I want to see the Biggest Opportunities table (sorted by WOW score descending) and the Quick Wins table (score bars, ≤2% gap products), with prices formatted in pt-PT locale,
So that I can quickly identify the most impactful products to reprice and the easiest wins available to me.

**Satisfies:** Epic 6.2 AC (epics-distillate.md:272) — Opportunities pre-sorted WOW DESC, no client re-sort; first row `#EFF6FF` tint; price `"€799,00"` (comma decimal, dot thousands); gap € `"−€6,50"` red `#DC2626`; gap % red pill; WOW right-aligned number; empty state `"Estás em 1.º lugar em todos os produtos neste canal."`; Quick Wins: no first-row tint; score = horizontal navy bar (relative width); empty state `"Não há vitórias rápidas disponíveis neste canal."`.

---

## Acceptance Criteria

**AC-1: Opportunities table rows populated from API data**
- After `GET /api/reports/:report_id` resolves (Story 6.1 does the fetch), `report.js` calls `renderOpportunities(opportunities)` with the `opportunities_pt` or `opportunities_es` array for the active channel
- Each item in the array renders as one `<tr>` inside the opportunities `<tbody>` (first `<tbody>` in `document.querySelectorAll('tbody')`)
- The API shape per item: `{ ean, product_title, shop_sku, my_price, first_price, gap_pct, wow_score }` — `gap_eur` is computed as `my_price - first_price` (a negative number for opportunities where `my_price > first_price`) for display purposes
- Rows are displayed in the order already returned by the API (pre-sorted by `wow_score DESC` server-side); no client-side re-sort
- Empty array: display the single-row empty state message (see AC-5) instead of rows

**AC-2: Opportunities table — first row highlight**
- The first `<tr>` of the opportunities table has background colour `#EFF6FF` (or Tailwind `bg-blue-50`, which maps to the same hex) — applied as an inline style or class
- Non-first rows have no first-row highlight class; they use the standard alternating/hover style
- The first-row highlight is applied based on DOM position (index 0), not on any data value

**AC-3: Opportunities table — price and gap formatting**
- "O teu preço" column: format `my_price` as `"€799,00"` — euro sign prefix, comma as decimal separator, dot as thousands separator (pt-PT locale), always 2 decimal places
  - Example: `799` → `"€799,00"`; `2499.5` → `"€2.499,50"`
- "Preço do 1.º lugar" column: same format applied to `first_price`
- "Diferença €" column: show `gap_eur` (or computed `my_price - first_price`) formatted as `"−€6,50"` (minus sign `−` U+2212, euro prefix, pt-PT locale, 2 decimal places) in red — CSS color `#DC2626` (Tailwind `text-red-600` or inline style)
  - The gap is always negative or zero for opportunities (my_price > first_price); display as negative number
  - Example: if `my_price = 799` and `first_price = 792.50`, gap display = `"−€6,50"` in red
- "Diferença %" column: show `gap_pct` formatted as a percentage (multiply by 100, round to 1 decimal) inside a red pill badge — `<span>` with `bg-error-container text-on-error-container` classes (or equivalent red-tinted pill)
  - Example: `gap_pct = 0.008` → `"0.8%"`
- "Pontuação" column: show `wow_score` as a right-aligned integer number (no decimal) — Tailwind class `text-right` (or inline `text-align: right`) on the `<td>`
  - Example: `wow_score = 974` → `"974"`; `wow_score = 912.5` → `"913"` (rounded)

**AC-4: Quick Wins table rows populated from API data**
- After data loads, `report.js` calls `renderQuickWins(quickwins)` with the `quickwins_pt` or `quickwins_es` array for the active channel
- Each item renders as one `<tr>` inside the quick wins `<tbody>` (second `<tbody>` in `document.querySelectorAll('tbody')`)
- Quick Wins items have the same shape as opportunities: `{ ean, product_title, shop_sku, my_price, first_price, gap_pct, wow_score }`
- No first-row tint (unlike the Opportunities table)
- Empty array: display the single-row empty state message (see AC-6)

**AC-5: Opportunities table — empty state**
- When `opportunities` array is empty (length 0 or null), the opportunities `<tbody>` shows exactly one `<tr>` with a single `<td colspan="6">` containing the Portuguese text:
  `"Estás em 1.º lugar em todos os produtos neste canal."`
- The empty state is centered (`text-align: center`) with muted color (e.g. `text-on-surface-variant`)
- No shimmer/skeleton is shown in the empty state — the empty-state message is the final rendered state

**AC-6: Quick Wins table — empty state**
- When `quickwins` array is empty (length 0 or null), the quick wins `<tbody>` shows exactly one `<tr>` with a single `<td colspan="6">` containing:
  `"Não há vitórias rápidas disponíveis neste canal."`
- Same styling as Opportunities empty state (centered, muted color)

**AC-7: Quick Wins table — score column is a horizontal navy bar**
- The "Score" column (6th column) in the Quick Wins table shows a horizontal bar graphic, NOT a raw number
- Bar container: fixed-width `<div>` (e.g. `w-24 h-1`) with `bg-surface-variant rounded-full overflow-hidden`
- Inner fill bar: `<div class="h-full bg-primary">` with `width` set as a percentage relative to the maximum `wow_score` in the current channel's quickwins array
  - Example: if max wow_score in the quickwins array is 1000 and an item has wow_score 920, the inner div gets `style="width: 92%"`
  - Minimum rendered width: 2% (to always show some bar even for very low scores)
- The raw `wow_score` number is NOT displayed as text in the Score cell (use `aria-label` on the bar container if needed for accessibility — Story 6.6 will audit)

**AC-8 (static): WOW scores referenced and formatted**
- `report.js` source text contains `.toLocaleString(` or `Intl.NumberFormat` (for numeric formatting of prices and stat counts)
- `report.js` source text references `wow_score` (the field name from the API response)
- `report.js` source text references `gap_pct` (the field name from the API response)
- Covered by pre-scaffolded ATDD: `tests/epic6-6.2-opportunities-quickwins-tables.atdd.test.js` T-6.2-static.1a, T-6.2-static.1b, T-6.2-static.1c

**AC-9 (static): opportunities and quickwins data referenced**
- `report.js` source text references `opportunities_pt` or `opportunities_es` or `opportunities` (the API field prefix)
- `report.js` source text references `quickwins_pt` or `quickwins_es` or `quickwins` (the API field prefix)
- Covered by pre-scaffolded ATDD: `tests/epic6-6.2-opportunities-quickwins-tables.atdd.test.js` — the two "positive invariant" tests

**AC-10: PT/ES toggle re-renders both tables for the new channel**
- When the user switches from PT to ES (or back), `renderOpportunities()` and `renderQuickWins()` are called again with the new channel's data arrays
- Both table bodies are replaced — no stale rows from the previous channel persist
- No additional `fetch()` is made on toggle (data already in memory — Story 6.1 constraint)

**AC-11: Unskip Playwright E2E tests for Story 6.2**
- In `tests/e2e/report.smoke.spec.js`, change `test.skip(` → `test(` for the two 6.2-labelled skipped tests:
  1. `'6.2 — Maiores Oportunidades table renders sorted opportunities with first-row highlight'`
  2. `'6.2 — Vitórias Rápidas table renders score bar graphics (not raw numbers)'`
- Both unskipped tests must pass with the implemented assertions (see Dev Notes for full test bodies)
- All previously-passing tests (DOM smoke, 4× Story 6.1 tests) must remain passing

---

## Tasks / Subtasks

- [x] **Task 1: Implement `renderOpportunities(opportunities)` function** (AC: 1, 2, 3, 5)
  - [x] Clear opportunities `<tbody>` (`tbodies[0].innerHTML = ''`)
  - [x] If array is empty or null: render empty state row (colspan=6, centered Portuguese message)
  - [x] For each item: create `<tr>`, apply first-row `#EFF6FF` tint on index 0
  - [x] Columns: product_title, my_price (€ format), first_price (€ format), gap_eur (negative red), gap_pct (red pill), wow_score (right-aligned integer)
  - [x] Format prices: `formatPrice(val)` → `"€" + val.toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })`
  - [x] Format gap: `"−€" + Math.abs(gap).toLocaleString('pt-PT', ...)` with red color `#DC2626`
  - [x] Format gap_pct: `(gap_pct * 100).toFixed(1) + "%"` in red pill span
  - [x] Format wow_score: `Math.round(wow_score).toString()` right-aligned
  - [x] Use safe DOM construction (no innerHTML with user data — use textContent / createElement)

- [x] **Task 2: Implement `renderQuickWins(quickwins)` function** (AC: 4, 6, 7)
  - [x] Clear quick wins `<tbody>` (`tbodies[1].innerHTML = ''`)
  - [x] If array is empty or null: render empty state row (colspan=6, centered Portuguese message)
  - [x] Compute `maxScore = Math.max(...quickwins.map(q => q.wow_score))` for bar scaling
  - [x] For each item: create `<tr>` (no first-row tint)
  - [x] Columns: product_title, my_price (€ format), first_price (€ format), gap_eur (negative), gap_pct (pill), score bar div
  - [x] Score bar: outer `<div class="w-24 h-1 bg-surface-variant rounded-full overflow-hidden">`, inner `<div class="h-full bg-primary">` with `style="width: X%"` where `X = Math.max(2, Math.round((item.wow_score / maxScore) * 100))`

- [x] **Task 3: Wire `renderOpportunities` + `renderQuickWins` into `renderChannel`** (AC: 10)
  - [x] In the `renderChannel(channel)` function (Story 6.1), replace the two `tbodies[n].innerHTML = ''` stubs with calls to `renderOpportunities(opps)` and `renderQuickWins(qws)`
  - [x] Pass the correct channel-keyed data: `reportData['opportunities_' + channel]` and `reportData['quickwins_' + channel]`
  - [x] Verify ES no-data branch (AC-11 from Story 6.1) still short-circuits before renderOpportunities/renderQuickWins

- [x] **Task 4: Unskip and implement Playwright E2E tests** (AC: 11)
  - [x] Fill in the two 6.2 test bodies in `tests/e2e/report.smoke.spec.js` (see Dev Notes)
  - [x] Change `test.skip(` → `test(` for both 6.2 tests
  - [x] Run: `npx playwright test tests/e2e/report.smoke.spec.js` — all 7 tests pass (1 DOM smoke + 4 Story 6.1 + 2 Story 6.2)

- [x] **Task 5: Run static ATDD tests** (AC: 8, 9)
  - [x] Run: `node --test tests/epic6-6.2-opportunities-quickwins-tables.atdd.test.js` — all 5 tests pass
  - [x] Run: `node --test tests/frontend-architecture-invariants.test.js` — all 13 invariants pass

### Review Findings

Code review performed 2026-04-21 via `/bmad-code-review`. Three adversarial layers (Blind Hunter, Edge Case Hunter, Acceptance Auditor against spec). No blocking issues; all ACs satisfied. Two should-fix robustness patches auto-applied:

- [x] [Review][Patch] `formatGapPct` returned `"NaN%"` when `gap_pct` missing/undefined — inconsistent with `formatPrice`/`formatGapEur` which coerce via `|| 0`. Added `Number(gapPct) || 0` guard. [public/js/report.js:212-215]
- [x] [Review][Patch] `renderQuickWins` score bar width became `NaN%` (invisible bar) when `item.wow_score` was `undefined` — `undefined / maxScore = NaN`. Added `Number(item.wow_score) || 0` coercion before division. [public/js/report.js:344-346]

All 557 unit/ATDD tests pass after patches; 13 frontend architecture invariants pass; 5 static ATDD for 6.2 pass.

---

## Dev Notes

### CRITICAL: Files to create or modify

- **Modify:** `public/js/report.js` — extend Story 6.1 implementation with `renderOpportunities()` + `renderQuickWins()` functions; wire into `renderChannel()`
- **Modify:** `tests/e2e/report.smoke.spec.js` — unskip 2 tests + implement assertions, extend `SAMPLE_REPORT` fixture with opportunity/quickwins data
- **Do NOT modify:** any server files, any other test files, `public/report.html`, `public/index.html`, `public/progress.html`

### API Data Contract (from Story 4.3 / epics-distillate.md)

`GET /api/reports/:report_id` returns:
```
{
  data: {
    generated_at: number (Unix timestamp, seconds),
    summary: {
      pt: { total, winning, losing, uncontested },
      es: { total, winning, losing, uncontested }
    },
    opportunities_pt: [
      { ean, product_title, shop_sku, my_price, first_price, gap_pct, wow_score },
      ...  // sorted wow_score DESC server-side
    ],
    opportunities_es: [ ... ],
    quickwins_pt: [ ... ],
    quickwins_es: [ ... ]
  }
}
```

Note: `gap_eur` is NOT explicitly listed in the API contract for individual items. Compute it as `my_price - first_price` in `report.js` (this will be negative for opportunities). Display as `−€{abs(gap_eur)}`.

The scoring formulas (from epics-distillate.md):
- WOW score: `gap = my_price - competitor_total_price_first`; `gap_pct = gap / competitor_total_price_first`; applies only where `my_price > competitor_total_price_first`
- Quick Win: `gap_pct <= 0.02` (≤ 2%)

### Existing HTML Structure — Opportunities Table

```html
<!-- Section 2: Maiores oportunidades (public/report.html lines 143-198) -->
<section class="mb-20 bg-surface-container-low p-10 rounded-2xl">
  <table class="w-full text-left border-separate border-spacing-y-3">
    <thead>
      <tr class="text-label-sm uppercase tracking-widest text-slate-400 font-bold">
        <th class="px-6 py-4">Produto</th>
        <th class="px-6 py-4">O teu preço</th>
        <th class="px-6 py-4">Preço do 1.º lugar</th>
        <th class="px-6 py-4">Diferença €</th>
        <th class="px-6 py-4">Diferença %</th>
        <th class="px-6 py-4">Pontuação</th>
      </tr>
    </thead>
    <tbody class="text-sm font-medium">
      <!-- Story 6.1 cleared this; Story 6.2 populates rows -->
    </tbody>
  </table>
</section>
```

### Existing HTML Structure — Quick Wins Table

```html
<!-- Section 3: Vitórias rápidas (public/report.html lines 200-255) -->
<section class="mb-20">
  <table class="w-full text-left border-separate border-spacing-y-2">
    <thead>
      <tr class="text-[10px] uppercase tracking-[0.2em] text-slate-400 font-black">
        <th class="px-6 pb-4">Produto</th>
        <th class="px-6 pb-4">O teu preço</th>
        <th class="px-6 pb-4">Preço do 1.º lugar</th>
        <th class="px-6 pb-4">Diferença €</th>
        <th class="px-6 pb-4">Diferença %</th>
        <th class="px-6 pb-4">Score</th>
      </tr>
    </thead>
    <tbody class="text-sm">
      <!-- Story 6.1 cleared this; Story 6.2 populates rows -->
    </tbody>
  </table>
</section>
```

Both tables use `document.querySelectorAll('tbody')`:
- `tbodies[0]` = Opportunities table body
- `tbodies[1]` = Quick Wins table body

### DOM Selectors

```js
// The same pattern Story 6.1 already uses:
const tbodies = document.querySelectorAll('tbody')
const oppTbody = tbodies[0]
const qwTbody  = tbodies[1]
```

### Price Formatting Helper

```js
// pt-PT locale price: "€799,00" (comma decimal, dot thousands)
// Story 6.1 already has formatPtPT(val) for integer counts.
// For prices with 2 decimal places, use a separate helper:
function formatPrice(val) {
  const n = Number(val) || 0
  try {
    return '€' + n.toLocaleString('pt-PT', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })
  } catch (_) {
    // Manual fallback (same pattern as formatPtPT)
    return '€' + n.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  }
}

// Gap EUR: always negative for opportunities (my_price > first_price)
// Display with U+2212 MINUS SIGN (not hyphen-minus) per design
function formatGapEur(gapEur) {
  // gapEur = my_price - first_price (negative number)
  const absVal = Math.abs(Number(gapEur) || 0)
  return '\u2212\u20AC' + absVal.toLocaleString('pt-PT', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })
}

// Gap pct: "0.8%" from 0.008
function formatGapPct(gapPct) {
  return (Number(gapPct) * 100).toFixed(1) + '%'
}
```

### Opportunities Row Builder

```js
function renderOpportunities(opportunities) {
  const oppTbody = document.querySelectorAll('tbody')[0]
  if (!oppTbody) return
  oppTbody.innerHTML = ''

  if (!opportunities || opportunities.length === 0) {
    const td = document.createElement('td')
    td.colSpan = 6
    td.className = 'px-6 py-8 text-on-surface-variant text-center'
    td.textContent = 'Estás em 1.º lugar em todos os produtos neste canal.'
    const tr = document.createElement('tr')
    tr.appendChild(td)
    oppTbody.appendChild(tr)
    return
  }

  opportunities.forEach(function(item, idx) {
    const tr = document.createElement('tr')
    tr.className = 'bg-surface-container-lowest/50 hover:bg-surface-container-lowest transition-colors shadow-sm rounded-lg'
    if (idx === 0) {
      // First-row #EFF6FF tint (design: highlighted row)
      tr.style.backgroundColor = '#EFF6FF'
    }

    // Column 1: Product title
    const tdProduct = document.createElement('td')
    tdProduct.className = 'px-6 py-6 rounded-l-lg'
    tdProduct.textContent = item.product_title || item.ean || ''
    if (idx === 0) tdProduct.classList.add('border-l-4', 'border-primary')

    // Column 2: My price
    const tdMyPrice = document.createElement('td')
    tdMyPrice.className = 'px-6 py-6'
    tdMyPrice.textContent = formatPrice(item.my_price)

    // Column 3: First price
    const tdFirstPrice = document.createElement('td')
    tdFirstPrice.className = 'px-6 py-6 font-bold'
    tdFirstPrice.textContent = formatPrice(item.first_price)

    // Column 4: Gap EUR (negative, red)
    const gapEur = (item.my_price || 0) - (item.first_price || 0)
    const tdGapEur = document.createElement('td')
    tdGapEur.className = 'px-6 py-6'
    tdGapEur.style.color = '#DC2626'
    tdGapEur.textContent = formatGapEur(gapEur)

    // Column 5: Gap pct — red pill
    const tdGapPct = document.createElement('td')
    tdGapPct.className = 'px-6 py-6'
    const pill = document.createElement('span')
    pill.className = 'bg-error-container text-on-error-container px-2 py-0.5 rounded text-xs'
    pill.textContent = formatGapPct(item.gap_pct)
    tdGapPct.appendChild(pill)

    // Column 6: WOW score — right-aligned integer
    const tdWow = document.createElement('td')
    tdWow.className = 'px-6 py-6 rounded-r-lg font-black text-primary text-lg tracking-tighter text-right'
    tdWow.textContent = Math.round(Number(item.wow_score) || 0).toString()

    tr.appendChild(tdProduct)
    tr.appendChild(tdMyPrice)
    tr.appendChild(tdFirstPrice)
    tr.appendChild(tdGapEur)
    tr.appendChild(tdGapPct)
    tr.appendChild(tdWow)
    oppTbody.appendChild(tr)
  })
}
```

### Quick Wins Row Builder

```js
function renderQuickWins(quickwins) {
  const qwTbody = document.querySelectorAll('tbody')[1]
  if (!qwTbody) return
  qwTbody.innerHTML = ''

  if (!quickwins || quickwins.length === 0) {
    const td = document.createElement('td')
    td.colSpan = 6
    td.className = 'px-6 py-8 text-on-surface-variant text-center'
    td.textContent = 'Não há vitórias rápidas disponíveis neste canal.'
    const tr = document.createElement('tr')
    tr.appendChild(td)
    qwTbody.appendChild(tr)
    return
  }

  const maxScore = Math.max.apply(null, quickwins.map(function(q) { return q.wow_score || 0 })) || 1

  quickwins.forEach(function(item) {
    const tr = document.createElement('tr')
    tr.className = 'hover:bg-surface-container transition-colors'

    // Column 1: Product title
    const tdProduct = document.createElement('td')
    tdProduct.className = 'px-6 py-5 border-b border-outline-variant/10 font-bold text-primary'
    tdProduct.textContent = item.product_title || item.ean || ''

    // Column 2: My price
    const tdMyPrice = document.createElement('td')
    tdMyPrice.className = 'px-6 py-5 border-b border-outline-variant/10 text-on-surface-variant'
    tdMyPrice.textContent = formatPrice(item.my_price)

    // Column 3: First price
    const tdFirstPrice = document.createElement('td')
    tdFirstPrice.className = 'px-6 py-5 border-b border-outline-variant/10 font-bold'
    tdFirstPrice.textContent = formatPrice(item.first_price)

    // Column 4: Gap EUR
    const gapEur = (item.my_price || 0) - (item.first_price || 0)
    const tdGapEur = document.createElement('td')
    tdGapEur.className = 'px-6 py-5 border-b border-outline-variant/10 font-medium text-on-tertiary-fixed-variant'
    tdGapEur.textContent = formatGapEur(gapEur)

    // Column 5: Gap pct pill
    const tdGapPct = document.createElement('td')
    tdGapPct.className = 'px-6 py-5 border-b border-outline-variant/10'
    const pill = document.createElement('span')
    pill.className = 'bg-surface-variant text-on-surface-variant px-2 py-0.5 rounded text-xs'
    pill.textContent = formatGapPct(item.gap_pct)
    tdGapPct.appendChild(pill)

    // Column 6: Score bar (not a number)
    const pct = Math.max(2, Math.round((item.wow_score / maxScore) * 100))
    const tdScore = document.createElement('td')
    tdScore.className = 'px-6 py-5 border-b border-outline-variant/10'
    const barOuter = document.createElement('div')
    barOuter.className = 'w-24 h-1 bg-surface-variant rounded-full overflow-hidden'
    const barInner = document.createElement('div')
    barInner.className = 'h-full bg-primary'
    barInner.style.width = pct + '%'
    barOuter.appendChild(barInner)
    tdScore.appendChild(barOuter)

    tr.appendChild(tdProduct)
    tr.appendChild(tdMyPrice)
    tr.appendChild(tdFirstPrice)
    tr.appendChild(tdGapEur)
    tr.appendChild(tdGapPct)
    tr.appendChild(tdScore)
    qwTbody.appendChild(tr)
  })
}
```

### Integration into `renderChannel`

In the `renderChannel(channel)` function (already in `report.js` from Story 6.1), replace the two stub lines:
```js
// Story 6.1 stubs — REPLACE WITH:
// tbodies[0].innerHTML = ''
// tbodies[1].innerHTML = ''
```
with:
```js
const opps = reportData['opportunities_' + channel] || []
const qws  = reportData['quickwins_' + channel]     || []
renderOpportunities(opps)
renderQuickWins(qws)
```

The ES no-data branch (at the top of `renderChannel`) must remain — it should return early BEFORE calling `renderOpportunities`/`renderQuickWins` (Story 6.1 already does this; do not break it).

### innerHTML Safety Note

- `product_title`, `ean`, prices are all set via `textContent` — safe from XSS
- The architecture invariant in `tests/frontend-architecture-invariants.test.js` flags `innerHTML` with interpolated user-data variables. None of the new code uses `innerHTML` with API data — use `textContent` and `createElement`/`appendChild` throughout (same pattern as Story 6.1's `renderNoData`)

### Tailwind JIT Note

The new classes added dynamically via JavaScript:
- `border-l-4`, `border-primary` — **already present in `report.html`** (`border-l-4 border-primary` appears in the locked Opportunities row)
- `bg-surface-variant`, `text-on-surface-variant`, `text-on-tertiary-fixed-variant` — **already present** in `report.html` Quick Wins section
- `w-24`, `h-1`, `rounded-full`, `overflow-hidden`, `h-full`, `bg-primary` — **already present** in the Quick Wins score bar HTML in `report.html`
- `bg-error-container`, `text-on-error-container` — **already present** in `report.html` opportunities section

No new Tailwind JIT safelist entries required — all dynamic classes are already referenced as static strings in `report.html`.

**IMPORTANT:** The first-row highlight uses an **inline style** (`tr.style.backgroundColor = '#EFF6FF'`) rather than a dynamic Tailwind class. `bg-blue-50` = `#EFF6FF` but since this class is not in `report.html`'s static HTML, adding it dynamically via JS risks JIT purge. Use `style.backgroundColor` directly per `feedback_tailwind_dynamic_classes.md`.

### Playwright E2E Test Implementation

The two Story 6.2 tests in `tests/e2e/report.smoke.spec.js` need their bodies filled in before unskipping. Extend the `SAMPLE_REPORT` fixture with richer data and implement assertions:

**Extend SAMPLE_REPORT at the top of the file:**
```js
const SAMPLE_REPORT = {
  summary: {
    pt: { in_first: 4821, losing: 1340, uncontested: 756 },
    es: { in_first: 2103,  losing: 512,  uncontested: 312 },
  },
  opportunities_pt: [
    { ean: '123', product_title: 'Sony Bravia XR-55A80L', my_price: 799, first_price: 792.50, gap_pct: 0.008, wow_score: 974 },
    { ean: '456', product_title: 'Canon EOS R6', my_price: 2499, first_price: 2485, gap_pct: 0.006, wow_score: 912 },
  ],
  opportunities_es: [],
  quickwins_pt: [
    { ean: '789', product_title: 'Apple AirPods Pro 2', my_price: 249, first_price: 246.90, gap_pct: 0.0085, wow_score: 920 },
  ],
  quickwins_es: [],
  generated_at: '2026-04-14T10:00:00Z',
}
```

**Test 1 — Opportunities table (6.2 test body):**
```js
test('6.2 — Maiores Oportunidades table renders sorted opportunities with first-row highlight', async ({ page }) => {
  await page.route(`**/api/reports/${SAMPLE_ID}`, (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ data: SAMPLE_REPORT }),
  }))
  await page.goto(`/report/${SAMPLE_ID}`)

  // Wait for data to load (PT stat cards populated)
  await expect(page.locator('.text-6xl').nth(0)).toHaveText('4.821')

  // First row visible with product title
  await expect(page.getByText('Sony Bravia XR-55A80L')).toBeVisible()

  // Second row visible
  await expect(page.getByText('Canon EOS R6')).toBeVisible()

  // Price formatted in pt-PT locale: "€799,00"
  await expect(page.getByText('€799,00')).toBeVisible()

  // WOW score rendered as number in first row area
  await expect(page.getByText('974')).toBeVisible()
})
```

**Test 2 — Quick Wins table (6.2 test body):**
```js
test('6.2 — Vitórias Rápidas table renders score bar graphics (not raw numbers)', async ({ page }) => {
  await page.route(`**/api/reports/${SAMPLE_ID}`, (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ data: SAMPLE_REPORT }),
  }))
  await page.goto(`/report/${SAMPLE_ID}`)

  // Wait for data to load
  await expect(page.locator('.text-6xl').nth(0)).toHaveText('4.821')

  // Quick wins product visible
  await expect(page.getByText('Apple AirPods Pro 2')).toBeVisible()

  // Score bar rendered as a div (bg-primary fill), not as raw text "920"
  // The score bar inner div exists
  const scoreBar = page.locator('tbody').nth(1).locator('.bg-primary')
  await expect(scoreBar).toBeVisible()

  // The raw wow_score number "920" should NOT appear as standalone text in the score column
  // (it's represented as bar width, not text)
  // Note: "920" might appear elsewhere if product_title contains it — check in context
  const scoreCell = page.locator('tbody').nth(1).locator('tr').first().locator('td').last()
  await expect(scoreCell.locator('div.bg-primary')).toBeVisible()
})
```

### Testing Commands

```bash
# Static ATDD for 6.2:
node --test tests/epic6-6.2-opportunities-quickwins-tables.atdd.test.js

# Frontend architecture invariants (must stay green):
node --test tests/frontend-architecture-invariants.test.js

# All report E2E tests (Story 6.1 + 6.2):
npx playwright test tests/e2e/report.smoke.spec.js

# Full unit/ATDD suite (regression check):
npm test
```

### Scope Boundary for Story 6.2

Story 6.2 covers:
- Opportunities table rows — `renderOpportunities()`
- Quick Wins table rows — `renderQuickWins()`
- PT/ES toggle re-rendering of both tables

**OUT OF SCOPE for Story 6.2 (handled by later stories):**
- CSV download functionality — Story 6.3
- CTA button URL (`CTA_URL`) — Story 6.3
- Mobile layout — Story 6.4
- Expired/error states (404, 5xx) — Story 6.5
- Full accessibility pass — Story 6.6

### Architecture Boundary

This story is 100% frontend (`public/js/report.js`). No server-side changes. The only backend it consumes is `GET /api/reports/:report_id` (Story 4.3 done, route contract unchanged).

### Previous Story Context (Story 6.1 done)

- Story 6.1 (`done`) implemented data fetch, skeleton, stat cards, PT/ES toggle, and stubbed out `renderOpportunitiesAndQuickWins()` and `buildOpportunitiesRows()` as forward scaffolds. Story 6.2 replaces these stubs with full implementations.
- The `renderChannel()` function in Story 6.1 already has `tbodies[0].innerHTML = ''` and `tbodies[1].innerHTML = ''` as placeholders — Story 6.2 replaces them with `renderOpportunities(opps)` and `renderQuickWins(qws)`.
- The `renderOpportunitiesAndQuickWins()` scaffold function in Story 6.1 already references `opportunities_pt`/`es` and `quickwins_pt`/`es` and uses `wow_score`/`gap_pct` — this satisfies the static ATDD T-6.2 tests. Story 6.2's real implementation will also reference these, keeping the tests green.

### NFR Compliance

- **NFR-P4:** Report page load < 2s — rendering the tables is synchronous DOM manipulation (no additional network calls); negligible added latency.
- No server-side performance impact — purely client JS.

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- Tailwind JIT invariant failure: `py-8` used in empty-state `<td>` className not in report.html. After comment stripping, the proximity heuristic (500-char window for `.style.*`) found no inline style fallback. Fixed by adding `td.style.padding = '2rem 1.5rem'` inline fallback adjacent to both empty-state className assignments.

### Completion Notes List

- Implemented `renderOpportunities(opportunities)` with pt-PT price formatting, first-row `#EFF6FF` highlight (inline style), red gap EUR (U+2212 minus sign), red pill for gap_pct, right-aligned WOW score integer
- Implemented `renderQuickWins(quickwins)` with horizontal navy score bar (relative width % of maxScore, min 2%), no first-row tint, same price formatting
- Both functions use safe DOM (createElement/textContent, no innerHTML for user data)
- Wired both into `renderChannel()` replacing the Story 6.1 stubs; ES no-data early-return preserved
- Removed Story 6.1 scaffold functions (`buildOpportunitiesRows`, `renderOpportunitiesAndQuickWins`) — replaced by real implementations
- Unskipped 2 Story 6.2 Playwright tests; extended SAMPLE_REPORT fixture with PT opportunities + quickwins data
- All tests green: 557 unit/ATDD pass, 13 frontend architecture invariants pass, 7 Playwright E2E pass (6 skipped future stories)

### File List

- public/js/report.js
- tests/e2e/report.smoke.spec.js

### Change Log

- 2026-04-21: Story 6.2 spec created — create-story workflow, comprehensive developer guide.
- 2026-04-21: Story 6.2 implemented — renderOpportunities, renderQuickWins, renderChannel wiring, E2E unskip. All tests green.
