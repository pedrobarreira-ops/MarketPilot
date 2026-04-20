# Story 5.1: form.js — Validation, Loading State, and Submission

**Epic:** 5 — Frontend Form & Progress Pages
**Story:** 5.1
**Story Key:** 5-1-form-js-validation-loading-and-submission
**Status:** ready-for-dev
**Date Created:** 2026-04-20

This story does NOT call Mirakl endpoints directly. It calls `POST /api/generate` (Story 4.1) and navigates to `/progress`. No Mirakl MCP check required.

---

## User Story

As a Worten marketplace seller,
I want the form on `index.html` to validate my inputs, show a loading state when I submit, and navigate me to the progress page on success,
So that I get clear feedback about submission errors and can track report generation without re-submitting.

**Satisfies:** Epic 5.1 AC (epics-distillate.md:266) — all validation messages, aria-describedby, spinner + disabled inputs, POST flow, 202 navigate, error states.

---

## Acceptance Criteria

**AC-1: Client validation — empty API key**
- Empty or whitespace-only `#api-key` → red border + inline error: `"Introduz a tua chave API do Worten para continuar."`
- Error element linked via `aria-describedby` attribute set dynamically on `#api-key`
- Button does NOT enter loading state; remains enabled and clickable after user corrects the field
- Focus moves to `#api-key` (first invalid field)

**AC-2: Client validation — empty email**
- Empty `#email` field → red border + inline error: `"Introduz o teu email para receber o relatório."`
- Error element linked via `aria-describedby` attribute set dynamically on `#email`
- Button does NOT enter loading state; remains enabled
- If both fields are empty, focus goes to `#api-key` (first invalid field)

**AC-3: Client validation — invalid email format**
- Value in `#email` that fails email format check → red border + inline error: `"Introduz um email válido."`
- Error element linked via `aria-describedby`

**AC-4: Loading state on valid submit**
- Both fields pass validation → button immediately shows spinner + text `"A gerar..."`, inputs `#api-key` and `#email` disabled
- Spinner is a CSS animation (no external library required)
- Button text set to `"A gerar..."` (not replaced entirely — text + spinner visible together or spinner replaces arrow icon)
- Loading state holds until server responds (success or error)

**AC-5: POST to `/api/generate`**
- Valid submit issues `POST /api/generate` with JSON body `{ api_key, email }`
- `Content-Type: application/json`
- `api_key` comes from `#api-key` input (trimmed); `email` from `#email` input

**AC-6: 202 response → navigate to progress page**
- On `202 Accepted` → `window.location.href = '/progress?job_id={job_id}&report_id={report_id}'`
- Uses `data.job_id` and `data.report_id` from the response body `{ data: { job_id, report_id } }`

**AC-7: Non-success / network error → inline error above submit**
- Any non-202 response (4xx, 5xx) OR `fetch` network failure → loading state clears (button re-enabled, inputs re-enabled), inline error above button: `"Algo correu mal. Tenta novamente ou contacta o suporte."`
- Button returns to default state: navy fill, `"Gerar o meu relatório"`, enabled

**AC-8: Server 400 key format error → field-level error**
- Server returns `400` with error code indicating key format problem → loading clears, red border on `#api-key`, inline error below field: `"O formato da chave não é válido. Verifica se copiaste a chave correcta do portal Worten."`
- Detection: check response body for `error: "validation_error"` AND message containing `"api_key"` (or server-indicated field). If ambiguous, treat as general error (AC-7) — do not guess at field attribution.

**AC-9: Accessibility — errors via aria-describedby**
- All field-level error elements are injected into the DOM by form.js and carry a stable `id`
- `#api-key` gains `aria-describedby="api-key-error"` when an error is shown; error element has `id="api-key-error"`
- `#email` gains `aria-describedby="email-error"` when an error is shown; error element has `id="email-error"`
- Error elements removed (or hidden) and `aria-describedby` removed when the field passes validation on re-submit

**AC-10: Add `<script>` tag to `index.html` — the ONLY permitted HTML change**
- `public/index.html` currently has NO `<script src="/js/form.js">` tag — form.js cannot run without it
- Add `<script src="/js/form.js"></script>` at the bottom of `<body>`, before `</body>` (after the footer)
- All other `index.html` structure and Tailwind classes are locked — no other HTML authoring permitted
- form.js may additionally inject error `<p>` elements adjacent to fields via JavaScript

