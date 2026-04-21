# Story 6.5: report.js — Expired Report & Fetch Error States

**Epic:** 6 — Frontend Report Page
**Story:** 6.5
**Story Key:** 6-5-expired-report-and-fetch-error-states
**Status:** ready-for-dev
**Date Created:** 2026-04-21

This story does NOT call Mirakl endpoints directly. It consumes `GET /api/reports/:report_id` (Story 4.3, done). No Mirakl MCP check required.

---

## User Story

As a Worten marketplace seller who lands on a report URL,
I want the report page to show a clear, actionable error card when my report has expired (404) or when the fetch fails with a server or network error (5xx / network),
So that I understand what went wrong and know exactly how to recover — without being stranded on a broken page.

**Satisfies:** Epic 6.5 AC (epics-distillate.md:275) — 404 expiry card (clock icon, "Este relatório já não está disponível", 48h explanation, "Gerar um novo relatório →" → /); 5xx/network error card ("Não foi possível carregar o relatório", "Recarregar" → window.location.reload(), "Contacta-nos"); header + CTA remain visible in both cases.

---

## Acceptance Criteria

**AC-1: 404 response → expiry card rendered by report.js**
- When `GET /api/reports/:report_id` returns HTTP 404, `report.js` removes the skeleton and renders an expiry card inside `<main>` replacing the main content area
- Expiry card contains:
  - A clock icon (Material Symbols Outlined `schedule` or equivalent — e.g. `<span class="material-symbols-outlined">schedule</span>`)
  - Heading: `"Este relatório já não está disponível"`
  - Body explaining the 48h TTL, e.g. `"Os relatórios expiram ao fim de 48 horas. Gera um novo relatório para obteres dados actualizados."`
  - A button/link `"Gerar um novo relatório →"` that navigates to `"/"` (the form page)
- The header (MarketPilot brand + date span) remains visible — do NOT hide or remove `<header>`
- The CTA banner (`<section class="bg-gradient-to-br from-primary...">`) remains visible — do NOT hide or remove it

**AC-2: 5xx or network error → fetch error card rendered by report.js**
- When `GET /api/reports/:report_id` returns HTTP 5xx, or when `fetch()` throws (network failure / CORS / DNS), `report.js` removes the skeleton and renders a fetch error card inside `<main>`
- Error card contains:
  - A warning triangle icon (Material Symbols Outlined `warning` or `error`)
  - Heading: `"Não foi possível carregar o relatório"`
  - A `"Recarregar"` button that calls `window.location.reload()` when clicked
  - A `"Contacta-nos"` link (can use `CTA_URL` or a mailto, visible as text link)
- The header and CTA banner remain visible — same constraint as AC-1

**AC-3 (static): Error and expiry UI driven by report.js — not static HTML**
- `report.js` source explicitly checks HTTP status (`response.ok` or `response.status`) to distinguish success from error responses
- `report.js` source contains the Portuguese copy strings for both error states (not relayed verbatim from the server error response)
- Pre-scaffolded ATDD: `tests/epic6-6.5-expired-and-error-states.atdd.test.js` (6 static tests across 3 `describe` blocks, currently passing via scaffolds in Story 6.1) — all 6 must continue to pass after implementation
- The ATDD tests check:
  - T-6.5-static.1a: `response.ok` or `response.status` check present
  - T-6.5-static.1b: 404 handling path present (literal `404` OR `response.ok + "Este relat"`)
  - AC-1 static: `"Este relatório já não está disponível"` string present
  - AC-1 static: `"Gerar um novo relatório"` CTA string present
  - AC-2 static: `"Não foi possível carregar o relatório"` string present
  - AC-2 static: `window.location.reload()` call present

**AC-4: Unskip the two 6.5 Playwright E2E tests in `tests/e2e/report.smoke.spec.js`**
- Change `test.skip(` → `test(` for both 6.5-labelled tests:
  1. `'6.5 — 410/expired report shows Portuguese expired-state card with "Gerar novo" CTA'`
  2. `'6.5 — generic fetch error (500) shows Portuguese "not available" error card with Reload button'`
- Implement assertions for both tests (see Dev Notes below)
- All existing passing tests (DOM smoke, 6.1 tests) must remain passing
- The 6.2, 6.3, 6.4, 6.6 `test.skip` tests must remain skipped

**AC-5: Both error states keep header and CTA visible**
- After error card render (AC-1 or AC-2), `document.querySelector('header')` is still in the DOM and visible
- The CTA section (`section.bg-gradient-to-br`) is still in the DOM and visible
- Neither the header nor CTA is hidden, removed, or styled with `display: none`

