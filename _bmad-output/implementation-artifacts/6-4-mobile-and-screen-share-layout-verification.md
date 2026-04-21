# Story 6.4: report.html — Mobile & Screen-Share Layout Verification

This story does NOT call Mirakl endpoints directly. No Mirakl MCP check required.

**Epic:** 6 — Frontend Report Page
**Story:** 6.4
**Story Key:** 6-4-mobile-and-screen-share-layout-verification
**Status:** ready-for-dev
**Date Created:** 2026-04-21

---

## User Story

As a Worten marketplace seller viewing my MarketPilot report on a mobile device or during a screen-share,
I want the report page to render correctly at all viewport sizes,
So that I can share my performance data with colleagues and access it on the go without horizontal overflow or illegible text.

**Satisfies:** Epic 6.4 AC (epics-distillate.md:274) — Mobile (<640px): stat cards stack vertically; tables `overflow-x: auto`; `"← desliza para ver mais →"` hint; font ≥ 14px; Desktop (≥1024px): no horizontal scroll, PT/ES always 2 pills.

---

## Acceptance Criteria

**AC-1: Mobile stat cards stack vertically (<640px)**
- At viewport width < 640px, the three stat cards render in a single column (vertically stacked), NOT in a side-by-side grid
- The stat card container (`div.grid`) uses `grid-cols-1` by default and `md:grid-cols-3` for wider viewports — this is already in `report.html` (line: `<div class="grid grid-cols-1 md:grid-cols-3 gap-8">`)
- No `report.js` change needed for this AC — it is purely structural HTML (already present)
- E2E test: `page.setViewportSize({ width: 375, height: 812 })` → stat card container computed `grid-template-columns` resolves to a single column

**AC-2: Mobile tables have horizontal scroll + "desliza" hint**
- Both tables (`Maiores oportunidades` and `Vitórias rápidas`) are wrapped in `<div class="overflow-x-auto">` — this is already in `report.html`
- Below each table wrapper, `report.js` must inject a hint element: `"← desliza para ver mais →"` visible only on mobile (<640px)
- CRITICAL — Tailwind JIT rule: do NOT use `md:hidden` class on the injected element (CDN JIT purges dynamic classes). Use `element.style.display` toggled by `window.matchMedia('(max-width: 639px)')` listener instead
- Implementation: inject `<p>` with inline style `display:''` when `(max-width: 639px)` matches, `display:'none'` otherwise; register `matchMedia.addEventListener('change', ...)` to toggle on viewport resize
- The hint must be injected once at page init (not conditionally on data fetch) — it is structural, not data-dependent

**AC-3: Mobile table row font size ≥ 14px**
- All `<td>` cells in both tables must have computed `font-size` ≥ 14px at mobile viewport
- The tables use `text-sm` Tailwind class on `<tbody>` — `text-sm` = 14px in Tailwind. This is already present in `report.html`
- No JS change needed — this is static HTML. E2E test verifies the computed style.

**AC-4: Desktop no horizontal scroll (≥1024px)**
- At viewport width ≥ 1024px, `document.documentElement.scrollWidth` must be ≤ `window.innerWidth` (no horizontal overflow)
- No JS change needed — this is verified purely by the E2E test against the existing HTML

**AC-5: Desktop PT/ES toggle always shows two pills**
- At viewport width ≥ 1024px, both PT and ES toggle buttons are visible — neither hidden, collapsed, nor replaced by a dropdown
- The toggle is in `report.html` as two `<button>` elements inside `.flex.bg-surface-container.p-1.rounded-lg` — always visible at all viewports
- No JS change needed — E2E test verifies both pills visible on desktop

**AC-6 (static): report.html uses responsive Tailwind breakpoints — verified by ATDD**
- The ATDD test `tests/epic6-6.4-mobile-layout.atdd.test.js` (T-6.4-static.1) must pass — already scaffolded and currently passing
- This test verifies that `public/report.html` contains `sm:`, `md:`, or `lg:` Tailwind breakpoint classes
- This test also verifies `overflow-x-auto` or `lg:` classes are present for table scrolling
- Story 6.4 must NOT remove any existing responsive classes from `report.html`

