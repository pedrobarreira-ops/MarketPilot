# Story 6.6: Accessibility Baseline

**Epic:** 6 — Frontend Report Page
**Story:** 6.6
**Story Key:** 6-6-accessibility-baseline
**Status:** ready-for-dev
**Date Created:** 2026-04-21

This story does NOT call Mirakl endpoints directly. It is a pure frontend accessibility verification story. No Mirakl MCP check required.

---

## User Story

As a Worten marketplace seller using a screen reader or keyboard navigation,
I want the form, progress screen, and report page to meet basic accessibility requirements,
So that the tool is usable beyond mouse-only interaction.

**Satisfies:** UX spec accessibility section (epics-distillate.md:276) — form: inputs have labels, errors via `aria-describedby`; progress: `role="progressbar"`, `aria-valuemin/max/now`, copy button `aria-label`; report: toggle `role="group"` + `aria-label="Canal"`, `aria-pressed` updated on click.

---

## Acceptance Criteria

**AC-1: form.js — inputs have labels and aria-describedby on errors**
- All `<input>` elements in `public/index.html` have associated `<label>` elements via `for` attribute — already in HTML (do NOT modify HTML)
- When `form.js` injects a field error, it sets `aria-describedby="<field-error-id>"` on the corresponding `<input>` via `setAttribute('aria-describedby', errorId)`
- When errors are cleared, `form.js` calls `removeAttribute('aria-describedby')` on each input
- Verify: all these are already implemented in `public/js/form.js` (Stories 5.1 done)

**AC-2: progress.js — progress bar and copy button ARIA**
- The progress bar element (`.w-full.h-1\.5.bg-surface-variant`) has `role="progressbar"`, `aria-valuemin="0"`, `aria-valuemax="100"` set by `progress.js` on init
- `aria-valuenow` is updated by `progress.js` at each phase transition to reflect the current fill percentage
- The copy button has `aria-label="Copiar link do relatório"` set by `progress.js`
- Verify: all these are already implemented in `public/js/progress.js` (Story 5.2 done)

**AC-3: report.js — PT/ES toggle group ARIA**
- The PT/ES toggle container has `role="group"` and `aria-label="Canal"` set by `report.js` on init
- Each toggle pill button (`ptBtn`, `esBtn`) has `aria-pressed` set to `"true"` or `"false"` on init (PT defaults to `"true"`, ES to `"false"`)
- `aria-pressed` is updated by `report.js` on every toggle click to reflect the currently active channel
- Verify: all these are already implemented in `public/js/report.js` (Story 6.1 done)

**AC-4 (static): ATDD static source scan tests pass for Story 6.6**
- The pre-scaffolded ATDD `tests/epic6-6.6-accessibility-baseline.atdd.test.js` (5 static tests across 3 `describe` blocks) must pass:
  - T-6.6-static.1a: `report.js` source contains `"group"` in an ARIA context (role="group" set by JS)
  - T-6.6-static.1b: `report.js` source contains `"Canal"` (aria-label="Canal" set by JS)
  - T-6.6-static.2a: `report.js` source contains `aria-pressed`
  - T-6.6-static.2b: `aria-pressed` appears at least 2 times in `report.js` source
  - Invariant: `report.js` does NOT call `removeAttribute("role")` or `removeAttribute("aria-label")`
- Run: `node --test tests/epic6-6.6-accessibility-baseline.atdd.test.js`
- All 5 tests must pass. Since report.js already has full implementation from Stories 6.1+, these tests pass now without any code changes.

**AC-5: Unskip and implement the Story 6.6 Playwright E2E test**
- In `tests/e2e/report.smoke.spec.js`, change `test.skip(` → `test(` for the 6.6-labelled test:
  `'6.6 — all form elements have associated labels; PT/ES toggle uses role=group + aria-pressed'`
- Implement assertions verifying the ARIA attributes are present in the rendered DOM (see Dev Notes)
- All existing passing tests must remain passing (all story 6.1 and 6.5 tests)
- The unskipped test must pass