---

## Tasks / Subtasks

- [ ] **Task 1: Replace scaffold stubs with real error card rendering** (AC: 1, 2, 3, 5)
  - [ ] Implement `showExpiryCard()` — replaces `<main>` content with expiry card DOM (clock icon + heading + body + CTA button → /)
  - [ ] Implement `showFetchErrorCard()` — replaces `<main>` content with error card DOM (warning icon + heading + Reload button + Contacta-nos link)
  - [ ] Both functions: preserve header and CTA banner (do NOT wipe full `<body>` or `document.body.innerHTML`)
  - [ ] Preferred pattern: clear only the content area between `<header>` and the CTA `<section>`, OR target `<main>` or a wrapper `<div>` and replace its children

- [ ] **Task 2: Wire error-card calls into the fetch chain** (AC: 1, 2, 3)
  - [ ] In the `init()` fetch `.then()` chain: if `response.status === 404` → call `showExpiryCard()`; if `!response.ok` (other non-200) → call `showFetchErrorCard()`
  - [ ] In the fetch `.catch()` handler: call `showFetchErrorCard()` (network/DNS failures)
  - [ ] Remove the skeleton before showing error card — call `removeSkeletonState(null)` (existing function; passing null skips the header date update)

- [ ] **Task 3: Run static ATDD tests and verify** (AC: 3)
  - [ ] Run: `node --test tests/epic6-6.5-expired-and-error-states.atdd.test.js`
  - [ ] All 6 static tests must pass (no new failures)

- [ ] **Task 4: Unskip and implement E2E tests** (AC: 4)
  - [ ] In `tests/e2e/report.smoke.spec.js`: change `test.skip(` → `test(` for both 6.5 tests
  - [ ] Implement test body for test 1 (404/expiry): assert `"Este relatório já não está disponível"` visible, `"Gerar um novo relatório"` button visible and links to `/`
  - [ ] Implement test body for test 2 (500/error): assert `"Não foi possível carregar o relatório"` visible, `"Recarregar"` button visible
  - [ ] Run: `npx playwright test tests/e2e/report.smoke.spec.js`
  - [ ] All passing tests (DOM smoke + 4× story 6.1 + 2× story 6.5) must green; 6.2/6.3/6.4/6.6 remain skipped

- [ ] **Task 5: Verify architecture invariants remain green** (AC: 3, 5)
  - [ ] Run: `node --test tests/frontend-architecture-invariants.test.js`
  - [ ] Confirm no `innerHTML` injection of user-supplied values (heading/body strings are author-controlled — safe; but `reportId` must NOT appear inside any `innerHTML` template literal)
  - [ ] Confirm any new dynamic Tailwind classes have static HTML reference or inline style fallback

- [ ] **Task 6: Full test suite regression check**
  - [ ] Run: `npm test`
  - [ ] All pre-existing passing tests remain passing

---

## Dev Notes

### CRITICAL: Files to Modify

- **Modify:** `public/js/report.js` — replace the `showExpiryCard()` and `showFetchErrorCard()` scaffold stubs with real DOM-building implementations; update the `init()` fetch chain to call them
- **Conditionally modify:** `public/report.html` — ONLY if using Tailwind classes not already in the HTML (e.g. `py-24`, `max-w-lg`, `hover:opacity-90`). If so, add ONE hidden safelist div before `</body>`: `<div class="hidden py-24 max-w-lg hover:opacity-90" aria-hidden="true"></div>`. This is the ONLY permitted change — do NOT alter layout, structure, or any other element
- **Do NOT modify:** any server files, any other HTML pages
- **Modify:** `tests/e2e/report.smoke.spec.js` — unskip 2 tests + fill in assertions
- **Do NOT modify:** `tests/epic6-6.5-expired-and-error-states.atdd.test.js` — this is a pre-scaffolded test file, read-only

### Story 6.1 Scaffold Already Present

`public/js/report.js` from Story 6.1 already contains scaffold stubs for `showExpiryCard()` and `showFetchErrorCard()`. These stubs only `console.info()` and define variables — they do NOT render any UI. Story 6.5 replaces these stubs with real DOM-building implementations.

