# Story 5.2: progress.js — Progress Bar, Copy & Redirect

**Epic:** 5 — Frontend Form & Progress Pages
**Story:** 5.2
**Story Key:** 5-2-progress-js-progress-bar-copy-redirect
**Status:** ready-for-dev
**Date Created:** 2026-04-20

This story does NOT call Mirakl endpoints directly. It consumes `GET /api/jobs/:job_id` (Stories 4.2 + 4.2a). No Mirakl MCP check required.

---

## User Story

As a Worten marketplace seller who just submitted the report generation form,
I want the progress page to show me a live progress bar, the report URL (immediately, before polling completes), and navigate me automatically when the report is ready,
So that I can share or bookmark the report link upfront and get redirected without manual action when generation finishes.

**Satisfies:** Epic 5.2 AC (epics-distillate.md:267) — URL field populated before poll, copy button, progress bar fill by phase, ARIA, complete→redirect, fallback link, error state with retry/contact.

---

## Acceptance Criteria

**AC-1: URL field populated immediately on load — before first poll**
- On page load, the `<code>` element (currently `https://marketpilot.pt/report/abc-123`) is immediately replaced with `{window.location.origin}/report/{report_id}` where `report_id` comes from the URL query param `report_id`
- This assignment happens synchronously in the top-level script execution (or inside a `DOMContentLoaded` listener) — NOT inside a `setInterval` or `setTimeout` callback
- The URL is populated before any polling response arrives (i.e., the field shows the correct URL even if the network is slow or offline)
- `APP_BASE_URL` is a server-side env var not available to client JS at MVP; use `window.location.origin` as the fallback

**AC-2: `job_id` and `report_id` from URL query params only — never localStorage/sessionStorage**
- `new URLSearchParams(window.location.search)` is the only source for `job_id` and `report_id`
- `localStorage` and `sessionStorage` are never read or written in `progress.js`

**AC-3: Polling `GET /api/jobs/:job_id` at 2-second intervals**
- On page load, start polling `GET /api/jobs/{job_id}` using `setInterval` (or equivalent) at approximately 2-second intervals
- `job_id` comes from URL query params (AC-2)
- Polling continues until `status === "complete"` or `status === "error"`

**AC-4: Progress bar fill by phase**
- `fetching_catalog` → bar width ~30%
- `scanning_competitors` → bar width ~80% with a pulse/crawl animation (the existing `.progress-pulse` CSS class in `progress.html` achieves this)
- `building_report` → bar width ~95%
- `complete` → bar width 100%
- Width transitions are applied by setting inline `style="width: X%"` on the inner fill `<div>` element (the `<div class="h-full bg-primary progress-pulse...">` element in `progress.html`)
- For `scanning_competitors`, add the `progress-pulse` class to animate; remove it for other phases

**AC-5: Progress bar ARIA attributes**
- The progress bar element must carry `role="progressbar"`, `aria-valuemin="0"`, `aria-valuemax="100"`, and `aria-valuenow` updated on every phase transition
- `aria-valuenow` must be a numeric string matching the current fill percentage (e.g. `"30"`, `"80"`, `"95"`, `"100"`)
- Apply ARIA attributes to the outer container `<div>` (the `<div class="w-full h-1.5 bg-surface-variant...">` element) or the fill `<div>` — either is acceptable as long as the `role="progressbar"` is on exactly one element and Playwright can locate it with `page.getByRole('progressbar')`

**AC-6: Live status line — counts visible when non-null**
- When the polling response has both `progress_current` and `progress_total` as non-null integers, display:
  `"{phase_message} ({progress_current} / {progress_total} produtos)"`
- Numbers must be formatted with the pt-PT locale (thousand separator is `.`): e.g. `12.400` not `12,400` and not `12400`
- Use `Number.toLocaleString('pt-PT')` for formatting

**AC-7: Live status line — phase_message only when counts null**
- When either `progress_current` or `progress_total` is null (e.g., `queued`, `building_report`, `complete` phases), display only `{phase_message}` with no count suffix
- The text `"/ produtos"` must NOT appear in these phases