**AC-7: Unskip Playwright E2E test for Story 6.4**
- In `tests/e2e/report.smoke.spec.js`, change `test.skip(` → `test(` for the 6.4-labelled skipped test:
  `'6.4 — mobile viewport: stat cards stack vertically; tables have horizontal scroll hint'`
- Implement the full assertion body (see Dev Notes for exact implementation)
- The unskipped test must pass
- All existing passing tests must remain passing

---

## Tasks / Subtasks

- [ ] **Task 1: Inject "desliza" scroll hint via report.js** (AC: 2)
  - [ ] In `report.js`, after the IIFE's initial DOM setup (not inside the fetch callback), find the two `div.overflow-x-auto` wrappers
  - [ ] For each `overflow-x-auto` div, create and append a hint `<p>` element
  - [ ] Use `matchMedia('(max-width: 639px)')` to control visibility (show on mobile, hide on desktop)
  - [ ] Register the `matchMedia` listener so hint toggles if viewport is resized (Playwright resizes viewport in tests)

- [ ] **Task 2: Unskip and implement Playwright E2E test** (AC: 7)
  - [ ] In `tests/e2e/report.smoke.spec.js`, change `test.skip(` → `test(` for the 6.4 test
  - [ ] Implement assertions: mobile viewport stack, overflow-x-auto on table wrapper, "desliza" hint visible, font-size ≥ 14px, desktop no scroll, both pills visible
  - [ ] All tests pass: `npx playwright test tests/e2e/report.smoke.spec.js`

- [ ] **Task 3: Verify ATDD static tests still pass** (AC: 6)
  - [ ] Run `node --test tests/epic6-6.4-mobile-layout.atdd.test.js` — must be 4 pass / 0 fail
  - [ ] Run `node --test tests/frontend-architecture-invariants.test.js` — must stay green

---

## Dev Notes

### CRITICAL: Files to Modify

- **Modify:** `public/js/report.js` — inject "desliza para ver mais →" hint elements + matchMedia listener
- **Modify:** `tests/e2e/report.smoke.spec.js` — unskip 6.4 test + implement assertions
- **Do NOT modify:** `public/report.html` (locked after Story 6.1 added the `<script>` tag; responsive classes already exist)
- **Do NOT modify:** `tests/epic6-6.4-mobile-layout.atdd.test.js` (already passing — do not break it)
- **Do NOT modify:** Any server files, any other HTML pages, any backend code

### What Already Exists in report.html (Do NOT Reinvent)

The Stitch-generated `report.html` already has all structural responsive classes:

1. **Stat cards grid:** `<div class="grid grid-cols-1 md:grid-cols-3 gap-8">` — single column on mobile, 3 columns on md+ ✅
2. **Opportunities table wrapper:** `<div class="overflow-x-auto">` — scrollable on narrow viewports ✅
3. **Quick Wins table wrapper:** `<div class="overflow-x-auto">` — scrollable on narrow viewports ✅
4. **PT/ES toggle:** Two `<button>` elements always rendered — no collapse at any viewport ✅
5. **Table body classes:** `<tbody class="text-sm ...">` — `text-sm` = 14px in Tailwind ✅
6. **Tailwind CDN with JIT:** Loaded via `<script src="https://cdn.tailwindcss.com?plugins=forms,container-queries">` ✅

The ATDD tests `T-6.4-static.1` (both subtests) are ALREADY PASSING since the Stitch HTML was committed. Story 6.4's only code change is the "desliza" hint injection in `report.js`.

### "Desliza" Hint Implementation Pattern

```js
// Inject "desliza para ver mais →" hint below each overflow-x-auto table wrapper
// Place this in the IIFE's init section (not inside the fetch callback)
// AVOIDS Tailwind JIT purge by using matchMedia + inline style instead of md:hidden

function createScrollHint () {
  const p = document.createElement('p')
  p.textContent = '← desliza para ver mais →'
  p.style.cssText = 'text-align:center;font-size:0.75rem;color:#444650;margin-top:0.5rem;'
  return p
}

function applyScrollHintVisibility (hint, mq) {
  hint.style.display = mq.matches ? '' : 'none'
}

const tableWrappers = document.querySelectorAll('div.overflow-x-auto')
const mq = window.matchMedia('(max-width: 639px)')

tableWrappers.forEach(function (wrapper) {
  const hint = createScrollHint()
  applyScrollHintVisibility(hint, mq)
  wrapper.parentNode.insertBefore(hint, wrapper.nextSibling)
  mq.addEventListener('change', function () {
    applyScrollHintVisibility(hint, mq)
  })
})
```

