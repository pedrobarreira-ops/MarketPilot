# Test Plan — Epic 6: Frontend Report Page

**Project:** MarketPilot Free Report
**Author:** Quinn (QA Agent) for Pedro
**Date:** 2026-04-21
**Epic:** 6 — Frontend: Report Page
**Stories:** 6.1 Data Fetch + Skeleton + Your Position + PT/ES Toggle · 6.2 Opportunities + Quick Wins Tables · 6.3 CSV Download + CTA · 6.4 Mobile Layout Verification · 6.5 Expired + Error States · 6.6 Accessibility Baseline

---

## Scope

This test plan covers all acceptance criteria for Epic 6. Tests run in two layers:

1. **Playwright E2E specs** (`tests/e2e/report.smoke.spec.js`) — browser-level behavioural assertions via Playwright. All API calls are mocked via `page.route()`. The static server (`scripts/test-static-server.js`) serves `public/**` only — no DB, no queue, no Redis needed.
2. **Static source scans** — narrow, load-bearing invariants enforced by reading `public/js/report.js` source text to catch security and architecture violations that cannot be exercised through the browser (e.g. confirming `report_id` is extracted from the URL path, confirming `CTA_URL` is not a placeholder, confirming the fetch target is `/api/reports/`).

No live Fastify, Redis, SQLite, or Mirakl API connection is required for any test in this plan. Backend behaviour is already covered by the Epic 4 ATDD suite.

---

## Test Files

| File | Stories Covered | Run command |
|------|----------------|-------------|
| `tests/e2e/report.smoke.spec.js` | 6.1–6.6 (Playwright) | `npm run test:e2e` |
| `tests/epic6-6.1-report-js-fetch-skeleton.atdd.test.js` | 6.1 (static source scans) | `node --test tests/epic6-6.1-report-js-fetch-skeleton.atdd.test.js` |
| `tests/epic6-6.2-opportunities-quickwins-tables.atdd.test.js` | 6.2 (static source scans) | `node --test tests/epic6-6.2-opportunities-quickwins-tables.atdd.test.js` |
| `tests/epic6-6.3-csv-download-and-cta.atdd.test.js` | 6.3 (static source scans) | `node --test tests/epic6-6.3-csv-download-and-cta.atdd.test.js` |
| `tests/epic6-6.4-mobile-layout.atdd.test.js` | 6.4 (static source scans) | `node --test tests/epic6-6.4-mobile-layout.atdd.test.js` |
| `tests/epic6-6.5-expired-and-error-states.atdd.test.js` | 6.5 (static source scans) | `node --test tests/epic6-6.5-expired-and-error-states.atdd.test.js` |
| `tests/epic6-6.6-accessibility-baseline.atdd.test.js` | 6.6 (static source scans) | `node --test tests/epic6-6.6-accessibility-baseline.atdd.test.js` |

Run all Epic 6 tests:

```bash
# Browser tests
npm run test:e2e

# Static source invariant tests
node --test tests/epic6-6.1-report-js-fetch-skeleton.atdd.test.js
node --test tests/epic6-6.2-opportunities-quickwins-tables.atdd.test.js
node --test tests/epic6-6.3-csv-download-and-cta.atdd.test.js
node --test tests/epic6-6.4-mobile-layout.atdd.test.js
node --test tests/epic6-6.5-expired-and-error-states.atdd.test.js
node --test tests/epic6-6.6-accessibility-baseline.atdd.test.js

# Run all unit/ATDD tests together
node --test "tests/**/*.test.js"
```

---

## Story 6.1 — report.js: Data Fetch, Skeleton, Your Position & PT/ES Toggle (`public/js/report.js`)

### Source files

- Implementation: `public/js/report.js`
- HTML: `public/report.html` (must NOT be modified structurally by any 6.x story)
- Test (browser): `tests/e2e/report.smoke.spec.js` (scaffold already exists — unskip relevant tests)
- Test (static): `tests/epic6-6.1-report-js-fetch-skeleton.atdd.test.js` (new)