**AC-8: Copy button — clipboard.writeText with success state**
- The copy `<button>` (wrapping the `content_copy` icon) calls `navigator.clipboard.writeText(reportUrl)` when clicked
- On success: replace the `content_copy` icon with `check` (or `check_circle`) icon; apply outline-green style (`color: #16A34A` or Tailwind `text-[#16A34A]`); after 2 seconds, revert icon and colour to original state
- `reportUrl` is the same value already displayed in the `<code>` element (AC-1)

**AC-9: Copy button — accessible label**
- The copy `<button>` must have `aria-label="Copiar link do relatório"` set by `progress.js`
- This attribute must be present on page load (set during initialisation, not only on click)

**AC-10: Copy fallback — clipboard API unavailable or throws**
- If `navigator.clipboard` is undefined OR `navigator.clipboard.writeText()` throws/rejects, fall back to:
  - Select the text in the `<code>` element using `document.execCommand('copy')` or a `<input>` selection trick
  - Show a tooltip/inline message `"Link seleccionado — copia com Ctrl+C"` near the copy button

**AC-11: `status: "complete"` → navigate to report after 1.5s**
- On receiving `status: "complete"` from the polling endpoint:
  1. Set bar to 100%, update `aria-valuenow="100"`
  2. Stop polling (`clearInterval`)
  3. After 1.5 seconds, navigate to `/report/{report_id}` via `window.location.href`

**AC-12: `status: "complete"` navigation fallback at 3s**
- If `window.location.href` navigation has not occurred within 3 seconds of `complete` (e.g., blocked by browser), display inline fallback text:
  `"O teu relatório está pronto — "` followed by a link `"ver relatório →"` pointing to `/report/{report_id}`

**AC-13: `status: "error"` → polling stops; bar turns red**
- On receiving `status: "error"`:
  - Stop polling (`clearInterval`)
  - Keep the bar fill at its current width percentage but change the fill colour to red (`#DC2626`); replace any `bg-primary` class with `bg-red-600` or equivalent; remove pulse animation class

**AC-14: `status: "error"` → "Processamento em tempo real" label hidden**
- The `<span class="text-[10px] font-bold uppercase tracking-widest font-label text-slate-400">` element containing "Processamento em tempo real" (DOM text mixed-case; CSS renders all-caps) must be hidden (set `style="display: none"` or equivalent) when an error occurs
- Playwright matches the DOM text case-insensitively: `/processamento em tempo real/i`

**AC-15: `status: "error"` → status shows server phase_message; link box label updated**
- Update the status text line to show the server-returned `phase_message` (the Portuguese safe error message)
- Change the link box label from `"Guarda este link — o relatório fica disponível 48 horas"` to `"Este link não está disponível — a geração falhou."`

**AC-16: `status: "error"` → show retry and contact actions**
- Show a `"Tentar novamente"` button (or link) that navigates to `/` (the home/form page)
- Show a `"Contacta-nos"` link (href may be `mailto:` or `#support` — any visible link with that text is acceptable)
- Both must be visible (not hidden) when error state is active

**AC-17 (static scan): no localStorage/sessionStorage**
- `progress.js` source text must not contain any reference to `localStorage` or `sessionStorage`

**AC-18 (static scan): URL field populated before setInterval**
- In `progress.js` source text, the line that assigns to the `<code>` element's `textContent` (or `innerText`) must appear before (earlier line number than) the `setInterval(` call that starts polling

**AC-19 (DOM smoke): Progress page loads**
- Progress page loads with: h1 containing `/a gerar.*relatório/i`, tab title matching `/Gerando Relatório|MarketPilot/i`, and MarketPilot brand text visible

**AC-20: Add `<script>` tag to `progress.html` — the ONLY permitted HTML change**
- `public/progress.html` currently has NO `<script src="/js/progress.js">` tag — progress.js cannot run without it
- Add `<script src="/js/progress.js"></script>` immediately before `</body>` in `public/progress.html`
- All other `progress.html` structure and Tailwind classes are locked — no other HTML changes permitted
- progress.js may dynamically update element attributes and content via JavaScript, but must not restructure the DOM beyond what is specified above

---

## Tasks / Subtasks