---

## Tasks / Subtasks

- [ ] **Task 1: Verify ATDD static tests pass as-is** (AC: 4)
  - [ ] Run: `node --test tests/epic6-6.6-accessibility-baseline.atdd.test.js`
  - [ ] All 5 tests must pass (they should, since report.js already implements the ARIA attributes from Story 6.1)
  - [ ] If any test fails, investigate `public/js/report.js` for missing ARIA attribute setters — do NOT modify the ATDD test file

- [ ] **Task 2: Unskip and implement the 6.6 Playwright E2E test** (AC: 5)
  - [ ] In `tests/e2e/report.smoke.spec.js`: change `test.skip(` → `test(` for the 6.6 test
  - [ ] Implement assertions (see Dev Notes for exact implementation)
  - [ ] Run: `npx playwright test tests/e2e/report.smoke.spec.js`
  - [ ] The 6.6 test must pass; all pre-existing passing tests must remain passing

- [ ] **Task 3: Verify frontend architecture invariants remain green** (AC: 3, 4)
  - [ ] Run: `node --test tests/frontend-architecture-invariants.test.js`
  - [ ] All invariants must pass — no new `innerHTML` injection of user-supplied values

- [ ] **Task 4: Full test suite regression check**
  - [ ] Run: `npm test`
  - [ ] All pre-existing passing tests remain passing

---

## Dev Notes

### CRITICAL: This is a Verification Story — Minimal Code Changes Expected

All three ARIA implementations are already in place from previous stories:
- `form.js` — `aria-describedby` wired in Story 5.1
- `progress.js` — `role="progressbar"`, `aria-valuemin/max/now`, copy button `aria-label` wired in Story 5.2
- `report.js` — `role="group"`, `aria-label="Canal"`, `aria-pressed` wired in Story 6.1

The **only required code change** is unskipping the Playwright E2E test (Task 2) and implementing its assertion body.

### CRITICAL: Files to Modify

- **Modify:** `tests/e2e/report.smoke.spec.js` — unskip the 6.6 test + implement assertions
- **Do NOT modify:** `public/js/report.js`, `public/js/form.js`, `public/js/progress.js` — ARIA is already implemented
- **Do NOT modify:** `public/index.html`, `public/progress.html`, `public/report.html` — HTML is locked
- **Do NOT modify:** `tests/epic6-6.6-accessibility-baseline.atdd.test.js` — pre-scaffolded test file, read-only

### Playwright E2E Test Implementation

The skipped 6.6 test is in `tests/e2e/report.smoke.spec.js` at the end of the `describe` block:

```js
test.skip('6.6 — all form elements have associated labels; PT/ES toggle uses role=group + aria-pressed', async ({ page }) => {
  await page.route(`**/api/reports/${SAMPLE_ID}`, (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ data: SAMPLE_REPORT }),
  }))
  await page.goto(`/report/${SAMPLE_ID}`)
  // Assert: PT/ES toggle container has role=group, aria-label=Canal
  // Assert: each toggle pill has aria-pressed="true" or "false"
  // Optionally: run @axe-core/playwright scan for WCAG AA violations
})
```

**Implement as follows:**

```js
test('6.6 — all form elements have associated labels; PT/ES toggle uses role=group + aria-pressed', async ({ page }) => {
  await page.route(`**/api/reports/${SAMPLE_ID}`, (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ data: SAMPLE_REPORT }),
  }))
  await page.goto(`/report/${SAMPLE_ID}`)

  // Wait for report.js init to run (toggle ARIA set immediately, before fetch)
  // AC-3: PT/ES toggle container has role="group" and aria-label="Canal"
  const toggleContainer = page.locator('[role="group"][aria-label="Canal"]')
  await expect(toggleContainer).toBeVisible()

  // AC-3: PT pill starts with aria-pressed="true", ES with aria-pressed="false"
  const ptBtn = page.getByRole('button', { name: /PT/i }).first()
  const esBtn = page.getByRole('button', { name: /ES/i }).first()
  await expect(ptBtn).toHaveAttribute('aria-pressed', 'true')
  await expect(esBtn).toHaveAttribute('aria-pressed', 'false')
})
```