**Why this pattern:**
- No `md:hidden` dynamic class added via `classList.add()` — avoids Tailwind JIT CDN purge (memory rule: `feedback_tailwind_dynamic_classes.md`)
- `matchMedia` listener ensures the hint shows/hides correctly when Playwright resizes viewport in tests
- Runs unconditionally at init — does not depend on data fetch (hint is structural, not data)
- `color:#444650` = `text-on-surface-variant` in the design system color palette (matches static CSS in report.html)

### Playwright E2E Test — Implementation Detail

The single 6.4 test in `report.smoke.spec.js` currently reads:

```js
test.skip('6.4 — mobile viewport: stat cards stack vertically; tables have horizontal scroll hint', async ({ page }) => {
  // Use a mobile viewport: await page.setViewportSize({ width: 375, height: 812 })
  // Assert stat cards in column (flex-direction), tables have overflow-x: auto
})
```

Implement it as:

```js
test('6.4 — mobile viewport: stat cards stack vertically; tables have horizontal scroll hint', async ({ page }) => {
  await page.route(`**/api/reports/${SAMPLE_ID}`, (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ data: SAMPLE_REPORT }),
  }))

  // Set mobile viewport BEFORE navigation so matchMedia fires correctly on init
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto(`/report/${SAMPLE_ID}`)

  // Wait for data to load
  await expect(page.locator('.text-6xl').nth(0)).toHaveText('4.821')

  // AC-1: Stat cards grid is single-column on mobile
  const statGrid = page.locator('.grid.grid-cols-1')
  await expect(statGrid).toBeVisible()
  const gridStyle = await statGrid.evaluate((el) =>
    window.getComputedStyle(el).gridTemplateColumns
  )
  // Single column: gridTemplateColumns should be a single track value
  expect(gridStyle.split(' ').length).toBe(1)

  // AC-2: Tables have overflow-x:auto
  const tableWrapper = page.locator('div.overflow-x-auto').first()
  await expect(tableWrapper).toBeVisible()
  const overflow = await tableWrapper.evaluate((el) =>
    window.getComputedStyle(el).overflowX
  )
  expect(overflow).toBe('auto')

  // AC-2: "desliza" hint visible on mobile
  await expect(page.getByText(/← desliza para ver mais →/).first()).toBeVisible()

  // AC-3: Table row font size >= 14px
  const firstTd = page.locator('tbody').first().locator('td').first()
  const fontSize = await firstTd.evaluate((el) =>
    parseFloat(window.getComputedStyle(el).fontSize)
  )
  expect(fontSize).toBeGreaterThanOrEqual(14)

  // AC-4 & AC-5: Desktop checks (resize viewport)
  await page.setViewportSize({ width: 1280, height: 900 })

  // AC-4: No horizontal scroll on desktop
  const hasHorizontalScroll = await page.evaluate(() =>
    document.documentElement.scrollWidth > window.innerWidth
  )
  expect(hasHorizontalScroll).toBe(false)

  // AC-5: Both PT and ES toggle pills visible on desktop
  await expect(page.getByRole('button', { name: 'PT', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'ES', exact: true })).toBeVisible()

  // AC-2: hint hidden on desktop (matchMedia change event fired)
  await expect(page.getByText(/← desliza para ver mais →/).first()).not.toBeVisible()
})
```

**Critical Playwright notes:**
- Set viewport BEFORE `page.goto()` so the `matchMedia` query reflects the correct size at JS init time
- After `setViewportSize()` mid-test, Playwright fires `resize`/`change` events — the `matchMedia` listener will toggle the hint visibility
- `page.getByText` uses CSS visibility — a `display:none` element correctly fails `toBeVisible()`

### ATDD Tests — Already Passing (Do Not Break)

The static source ATDD tests are already green. Run to confirm before and after:

```bash
# Story 6.4 ATDD (static scan):
node --test tests/epic6-6.4-mobile-layout.atdd.test.js
# Expected: 4 pass / 0 fail (T-6.4-static.1 × 2 + layout invariant × 2)

# Frontend architecture invariants (must stay green):
node --test tests/frontend-architecture-invariants.test.js

# All E2E tests:
npx playwright test tests/e2e/report.smoke.spec.js

# Full unit/ATDD suite:
npm test
```

