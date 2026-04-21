# Story 6.3: report.js — CSV Download & CTA Banner

This story does NOT call Mirakl endpoints directly. No Mirakl MCP check required.

**Epic:** 6 — Frontend Report Page
**Story:** 6.3
**Story Key:** 6-3-csv-download-and-cta
**Status:** done
**Date Created:** 2026-04-21

---

## User Story

As a Worten marketplace seller viewing my MarketPilot report,
I want a working CSV download button and a visible CTA banner,
So that I can download the full product dataset for offline analysis and learn about paid features.

**Satisfies:** Epic 6.3 AC (epics-distillate.md:273) — CSV request to `/api/reports/{id}/csv`; filename `marketpilot-report-{first-8-chars}.csv`; latency>1s: "A preparar..."; CSV link hidden during skeleton; `CTA_URL` const at top of report.js (not in HTML); `target="_blank"` `rel="noopener noreferrer"`.

---

## Acceptance Criteria

**AC-1: CSV download button triggers correct API request**
- Clicking the CSV download button issues a `GET /api/reports/{reportId}/csv` request
- The URL is constructed dynamically using the `reportId` extracted from `window.location.pathname`
- The button is the one containing `<span class="material-symbols-outlined">download</span>` already in `report.html`
- Triggers a browser file download with filename `marketpilot-report-{first-8-chars-of-reportId}.csv` (first 8 characters of the `reportId`)
- Uses a hidden `<a>` element technique: create an `<a>` with `href = /api/reports/${reportId}/csv`, `download = "marketpilot-report-${reportId.substring(0,8)}.csv"`, append to body, `.click()`, then remove it

**AC-2: CSV download latency indicator**
- If the CSV response takes > 1 second, show the text `"A preparar..."` on the button (replacing the "Descarregar relatório completo CSV" label while loading)
- When the fetch completes (success or error), restore the original button content
- Implementation: use a `setTimeout(showPreparingText, 1000)` before the fetch; cancel the timeout if response arrives within 1s; use `clearTimeout` in the finally/completion handler

**AC-3: CSV link hidden during skeleton**
- The CSV download button is hidden (`display: none`) while the report data fetch is in flight (skeleton state)
- The button becomes visible after `removeSkeletonState()` is called (on successful data fetch)
- This behaviour is already scaffolded in Story 6.1's `applySkeleton()` / `removeSkeletonState()` — Story 6.3 must NOT re-implement skeleton logic; just wire the button's click handler

**AC-4: CTA banner opens in new tab with security attributes**
- CRITICAL HTML FINDING: The CTA in `report.html` is a `<button>` element — NOT an `<a>` tag. The HTML is locked (cannot change to `<a>`).
- The correct implementation is a click handler using `window.open(CTA_URL, '_blank', 'noopener,noreferrer')` on the CTA button
- `report.js` adds a `click` event listener to the CTA button; the handler calls `window.open(CTA_URL, '_blank', 'noopener,noreferrer')`
- The CTA banner renders immediately on page load — it has no data dependency on the report fetch
- The ATDD static test (External link security) checks for `noopener` and `noreferrer` in `report.js` source — `window.open(..., 'noopener,noreferrer')` satisfies this

**AC-5: CTA_URL declared as const at top of report.js — NOT in HTML**
- `const CTA_URL = '...'` is already at the top of `public/js/report.js` (placed there in Story 6.1: `const CTA_URL = 'https://wa.me/351000000000'`)
- Story 6.3 must NOT move or rename this constant — just wire it to the CTA anchor's `href`
- The value must not be a placeholder (TODO, PLACEHOLDER, example.com, localhost) — the current value `'https://wa.me/351000000000'` already satisfies this

**AC-6 (static): CSV URL constructed dynamically — verified by ATDD**
- The ATDD test `tests/epic6-6.3-csv-download-and-cta.atdd.test.js` (T-6.3-static.1) must pass:
  - `report.js` source contains `/csv` in a URL construction context
  - `report.js` does NOT hardcode a specific UUID in the CSV URL