**Current scaffold (lines ~317-332 of report.js):**
```js
function showExpiryCard () {
  // AC-1: expiry message — "Este relatório já não está disponível"
  const expiryMsg = 'Este relatório já não está disponível'
  // AC-1: CTA button — "Gerar um novo relatório →"
  const ctaLabel  = 'Gerar um novo relatório'
  console.info('[report.js] Report expired:', expiryMsg, ctaLabel)
}

function showFetchErrorCard () {
  // AC-2: error message — "Não foi possível carregar o relatório"
  const errorMsg = 'Não foi possível carregar o relatório'
  console.info('[report.js] Fetch error state:', errorMsg)
  // AC-2: Recarregar button calls window.location.reload()
  void function () { window.location.reload() }
}
```

**Replace with real implementations (see patterns below).**

### Current `init()` Fetch Chain (from Story 6.1)

The current fetch chain in `init()`:
```js
fetch('/api/reports/' + reportId)
  .then(function (response) {
    if (!response.ok) {
      console.warn('[report.js] Fetch failed with status:', response.status)
      return null
    }
    return response.json()
  })
  .then(function (json) {
    if (!json || !json.data) return
    reportData = json.data
    removeSkeletonState(reportData.generated_at)
    renderChannel(activeChannel)
  })
  .catch(function (err) {
    console.warn('[report.js] Fetch error:', err)
  })
```

**Story 6.5 must update this to:**
```js
fetch('/api/reports/' + reportId)
  .then(function (response) {
    if (!response.ok) {
      removeSkeletonState(null)   // clears shimmer, preserves header date as "—"
      if (response.status < 500) {
        // 4xx (404, 410, etc.) — expired or not found
        showExpiryCard()
      } else {
        // 5xx — server error
        showFetchErrorCard()
      }
      return null
    }
    return response.json()
  })
  .then(function (json) {
    if (!json || !json.data) return
    reportData = json.data
    removeSkeletonState(reportData.generated_at)
    renderChannel(activeChannel)
  })
  .catch(function (err) {
    console.warn('[report.js] Fetch error:', err)
    removeSkeletonState(null)
    showFetchErrorCard()
  })
```

**RECOMMENDED: just call `removeSkeletonState(null)`** — the existing `removeSkeletonState(generatedAt)` function from Story 6.1 already handles `generatedAt == null` (skips the header date update and leaves it at "—"). This avoids adding a new function:

```js
if (!response.ok) {
  removeSkeletonState(null)   // clears shimmer, restores toggle, leaves date as "—"
  if (response.status < 500) {
    showExpiryCard()
  } else {
    showFetchErrorCard()
  }
  return null
}
```

If you prefer a dedicated `removeSkeleton()` helper (for clarity), you can add it as a thin wrapper — but `removeSkeletonState(null)` is already in the file and works correctly.

### Preserving Header and CTA (AC-1, AC-2, AC-5)

**Key constraint:** The expiry/error card MUST NOT wipe the full page. `<header>` and the CTA `<section>` must remain in the DOM and visible.

**Recommended approach — replace `<main>` inner content:**

```js
function showExpiryCard () {
  const mainEl = document.querySelector('main')
  if (!mainEl) return

  const card = document.createElement('div')
  card.className = 'py-24 flex flex-col items-center text-center gap-6 max-w-lg mx-auto'

  const icon = document.createElement('span')
  icon.className = 'material-symbols-outlined text-6xl text-secondary'
  icon.textContent = 'schedule'

  const heading = document.createElement('h2')
  heading.className = 'text-3xl font-extrabold text-primary tracking-tight'
  heading.textContent = 'Este relatório já não está disponível'

  const body = document.createElement('p')
  body.className = 'text-on-surface-variant font-medium'
  body.textContent = 'Os relatórios expiram ao fim de 48 horas. Gera um novo relatório para obteres dados actualizados.'

  const ctaBtn = document.createElement('a')
  ctaBtn.href = '/'
  ctaBtn.className = 'mt-4 px-8 py-4 bg-primary text-white font-bold rounded-lg hover:opacity-90 transition-opacity'
  ctaBtn.textContent = 'Gerar um novo relatório →'

  card.appendChild(icon)
  card.appendChild(heading)
  card.appendChild(body)
  card.appendChild(ctaBtn)

  mainEl.innerHTML = ''
  mainEl.appendChild(card)
}
```

