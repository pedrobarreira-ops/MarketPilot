# Story 6.1: report.js — Data Fetch, Skeleton, Your Position & PT/ES Toggle

Endpoints verified against MCP-Verified Endpoint Reference (epics-distillate.md, 2026-04-18).

**Epic:** 6 — Frontend Report Page
**Story:** 6.1
**Story Key:** 6-1-report-js-data-fetch-skeleton-and-your-position
**Status:** ready-for-dev
**Date Created:** 2026-04-21

This story does NOT call Mirakl endpoints directly. It consumes `GET /api/reports/:report_id` (Story 4.3). No Mirakl MCP check required for direct endpoint usage; endpoint reference note added for completeness.

---

## User Story

As a Worten marketplace seller viewing my MarketPilot report,
I want the report page to show a skeleton loading state while my data is being fetched, then instantly populate with my current position stats and PT/ES market data,
So that I get immediate visual feedback on load and can quickly switch between Portuguese and Spanish market data without waiting for additional network requests.

**Satisfies:** Epic 6.1 AC (epics-distillate.md:271) — skeleton (shimmer cards + table rows, toggle disabled, CSV hidden, date "—", CTA immediate), on-success instant swap with Portuguese long date, PT default, both channels in memory on first fetch, no re-fetch on toggle, toggle ARIA, ES no-data edge case.

---

## Acceptance Criteria

**AC-1: Skeleton state shown while fetch is in flight**
- On page load, before the `GET /api/reports/:report_id` fetch completes, the following skeleton state is active:
  - Stat cards (Em 1.º lugar, A perder posição, Sem concorrência) show grey shimmer placeholders replacing the large number values — implemented by adding a shimmer CSS class (e.g. `animate-pulse bg-surface-container`) over the stat number element
  - Opportunities table shows 4 shimmer placeholder rows (replace `<tbody>` with 4 skeleton rows using `animate-pulse`)
  - Quick Wins table shows 4 shimmer placeholder rows (same pattern)
  - The PT/ES toggle container has `pointer-events: none` and `opacity: 0.5` (or equivalent reduced opacity) — toggle is not clickable during skeleton
  - The CSV download button/link is hidden (`display: none` or `visibility: hidden`)
  - The header date element shows `"—"` (a literal dash)
  - The CTA banner renders immediately without waiting for the fetch (it has no data dependency)

**AC-2: report_id extracted from URL path — not query params or storage**
- `report_id` is extracted from `window.location.pathname` (the route is `GET /report/:report_id` — the ID is the last path segment)
- `localStorage` and `sessionStorage` are never read or written in `report.js`
- `URLSearchParams` is NOT used to extract `report_id` (it is in the path, not the query string)
- Extraction pattern: `const reportId = window.location.pathname.split('/').pop()`

**AC-3: Fetch `GET /api/reports/:report_id` on load**
- On page load (DOMContentLoaded or top-level synchronous execution), `report.js` issues exactly one `fetch('/api/reports/' + reportId)` call
- No additional fetches are made when the user toggles between PT and ES channels (both channels loaded into memory on the first fetch)
- The fetch response shape is `{ data: { summary, opportunities_pt, opportunities_es, quickwins_pt, quickwins_es, generated_at } }`

**AC-4: On fetch success — instant swap, no fade**
- When the fetch resolves with HTTP 200, the skeleton state is immediately replaced (no CSS fade/transition delay) with the real data
- The swap applies to: stat card numbers, table bodies, toggle enabled state, CSV link visible, header date populated
- The swap is instant — no `setTimeout` or CSS `transition` delay on the swap itself

**AC-5: Header date in Portuguese long format**
- The header date element (currently showing `"Relatório gerado em 14 Abril 2026"`) is populated from `generated_at` in the API response
- Format: Portuguese long format, e.g. `"14 de Abril de 2026"` — use `new Date(generatedAt).toLocaleDateString('pt-PT', { day: 'numeric', month: 'long', year: 'numeric' })`
- The full header text becomes `"Relatório gerado em {date}"` where `{date}` is the formatted date
- During skeleton: the date portion shows `"—"` (the header element text becomes `"Relatório gerado em —"`)

**AC-6: PT channel default on load**
- After data loads, the PT channel is active by default
- The PT toggle pill has `aria-pressed="true"`; the ES toggle pill has `aria-pressed="false"`
- The stat cards, opportunities table, and quick wins table show PT channel data