**AC-7 (static): CTA_URL const present and valid — verified by ATDD**
- The ATDD test T-6.3-static.2 must pass: `const CTA_URL` present in `report.js`
- The ATDD test T-6.3-static.3 must pass: CTA_URL value is not a placeholder
- The ATDD test for external link security must pass: `target="_blank"` is paired with `noopener noreferrer`

**AC-8: Unskip Playwright E2E tests for Story 6.3**
- In `tests/e2e/report.smoke.spec.js`, change `test.skip(` → `test(` for the two 6.3-labelled skipped tests:
  1. `'6.3 — CSV download link has correct href and becomes visible after data loads'`
  2. `'6.3 — CTA banner renders immediately with correct href and target=_blank'`
- Both unskipped tests must pass
- The existing passing tests (DOM smoke, 6.1 tests) must remain passing

---

## Tasks / Subtasks

- [x] **Task 1: Wire CSV button click handler** (AC: 1, 2, 3)
  - [x] Locate `csvBtn` using the existing selector in report.js (Story 6.1 already found it: `const allButtons = document.querySelectorAll('button'); for btn where icon.textContent.trim() === 'download'`)
  - [x] Add click event listener to `csvBtn` that:
    - Creates `<a href="/api/reports/${reportId}/csv" download="marketpilot-report-${reportId.substring(0,8)}.csv">`, appends to body, clicks, removes
    - Sets a `setTimeout` for 1s to show `"A preparar..."` text on the button
    - Clears the timeout and restores button text after download completes
  - [x] Do NOT re-implement skeleton hide/show logic — that is already handled by `applySkeleton()` / `removeSkeletonState()` from Story 6.1

- [x] **Task 2: Wire CTA button** (AC: 4, 5)
  - [x] CRITICAL: The CTA in `report.html` is a `<button>`, NOT an `<a>` tag — report.html is locked, cannot be changed
  - [x] Query the CTA button: `document.querySelector('.bg-gradient-to-br button')`
  - [x] Add click listener: `ctaBtn.addEventListener('click', function() { window.open(CTA_URL, '_blank', 'noopener,noreferrer') })`
  - [x] This wiring happens unconditionally on init (not inside the fetch `.then()`) — CTA has no data dependency
  - [x] Do NOT set `href`, `target`, or `rel` on a `<button>` element — buttons do not support those attributes

- [x] **Task 3: Run static ATDD tests** (AC: 6, 7)
  - [x] All 4 static ATDD tests pass: `node --test tests/epic6-6.3-csv-download-and-cta.atdd.test.js`
  - [x] Frontend architecture invariants still pass: `node --test tests/frontend-architecture-invariants.test.js`

- [x] **Task 4: Unskip Playwright E2E tests** (AC: 8)
  - [x] Implement assertions in the two 6.3 skipped test bodies (see Dev Notes for assertion details)
  - [x] Change `test.skip(` → `test(` for both 6.3 tests
  - [x] All tests pass: `npx playwright test tests/e2e/report.smoke.spec.js`

---

## Dev Notes

### CRITICAL: Files to Modify

- **Modify:** `public/js/report.js` — add CSV click handler and CTA wiring (Story 6.3 scope only)
- **Modify:** `tests/e2e/report.smoke.spec.js` — unskip 2 tests + fill assertions
- **Do NOT modify:** `public/report.html` (locked after Story 6.1 added the `<script>` tag); any server files; any other test files; any other HTML pages

### Story 6.1 Context — What Already Exists in report.js

Story 6.1 already implemented these items that Story 6.3 builds on:

1. `const CTA_URL = 'https://wa.me/351000000000'` — already at top of file. Do NOT change.
2. `csvBtn` — already found in the init scope via the download icon scan:
   ```js
   let csvBtn = null
   const allButtons = document.querySelectorAll('button')
   for (const btn of allButtons) {
     const icon = btn.querySelector('.material-symbols-outlined')
     if (icon && icon.textContent.trim() === 'download') {
       csvBtn = btn
       break
     }
   }
   ```