**AC-11: Playwright smoke tests unskipped**
- The three `test.skip` tests in `tests/e2e/form.smoke.spec.js` are unskipped and must pass:
  1. `validation — empty submit surfaces Portuguese inline errors with aria-describedby`
  2. `valid submission — mocked 202 response navigates to progress page`
  3. `server error — non-success response shows inline error and preserves retry-ability`
- The existing DOM smoke test (`DOM smoke — page loads with expected elements`) must remain passing

---

## Tasks / Subtasks

- [ ] **Task 0: Add `<script>` tag to `index.html`** (AC: 10)
  - [ ] Add `<script src="/js/form.js"></script>` immediately before `</body>` in `public/index.html`
  - [ ] Verify the DOM smoke test still passes: `npx playwright test tests/e2e/form.smoke.spec.js --grep "DOM smoke"`

- [ ] **Task 1: Wire form.js — DOM references and submit handler** (AC: 1, 2, 3, 4, 5)
  - [ ] Get references: `const form = document.querySelector('form')`, `const apiKeyInput = document.getElementById('api-key')`, `const emailInput = document.getElementById('email')`, `const submitBtn = form.querySelector('button[type="submit"]')`
  - [ ] Attach `form.addEventListener('submit', handleSubmit)`
  - [ ] Implement `clearErrors()` — remove all error elements and `aria-describedby` attrs before each submit attempt
  - [ ] Implement `showFieldError(input, errorId, message)` — injects `<p id="{errorId}" class="...">` after the input's parent `.space-y-2` div; sets `input.setAttribute('aria-describedby', errorId)`; adds red border class

- [ ] **Task 2: Validation logic** (AC: 1, 2, 3)
  - [ ] `validateApiKey(value)` — returns error string or `null`; empty/whitespace → AC-1 message; otherwise null
  - [ ] `validateEmail(value)` — returns error string or `null`; empty → AC-2 message; invalid format → AC-3 message; use simple regex `/.+@.+\..+/` (matches UX spec: "browser-native email format check")
  - [ ] On submit: collect errors, if any → show them, focus first invalid input, return (do NOT enter loading state)

- [ ] **Task 3: Loading state** (AC: 4)
  - [ ] `setLoading(true)` — set button `disabled`, set button innerHTML to spinner SVG + `"A gerar..."`, disable both inputs
  - [ ] `setLoading(false)` — restore button to default state (`"Gerar o meu relatório"` + arrow), enable button, enable both inputs
  - [ ] Spinner: inline SVG `<svg class="animate-spin …">` using Tailwind's `animate-spin` (already in Tailwind CDN on the page); no extra CSS file required

- [ ] **Task 4: POST /api/generate and response handling** (AC: 5, 6, 7, 8)
  - [ ] `setLoading(true)` before fetch
  - [ ] `fetch('/api/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ api_key: apiKeyInput.value.trim(), email: emailInput.value.trim() }) })`
  - [ ] Wrap in try/catch: network error → `setLoading(false)` + `showGeneralError()`
  - [ ] `if (res.status === 202)` → parse body, navigate to `/progress?job_id={data.job_id}&report_id={data.report_id}`
  - [ ] `if (res.status === 400)` → parse body; if server indicates api_key field → `setLoading(false)` + `showFieldError(apiKeyInput, 'api-key-error', AC-8 message)`; otherwise fall through to general error
  - [ ] All other non-202 → `setLoading(false)` + `showGeneralError()` (AC-7 message above button)

- [ ] **Task 5: General (above-button) error rendering** (AC: 7)
  - [ ] `showGeneralError()` — injects `<p id="form-error" class="…">Algo correu mal. Tenta novamente ou contacta o suporte.</p>` above the submit button
  - [ ] Remove `#form-error` in `clearErrors()`

- [ ] **Task 6: Unskip Playwright E2E tests** (AC: 11)
  - [ ] In `tests/e2e/form.smoke.spec.js`, change `test.skip(` → `test(` for all three skipped tests
  - [ ] Run `npx playwright test tests/e2e/form.smoke.spec.js` — all 4 tests pass

---

## Dev Notes

### CRITICAL: Files to create or modify

- **Create:** `public/js/form.js` (currently a 3-line comment stub — implement full behaviour)
- **Modify:** `public/index.html` — add `<script src="/js/form.js"></script>` before `</body>` ONLY (design/layout locked)
- **Modify:** `tests/e2e/form.smoke.spec.js` — unskip 3 tests only, do NOT change test logic
- **Do NOT modify:** any server files, any other test files, any other HTML pages

### Existing HTML Structure — Key Elements