### Acceptance Criteria Mapping

| AC | Description | Test(s) |
|----|-------------|---------|
| AC-1 | Skeleton shown while fetch in flight: grey shimmer stat cards + 4 table shimmer rows; PT/ES toggle `pointer-events: none` + reduced opacity; CSV link hidden; header date `"—"`; CTA renders immediately | E2E-6.1-1 |
| AC-2 | On fetch success: instant swap (no fade); header date in Portuguese long format (`"14 de Abril de 2026"`); PT channel active by default | E2E-6.1-2, E2E-6.1-3 |
| AC-3 | Both channels loaded into memory on first fetch — no re-fetch on PT/ES toggle | E2E-6.1-4 |
| AC-4 | PT/ES toggle: `role="group"`, `aria-label="Canal"`, `aria-pressed` on each button updated on click; instant, no reload | E2E-6.1-5 |
| AC-5 | No ES data edge case: `"Sem dados para Worten ES — este catálogo não tem ofertas activas neste canal."` per section when `opportunities_es` is empty | E2E-6.1-6 |
| AC-6 | Stat cards render: `"Em 1.º lugar"` (green), `"A perder posição"` (red), `"Sem concorrência"` (blue) with pt-PT locale formatted integers | E2E-6.1-7 |
| AC-7 (static) | `report.js` fetches from `/api/reports/` — not from any other endpoint | T-6.1-static.1 |
| AC-8 (static) | `report_id` extracted from URL **path** (not from query params, not from localStorage) | T-6.1-static.2 |
| AC-9 (DOM smoke) | Report page loads with brand + `h1` containing `/relatório de performance/i` | E2E-6.1-smoke |

### E2E Test Case Detail (`tests/e2e/report.smoke.spec.js` — tests are `test.skip` templates until Story 6.1 ships)

| Test ID | Scenario | Expected |
|---------|----------|----------|
| E2E-6.1-smoke | DOM smoke — page loads | `h1` contains `/relatório de performance/i`; MarketPilot brand visible |
| E2E-6.1-1 | Stall fetch — observe skeleton | Shimmer placeholder(s) visible; toggle interaction disabled (`pointer-events: none` or `aria-disabled`); CSV link hidden; header date element shows `"—"` |
| E2E-6.1-2 | Fetch success with `generated_at: "2026-04-14T10:00:00Z"` | Header date contains `/14.*abril.*2026/i` |
| E2E-6.1-3 | Fetch success | PT tab/pill has `aria-pressed="true"` by default |
| E2E-6.1-4 | Click ES then PT — route called only once | `page.route()` call count === 1 after toggling both ways |
| E2E-6.1-5 | Click ES toggle | ES pill `aria-pressed="true"`, PT pill `aria-pressed="false"` |
| E2E-6.1-6 | Fetch returns empty `opportunities_es` | Text matching `/sem dados para Worten ES/i` visible in ES section |
| E2E-6.1-7 | Fetch `summary.pt.in_first: 4821, losing: 1340, uncontested: 756` | `"4.821"`, `"1.340"`, `"756"` visible (pt-PT dot thousands) |

### Static Source Test Case Detail (`tests/epic6-6.1-report-js-fetch-skeleton.atdd.test.js`)

| Test ID | Invariant | Scan Pattern |
|---------|-----------|-------------|
| T-6.1-static.1 | `report.js` fetch targets `/api/reports/` | Source must contain `/api/reports/` as a string literal — must NOT fetch from a different path |
| T-6.1-static.2 | `report_id` read from URL **path** — not from query params or storage | Source must NOT contain `URLSearchParams` **OR** must not use it to read `report_id`; must NOT reference `localStorage` or `sessionStorage` for `report_id`; source must extract ID via `window.location.pathname` or equivalent path-parsing |