3. `applySkeleton()` — already hides `csvBtn` (`csvBtn.style.display = 'none'`)
4. `removeSkeletonState()` — already restores `csvBtn` (`csvBtn.style.display = ''`)
5. A Story 6.3 scaffold already exists in report.js:
   ```js
   // Story 6.3 scaffold: CSV download URL
   function getCsvDownloadUrl () {
     return '/api/reports/' + reportId + '/csv'
   }
   // Expose for CSV button wiring in Story 6.3
   if (csvBtn) {
     csvBtn.setAttribute('data-csv-url', getCsvDownloadUrl())
   }
   ```

Story 6.3 must **extend** the existing `report.js` — NOT rewrite it. Add the click handler and CTA wiring inside the IIFE, after the existing scaffold code.

### CSV Download Implementation Pattern

```js
// Inside the IIFE, after the existing getCsvDownloadUrl scaffold:

function downloadCsv () {
  if (!csvBtn) return

  // Latency indicator: show "A preparar..." if response takes > 1s
  let preparingTimeout = null
  const originalContent = csvBtn.innerHTML

  preparingTimeout = setTimeout(function () {
    csvBtn.textContent = 'A preparar...'
  }, 1000)

  // Use hidden anchor for programmatic download with custom filename
  const a = document.createElement('a')
  a.href = '/api/reports/' + reportId + '/csv'
  a.download = 'marketpilot-report-' + reportId.substring(0, 8) + '.csv'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)

  // Restore button after a short delay (browser download is async — we cannot
  // detect completion, so restore after a reasonable window)
  setTimeout(function () {
    clearTimeout(preparingTimeout)
    csvBtn.innerHTML = originalContent
  }, 3000)
}

if (csvBtn) {
  csvBtn.addEventListener('click', downloadCsv)
}
```

**Note on innerHTML:** `originalContent` captures the HTML of the button (the download icon + text). Restoring via `innerHTML = originalContent` is safe here because the source is the button's own pre-existing innerHTML (not user-supplied data). The frontend architecture invariant only flags `innerHTML` assignments with **user-supplied / API-sourced** variables (reportId, jobId, phase_message). `originalContent` is captured from a static HTML element authored by the developer — not from the API or user input.

**Alternative (safer):** Clone the button content before modification and restore via `innerHTML = originalContent` — since `originalContent` comes from `csvBtn.innerHTML` (static developer HTML), this is safe.

### CTA Button Wiring

CRITICAL: The actual `report.html` CTA section uses a `<button>` element, NOT an `<a>` tag:

```html
<!-- Actual HTML (locked) -->
<section class="bg-gradient-to-br from-primary to-primary-container p-12 rounded-2xl ...">
  <div class="relative z-10 text-center md:text-left">
    <h3 class="text-3xl font-black text-white ...">Quer que isto aconteça automaticamente?</h3>
    <p class="text-primary-fixed-dim ...">Ative o Repricing Dinâmico e mantenha-se em 1.º lugar 24/7.</p>
  </div>
  <button class="relative z-10 px-10 py-5 bg-surface-bright text-primary font-black rounded-lg ...">
    Começar a automatizar →
  </button>
</section>
```

Since `report.html` is locked, the button CANNOT be changed to an `<a>`. Use `window.open()` in a click handler:

```js
// CTA button wiring — runs unconditionally on init (no data dependency)
const ctaSection = document.querySelector('section.bg-gradient-to-br')
const ctaBtn = ctaSection ? ctaSection.querySelector('button') : null

if (ctaBtn) {
  ctaBtn.addEventListener('click', function () {
    window.open(CTA_URL, '_blank', 'noopener,noreferrer')
  })
}
```