**Important notes for Playwright selectors:**
- The toggle container selector `[role="group"][aria-label="Canal"]` matches the element after `report.js` sets both attributes on init (before the fetch resolves)
- The `getByRole('button', { name: /PT/i })` selector must match the button text in `report.html` — verify the exact button text (e.g. `"PT"`) before implementing. If text differs, use `page.locator('button[aria-pressed]').first()` for the first pill
- Both ARIA attributes are set by `report.js` in the synchronous init section (before the async fetch), so they are available immediately after `page.goto()` without needing to `waitFor` data

### Verifying Toggle Button Selectors

If `getByRole('button', { name: /PT/i })` does not match, check `public/report.html` for the actual button text in the toggle. Alternative selectors:
```js
// By aria-pressed attribute (most robust):
const ptBtn = page.locator('button[aria-pressed="true"]')
const esBtn = page.locator('button[aria-pressed="false"]')
await expect(ptBtn).toHaveAttribute('aria-pressed', 'true')
await expect(esBtn).toHaveAttribute('aria-pressed', 'false')
```

### What Is Already Implemented (Verified from Source)

**`public/js/report.js` (Story 6.1):**
```js
// Line ~39-45: ARIA init on toggle
if (toggleContainer) {
  toggleContainer.setAttribute('role', 'group')
  toggleContainer.setAttribute('aria-label', 'Canal')
}
if (ptBtn) ptBtn.setAttribute('aria-pressed', 'true')
if (esBtn) esBtn.setAttribute('aria-pressed', 'false')

// Line ~378-379: ARIA update on renderChannel
if (ptBtn) ptBtn.setAttribute('aria-pressed', channel === 'pt' ? 'true' : 'false')
if (esBtn) esBtn.setAttribute('aria-pressed', channel === 'es' ? 'true' : 'false')

// Lines ~414-415 and ~424-425: ARIA update on click handlers
ptBtn.setAttribute('aria-pressed', 'true'); esBtn.setAttribute('aria-pressed', 'false')
ptBtn.setAttribute('aria-pressed', 'false'); esBtn.setAttribute('aria-pressed', 'true')
```

**`public/js/progress.js` (Story 5.2):**
```js
// Progress bar ARIA init
progressOuter.setAttribute('role', 'progressbar')
progressOuter.setAttribute('aria-valuemin', '0')
progressOuter.setAttribute('aria-valuemax', '100')
progressOuter.setAttribute('aria-valuenow', '0')
// aria-valuenow updated at each phase transition:
progressOuter.setAttribute('aria-valuenow', String(pct))
// Copy button aria-label:
copyBtn.setAttribute('aria-label', 'Copiar link do relatório')
```

**`public/js/form.js` (Story 5.1):**
```js
// Error state: aria-describedby set on input
input.setAttribute('aria-describedby', errorId)
// Clear state: aria-describedby removed
apiKeyInput.removeAttribute('aria-describedby')
emailInput.removeAttribute('aria-describedby')
```

**`public/index.html` (static HTML):**
```html
<label for="api-key">Shop API Key</label>
<input id="api-key" ... />
<label for="email">Email</label>
<input id="email" ... />
```

### ATDD Tests Already Passing

Because `report.js` already implements `role="group"`, `aria-label="Canal"`, and `aria-pressed`, the 5 static ATDD tests in `tests/epic6-6.6-accessibility-baseline.atdd.test.js` pass without any source changes:
- T-6.6-static.1a: `"group"` — satisfied by `setAttribute('role', 'group')`
- T-6.6-static.1b: `"Canal"` — satisfied by `setAttribute('aria-label', 'Canal')`
- T-6.6-static.2a: `aria-pressed` — satisfied by multiple `setAttribute('aria-pressed', ...)`
- T-6.6-static.2b: `aria-pressed` ≥ 2 occurrences — satisfied (appears 6+ times in source)
- Invariant: no `removeAttribute("role")` or `removeAttribute("aria-label")` calls — confirmed in source