---

## Story 6.2 — Opportunities & Quick Wins Tables (`public/js/report.js`)

### Source files

- Implementation: `public/js/report.js` (extension — same file, unskip templates)
- Test (browser): `tests/e2e/report.smoke.spec.js` (unskip 6.2 templates)
- Test (static): `tests/epic6-6.2-opportunities-quickwins-tables.atdd.test.js` (new)

### Acceptance Criteria Mapping

| AC | Description | Test(s) |
|----|-------------|---------|
| AC-1 | Opportunities table: rows pre-sorted by WOW DESC (no client re-sort); first row `#EFF6FF` tint | E2E-6.2-1, E2E-6.2-2 |
| AC-2 | Price format `"€799,00"` (comma decimal, dot thousands) | E2E-6.2-3 |
| AC-3 | Gap € shown as `"−€6,50"` in red `#DC2626`; gap % as red pill badge | E2E-6.2-4 |
| AC-4 | WOW score column: right-aligned number | E2E-6.2-5 |
| AC-5 | Opportunities empty state: `"Estás em 1.º lugar em todos os produtos neste canal."` | E2E-6.2-6 |
| AC-6 | Quick Wins table: no first-row highlight; score column = short horizontal navy bar (relative width) | E2E-6.2-7, E2E-6.2-8 |
| AC-7 | Quick Wins empty state: `"Não há vitórias rápidas disponíveis neste canal."` | E2E-6.2-9 |
| AC-8 (static) | `report.js` renders WOW score as a formatted number — not as a raw unformatted value or percentage | T-6.2-static.1 |

### E2E Test Case Detail

| Test ID | Scenario | Expected |
|---------|----------|----------|
| E2E-6.2-1 | 2-row opportunities fixture (pre-sorted by wow_score DESC) | Rows appear in order; no client-side sort logic needed |
| E2E-6.2-2 | 2-row opportunities fixture | First row has background tint matching `#EFF6FF` or a class that maps to it |
| E2E-6.2-3 | Opportunity with `my_price: 799` | Cell contains text matching `expectPortuguesePrice(locator, 799)` — i.e. `"€\u00a0799,00"` or `"799,00\u00a0€"` |
| E2E-6.2-4 | Opportunity with `gap_eur: -6.50` | Gap cell text contains `"−€6,50"` or matches `/[-−].*6,50/`; cell or parent has red colour (`#DC2626` or red Tailwind class) |
| E2E-6.2-5 | Opportunity with `wow_score: 974` | Cell containing `974` is right-aligned (CSS `text-align: right` or Tailwind `text-right`) |
| E2E-6.2-6 | Empty `opportunities_pt` | Text matching `/estás em 1\.º lugar em todos/i` visible |
| E2E-6.2-7 | Quick wins fixture — 2 rows | Score cell does NOT show raw number; instead contains a `<div>` or `<span>` acting as a bar element |
| E2E-6.2-8 | Quick wins — 2 rows with different scores | First row bar wider than second row bar (relative-width assertion) |
| E2E-6.2-9 | Empty `quickwins_pt` | Text matching `/não há vitórias rápidas/i` visible |

### Static Source Test Case Detail (`tests/epic6-6.2-opportunities-quickwins-tables.atdd.test.js`)

| Test ID | Invariant | Scan Pattern |
|---------|-----------|-------------|
| T-6.2-static.1 | WOW scores rendered as formatted numbers | Source must contain formatting logic for numeric values (e.g. `toLocaleString` or `Intl.NumberFormat` calls near `wow_score` context) — confirms scores are not injected raw/unformatted |

---

## Story 6.3 — CSV Download & CTA (`public/js/report.js`)

### Source files

- Implementation: `public/js/report.js` (extension — same file, unskip templates)
- Test (browser): `tests/e2e/report.smoke.spec.js` (unskip 6.3 templates)
- Test (static): `tests/epic6-6.3-csv-download-and-cta.atdd.test.js` (new)