The `window.open(CTA_URL, '_blank', 'noopener,noreferrer')` pattern:
- Opens `CTA_URL` in a new tab
- `'noopener,noreferrer'` are passed as the `windowFeatures` string — this is equivalent to `rel="noopener noreferrer"` on an anchor
- Satisfies the ATDD static scan: `report.js` source will contain both `noopener` and `noreferrer`

This wiring runs unconditionally in `init()` — CTA must work even when report fetch fails or is pending.

### Playwright E2E Tests — Assertions to Implement

Before unskipping, implement the assertion bodies:

**Test 1 — `'6.3 — CSV download link has correct href and becomes visible after data loads'`**

```js
test('6.3 — CSV download link has correct href and becomes visible after data loads', async ({ page }) => {
  await page.route(`**/api/reports/${SAMPLE_ID}`, (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ data: SAMPLE_REPORT }),
  }))
  await page.goto(`/report/${SAMPLE_ID}`)

  // Wait for data to load (skeleton removed)
  await expect(page.locator('.text-6xl').nth(0)).toHaveText('4.821')

  // CSV button visible after data loads (was hidden during skeleton)
  const csvBtn = page.locator('button:has(.material-symbols-outlined)')
    .filter({ hasText: /descarregar|A preparar/i })
  // Alternatively: look for button with 'download' icon
  await expect(csvBtn).toBeVisible()

  // The data-csv-url attribute (set by getCsvDownloadUrl scaffold) confirms URL shape
  const csvUrl = await csvBtn.getAttribute('data-csv-url')
  expect(csvUrl).toContain(`/api/reports/${SAMPLE_ID}/csv`)
})
```

**Note:** The `data-csv-url` attribute was set by the Story 6.1 scaffold (`csvBtn.setAttribute('data-csv-url', getCsvDownloadUrl())`). Use it in the test to verify the URL shape without triggering a real download.

**Test 2 — `'6.3 — CTA banner renders immediately with correct href and target=_blank'`**

IMPORTANT: The CTA is a `<button>`, not an `<a>`. The test scaffold comment says "button has correct href" which is misleading — a button doesn't have href. The test should verify:
1. The CTA button is visible
2. Clicking it opens a new page (popup) at `CTA_URL`

```js
test('6.3 — CTA banner renders immediately with correct href and target=_blank', async ({ page }) => {
  // Keep the report fetch pending so we verify CTA renders without waiting for data
  let resolveFetch
  const fetchGate = new Promise(r => { resolveFetch = r })
  await page.route(`**/api/reports/${SAMPLE_ID}`, (route) => {
    fetchGate.then(() => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: SAMPLE_REPORT }),
    }))
  })

  await page.goto(`/report/${SAMPLE_ID}`)

  // CTA button should be visible even while fetch is in flight (no data dependency)
  const ctaBtn = page.locator('.bg-gradient-to-br button').first()
  await expect(ctaBtn).toBeVisible()

  // Clicking CTA should open a new tab/popup (window.open with _blank)
  const [newPage] = await Promise.all([
    page.context().waitForEvent('page'),
    ctaBtn.click()
  ])
  expect(newPage.url()).toContain('wa.me')  // CTA_URL is a WhatsApp URL

  await newPage.close()
  resolveFetch()
})
```

### ATDD Tests — Already Passing (Verify No Regressions)

Run before and after implementation to confirm no regressions:

```bash
# Story 6.3 ATDD (static scan — should already pass given Story 6.1 scaffold):
node --test tests/epic6-6.3-csv-download-and-cta.atdd.test.js

# Frontend architecture invariants (must stay green):
node --test tests/frontend-architecture-invariants.test.js

# Full E2E suite:
npx playwright test tests/e2e/report.smoke.spec.js

# Full unit/ATDD suite (regression check):
npm test
```

### Testing Commands

```bash
# ATDD static scan for 6.3 (run first):
node --test tests/epic6-6.3-csv-download-and-cta.atdd.test.js

# Frontend architecture invariants (must stay green):
node --test tests/frontend-architecture-invariants.test.js

# All report E2E tests (after Story 6.3 implementation):
npx playwright test tests/e2e/report.smoke.spec.js

# Full unit/ATDD suite (regression check):
npm test
```