- [ ] **Task 0: Add `<script>` tag to `progress.html`** (AC: 20)
  - [ ] Add `<script src="/js/progress.js"></script>` immediately before `</body>` in `public/progress.html`
  - [ ] Verify the DOM smoke test still passes: `npx playwright test tests/e2e/progress.smoke.spec.js --grep "DOM smoke"`

- [ ] **Task 1: Wire progress.js — DOM references and initialisation** (AC: 1, 2, 9)
  - [ ] Read `job_id` and `report_id` from `new URLSearchParams(window.location.search)` only
  - [ ] Get DOM references: outer progress container (`role="progressbar"` target), inner fill `<div>`, status text `<p>`, `<code>` URL element, copy `<button>`, processing label `<span>`
  - [ ] Immediately assign `<code>` text to `window.location.origin + '/report/' + reportId` (synchronously, before any `setInterval`)
  - [ ] Set `aria-label="Copiar link do relatório"` on copy button during init
  - [ ] Set ARIA attributes on progress bar: `role="progressbar"`, `aria-valuemin="0"`, `aria-valuemax="100"`, `aria-valuenow="0"`

- [ ] **Task 2: Progress bar fill function** (AC: 4, 5)
  - [ ] Implement `setProgress(phase)` — maps phase string to a percentage:
    - `queued` → 0 (or leave at current; do not reset)
    - `fetching_catalog` → 30
    - `scanning_competitors` → 80 (add `progress-pulse` class)
    - `building_report` → 95 (remove `progress-pulse` class)
    - `complete` → 100 (remove `progress-pulse` class)
  - [ ] Update `aria-valuenow` on each call
  - [ ] Use `innerFill.style.width = pct + '%'`; manage `progress-pulse` class add/remove
  - [ ] Error state: preserve current `style.width`; replace `bg-primary` with `bg-red-600`; remove `progress-pulse`

- [ ] **Task 3: Live status line** (AC: 6, 7)
  - [ ] Implement `updateStatusLine(data)`:
    - If `data.progress_current !== null && data.progress_total !== null`:
      `statusEl.textContent = data.phase_message + ' (' + data.progress_current.toLocaleString('pt-PT') + ' / ' + data.progress_total.toLocaleString('pt-PT') + ' produtos)'`
    - Else: `statusEl.textContent = data.phase_message`

- [ ] **Task 4: Polling loop** (AC: 3, 4, 5, 6, 7, 11, 12, 13, 14, 15, 16)
  - [ ] Start `setInterval` at 2000ms after AC-1 URL assignment (so URL is always set first in source order)
  - [ ] Each tick: `fetch('/api/jobs/' + jobId)` → parse JSON → extract `data`
  - [ ] Call `setProgress(data.status)` and `updateStatusLine(data)`
  - [ ] On `status === 'complete'`: `clearInterval(intervalId)`; set bar 100%; after 1.5s `window.location.href = '/report/' + reportId`; also set a 3s fallback timeout to show the inline link (AC-12)
  - [ ] On `status === 'error'`: `clearInterval(intervalId)`; apply red bar (AC-13); hide processing label (AC-14); update status text and link box label (AC-15); show retry/contact actions (AC-16)
  - [ ] Network/fetch errors: log to console; continue polling (do not crash)

- [ ] **Task 5: Copy button behaviour** (AC: 8, 10)
  - [ ] Attach click listener to copy button
  - [ ] On click: try `navigator.clipboard.writeText(reportUrl)`; on success: swap icon to `check`/`check_circle`, add green colour class, restore after 2s via `setTimeout`
  - [ ] Catch / fallback: if `navigator.clipboard` undefined or throws → use `document.execCommand('copy')` after selecting the `<code>` text, show inline tooltip `"Link seleccionado — copia com Ctrl+C"`

- [ ] **Task 6: Create static ATDD file** (AC: 17, 18)
  - [ ] Create `tests/epic5-5.2-progress-js.atdd.test.js` (new file)
  - [ ] T-P-static.1: read `public/js/progress.js` source; assert `/(localStorage|sessionStorage)/` does NOT match
  - [ ] T-P-static.2: read source; find line index of `<code>` element URL assignment; find line index of `setInterval(`; assert URL assignment line index < `setInterval` line index
  - [ ] Run: `node --test tests/epic5-5.2-progress-js.atdd.test.js` — all tests must pass