### Acceptance Criteria Mapping

| AC | Description | Test(s) |
|----|-------------|---------|
| AC-1 | CSV link requests `GET /api/reports/{report_id}/csv`; filename `marketpilot-report-{first-8-chars}.csv` | E2E-6.3-1, T-6.3-static.1 |
| AC-2 | CSV link hidden during skeleton; visible after data loads | E2E-6.3-2 |
| AC-3 | Latency > 1s: show `"A preparar..."` text | E2E-6.3-3 |
| AC-4 | `const CTA_URL` at top of `report.js` (not in HTML); `target="_blank"` + `rel="noopener noreferrer"` | E2E-6.3-4, T-6.3-static.2 |
| AC-5 (static) | `CTA_URL` constant present at top of `report.js` (not embedded in HTML) | T-6.3-static.2 |
| AC-6 (static) | `CTA_URL` does not contain placeholder values (`TODO`, `PLACEHOLDER`, `example.com`, `localhost`) | T-6.3-static.3 (also enforced by `frontend-architecture-invariants.test.js`) |

### E2E Test Case Detail

| Test ID | Scenario | Expected |
|---------|----------|----------|
| E2E-6.3-1 | Fetch success — CSV link visible | Link `href` contains `/api/reports/${SAMPLE_ID}/csv`; link `download` attribute or triggered filename includes `marketpilot-report-` followed by 8 chars of the report ID |
| E2E-6.3-2 | Stall fetch — observe skeleton | CSV link element not visible (hidden or not rendered) |
| E2E-6.3-3 | Trigger CSV download; stall route >1s | Text matching `/a preparar/i` appears on page |
| E2E-6.3-4 | Page loads with data | CTA anchor has `target="_blank"` and `rel` containing `noopener noreferrer` |

### Static Source Test Case Detail (`tests/epic6-6.3-csv-download-and-cta.atdd.test.js`)

| Test ID | Invariant | Scan Pattern |
|---------|-----------|-------------|
| T-6.3-static.1 | CSV URL constructed as `/api/reports/<id>/csv` | Source contains `/csv` string in a URL construction context; must NOT hardcode a report ID |
| T-6.3-static.2 | `CTA_URL` declared as a `const` | Source contains `const CTA_URL` declaration — not set via HTML data attribute or `window` global |
| T-6.3-static.3 | `CTA_URL` not a placeholder | Pattern: `CTA_URL` value must NOT match `/\b(TODO|PLACEHOLDER|example\.com|localhost|your[-_]?domain|fixme)\b/i` — already in `frontend-architecture-invariants.test.js` section 5, but verified here as a story-specific assertion |

---

## Story 6.4 — Mobile Layout Verification (`public/js/report.js`, `public/report.html`)

### Source files

- Implementation: responsive CSS classes already in `report.html` (Tailwind `sm:` / `lg:` variants); `report.js` may set touch-specific behaviour
- Test (browser): `tests/e2e/report.smoke.spec.js` (unskip 6.4 templates with viewport overrides)
- Test (static): `tests/epic6-6.4-mobile-layout.atdd.test.js` (new)

### Acceptance Criteria Mapping

| AC | Description | Test(s) |
|----|-------------|---------|
| AC-1 | Mobile (<640px): stat cards stack vertically (`flex-direction: column` or Tailwind `sm:` grid) | E2E-6.4-1 |
| AC-2 | Mobile: tables have `overflow-x: auto` or equivalent; `"← desliza para ver mais →"` hint visible below each table | E2E-6.4-2, E2E-6.4-3 |
| AC-3 | Mobile: row font size ≥ 14px | E2E-6.4-4 |
| AC-4 | Desktop (≥1024px): no horizontal scroll on stat-cards or tables; PT/ES toggle always shows two pills (never collapses) | E2E-6.4-5, E2E-6.4-6 |
| AC-5 (static) | `report.html` uses `sm:` or responsive Tailwind breakpoint classes for stat cards and tables | T-6.4-static.1 |