### ESM / Module Notes

- `report.js` is a plain browser IIFE — NO `import`/`export`, NO `type="module"` on the `<script>` tag
- This is the same pattern established by Stories 6.1 and 5.2

### Scope Boundary for Story 6.3

**IN SCOPE:**
- CSV download button click handler (hidden anchor download technique + "A preparar..." latency indicator)
- CTA anchor `href`, `target`, `rel` wiring from `CTA_URL` constant
- Unskipping and implementing 2 Playwright E2E tests

**OUT OF SCOPE (handled by later stories):**
- Opportunities table rows — Story 6.2
- Quick Wins table rows — Story 6.2
- Mobile layout — Story 6.4
- Expired/error states (404, 5xx) — Story 6.5
- Full accessibility pass — Story 6.6
- Any backend changes — report.js is 100% frontend for this story

### NFR Compliance

- **NFR-P5:** CSV download initiation < 3s — the backend returns `csv_data` from a single indexed SQLite read (`WHERE report_id = ? AND expires_at > now`). The frontend download is purely client-side (hidden `<a>` click). No performance risk.
- The "A preparar..." indicator fires at 1s client-side timeout — does not add server-side latency.

### No Mirakl Endpoint Touch

Story 6.3 is 100% frontend. The only backend it indirectly triggers is `GET /api/reports/:report_id/csv` (already fully implemented in Story 4.3, done). No Mirakl MCP verification required.

### Previous Story Context

- Story 6.1 (`done`): established `report.js` IIFE pattern; `CTA_URL` const; `csvBtn` selector; `applySkeleton()`/`removeSkeletonState()` for CSV button visibility; `getCsvDownloadUrl()` scaffold function. Story 6.3 EXTENDS this file.
- Story 6.2 (`backlog`, runs in parallel via BAD): populates opportunities and quick wins table rows. Story 6.3 does NOT depend on 6.2 — they both modify `report.js` independently. Expect merge conflicts on `report.js` between 6.2 and 6.3 branches — resolve by preserving both sets of changes.
- Story 4.3 (`done`): implemented `GET /api/reports/:id/csv` returning `csv_data` with `Content-Type: text/csv` and `Content-Disposition: attachment; filename="marketpilot-report.csv"`. The backend already sets the Content-Disposition header; the frontend `download` attribute provides a per-report filename override.

### Known Merge Conflict Risk (6.2 + 6.3 run in parallel)

Stories 6.2 and 6.3 both modify `public/js/report.js`. When both branches are reviewed and merged:
- 6.2 adds: `renderOpportunities()`, `renderQuickWins()`, table row DOM construction
- 6.3 adds: `downloadCsv()`, CTA anchor wiring

Both sets of additions are in distinct function bodies — conflicts are mechanical and resolved by preserving all functions from both branches. The BAD pipeline handles this via the standard spec-file push race resolution (see memory `project_bad_spec_file_push_race.md`).

### References

- [Source: epics-distillate.md §report.js Behaviour, line 169] — CSV download and CTA spec
- [Source: epics-distillate.md §Epic 6 AC 6.3, line 273] — compressed AC
- [Source: epics-distillate.md §CSV Schema] — backend CSV contract; Content-Disposition header
- [Source: epics-distillate.md §HTTP API Routes] — GET /api/reports/:id/csv contract
- [Source: 6-1-report-js-data-fetch-skeleton-and-your-position.md] — Story 6.1 completion; what exists in report.js
- [Source: tests/epic6-6.3-csv-download-and-cta.atdd.test.js] — pre-scaffolded ATDD (4 static tests)
- [Source: tests/e2e/report.smoke.spec.js] — E2E test contract (2 skipped tests to unskip for 6.3)
- [Source: tests/frontend-architecture-invariants.test.js] — cross-cutting invariants (innerHTML user-value injection, CTA_URL guard, noopener noreferrer)
- [Source: public/report.html] — locked HTML; CTA section structure
- [Source: public/js/report.js] — current implementation (Story 6.1 complete); extends this file

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