From `public/index.html` (locked — do not modify):
```html
<!-- Form wrapper -->
<form class="space-y-6">
  <!-- API Key field wrapper -->
  <div class="space-y-2">
    <label for="api-key">...</label>
    <div class="relative group">
      <input id="api-key" type="password" class="w-full px-0 py-3 …" />
      <span class="absolute right-0 top-3 …">key</span>
    </div>
  </div>
  <!-- Email field wrapper -->
  <div class="space-y-2">
    <label for="email">...</label>
    <div class="relative group">
      <input id="email" type="email" class="w-full px-0 py-3 …" />
      <span class="absolute right-0 top-3 …">mail</span>
    </div>
  </div>
  <!-- Submit button -->
  <button type="submit" class="cta-gradient w-full …">
    Gerar o meu relatório
    <span class="material-symbols-outlined" data-icon="trending_up">trending_up</span>
  </button>
</form>
```

**Error element injection pattern:** Insert error `<p>` inside the `<div class="space-y-2">` wrapper, after the `<div class="relative group">`. This places the error below the input within the same field group.

### Red Border Injection

The inputs use `border-b border-outline-variant/30` for the default border. For error state, add a class that overrides to red:
```js
input.classList.add('border-b', 'border-red-600')         // add error border
input.classList.remove('border-outline-variant/30')       // remove default
// On clear:
input.classList.remove('border-red-600')
input.classList.add('border-outline-variant/30')          // restore default
```
Alternatively, use a single CSS utility add/remove approach — the exact approach is flexible as long as the red border (`#DC2626` = Tailwind `red-600`) is visually applied.

### Spinner SVG (Tailwind animate-spin)

Tailwind CDN is loaded on the page. `animate-spin` is available. Use inline SVG in the button:
```js
submitBtn.innerHTML = `
  <svg class="animate-spin -ml-1 mr-2 h-5 w-5 text-white inline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
  </svg>
  A gerar...
`
```
Store the original button HTML before entering loading state so `setLoading(false)` can restore it exactly.

### API Key Detection for 400 Field Error (AC-8)

The server returns `{ error: "validation_error", message: "body/api_key must be a non-empty string" }` for schema failures on `api_key`. Detection logic:
```js
const body = await res.json()
const isApiKeyError = body?.message?.toLowerCase().includes('api_key')
```
If `isApiKeyError` → show field error on `#api-key` (AC-8). Otherwise → general error (AC-7).

### POST /api/generate Contract (from Story 4.1)

- **Request:** `POST /api/generate` | `Content-Type: application/json` | Body: `{ api_key: string, email: string }`
- **Success:** `202 Accepted` | Body: `{ data: { job_id: string, report_id: string } }`
- **Validation failure:** `400` | Body: `{ error: "validation_error", message: string }`
- **Server error:** `5xx` | Body: `{ error: string, message: string }`

### Navigation on Success (AC-6)

```js
const { job_id, report_id } = data.data  // note: data.data (nested)
window.location.href = `/progress?job_id=${job_id}&report_id=${report_id}`
```

### Playwright Test Contract (from `tests/e2e/form.smoke.spec.js`)

The E2E tests are your primary acceptance test. They specify exact selector/behavior contracts:
- `#api-key` and `#email` selected by id — these ids are locked in `index.html`
- `getByRole('button', { name: /gerar o meu relatório/i })` — button must carry this visible text in default state
- On validation error: `#api-key` must have `aria-describedby` pointing to an element with text matching `/introduz.*chave API.*Worten/i`
- On mocked 202: URL must match `/progress.*job_id=test-job-abc.*report_id=test-report-xyz/`
- On 500: `getByText(/algo correu mal/i)` visible; button enabled; URL remains `/`

### No Loading State on Client Validation Failure

This is explicitly specified in UX doc and epics-distillate.md:140. The button must NOT go into loading state when client-side validation fails. Only enter loading state AFTER validation passes.

### ESM Module (no `type="module"` needed for plain scripts)

`index.html` currently loads `form.js` as a plain script (not a module). The JS file should be written as a standard browser script (no `import`/`export`). DO NOT add `type="module"` to the script tag without modifying `index.html` — but since `index.html` is locked, write form.js as plain script. No `require()`, no imports.

**Script tag placement:** Add `<script src="/js/form.js"></script>` before `</body>`. Since it's at the end of body, the DOM is already parsed when the script runs — no `DOMContentLoaded` listener needed (but wrapping in one is fine for safety). Use `defer` attribute optionally: `<script defer src="/js/form.js"></script>`.