### E2E Test Case Detail

| Test ID | Scenario | Expected |
|---------|----------|----------|
| E2E-6.4-1 | `page.setViewportSize({ width: 375, height: 812 })` then fetch success | Stat card containers render in a vertically-stacked layout (computed `flex-direction === "column"` or `grid` single-column) |
| E2E-6.4-2 | Mobile viewport; fetch success | Table wrapper has `overflow-x: auto` in computed style |
| E2E-6.4-3 | Mobile viewport; fetch success | Text matching `/← desliza para ver mais →/i` visible below table |
| E2E-6.4-4 | Mobile viewport; fetch success with at least 1 opportunity row | Row cells have computed `font-size` ≥ 14px |
| E2E-6.4-5 | `page.setViewportSize({ width: 1280, height: 900 })` | No horizontal scroll (`document.documentElement.scrollWidth <= window.innerWidth`) |
| E2E-6.4-6 | Desktop viewport; fetch success | Both PT and ES toggle pills visible; neither collapsed into a dropdown or hidden |

### Static Source Test Case Detail (`tests/epic6-6.4-mobile-layout.atdd.test.js`)

| Test ID | Invariant | Scan Pattern |
|---------|-----------|-------------|
| T-6.4-static.1 | `report.html` uses responsive Tailwind breakpoints | `public/report.html` source must contain `sm:` or `lg:` Tailwind class prefix — confirms responsive classes were applied, not just inline styles |

---

## Story 6.5 — Expired Report & Fetch Error States (`public/js/report.js`)

### Source files

- Implementation: `public/js/report.js` (extension — same file, unskip templates)
- Test (browser): `tests/e2e/report.smoke.spec.js` (unskip 6.5 templates)
- Test (static): `tests/epic6-6.5-expired-and-error-states.atdd.test.js` (new)

### Acceptance Criteria Mapping

| AC | Description | Test(s) |
|----|-------------|---------|
| AC-1 | 404 response: expiry card — clock icon, `"Este relatório já não está disponível"`, 48h TTL explanation, `"Gerar um novo relatório →"` button → `/`; header + CTA remain visible | E2E-6.5-1, E2E-6.5-2 |
| AC-2 | 5xx / network error: `"Não foi possível carregar o relatório"`, `"Recarregar"` button (`window.location.reload()`), `"Contacta-nos"` link; header + CTA remain visible | E2E-6.5-3, E2E-6.5-4 |
| AC-3 (static) | Error/expiry UI shown by `report.js`, not by inline HTML default content | T-6.5-static.1 |

### E2E Test Case Detail

| Test ID | Scenario | Expected |
|---------|----------|----------|
| E2E-6.5-1 | Route returns 404 | Text matching `/este relatório já não está disponível/i` visible; button matching `/gerar.*novo relatório/i` visible with `href="/"` |
| E2E-6.5-2 | Route returns 404 | Header (MarketPilot brand) visible; CTA banner visible |
| E2E-6.5-3 | Route returns 500 | Text matching `/não foi possível carregar o relatório/i` visible; `"Recarregar"` button visible |
| E2E-6.5-4 | Route aborted (network error) | Same `/não foi possível carregar/i` text visible; `"Contacta-nos"` link visible |
| E2E-6.5-5 | Route returns 500 | Header visible; CTA banner visible |

### Static Source Test Case Detail (`tests/epic6-6.5-expired-and-error-states.atdd.test.js`)

| Test ID | Invariant | Scan Pattern |
|---------|-----------|-------------|
| T-6.5-static.1 | `report.js` handles non-200 responses explicitly | Source must contain a conditional on HTTP response status (e.g. `response.ok`, `response.status`, `status === 404`) and must contain the Portuguese error copy strings (`"Este relatório já não está disponível"` or close match, and `"Não foi possível carregar"` or close match) — confirms errors are handled in JS, not by the HTML stub alone |