None.

### Completion Notes List

- Implemented `downloadCsv()` function in `public/js/report.js` using the hidden `<a>` element technique for programmatic file download with custom filename (`marketpilot-report-{first8}.csv`).
- Implemented 1s latency indicator: `setTimeout` sets "A preparar..." on the button; a 3s restore timeout clears the preparing timeout and restores original `innerHTML` (safe — `originalContent` is captured from static developer HTML, not API data).
- CTA wiring: queried `section.bg-gradient-to-br button`, added `click` listener calling `window.open(CTA_URL, '_blank', 'noopener,noreferrer')` unconditionally on init (no data dependency).
- All 5 ATDD static tests pass (T-6.3-static.1, .2, .3, external link security). All 13 frontend architecture invariants pass.
- Unskipped and implemented 2 Playwright E2E tests: CSV button visibility + `data-csv-url` attribute check; CTA button visible immediately + click opens WhatsApp new tab.
- Fixed CTA E2E assertion to match `wa.me|whatsapp.com` regex (WhatsApp redirects `wa.me/...` to `api.whatsapp.com/...` in browser).
- Full regression suite: 557 tests, 0 failures. Playwright: 7 active pass, 6 skipped (future stories).

### File List

- `public/js/report.js` — added `downloadCsv()` function, CSV button click handler, CTA button click handler
- `tests/e2e/report.smoke.spec.js` — unskipped 2 Story 6.3 tests, implemented assertion bodies

### Change Log

- 2026-04-21: Story 6.3 spec created — create-story workflow, comprehensive developer guide.
- 2026-04-21: Story 6.3 implemented — CSV download button handler + CTA button wiring + E2E tests unskipped; all tests green.
- 2026-04-21: Story 6.3 code review complete — 1 patch applied (CSV re-entrancy guard), 4 dismissed as noise, 0 deferred.

---

## Review Findings

Code review performed on 2026-04-21 via `bmad-code-review` (adversarial + edge-case + acceptance-auditor layers).

- [x] [Review][Patch] CSV re-entrancy bug: rapid re-click mid-restore permanently strands button on "A preparar..." text [public/js/report.js:316] — FIXED. Moved `originalContent` capture to module scope and added `csvDownloadInFlight` guard so the second click within the 3s restore window is ignored (previously it would capture `originalContent = "A preparar..."` and later restore to that stale value).

### Dismissed (noise)

- `preparingTimeout = null` initial assignment was dead code (immediately reassigned). Removed as a side effect of the re-entrancy patch above.
- `var` vs `const`/`let` in new code — existing file uses both styles; kept consistent with surrounding code.
- `clearTimeout(preparingTimeout)` inside the 3s restore is effectively a no-op (1s timer has always fired by then) — but matches spec's explicit guidance for defensive cleanup. Retained.
- No download-failure handling — inherent to the hidden-anchor download technique and acknowledged in both spec and code comment.

### Acceptance Auditor

All 8 ACs verified: AC-1 (hidden-anchor download with correct URL + filename), AC-2 ("A preparar..." at 1s), AC-3 (skeleton hide already handled by Story 6.1), AC-4 (`window.open(CTA_URL, '_blank', 'noopener,noreferrer')`), AC-5 (`CTA_URL` const untouched), AC-6/AC-7 (4 static ATDD + noopener/noreferrer invariant green), AC-8 (two 6.3 E2E tests unskipped, all assertions pass).

### Test Run Evidence

- `node --test tests/epic6-6.3-csv-download-and-cta.atdd.test.js` — 5 pass / 0 fail
- `node --test tests/frontend-architecture-invariants.test.js` — 13 pass / 0 fail
- `npm test` — 557 pass / 0 fail
- `npx playwright test tests/e2e/report.smoke.spec.js` — 7 pass / 6 skipped (future stories)