### Architecture Boundary

This story is 100% frontend (`public/js/form.js`). No server-side changes. The backend POST /api/generate contract is fully implemented (Story 4.1, done). No queue, no DB, no keyStore changes.

### Project Structure Notes

- `public/js/form.js` — CREATE (currently a 3-line stub comment — implement full behaviour)
- `public/index.html` — MODIFY: add `<script src="/js/form.js"></script>` before `</body>` ONLY — no other changes to HTML structure, design, or Tailwind classes
- `tests/e2e/form.smoke.spec.js` — MODIFY (unskip 3 tests only — no logic changes)

**Why index.html needs the script tag:** The Stitch mockup export did not include JS wiring. The stub file `public/js/form.js` exists but is never loaded because `index.html` has no `<script src="/js/form.js">` tag (verified: only Tailwind CDN and tailwind-config scripts are present). Without the tag, all form.js code is dead code.

### Playwright Test Infrastructure

The E2E tests use a static server (`scripts/test-static-server.js`) serving `public/**` only. The `playwright.config.js` starts this server automatically. To run:
```bash
npx playwright test tests/e2e/form.smoke.spec.js
```
See `tests/e2e/README.md` for setup details. Tests mock `POST /api/generate` via `page.route()` — no real server or DB needed.

### Testing Commands

```bash
# E2E form tests only (headless):
npm run test:e2e -- --project=chromium tests/e2e/form.smoke.spec.js
# Or directly:
npx playwright test tests/e2e/form.smoke.spec.js

# Headed (watch the browser — useful when developing):
npm run test:e2e:headed -- tests/e2e/form.smoke.spec.js

# Full Playwright suite:
npm run test:e2e

# Full unit/ATDD suite (must remain green — no regressions):
npm test
```

**Note:** Playwright tests use `.spec.js` extension (not `.test.js`). The `npm test` glob (`tests/**/*.test.js`) does NOT pick up Playwright spec files — the two suites are independent.

### Previous Story Context (Epic 4 — HTTP API complete)

All Epic 4 stories are done. This story consumes the completed API contract:
- Story 4.1 (`POST /api/generate`) — the endpoint this form calls; contract: validates api_key+email, returns `202 { data: { job_id, report_id } }`
- Story 4.2a — polling endpoint contract has been extended; form.js does NOT call the polling endpoint (that's Story 5.2)
- The `job_id` + `report_id` from the 202 response are passed as query params to `/progress` for Story 5.2 consumption

**Pattern from Epic 4 stories:**
- Error response shape: `{ error: string, message: string }` (not `{ errors: [] }`)
- Success wrapper: `{ data: { ... } }` — always nested under `data`

### Git Context

- `9e348c1` — Add test plan for Epic 5 (Frontend: Form & Progress Pages) — includes `tests/e2e/form.smoke.spec.js` with the 3 skipped tests this story must unskip
- `e06ff42` — phase0 reconciliation: epic-4 done, epic-5 unblocked — confirmed Epic 5 is now ready to start
- `84e2e96` — Wire Playwright E2E infrastructure with smoke + template tests for Epic 5/6 — the Playwright config and static server are already set up

### NFR Compliance

- **NFR-P1:** form submit → job enqueued < 2s — form.js has zero impact on server latency; it just issues the fetch and navigates on 202
- No server-side performance impact — this is purely client JS

### References

- [Source: epics-distillate.md §form.js Behaviour] — full interaction spec (lines 140-145)
- [Source: epics-distillate.md §Epic 5 AC 5.1] — compressed acceptance criteria
- [Source: ux-design.md §Form Page Interaction Specifications] — canonical UX spec for validation states, loading state, error states
- [Source: architecture-distillate.md §API Routes] — POST /api/generate contract
- [Source: tests/e2e/form.smoke.spec.js] — locked E2E test contract (3 tests to unskip)
- [Source: public/index.html] — locked HTML; element ids `#api-key`, `#email`; button selector
- [Source: public/js/form.js] — current stub (3-line comment); this story implements it
- [Source: _bmad-output/implementation-artifacts/4-1-post-api-generate-route.md §AC-7] — server returns `202 { data: { job_id, report_id } }`

---

## Dev Agent Record

### Agent Model Used

_to be filled by dev agent_

### Debug Log References

_to be filled by dev agent_

### Completion Notes List

_to be filled by dev agent_

### File List

_to be filled by dev agent_

### Change Log

- 2026-04-20: Story 5.1 spec created — create-story workflow, comprehensive developer guide.