---

## Story 6.6 — Accessibility Baseline (`public/js/report.js`)

### Source files

- Implementation: `public/js/report.js` (extension — sets ARIA attributes dynamically)
- Test (browser): `tests/e2e/report.smoke.spec.js` (unskip 6.6 templates)
- Test (static): `tests/epic6-6.6-accessibility-baseline.atdd.test.js` (new)

### Acceptance Criteria Mapping

| AC | Description | Test(s) |
|----|-------------|---------|
| AC-1 | PT/ES toggle: `role="group"`, `aria-label="Canal"` on container; `aria-pressed` on each pill — updated on click | E2E-6.6-1, E2E-6.6-2 |
| AC-2 | Colour is not the sole differentiator for stat card status (green/red/blue categories have accompanying text or icon) | E2E-6.6-3 |
| AC-3 | Report page works with keyboard navigation: toggle pills focusable and activatable via Enter/Space | E2E-6.6-4 |
| AC-4 (static) | `report.js` sets `role="group"` and `aria-label` on the channel toggle container | T-6.6-static.1 |
| AC-5 (static) | `report.js` sets `aria-pressed` on toggle pill buttons | T-6.6-static.2 |

### E2E Test Case Detail

| Test ID | Scenario | Expected |
|---------|----------|----------|
| E2E-6.6-1 | Fetch success | Toggle container has `role="group"` and `aria-label` matching `/canal/i` |
| E2E-6.6-2 | Click ES toggle | ES pill `aria-pressed="true"`; PT pill `aria-pressed="false"` |
| E2E-6.6-3 | Fetch success | Each stat card contains visible text label in addition to colour (e.g. `"Em 1.º lugar"` alongside green colouring) |
| E2E-6.6-4 | Press Tab to focus ES pill, then press Enter | ES tab becomes active (aria-pressed="true"); same as click behaviour |

### Static Source Test Case Detail (`tests/epic6-6.6-accessibility-baseline.atdd.test.js`)

| Test ID | Invariant | Scan Pattern |
|---------|-----------|-------------|
| T-6.6-static.1 | Toggle container has `role="group"` + `aria-label="Canal"` set by JS | Source contains both `role` set to `"group"` AND `aria-label` with value `"Canal"` |
| T-6.6-static.2 | Toggle pill buttons have `aria-pressed` set | Source contains `setAttribute('aria-pressed'` or `ariaPressed` assignment at least twice (once per pill), OR a loop that sets it |

---

## Security Invariants (Cross-Cutting)

| Invariant | Verified in |
|-----------|-------------|
| `api_key` never stored or referenced client-side in `report.js` | `frontend-architecture-invariants.test.js` (no-localStorage scan) |
| `report_id` extracted from URL path only — no query param or localStorage | Story 6.1 static scan T-6.1-static.2 |
| No `innerHTML` interpolation of server-returned `report_id`, `product_title`, `phase_message` | `frontend-architecture-invariants.test.js` section 3 (innerHTML injection guard) |
| `CTA_URL` not a placeholder (no TODO/PLACEHOLDER/example.com) | Story 6.3 static scan T-6.3-static.3 + `frontend-architecture-invariants.test.js` section 5 |
| No `eval()` or `document.write()` | `frontend-architecture-invariants.test.js` section 1 |
| No imports from `src/` or Node core modules | `frontend-architecture-invariants.test.js` section 2 |

---

## NFR Coverage