- [ ] **Task 7: Unskip Playwright E2E tests** (AC: 19 and all E2E-P tests)
  - [ ] In `tests/e2e/progress.smoke.spec.js`, change `test.skip(` → `test(` for all skipped tests
  - [ ] Run `npx playwright test tests/e2e/progress.smoke.spec.js` — all tests pass
  - [ ] Verify DOM smoke test remains passing

---

## Dev Notes

### CRITICAL: Files to create or modify

- **Create:** `tests/epic5-5.2-progress-js.atdd.test.js` (static source scan ATDD)
- **Modify:** `public/js/progress.js` (currently a 2-line comment stub — implement full behaviour)
- **Modify:** `public/progress.html` — add `<script src="/js/progress.js"></script>` before `</body>` ONLY (design/layout locked)
- **Modify:** `tests/e2e/progress.smoke.spec.js` — unskip 4 skipped tests only, do NOT change test logic
- **Do NOT modify:** any server files, any other test files, any other HTML pages, `public/index.html`

### Existing HTML Structure — Key Elements (from `public/progress.html`)

The HTML is locked. These are the elements progress.js must target:

```html
<!-- Progress bar: outer container — add role="progressbar" here -->
<div class="w-full h-1.5 bg-surface-variant rounded-full overflow-hidden mb-4">
  <!-- Inner fill — update width + colour + pulse class here -->
  <div class="h-full bg-primary progress-pulse rounded-full"></div>
</div>

<!-- Status line -->
<p class="text-on-surface-variant font-medium text-sm tracking-wide">
  A obter catálogo... <span class="text-primary">(12.400 / 31.179 produtos)</span>
</p>

<!-- Processing label — hide on error -->
<span class="text-[10px] font-bold uppercase tracking-widest font-label text-slate-400">
  Processamento em tempo real
</span>

<!-- Report URL: code element — set textContent here -->
<code class="text-xs md:text-sm text-primary font-medium truncate pr-4">
  https://marketpilot.pt/report/abc-123
</code>

<!-- Copy button — add aria-label + click handler here -->
<button class="flex items-center gap-2 text-primary hover:text-on-primary-container transition-colors">
  <span class="material-symbols-outlined text-xl" data-icon="content_copy">content_copy</span>
</button>

<!-- Link box label — update on error -->
<span class="text-[10px] font-bold text-primary uppercase tracking-widest font-label">
  Guarda este link — o relatório fica disponível 48 horas
</span>
```

### Status → Progress % Mapping

```js
const PHASE_PCT = {
  queued:               0,    // show initial animated state (or leave at 0)
  fetching_catalog:     30,
  scanning_competitors: 80,   // add progress-pulse class
  building_report:      95,
  complete:             100,
  error:                null, // preserve current position; turn red
}
```

### DOM Selectors (recommended)

```js
const progressOuter = document.querySelector('.w-full.h-1\\.5.bg-surface-variant')   // outer container
const progressFill  = progressOuter.querySelector('.h-full')                           // inner fill div
const statusEl      = document.querySelector('p.text-on-surface-variant')              // status line
const processingEl  = document.querySelector('.tracking-widest.text-slate-400')        // "Processamento em tempo real"
const codeEl        = document.querySelector('code.text-primary')                      // URL display
const copyBtn       = document.querySelector('button .material-symbols-outlined[data-icon="content_copy"]')?.closest('button')
const linkLabel     = document.querySelector('.text-primary.uppercase.tracking-widest.font-label')
```

**Alternative safer approach:** Add temporary `id` attributes via JS on init rather than relying on class-chain selectors. Since progress.js is injected into a locked HTML page, class selectors are the only option — pick the most discriminating ones and comment them clearly.

### Progress Bar ARIA Pattern

```js
// On init:
progressOuter.setAttribute('role', 'progressbar')
progressOuter.setAttribute('aria-valuemin', '0')
progressOuter.setAttribute('aria-valuemax', '100')
progressOuter.setAttribute('aria-valuenow', '0')

// On each phase transition:
progressOuter.setAttribute('aria-valuenow', String(pct))
progressFill.style.width = pct + '%'
```

### Live Status Line — Portuguese Locale