```js
function showFetchErrorCard () {
  const mainEl = document.querySelector('main')
  if (!mainEl) return

  const card = document.createElement('div')
  card.className = 'py-24 flex flex-col items-center text-center gap-6 max-w-lg mx-auto'

  const icon = document.createElement('span')
  icon.className = 'material-symbols-outlined text-6xl text-error'
  icon.textContent = 'warning'

  const heading = document.createElement('h2')
  heading.className = 'text-3xl font-extrabold text-primary tracking-tight'
  heading.textContent = 'Não foi possível carregar o relatório'

  const reloadBtn = document.createElement('button')
  reloadBtn.className = 'mt-4 px-8 py-4 bg-primary text-white font-bold rounded-lg hover:opacity-90 transition-opacity'
  reloadBtn.textContent = 'Recarregar'
  reloadBtn.addEventListener('click', function () {
    window.location.reload()
  })

  const contactLink = document.createElement('a')
  contactLink.href = CTA_URL
  contactLink.target = '_blank'
  contactLink.rel = 'noopener noreferrer'
  contactLink.className = 'text-primary font-medium underline'
  contactLink.textContent = 'Contacta-nos'

  card.appendChild(icon)
  card.appendChild(heading)
  card.appendChild(reloadBtn)
  card.appendChild(contactLink)

  mainEl.innerHTML = ''
  mainEl.appendChild(card)
}
```

**Important:** Using `mainEl.innerHTML = ''` then `mainEl.appendChild(card)` is safe because `card` is created via `createElement` — no user-supplied values are passed to `innerHTML`. The architecture invariant scan only flags `innerHTML = \`...\${userVar}\``. This pattern clears and then appends — no string interpolation of user data.

### Architecture Invariant — innerHTML Safety

The `tests/frontend-architecture-invariants.test.js` scan flags `innerHTML` assignments that interpolate these variables:
```
apiKey, api_key, email, emailVal, emailValue, phase_message, phaseMessage,
reportUrl, reportId, report_id, jobId, job_id
```

The expiry/error card implementations above use only author-controlled strings (`textContent`) and `mainEl.innerHTML = ''` (empty string — no interpolation). This is safe and will not trigger the invariant.

**Do NOT do this (would fail invariant):**
```js
mainEl.innerHTML = `<h2>${reportId}</h2>`  // WRONG — reportId interpolated
```

### Tailwind JIT — New Dynamic Classes

If you add any new Tailwind classes via `classList.add('X')` or `className = 'X'`, the class `X` must either:
- Already appear statically in `public/report.html` (or any `public/*.html`), OR
- Have a nearby `element.style.*` inline fallback at the same write site

The card HTML string pattern used in the snippets above uses `card.className = 'py-24 ...'` with class-name assignment — this is a static string, not a classList.add() call, so the invariant scan also checks it via `rgxClassName`. Verify all classes you use appear somewhere in the HTML corpus.

**Classes verified to exist in `public/report.html` (safe to reuse):**
- `material-symbols-outlined`, `text-6xl`, `text-primary`, `text-secondary`, `text-error`, `text-on-surface-variant`
- `font-extrabold`, `font-medium`, `font-bold`, `tracking-tight`
- `flex`, `flex-col`, `items-center`, `text-center`, `gap-6`
- `px-8`, `py-4`, `py-12`, `bg-primary`, `text-white`, `rounded-lg`, `mx-auto`
- `underline`, `mt-4`, `transition-opacity`

**Classes NOT in `report.html` that appear in the suggested card snippet:**
- `py-24` — NOT in HTML. Use `py-12` (which is in the CTA section) or add inline style `card.style.paddingTop = '6rem'`
- `max-w-lg` — NOT in HTML. Use `max-w-[1400px]` (which exists) or add `card.style.maxWidth = '32rem'`
- `hover:opacity-90` — NOT in HTML. Skip the hover class; use `transition-opacity` (which exists) without the hover rule, or add an inline approach

**Recommended workaround for missing classes:** Add a single hidden safelist div to `public/report.html` with the needed classes (same pattern as the `animate-pulse` safelist div already at the bottom of `report.html`):

```html
<!-- Tailwind JIT safelist: Story 6.5 error card classes -->
<div class="hidden py-24 max-w-lg hover:opacity-90" aria-hidden="true"></div>
```

Add this immediately before `</body>` alongside the existing safelist div. This is the approved pattern per `feedback_tailwind_dynamic_classes.md`.

Alternatively, use inline styles for the three missing classes to avoid touching `report.html` at all (though the project preference is the safelist div approach).

### Playwright E2E Test Implementation

The two skipped 6.5 tests are in `tests/e2e/report.smoke.spec.js`:

```js
test.skip('6.5 — 410/expired report shows Portuguese expired-state card with "Gerar novo" CTA', async ({ page }) => {
  await page.route(`**/api/reports/${SAMPLE_ID}`, (route) => route.fulfill({ status: 410 }))
  await page.goto(`/report/${SAMPLE_ID}`)
  // Assert: "Este relatório já não está disponível" visible; "Gerar um novo relatório" button visible → links to /
})

test.skip('6.5 — generic fetch error (500) shows Portuguese "not available" error card with Reload button', async ({ page }) => {
  await page.route(`**/api/reports/${SAMPLE_ID}`, (route) => route.fulfill({ status: 500 }))
  await page.goto(`/report/${SAMPLE_ID}`)
  // Assert: "Não foi possível carregar o relatório" visible; "Recarregar" button visible
})
```

**Test 1 — 404/410 expiry (implement assertions):**

Note: The test uses status 410 (Gone). Your `showExpiryCard()` logic should trigger for **any non-ok non-5xx response**, or you can handle 404 and 410/other-4xx together. The recommended approach: if `response.status === 404` trigger expiry; treat any other non-ok (including 410, 5xx) as generic error. However, the test fixture uses 410 and expects the expiry card — so either treat 404+4xx as expiry, or check `!response.ok && response.status < 500` for expiry.

**Simplest correct approach:** `response.status >= 400 && response.status < 500` → `showExpiryCard()`; `response.status >= 500` → `showFetchErrorCard()`.

```js
test('6.5 — 410/expired report shows Portuguese expired-state card with "Gerar novo" CTA', async ({ page }) => {
  await page.route(`**/api/reports/${SAMPLE_ID}`, (route) => route.fulfill({ status: 410 }))
  await page.goto(`/report/${SAMPLE_ID}`)

  await expect(page.getByText(/Este relat.*j.*n.*dispon/i).first()).toBeVisible()
  await expect(page.getByText(/Gerar um novo relat/i).first()).toBeVisible()

  // Header still visible
  await expect(page.locator('header')).toBeVisible()
})
```

```js
test('6.5 — generic fetch error (500) shows Portuguese "not available" error card with Reload button', async ({ page }) => {
  await page.route(`**/api/reports/${SAMPLE_ID}`, (route) => route.fulfill({ status: 500 }))
  await page.goto(`/report/${SAMPLE_ID}`)

  await expect(page.getByText(/N.*o foi poss.*vel carregar/i).first()).toBeVisible()
  await expect(page.getByRole('button', { name: /Recarregar/i })).toBeVisible()

  // Header still visible
  await expect(page.locator('header')).toBeVisible()
})
```

**Important note about the 410 vs 404 split:** The ATDD static test T-6.5-static.1b checks for `404` literal OR `response.ok + "Este relat"`. If you use the `status >= 400 && status < 500` approach, the literal `404` will NOT appear as a strict comparison, but `response.ok` check will exist. Verify the ATDD test still passes with your chosen branching logic.

Safest approach that satisfies both the Playwright test (410 → expiry) and the ATDD (literal 404 or response.ok):
```js
if (!response.ok) {
  removeSkeletonState(null)
  if (response.status < 500) {
    // 4xx — treat as expired/not found
    showExpiryCard()
  } else {
    // 5xx — treat as server error
    showFetchErrorCard()
  }
  return null
}
```
This uses `response.ok` (satisfies ATDD T-6.5-static.1a) and the `"Este relat"` string is in `showExpiryCard()` (satisfies T-6.5-static.1b second condition).

### ATDD Static Tests — Verify They Continue to Pass

The 6 tests in `tests/epic6-6.5-expired-and-error-states.atdd.test.js` currently pass via the Story 6.1 scaffolds. After implementing the real functions, verify:

1. `T-6.5-static.1a`: `response.ok` or `response.status` check — satisfied by fetch chain update
2. `T-6.5-static.1b`: 404 handling + "Este relat" in source — satisfied by `showExpiryCard()`
3. `"Este relatório já não está disponível"` string in source — in `showExpiryCard()` heading textContent
4. `"Gerar um novo relatório"` in source — in `showExpiryCard()` CTA textContent
5. `"Não foi possível carregar o relatório"` in source — in `showFetchErrorCard()` heading textContent
6. `window.location.reload()` in source — in the Recarregar button click handler

### ESM / Module Notes

Same as Story 6.1: `report.js` is a plain IIFE browser script — no `import`/`export`. Keep the IIFE wrapper intact. The `CTA_URL` constant at the top of the IIFE (for the Contacta-nos link in the error card) is accessible throughout the closure.

### Scope Boundary for Story 6.5