| NFR | Story | Test |
|-----|-------|------|
| NFR-P4: report page load < 2s | 6.1 | E2E-6.1-2 verifies populated state renders within Playwright's default timeout (30s); actual latency NFR enforced by mock routing — real latency measured during smoke test against staging |
| NFR-P5: CSV download initiation < 3s | 6.3 | E2E-6.3-3 asserts "A preparar..." shown when latency > 1s; the 3s budget is covered by the Epic 4 AC-5 server-side test |
| NFR-R4: expired URL → 404 on 100% of requests | 6.5 | E2E-6.5-1 asserts expiry card shown on 404; backend enforcement already in Epic 4 suite |
| Portuguese locale formatting throughout | 6.1, 6.2 | E2E-6.1-7 (integers), E2E-6.2-3 (prices) — use `expectPortuguesePrice` + `expectPortugueseInteger` helpers from `tests/e2e/test-helpers.js` |

---

## Playwright Infrastructure

### Run commands

```bash
# Headless (CI-equivalent)
npm run test:e2e

# Watch mode (writing new tests)
npm run test:e2e:headed

# Interactive Playwright UI
npm run test:e2e:ui
```

### Static server

`scripts/test-static-server.js` — Fastify + `@fastify/static`, serves `public/**` on `http://127.0.0.1:3001`. No DB migrations, no Redis, no worker. Auto-started by `playwright.config.js` `webServer` config.

### Key patterns (see `tests/e2e/README.md` for full rules)

- All API calls mocked via `page.route('**/api/...')` — never hit real Fastify routes
- Selectors: role/label/text/id preferred over CSS utility classes
- Viewport overrides for mobile tests: `await page.setViewportSize({ width: 375, height: 812 })`
- Timing: `expect.poll` / `toPass` preferred over `waitForTimeout`
- Portuguese copy matched case-insensitively with regex
- Use `expectPortuguesePrice` / `expectPortugueseInteger` / `expectPortugueseDate` from `tests/e2e/test-helpers.js`

### Stall pattern (skeleton tests)

To observe skeleton state, stall the API route:

```js
let resolveFetch
const gate = new Promise(r => { resolveFetch = r })
await page.route(`**/api/reports/${SAMPLE_ID}`, (route) => {
  gate.then(() => route.fulfill({ status: 200, body: JSON.stringify({ data: SAMPLE_REPORT }) }))
})
await page.goto(`/report/${SAMPLE_ID}`)
// ... assert skeleton state here ...
resolveFetch()
```

---

## Pass Criteria

A story may be marked `done` in `sprint-status.yaml` when:

1. All corresponding `test.skip` templates in `tests/e2e/report.smoke.spec.js` for that story have been unskipped and pass (`npm run test:e2e` green).
2. The new static source ATDD file for the story (`tests/epic6-6.N-*.atdd.test.js`) passes (`node --test` zero failures).
3. The DOM smoke test (already passing today) continues to pass after the JS ships.
4. `npm test` (full unit/ATDD suite) remains green — no regressions.
5. `tests/frontend-architecture-invariants.test.js` passes — all architecture invariants remain intact.

---

## Implementation Notes for Dev

- `public/report.html` must NOT be modified structurally — it is a committed Stitch mockup. `report.js` wires behaviour to the existing DOM.
- `public/js/report.js` starts as an empty stub; Stories 6.1–6.6 fill it in incrementally.
- `report_id` is extracted from the URL **path** (`window.location.pathname`), not from query params. The route is `GET /report/:report_id` — the ID is the last path segment.
- Both PT and ES data are fetched in a single `GET /api/reports/:report_id` call and held in memory; no re-fetch on toggle.
- `const CTA_URL = '...'` must appear at the **top** of `report.js` (before any function definitions), not in `report.html`.
- The `tests/e2e/report.smoke.spec.js` scaffold already exists — the dev agent only needs to unskip and implement the behavioural templates per story.
- New static ATDD files must be created by the dev agent at the start of each story (red-phase markers run until implementation ships, then go green).
- Tailwind dynamic classes added via `classList.add()` in `report.js` must have a static HTML reference in `public/report.html` OR a sibling `element.style.*` fallback — enforced by `frontend-architecture-invariants.test.js` section 4.