```js
// When both counts non-null:
const current = data.progress_current.toLocaleString('pt-PT')  // "12.400"
const total   = data.progress_total.toLocaleString('pt-PT')    // "31.179"
statusEl.textContent = `${data.phase_message} (${current} / ${total} produtos)`

// When either count is null:
statusEl.textContent = data.phase_message
```

Note: in `progress.html` the status `<p>` currently contains a nested `<span>`. `progress.js` may overwrite `textContent` to replace the whole line — this is acceptable since the nested span is static mockup content.

### Complete → Navigate Pattern

```js
case 'complete':
  clearInterval(intervalId)
  setProgress('complete')  // bar 100%
  updateStatusLine(data)

  // Primary: navigate after 1.5s
  const navigateTimeout = setTimeout(() => {
    window.location.href = '/report/' + reportId
  }, 1500)

  // Fallback: show link at 3s if still on page
  setTimeout(() => {
    // Only fires if navigation didn't happen
    showFallbackLink(reportId)
  }, 3000)
  break
```

For the fallback, inject an element below the status line (or into the progress card) showing the text and link. The 3s timeout will fire if navigation failed (e.g. tested by Playwright patching `window.location`).

### Error State Pattern

```js
case 'error':
  clearInterval(intervalId)

  // Red bar at current position
  progressFill.classList.remove('bg-primary', 'progress-pulse')
  progressFill.classList.add('bg-red-600')

  // Hide processing label
  processingEl.style.display = 'none'

  // Status text = server phase_message
  statusEl.textContent = data.phase_message || 'Erro desconhecido.'

  // Update link box label
  linkLabel.textContent = 'Este link não está disponível — a geração falhou.'

  // Inject retry + contact actions
  showErrorActions()
  break
```

For `showErrorActions()`, inject two elements into the progress card (e.g., below the link box):
- A button/link: text `"Tentar novamente"`, `href="/"` (or `onclick="window.location.href='/'"`)
- A link: text `"Contacta-nos"`, `href="mailto:suporte@marketpilot.pt"` or `href="#support"` — any href is acceptable for MVP, the text must match

### Copy Button — Icon Swap Pattern

```js
copyBtn.addEventListener('click', async () => {
  const reportUrl = codeEl.textContent
  const iconEl = copyBtn.querySelector('.material-symbols-outlined')

  try {
    await navigator.clipboard.writeText(reportUrl)
    // Success state
    iconEl.textContent = 'check_circle'
    copyBtn.style.color = '#16A34A'
    setTimeout(() => {
      iconEl.textContent = 'content_copy'
      copyBtn.style.color = ''
    }, 2000)
  } catch (err) {
    // Fallback
    fallbackCopy(reportUrl)
  }
})
```

### Copy Fallback Implementation

```js
function fallbackCopy(text) {
  // Method 1: try execCommand
  try {
    const range = document.createRange()
    range.selectNodeContents(codeEl)
    const sel = window.getSelection()
    sel.removeAllRanges()
    sel.addRange(range)
    document.execCommand('copy')
  } catch (_) {}

  // Show tooltip regardless
  showCopyTooltip('Link seleccionado — copia com Ctrl+C')
}
```

### Static ATDD File Structure

Create `tests/epic5-5.2-progress-js.atdd.test.js`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const src = readFileSync('public/js/progress.js', 'utf8')
const lines = src.split('\n')

test('T-P-static.1: localStorage and sessionStorage not used', () => {
  assert.doesNotMatch(src, /(localStorage|sessionStorage)/)
})