Story 6.5 covers:
- 404/4xx response → expiry card (AC-1)
- 5xx/network error → fetch error card (AC-2)
- Header and CTA remain visible in both error states (AC-5)
- Unskipping 2 Playwright E2E tests (AC-4)

**OUT OF SCOPE for Story 6.5 (handled by other stories):**
- Opportunities/Quick Wins table rendering — Story 6.2 (may be running in parallel)
- CSV download and CTA wiring — Story 6.3 (may be running in parallel)
- Mobile layout — Story 6.4
- Full accessibility pass — Story 6.6

**Parallel story caution:** Stories 6.2, 6.3, and 6.5 are running in parallel (all branching from Story 6.1). All three modify `public/js/report.js`. When PRs are merged, expect merge conflicts on `report.js`. The merge resolution is mechanical — each story adds new function bodies and/or wires the fetch chain; they do not touch each other's sections. Resolve conflicts by keeping all implementations.

### Testing Commands

```bash
# Static ATDD for 6.5:
node --test tests/epic6-6.5-expired-and-error-states.atdd.test.js

# Frontend architecture invariants (must stay green):
node --test tests/frontend-architecture-invariants.test.js

# All report E2E tests (DOM smoke + 6.1 tests + 6.5 tests must pass):
npx playwright test tests/e2e/report.smoke.spec.js

# Full unit/ATDD suite (regression check):
npm test
```

### Architecture Boundary

This story is 100% frontend (`public/js/report.js`). The only backend it calls is `GET /api/reports/:report_id` (already fully implemented, Story 4.3 done). No server-side changes in this story.

### API Contract — Error Responses (from Story 4.3, epics-distillate.md)

```
GET /api/reports/:report_id
404: { error: "report_not_found", message: "Este relatório expirou ou não existe. Gera um novo relatório para obteres dados actualizados." }
5xx: Fastify errorHandler format → { error: string, message: string }
Network failure: fetch() throws TypeError
```

**Important:** The 404 server response body contains a Portuguese message, but the UI must NOT relay it verbatim — the UI constructs its own copy strings (ATDD T-6.5 static scans enforce this). Do NOT do:
```js
const serverMsg = await response.json()
showExpiryCard(serverMsg.message)  // WRONG — relaying server response
```

Instead, the copy strings must be hard-coded in `report.js` itself:
```js
// RIGHT — UI controls its own copy
heading.textContent = 'Este relatório já não está disponível'
```

### NFR Compliance

- **NFR-P4:** Report page load < 2s — error cards are pure DOM construction, no additional network requests
- No server-side performance impact — purely client JS

### Previous Story Context

- Story 6.1 (`done`) established `report.js` as a plain IIFE browser script; implemented skeleton, stat cards, toggle, ES no-data
- Story 6.1 (`done`) already added scaffolds `showExpiryCard()` and `showFetchErrorCard()` — Story 6.5 replaces these with real implementations
- Story 6.1 also scaffolded Story 6.2/6.3 patterns in `report.js` — do not remove or break those scaffolds

### Git Context

- `6e24095` — Phase0 reconciliation: PR#53 merged, 6.1=done; 6.2, 6.3, 6.5 unblocked
- Story 6.1 PR #53 implemented `public/js/report.js` with scaffold stubs for 6.5
- `tests/epic6-6.5-expired-and-error-states.atdd.test.js` — pre-scaffolded, 4 static tests currently passing via Story 6.1 stubs
- `tests/e2e/report.smoke.spec.js` — 2 Story 6.5 tests currently skipped

### References

- [Source: epics-distillate.md §report.js Behaviour lines 159-174] — full interaction spec for error states
- [Source: epics-distillate.md §Epic 6 AC 6.5 line 275] — compressed AC: 404 expiry card, 5xx/network error card
- [Source: epics-distillate.md §HTTP API Routes] — GET /api/reports/:id 404 response format
- [Source: tests/epic6-6.5-expired-and-error-states.atdd.test.js] — pre-scaffolded ATDD (6 static tests across 3 describe blocks)
- [Source: tests/e2e/report.smoke.spec.js lines 197-208] — 2 skipped 6.5 E2E tests to unskip + implement
- [Source: tests/frontend-architecture-invariants.test.js] — cross-cutting architecture invariants
- [Source: public/js/report.js lines 317-332] — existing scaffold stubs to replace
- [Source: public/report.html] — locked HTML; `<main>`, `<header>`, CTA `<section>` structure
- [Source: 6-1-report-js-data-fetch-skeleton-and-your-position.md] — Story 6.1 full context and patterns

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

### File List