**AC-7 (static): Fetch from `/api/reports/` — not another endpoint**
- `report.js` source text contains a `fetch()` call
- The fetch URL contains `/api/reports/`
- Covered by pre-scaffolded ATDD: `tests/epic6-6.1-report-js-fetch-skeleton.atdd.test.js` T-6.1-static.1a and T-6.1-static.1b

**AC-8 (static): report_id from URL path only**
- `report.js` source text uses `location.pathname`
- `report.js` does NOT reference `localStorage`
- `report.js` does NOT reference `sessionStorage`
- `report.js` does NOT use `URLSearchParams.get('report_id')`
- Covered by pre-scaffolded ATDD: T-6.1-static.2a through T-6.1-static.2d

**AC-9: Both channels loaded into memory on first fetch — no re-fetch on toggle**
- The API response for `GET /api/reports/:id` returns `{ opportunities_pt, opportunities_es, quickwins_pt, quickwins_es, summary: { pt, es } }`
- On first fetch success, `report.js` stores all channel data in local variables (closure scope)
- Toggling PT↔ES uses the in-memory data — no additional `fetch()` is called
- The fetch is called exactly once per page load

**AC-10: PT/ES toggle — ARIA and behaviour**
- The toggle container `<div class="flex bg-surface-container p-1 rounded-lg">` has `role="group"` and `aria-label="Canal"` set by `report.js`
- Each toggle pill button has `aria-pressed` attribute set by `report.js`: active channel → `"true"`, inactive channel → `"false"`
- On click: active channel's `aria-pressed` → `"true"`, other → `"false"`; stat cards and tables update instantly with the new channel's data
- The toggle works during skeleton: toggle has `pointer-events: none` so clicks during fetch are no-ops

**AC-11: ES no-data edge case**
- When `summary.es.total` is 0 (or `opportunities_es` and `quickwins_es` are both empty arrays AND `summary.es` is absent/zero), display the message:
  `"Sem dados para Worten ES — este catálogo não tem ofertas activas neste canal."`
- This message is shown per section (replacing both the opportunities table and the quick wins table) when ES is active and has no data
- The stat cards section for ES shows the same no-data message if all ES summary values are 0

**AC-12: Stat cards — "A tua posição agora" section populated**
- The three stat cards show the following values from `summary.{channel}`:
  - "Em 1.º lugar" card: value from `summary.{channel}.in_first` (also called `winning` in some docs — see Dev Notes)
  - "A perder posição" card: value from `summary.{channel}.losing`
  - "Sem concorrência" card: value from `summary.{channel}.uncontested`
- Numbers are formatted with pt-PT locale (thousand separator `.`): e.g. `4.821` not `4821`
- Use `Number(val).toLocaleString('pt-PT')` for formatting

**AC-13: Add `<script>` tag to `report.html` — the ONLY permitted HTML change**
- `public/report.html` currently has NO `<script src="/js/report.js">` tag
- Add `<script src="/js/report.js"></script>` immediately before `</body>` in `public/report.html`
- All other `report.html` structure and Tailwind classes are locked — no other HTML changes
- `report.js` may dynamically update element attributes and content via JavaScript, but must not restructure the DOM beyond what is specified

**AC-14: Unskip Playwright E2E tests for Story 6.1**
- In `tests/e2e/report.smoke.spec.js`, change `test.skip(` → `test(` for the three 6.1-labelled skipped tests:
  1. `'6.1 — skeleton shows while report fetch is in flight'`
  2. `'6.1 — populated state shows PT stat cards with pt-PT locale numbers'`
  3. `'6.1 — PT/ES toggle swaps data without re-fetch'`