### Tailwind Dynamic Class Rule (Critical)

**Memory rule:** `feedback_tailwind_dynamic_classes.md` — JS-string-literal classes need static HTML reference or inline style fallback (CDN JIT purges).

This story injects elements via `report.js`. The hint paragraph uses ONLY inline styles — no dynamic Tailwind class is added via `classList.add()`. This is safe.

**Do NOT** do: `hint.classList.add('md:hidden')` — the CDN JIT will purge `md:hidden` since it doesn't appear in the static HTML.

**Do**: use `element.style.display = ...` toggled by `matchMedia` listener.

### Scope Boundary for Story 6.4

**IN SCOPE:**
- "Desliza para ver mais →" hint injection via `report.js` + `matchMedia` listener
- Unskipping and implementing the single 6.4 E2E Playwright test

**OUT OF SCOPE (already done by prior stories):**
- Stat card grid columns — handled by `grid-cols-1 md:grid-cols-3` in `report.html` (Story 1.1 scaffold)
- Table `overflow-x-auto` — already in `report.html` (Story 1.1 scaffold)
- Font sizes — `text-sm` on `<tbody>` already in `report.html`
- PT/ES toggle visibility — always two buttons, always visible (Story 6.1 wired them)
- Accessibility pass (ARIA) — Story 6.6
- Error / expiry states — Story 6.5 (done)

### ESM / Module Notes

- `report.js` is a plain browser IIFE — NO `import`/`export`, NO `type="module"` on the `<script>` tag
- Same pattern established by Stories 6.1–6.3. Do NOT add module syntax.

### No Mirakl Endpoint Touch

Story 6.4 is 100% frontend layout verification. No backend changes. No Mirakl MCP verification required.

### Previous Story Context

- Story 6.1 (`done`): established `report.js` IIFE pattern; `CTA_URL` const; `csvBtn` selector; `applySkeleton()`/`removeSkeletonState()`; toggle ARIA; stat card rendering.
- Story 6.2 (`done`): added `renderOpportunities()` and `renderQuickWins()` — populates both `<tbody>` elements. Story 6.4 must NOT re-render or overwrite table rows.
- Story 6.3 (`done`): added CSV download handler + CTA button wiring. Story 6.4 must NOT touch `getCsvDownloadUrl()`, `downloadCsv()`, or CTA handler.
- Story 6.5 (`done`): added error/expiry state rendering in `report.js`. Story 6.4 must NOT touch error/expiry code.
- Stories 6.2, 6.3, 6.5 all merged — no merge conflict risk for Story 6.4 since the hint injection is a new code block that does not overlap with any of their additions.

### NFR Compliance

- **NFR-P4:** report page load < 2s — the hint injection is synchronous DOM manipulation at init, adds no network calls, negligible performance impact.

### References

- [Source: epics-distillate.md §Epic 6 AC 6.4, line 274] — compressed AC
- [Source: epics-distillate.md §report.js Behaviour, Mobile section] — mobile layout requirements
- [Source: test-plan-epic-6-frontend-report-page.md §Story 6.4] — E2E and static test spec (E2E-6.4-1 through E2E-6.4-6, T-6.4-static.1)
- [Source: tests/epic6-6.4-mobile-layout.atdd.test.js] — pre-scaffolded ATDD (4 static tests, already passing)
- [Source: tests/e2e/report.smoke.spec.js] — E2E test contract (1 skipped test to unskip for 6.4)
- [Source: tests/frontend-architecture-invariants.test.js] — cross-cutting invariants
- [Source: public/report.html] — locked HTML; stat card grid, table wrappers, toggle buttons already present
- [Source: public/js/report.js] — current implementation (Stories 6.1–6.5 complete); extends this file
- [Source: CLAUDE.md §CRITICAL: Mirakl API] — Mirakl MCP not required for frontend story
- [Source: memory feedback_tailwind_dynamic_classes.md] — Tailwind JIT dynamic class rule

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

None.

### Completion Notes List

### File List

### Change Log

- 2026-04-21: Story 6.4 spec created — create-story workflow, comprehensive developer guide.