test('T-P-static.2: URL field populated before setInterval', () => {
  const urlAssignIdx  = lines.findIndex(l => l.includes('codeEl') && (l.includes('.textContent') || l.includes('.innerText')))
  const intervalIdx   = lines.findIndex(l => l.includes('setInterval('))
  assert.ok(urlAssignIdx >= 0, 'URL code element assignment not found in progress.js')
  assert.ok(intervalIdx  >= 0, 'setInterval not found in progress.js')
  assert.ok(urlAssignIdx < intervalIdx, `URL assignment (line ${urlAssignIdx + 1}) must precede setInterval (line ${intervalIdx + 1})`)
})
```

**Note on static scan heuristic (T-P-static.2):** The variable name `codeEl` is a suggested name; if the dev agent uses a different variable name (e.g. `urlEl`, `reportUrlEl`), the scan pattern must be adjusted to match the actual source. The invariant is: the textContent assignment to the `<code>` element must appear before `setInterval(` in source order. The dev agent should use `codeEl` to keep the scan simple, OR update the ATDD pattern to match their chosen name.

### ESM / Module Notes

`progress.html` uses no `type="module"` on existing scripts. Write `progress.js` as a plain browser script (no `import`/`export`). Wrapping in an IIFE or `DOMContentLoaded` listener is fine. Do NOT add `type="module"` to the `<script>` tag.

### API Contract — GET /api/jobs/:job_id (from Stories 4.2 + 4.2a)

```
GET /api/jobs/:job_id
200 OK: { data: { status, phase_message, progress_current, progress_total, report_id } }
  - status: "queued" | "fetching_catalog" | "scanning_competitors" | "building_report" | "complete" | "error"
  - phase_message: string (Portuguese) | null
  - progress_current: integer | null  (non-null during fetching_catalog + scanning_competitors only)
  - progress_total:   integer | null  (non-null during fetching_catalog + scanning_competitors only)
  - report_id: string (UUID)
404: { error: "job_not_found", message: "Job não encontrado." }
```

### Testing Commands

```bash
# DOM smoke test (run first — must stay green):
npx playwright test tests/e2e/progress.smoke.spec.js --grep "DOM smoke"

# All progress E2E tests (after implementation):
npx playwright test tests/e2e/progress.smoke.spec.js

# Static ATDD:
node --test tests/epic5-5.2-progress-js.atdd.test.js

# Full E2E suite (regression check):
npm run test:e2e

# Full unit/ATDD suite (regression check — must stay green):
npm test
```

### Architecture Boundary

This story is 100% frontend (`public/js/progress.js`). The only backend it calls is `GET /api/jobs/:job_id` (already fully implemented, Stories 4.2 + 4.2a done). No server-side changes in this story.

### Previous Story Context (5.1 done, Epic 4 done)

- Story 5.1 implemented `public/js/form.js` and added `<script src="/js/form.js">` to `index.html`. Same pattern applies here for `progress.js` / `progress.html`.
- Story 4.2a (done) extended the polling endpoint with `progress_current` / `progress_total` structured fields. The E2E tests mock the full 5-field response.
- The `report_id` passed to this page comes from the `202` response of `POST /api/generate` (Story 4.1) via the form navigation in Story 5.1.

### NFR Compliance

- **NFR-I3 (UX):** Report URL shown on progress screen before email sent — AC-1 satisfies this by populating synchronously on load before any polling or email delivery
- No server-side performance impact — purely client JS

### Git Context

- `84e2e96` — Wire Playwright E2E infrastructure with smoke + template tests for Epic 5/6 — includes `tests/e2e/progress.smoke.spec.js` with 4 skipped tests this story must unskip
- Story 5.1 (`done`) — established the pattern for script-tag injection into HTML pages

### References

- [Source: epics-distillate.md §progress.js Behaviour] — full interaction spec (lines 148-156)
- [Source: epics-distillate.md §Epic 5 AC 5.2] — compressed acceptance criteria (line 267)
- [Source: test-plan-epic-5-frontend-form-progress.md §Story 5.2] — complete test case table, static scan patterns
- [Source: architecture-distillate.md §API Routes] — GET /api/jobs/:job_id contract
- [Source: 4-2a-polling-progress-contract.md] — structured progress fields contract
- [Source: tests/e2e/progress.smoke.spec.js] — locked E2E test contract (4 tests to unskip)
- [Source: public/progress.html] — locked HTML; element structure for DOM targeting
- [Source: public/js/progress.js] — current stub (2-line comment); this story implements it
- [Source: 5-1-form-js-validation-loading-submission.md] — pattern reference for script-tag injection and plain-script implementation style

---

## Dev Agent Record

### Agent Model Used

_To be filled by dev agent_

### Debug Log References

_To be filled by dev agent_

### Completion Notes List

_To be filled by dev agent_

### File List

_To be filled by dev agent_

### Change Log

- 2026-04-20: Story 5.2 spec created — create-story workflow, comprehensive developer guide.