- All three unskipped tests must pass
- The existing DOM smoke test (`DOM smoke — page loads with expected static elements`) must remain passing
- Note: The skeleton test (#1) has implementation comments that must be filled in before unskipping (see Dev Notes)

---

## Tasks / Subtasks

- [ ] **Task 0: Add `<script>` tag to `report.html`** (AC: 13)
  - [ ] Add `<script src="/js/report.js"></script>` immediately before `</body>` in `public/report.html`
  - [ ] Verify the DOM smoke test still passes: `npx playwright test tests/e2e/report.smoke.spec.js --grep "DOM smoke"`

- [ ] **Task 1: Wire report.js — DOM references and initialisation** (AC: 2, 3, 5, 6, 10)
  - [ ] Extract `reportId` from `window.location.pathname.split('/').pop()`
  - [ ] Guard: if `!reportId` log warning and return early
  - [ ] Get DOM references:
    - Header date `<span>` (currently `"Relatório gerado em 14 Abril 2026"`)
    - Stat card number `<span>` elements (three large number spans inside `.text-6xl`)
    - Opportunities table `<tbody>`
    - Quick Wins table `<tbody>`
    - PT/ES toggle container `<div class="flex bg-surface-container p-1 rounded-lg">`
    - PT button (first child button of toggle)
    - ES button (second child button of toggle)
    - CSV download button/link
  - [ ] Set toggle ARIA: `role="group"`, `aria-label="Canal"` on container; `aria-pressed="true"` on PT button, `aria-pressed="false"` on ES button

- [ ] **Task 2: Apply skeleton state** (AC: 1, 5)
  - [ ] Apply shimmer placeholders to stat card number `<span>` elements: replace text with `&nbsp;`, add `animate-pulse bg-surface-container rounded w-16 h-12 inline-block` (or similar shimmer class set)
  - [ ] Replace opportunities `<tbody>` content with 4 shimmer rows
  - [ ] Replace quick wins `<tbody>` content with 4 shimmer rows
  - [ ] Disable toggle: `toggleContainer.style.pointerEvents = 'none'; toggleContainer.style.opacity = '0.5'`
  - [ ] Hide CSV link: `csvLink.style.display = 'none'`
  - [ ] Set header date to `"—"`: update the date portion of the header span
  - [ ] **Tailwind JIT note:** Any class added dynamically (e.g. `animate-pulse`, `bg-surface-container`) must already appear in `public/report.html` (it does — these are Tailwind classes already in the HTML) OR must have an `element.style.*` inline fallback. The shimmer pattern uses classes already present in report.html so JIT will not purge them.

- [ ] **Task 3: Fetch and data storage** (AC: 3, 9)
  - [ ] Call `fetch('/api/reports/' + reportId)` on init (after skeleton applied)
  - [ ] On 200 response: parse `{ data }` from JSON; store in closure variables:
    ```js
    let reportData = null   // full data object
    let activeChannel = 'pt'
    ```
  - [ ] Store both channels on first fetch: `reportData = data` (contains `summary`, `opportunities_pt`, `opportunities_es`, `quickwins_pt`, `quickwins_es`, `generated_at`)
  - [ ] Call `renderChannel('pt')` after data is stored

- [ ] **Task 4: Remove skeleton, render populated state** (AC: 4, 5, 6, 11, 12)
  - [ ] Implement `renderChannel(channel)`:
    - Get `summary[channel]` values: `in_first` (or `winning`), `losing`, `uncontested`
    - Update three stat card number `<span>` elements with pt-PT formatted numbers
    - Check ES no-data condition: if `channel === 'es'` and all summary values are 0, show no-data message in tables
    - Otherwise populate tables (table row rendering handled by Stories 6.2+ — for Story 6.1 just clear shimmer and show empty state if data arrays are empty)
    - Update toggle `aria-pressed` attributes
  - [ ] Implement `removeSkeletonState()`:
    - Enable toggle: restore `pointerEvents` and `opacity`
    - Show CSV link: restore `display`
    - Set header date: `"Relatório gerado em " + formattedDate`
  - [ ] Call `removeSkeletonState()` before `renderChannel(activeChannel)`

- [ ] **Task 5: PT/ES toggle handler** (AC: 9, 10, 11)
  - [ ] Attach click listener to PT button: on click, if `activeChannel !== 'pt'` → `activeChannel = 'pt'`, update `aria-pressed` on both buttons, call `renderChannel('pt')`
  - [ ] Attach click listener to ES button: on click, if `activeChannel !== 'es'` → `activeChannel = 'es'`, update `aria-pressed` on both buttons, call `renderChannel('es')`
  - [ ] No additional `fetch()` in either handler — data already in `reportData`

- [ ] **Task 6: Unskip Playwright E2E tests** (AC: 14)
  - [ ] Complete the implementation comments in `tests/e2e/report.smoke.spec.js` for the 3 skeleton/populated/toggle tests (see Dev Notes — the test bodies have `// await` comments that need to be uncommented/implemented)
  - [ ] Change `test.skip(` → `test(` for the three 6.1-labelled tests
  - [ ] Run `npx playwright test tests/e2e/report.smoke.spec.js` — all tests must pass (1 DOM smoke + 3 unskipped = 4 total)

- [ ] **Task 7: Run static ATDD tests** (AC: 7, 8)
  - [ ] Run: `node --test tests/epic6-6.1-report-js-fetch-skeleton.atdd.test.js` — all 5 tests must pass
  - [ ] These tests are pre-scaffolded and already exist — they test T-6.1-static.1a, 1b, 2a, 2b, 2c, 2d

---

## Dev Notes

### CRITICAL: Files to create or modify

- **Modify:** `public/js/report.js` (currently a 3-line stub — implement Story 6.1 behaviour only)
- **Modify:** `public/report.html` — add `<script src="/js/report.js"></script>` before `</body>` ONLY (design/layout locked)
- **Modify:** `src/routes/reports.js` — add `generated_at: row.generated_at` to the `GET /api/reports/:report_id` response `data` object (one-line additive change — see API Contract section)
- **Modify:** `tests/e2e/report.smoke.spec.js` — unskip 3 tests + fill in test body assertions, do NOT change test logic for 6.2+ skipped tests
- **Do NOT modify:** any other server files, any other test files, any other HTML pages, `public/index.html`, `public/progress.html`

### Summary Field Name Ambiguity

The `GET /api/reports/:id` response `summary` object uses the field name `in_first` (based on the scoring formula: "Winning (1st place)"). However, the epics-distillate.md AC compressed text uses `winning`. The DB schema and scoring engine (Story 3.4) use:

```
summary per channel: { total, winning, losing, uncontested }
```

The actual field from `computeReport.js` (Story 3.4) is `winning`, not `in_first`. The Playwright fixture in `report.smoke.spec.js` uses `in_first`:

```js
pt: { in_first: 4821, losing: 1340, uncontested: 756 }
```

**Resolution:** Use both keys defensively: `summary.pt.winning ?? summary.pt.in_first`. This handles both the fixture and the real API. The real API returns `winning` per Story 3.4 scoring output. The test fixture uses `in_first`. The defensive fallback covers both cases without changing either.

**Important:** Do NOT modify the E2E fixture in `report.smoke.spec.js` — use the defensive read in `report.js`.

### Existing HTML Structure — Key DOM Elements (from `public/report.html`, locked)

```html
<!-- Header date — update textContent here -->
<span class="text-xs font-medium text-secondary">Relatório gerado em 14 Abril 2026</span>

<!-- PT/ES Toggle container — add role="group" aria-label="Canal" here -->
<div class="flex bg-surface-container p-1 rounded-lg">
  <button class="px-6 py-2 bg-surface-container-lowest text-primary font-bold rounded-md shadow-sm text-sm">PT</button>
  <button class="px-6 py-2 text-on-surface-variant font-medium hover:text-primary transition-colors text-sm">ES</button>
</div>

<!-- Stat cards — update the large number <span> elements -->
<!-- Card 1: Em 1.º lugar -->
<span class="text-6xl font-extrabold text-primary tracking-tighter">4.821</span>
<!-- Card 2: A perder posição -->
<span class="text-6xl font-extrabold text-primary tracking-tighter">1.340</span>
<!-- Card 3: Sem concorrência -->
<span class="text-6xl font-extrabold text-primary tracking-tighter">756</span>

<!-- Opportunities table -->
<section class="mb-20 bg-surface-container-low p-10 rounded-2xl">
  ...
  <table class="w-full text-left border-separate border-spacing-y-3">
    <tbody class="text-sm font-medium">
      <!-- Story 6.1: replace with shimmer rows during skeleton; clear to empty on success -->
      <!-- Story 6.2: populate opportunity rows -->
    </tbody>
  </table>
</section>

<!-- Quick Wins table -->
<section class="mb-20">
  ...
  <table class="w-full text-left border-separate border-spacing-y-2">
    <tbody class="text-sm">
      <!-- Story 6.1: replace with shimmer rows during skeleton; clear to empty on success -->
      <!-- Story 6.2: populate quick-wins rows -->
    </tbody>
  </table>
</section>

<!-- CSV download button — hide during skeleton -->
<button class="flex items-center gap-2 px-6 py-3 border border-outline-variant/30 text-primary font-bold rounded-lg hover:bg-surface-container transition-all">
  <span class="material-symbols-outlined text-lg">download</span>
  Descarregar relatório completo CSV
</button>

<!-- CTA banner — renders immediately, no data dependency -->
<section class="bg-gradient-to-br from-primary to-primary-container ...">
  ...
</section>
```

### DOM Selectors (recommended)

```js
// Header date
const headerDateEl = document.querySelector('header .text-secondary')
// or: document.querySelector('header span.text-xs')

// Toggle container
const toggleContainer = document.querySelector('.flex.bg-surface-container.p-1.rounded-lg')
const ptBtn = toggleContainer.querySelectorAll('button')[0]
const esBtn = toggleContainer.querySelectorAll('button')[1]

// Stat card number spans (three large numbers)
const statNumbers = document.querySelectorAll('.text-6xl.font-extrabold.text-primary')
// statNumbers[0] = Em 1.º lugar, [1] = A perder posição, [2] = Sem concorrência

// Table bodies
const allTbodies = document.querySelectorAll('tbody')
// allTbodies[0] = opportunities tbody, allTbodies[1] = quick wins tbody

// CSV download button
const csvBtn = document.querySelector('button .material-symbols-outlined[data-icon="download"]')?.closest('button')
// Fallback if no data-icon: document.querySelector('section.mb-20 button')  — the QW section button
```

**Alternative approach:** Add `data-*` attributes via `report.js` on init to create stable selectors. Since `report.html` is locked, the script must use class/structural selectors above.

### Skeleton Row Pattern

```js
function makeShimmerRow(cellCount) {
  const tr = document.createElement('tr')
  for (let i = 0; i < cellCount; i++) {
    const td = document.createElement('td')
    td.className = 'px-6 py-6'
    const shimmer = document.createElement('div')
    shimmer.className = 'animate-pulse bg-surface-container rounded h-4 w-full'
    // Note: animate-pulse and bg-surface-container already appear in report.html
    // so Tailwind JIT CDN will not purge them.
    td.appendChild(shimmer)
    tr.appendChild(td)
  }
  return tr
}

function applySkeletonTables() {
  const tbodies = document.querySelectorAll('tbody')
  // Opportunities table: 6 columns (product, my price, 1st price, gap €, gap %, score)
  const oppTbody = tbodies[0]
  oppTbody.innerHTML = ''
  for (let i = 0; i < 4; i++) oppTbody.appendChild(makeShimmerRow(6))

  // Quick Wins table: 6 columns
  const qwTbody = tbodies[1]
  qwTbody.innerHTML = ''
  for (let i = 0; i < 4; i++) qwTbody.appendChild(makeShimmerRow(6))
}
```

### Stat Card Shimmer

```js
function applySkeletonStatCards() {
  const statNums = document.querySelectorAll('.text-6xl.font-extrabold.text-primary')
  statNums.forEach(el => {
    el.textContent = ''
    // Add shimmer classes — these classes already exist in report.html (JIT safe)
    el.classList.add('animate-pulse', 'bg-surface-container', 'rounded')
    el.style.minWidth = '4rem'
    el.style.minHeight = '1.5rem'
    el.style.display = 'inline-block'
  })
}

function removeSkeletonStatCards() {
  const statNums = document.querySelectorAll('.text-6xl.font-extrabold.text-primary')
  statNums.forEach(el => {
    el.classList.remove('animate-pulse', 'bg-surface-container', 'rounded')
    el.style.minWidth = ''
    el.style.minHeight = ''
    el.style.display = ''
  })
}
```

### PT-PT Number Formatting

```js
// Both channels loaded on first fetch — format on render:
const val = (summary?.winning ?? summary?.in_first ?? 0)
statNumbers[0].textContent = Number(val).toLocaleString('pt-PT')
// e.g. 4821 → "4.821"
```

### Date Formatting

```js
function formatPortugueseDate(isoString) {
  // generated_at from API is ISO 8601: "2026-04-14T10:00:00Z"
  const date = new Date(isoString)
  return date.toLocaleDateString('pt-PT', { day: 'numeric', month: 'long', year: 'numeric' })
  // e.g. "14 de abril de 2026"
  // Capitalise month manually if needed: date parts vary by runtime locale
}
```

Note: `toLocaleDateString('pt-PT', ...)` may return lowercase months (`"14 de abril de 2026"`). The design mockup shows `"14 Abril 2026"`. For MVP, lowercase is acceptable; Story 6.6 (accessibility baseline) can refine if needed.

### Toggle Initialisation

```js
function initToggle(data) {
  toggleContainer.setAttribute('role', 'group')
  toggleContainer.setAttribute('aria-label', 'Canal')
  ptBtn.setAttribute('aria-pressed', 'true')
  esBtn.setAttribute('aria-pressed', 'false')

  ptBtn.addEventListener('click', () => {
    if (activeChannel === 'pt') return
    activeChannel = 'pt'
    ptBtn.setAttribute('aria-pressed', 'true')
    esBtn.setAttribute('aria-pressed', 'false')
    renderChannel('pt')
  })

  esBtn.addEventListener('click', () => {
    if (activeChannel === 'es') return
    activeChannel = 'es'
    ptBtn.setAttribute('aria-pressed', 'false')
    esBtn.setAttribute('aria-pressed', 'true')
    renderChannel('es')
  })
}
```

### ES No-Data Edge Case

```js
function renderChannel(channel) {
  const summary = reportData.summary[channel] ?? {}
  const winning = summary.winning ?? summary.in_first ?? 0
  const losing = summary.losing ?? 0
  const uncontested = summary.uncontested ?? 0

  // Stat cards
  statNumbers[0].textContent = Number(winning).toLocaleString('pt-PT')
  statNumbers[1].textContent = Number(losing).toLocaleString('pt-PT')
  statNumbers[2].textContent = Number(uncontested).toLocaleString('pt-PT')

  // Check ES no-data
  const opps = reportData[`opportunities_${channel}`] ?? []
  const qws = reportData[`quickwins_${channel}`] ?? []

  if (channel === 'es' && winning === 0 && losing === 0 && uncontested === 0) {
    const noDataMsg = 'Sem dados para Worten ES — este catálogo não tem ofertas activas neste canal.'
    // Replace both table bodies with no-data message
    const oppTbody = document.querySelectorAll('tbody')[0]
    const qwTbody  = document.querySelectorAll('tbody')[1]
    oppTbody.innerHTML = `<tr><td colspan="6" class="px-6 py-8 text-on-surface-variant text-center">${noDataMsg}</td></tr>`
    qwTbody.innerHTML  = `<tr><td colspan="6" class="px-6 py-8 text-on-surface-variant text-center">${noDataMsg}</td></tr>`
    return
  }

  // Story 6.2 will populate the table rows — for 6.1, just clear the tbody:
  document.querySelectorAll('tbody')[0].innerHTML = ''
  document.querySelectorAll('tbody')[1].innerHTML = ''
  // (Story 6.2 will call a renderOpportunities() + renderQuickWins() function here)
}
```

**Note on innerHTML usage:** The `noDataMsg` string above is author-controlled (hardcoded Portuguese string, not user input). The architecture invariant in `tests/frontend-architecture-invariants.test.js` flags `innerHTML` assignments containing interpolated variables like `reportId`, `jobId`, `phase_message`, etc. The `noDataMsg` variable is not in that list — but to be safe, use `textContent` on a `<td>` element instead of `innerHTML` interpolation.

**Safer pattern for no-data message (to pass the invariant scan):**
```js
const noDataTd = document.createElement('td')
noDataTd.colSpan = 6
noDataTd.className = 'px-6 py-8 text-on-surface-variant text-center'
noDataTd.textContent = 'Sem dados para Worten ES — este catálogo não tem ofertas activas neste canal.'
const noDataRow = document.createElement('tr')
noDataRow.appendChild(noDataTd)
oppTbody.innerHTML = ''
oppTbody.appendChild(noDataRow.cloneNode(true))
qwTbody.innerHTML = ''
qwTbody.appendChild(noDataRow.cloneNode(true))
```

### API Contract — GET /api/reports/:report_id (from Story 4.3)

**IMPORTANT — Route gap identified:** `src/routes/reports.js` currently does NOT include `generated_at` in the `data` response. The `getReport()` query returns `generated_at` (Unix timestamp integer) from the DB, but the route only passes `summary_json`, `opportunities_pt_json`, etc. to the client.

**Story 6.1 must add `generated_at` to the route response** (minor route change — one line in `src/routes/reports.js`):

```js
// In src/routes/reports.js GET /api/reports/:report_id handler, update the return:
return reply.send({
  data: {
    generated_at:     row.generated_at,    // ADD THIS — Unix timestamp (seconds)
    summary:          JSON.parse(row.summary_json),
    opportunities_pt: JSON.parse(row.opportunities_pt_json),
    opportunities_es: JSON.parse(row.opportunities_es_json),
    quickwins_pt:     JSON.parse(row.quickwins_pt_json),
    quickwins_es:     JSON.parse(row.quickwins_es_json),
  },
})
```

`generated_at` in SQLite is stored as an INTEGER (Unix seconds). In `report.js`, convert it:
```js
const dateVal = new Date(generatedAt * 1000)  // multiply by 1000 for milliseconds
```

The Playwright E2E fixture uses `generated_at: '2026-04-14T10:00:00Z'` (ISO string) — update `SAMPLE_REPORT` in `tests/e2e/report.smoke.spec.js` to use a Unix timestamp instead, OR handle both:
```js
const dateVal = typeof generatedAt === 'number'
  ? new Date(generatedAt * 1000)
  : new Date(generatedAt)
```

Full updated contract:

```
GET /api/reports/:report_id
200 OK: {
  data: {
    generated_at: number (Unix timestamp seconds),
    summary: {
      pt: { total: number, winning: number, losing: number, uncontested: number },
      es: { total: number, winning: number, losing: number, uncontested: number }
    },
    opportunities_pt: [ { ean, product_title, shop_sku, my_price, first_price, gap_pct, wow_score } ],
    opportunities_es: [ ... ],
    quickwins_pt: [ ... ],
    quickwins_es: [ ... ]
  }
}
404: { error: "report_not_found", message: "Este relatório expirou ou não existe. Gera um novo relatório para obteres dados actualizados." }
```

**Files to modify for `generated_at`:**
- `src/routes/reports.js` — add `generated_at: row.generated_at` to the response data object
- `tests/e2e/report.smoke.spec.js` — update `SAMPLE_REPORT.generated_at` fixture as needed
- `tests/epic4-4.3-get-api-reports-and-csv.atdd.test.js` — check if `generated_at` being absent was asserted (it wasn't in the original spec, so no breaking change to existing tests)

This is a minor additive change to `src/routes/reports.js` — it does NOT break any existing tests (adding a field to a JSON response is non-breaking). The existing ATDD tests for 4.3 assert presence of `summary`, `opportunities_pt`, etc. but don't forbid additional fields.

### Playwright E2E Test Completion

The 3 skipped 6.1 tests in `tests/e2e/report.smoke.spec.js` have commented-out assertions. Before unskipping, implement the assertions:

**Test 1 — skeleton:**
```js
// Uncomment and adapt:
await expect(page.locator('[data-skeleton]').first()).toBeVisible()
// Or use: await expect(page.locator('.animate-pulse').first()).toBeVisible()
```
The simplest implementation: check that `animate-pulse` class appears on a stat card element during the stalled fetch.

**Test 2 — populated state:**
```js
// Assert PT stat cards populated with pt-PT numbers
// SAMPLE_REPORT uses: pt: { in_first: 4821, losing: 1340, uncontested: 756 }
// report.js reads: summary.winning ?? summary.in_first
// So stat cards show: "4.821", "1.340", "756"
await expect(page.locator('.text-6xl').nth(0)).toHaveText('4.821')
await expect(page.locator('.text-6xl').nth(1)).toHaveText('1.340')
await expect(page.locator('.text-6xl').nth(2)).toHaveText('756')
```

**Test 3 — toggle no re-fetch:**
```js
// After page load with mocked fetch (fetchCount starts at 1)
// Click ES toggle:
await page.getByRole('button', { name: 'ES' }).click()
// Assert fetchCount still 1:
expect(fetchCount).toBe(1)
// Assert ES pill aria-pressed:
await expect(page.getByRole('button', { name: 'ES' })).toHaveAttribute('aria-pressed', 'true')
```

### ESM / Module Notes

`report.html` uses no `type="module"` on existing scripts. Write `report.js` as a plain browser script (no `import`/`export`). Wrapping in an IIFE or `DOMContentLoaded` listener is fine. Do NOT add `type="module"` to the `<script>` tag.

### Scope Boundary for Story 6.1

Story 6.1 covers:
- Fetch, skeleton, instant swap
- Stat cards ("A tua posição agora") — populate with summary data
- PT/ES toggle (ARIA + channel switch)
- ES no-data edge case

**OUT OF SCOPE for Story 6.1 (handled by later stories):**
- Opportunities table rows — Story 6.2 (`renderOpportunities()`)
- Quick Wins table rows — Story 6.2 (`renderQuickWins()`)
- CSV download functionality — Story 6.3
- CTA button URL — Story 6.3 (`CTA_URL` constant already exists in the stub, do not change it)
- Mobile layout — Story 6.4
- Expired/error states (404, 5xx) — Story 6.5
- Full accessibility pass — Story 6.6

For Story 6.1: after clearing the skeleton from tables, leave the tbody empty (or with the no-data message for ES edge case). Stories 6.2+ will add the row rendering.

### Testing Commands

```bash
# DOM smoke test (run first — must stay green):
npx playwright test tests/e2e/report.smoke.spec.js --grep "DOM smoke"

# All report E2E tests (after Story 6.1 implementation):
npx playwright test tests/e2e/report.smoke.spec.js

# Static ATDD for 6.1:
node --test tests/epic6-6.1-report-js-fetch-skeleton.atdd.test.js

# Frontend architecture invariants (must stay green):
node --test tests/frontend-architecture-invariants.test.js

# Full unit/ATDD suite (regression check):
npm test
```

### Architecture Boundary

This story is 100% frontend (`public/js/report.js`). The only backend it calls is `GET /api/reports/:report_id` (already fully implemented, Story 4.3 done). No server-side changes in this story.

### Previous Story Context (Epic 5 done, Epic 4 done)

- Story 5.2 (`done`) established the pattern for `report.js`: plain browser script, no `import`/`export`, injected via `<script>` tag added to HTML before `</body>`.
- Story 4.3 (`done`) implemented `GET /api/reports/:report_id` returning full report JSON; `GET /report/:report_id` returns `public/report.html`.
- The `report_id` appears in the URL path (`/report/abc-123`) — not in query params (unlike `job_id` and `report_id` on the progress page which use `?job_id=...&report_id=...`).
- The current `public/js/report.js` stub (3 lines) already defines `const CTA_URL = 'https://wa.me/351000000000'` — DO NOT change this constant in Story 6.1; Story 6.3 handles the CTA.

### NFR Compliance

- **NFR-P4:** Report page load < 2s — `report.js` issues a single indexed SQLite read (`WHERE report_id = ? AND expires_at > now`); response time is fast. Skeleton pattern ensures UI is immediately visible.
- No server-side performance impact — purely client JS.

### Git Context

- `754e043` — Epic 6 test design: test plan + 6 per-story ATDD static scan files — includes `tests/epic6-6.1-report-js-fetch-skeleton.atdd.test.js` (pre-scaffolded, 5 static tests to run)
- `tests/e2e/report.smoke.spec.js` — scaffolded with 3 Story 6.1 skip tests to unskip
- `public/js/report.js` — 3-line stub (already has `CTA_URL` constant)
- Story 5.2 (`done`) — pattern reference for script-tag injection and plain-script browser style

### References

- [Source: epics-distillate.md §report.js Behaviour] — full interaction spec (lines 160-174)
- [Source: epics-distillate.md §Epic 6 AC 6.1] — compressed acceptance criteria (line 271)
- [Source: architecture-distillate.md §API Routes] — GET /api/reports/:report_id contract
- [Source: 4-3-get-api-reports-and-csv.md] — route implementation reference
- [Source: tests/epic6-6.1-report-js-fetch-skeleton.atdd.test.js] — pre-scaffolded ATDD (5 static tests)
- [Source: tests/e2e/report.smoke.spec.js] — E2E test contract (3 skipped tests to unskip for 6.1)
- [Source: tests/frontend-architecture-invariants.test.js] — cross-cutting architecture invariants (no eval, no server imports, no innerHTML user-value injection, Tailwind JIT, CTA_URL guard)
- [Source: public/report.html] — locked HTML; element structure for DOM targeting
- [Source: public/js/report.js] — current stub (3 lines including CTA_URL); this story starts implementation
- [Source: 5-2-progress-js-progress-bar-copy-redirect.md] — pattern reference for plain-script browser implementation

---

## Dev Agent Record

### Agent Model Used

_To be filled by dev agent_

### Debug Log References

_To be filled by dev agent_

### Completion Notes List

_To be filled by dev agent_

### File List

- `public/js/report.js` — implement Story 6.1 behaviour (fetch, skeleton, stat cards, toggle)
- `public/report.html` — add `<script src="/js/report.js"></script>` before `</body>` (Task 0 only)
- `src/routes/reports.js` — add `generated_at: row.generated_at` to GET /api/reports/:report_id response
- `tests/e2e/report.smoke.spec.js` — unskip 3 Story 6.1 tests + fill in assertions

### Change Log

- 2026-04-21: Story 6.1 spec created — create-story workflow, comprehensive developer guide.