### Architecture Boundary

Story 6.6 is 100% frontend verification. The only backend interaction is `GET /api/reports/:report_id` (used by the Playwright E2E mock — no real server call). No server-side changes in this story.

### NFR Compliance

- **NFR-P4:** Report page load < 2s — no new code added; ARIA attributes are synchronous DOM operations
- Accessibility: WCAG 2.1 AA intent for programmatic labels, keyboard operability (buttons), and progress bar state announcement

### Testing Commands

```bash
# Static ATDD for 6.6 (should pass before and after Task 2):
node --test tests/epic6-6.6-accessibility-baseline.atdd.test.js

# Frontend architecture invariants (must stay green):
node --test tests/frontend-architecture-invariants.test.js

# All report E2E tests (6.1 + 6.5 + 6.6 must pass; 6.2/6.3/6.4 remain skipped):
npx playwright test tests/e2e/report.smoke.spec.js

# Full unit/ATDD suite (regression check):
npm test
```

### Previous Story Context

- Story 6.1 (`done`) — established `report.js` as a plain IIFE browser script; implemented toggle ARIA (`role="group"`, `aria-label="Canal"`, `aria-pressed`) in the synchronous init section
- Story 5.1 (`done`) — implemented `form.js` with `aria-describedby` on error injection and removal
- Story 5.2 (`done`) — implemented `progress.js` with `role="progressbar"`, `aria-valuemin/max/now`, and copy button `aria-label`
- Story 6.5 (`done`) — left 6.6 Playwright test skipped as required; confirmed all story 6.1 ARIA attributes still present after 6.5's changes

### Git Context

- All ARIA implementations already merged to `main` via PRs for Stories 5.1, 5.2, and 6.1
- `tests/epic6-6.6-accessibility-baseline.atdd.test.js` — pre-scaffolded, 5 static tests, currently passing
- `tests/e2e/report.smoke.spec.js` — 1 Story 6.6 test currently skipped (last test in the file)

### References

- [Source: epics-distillate.md line 276] — compressed AC: form aria-describedby, progress role=progressbar/aria-valuenow/copy-label, report toggle role=group/aria-pressed
- [Source: tests/epic6-6.6-accessibility-baseline.atdd.test.js] — pre-scaffolded ATDD (5 static tests across 3 describe blocks)
- [Source: tests/e2e/report.smoke.spec.js lines 389-398] — 1 skipped 6.6 E2E test to unskip + implement
- [Source: public/js/report.js lines 39-45, 375-379, 412-426] — existing ARIA implementation from Story 6.1
- [Source: public/js/progress.js lines 41-52, 72] — existing ARIA implementation from Story 5.2
- [Source: public/js/form.js lines 22, 28, 49] — existing aria-describedby implementation from Story 5.1
- [Source: public/index.html lines 131, 133, 139, 141] — static label+input pairs for form fields

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

None — verification story, no debugging required.

### Completion Notes List

- Step 2 (ATDD) already unskipped and implemented the E2E test in `tests/e2e/report.smoke.spec.js` (commit 7bd02ec).
- All 5 ATDD static tests pass without any production code changes — ARIA attributes were already implemented in prior stories (5.1, 5.2, 6.1).
- Frontend architecture invariants: 13/13 pass.
- No production code changes required — this was a pure verification story.

### File List

- `tests/e2e/report.smoke.spec.js` — unskipped and implemented 6.6 E2E accessibility test (done in Step 2)

### Change Log

- 2026-04-21: Story 6.6 spec created — accessibility baseline verification story. (claude-sonnet-4-6)
- 2026-04-21: Step 2 (ATDD) unskipped and implemented E2E test; Step 3 confirmed all tests passing, updated Dev Agent Record. (claude-sonnet-4-6)
