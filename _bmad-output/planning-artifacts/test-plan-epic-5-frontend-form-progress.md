# Test Plan — Epic 5: Frontend Form & Progress Pages

**Project:** MarketPilot Free Report
**Author:** Quinn (QA Agent) for Pedro
**Date:** 2026-04-20
**Epic:** 5 — Frontend: Form & Progress Pages
**Stories:** 5.1 form.js (Validation, Loading & Submission) · 5.2 progress.js (Progress Bar, Copy & Redirect)

---

## Scope

This test plan covers all acceptance criteria for Epic 5. Tests run in two layers:

1. **Playwright E2E specs** (`tests/e2e/*.spec.js`) — browser-level behavioural assertions via Playwright. All API calls are mocked via `page.route()`. The static server (`scripts/test-static-server.js`) serves `public/**` only — no DB, no queue, no Redis needed.
2. **Static source scans** — narrow, load-bearing invariants enforced by reading `public/js/*.js` source text to catch security and architecture violations that cannot be exercised through the browser (e.g. confirming `localStorage` is never read, confirming URL query params are the sole source for `job_id` / `report_id`).

No live Fastify, Redis, SQLite, or Mirakl API connection is required for any test in this plan. Backend behaviour is already covered by the Epic 4 ATDD suite.

---

## Test Files

| File | Stories Covered | Run command |
|------|----------------|-------------|
| `tests/e2e/form.smoke.spec.js` | 5.1 | `npm run test:e2e` |
| `tests/e2e/progress.smoke.spec.js` | 5.2 | `npm run test:e2e` |
| `tests/epic5-5.1-form-js.atdd.test.js` | 5.1 (static source scans) | `node --test tests/epic5-5.1-form-js.atdd.test.js` |
| `tests/epic5-5.2-progress-js.atdd.test.js` | 5.2 (static source scans) | `node --test tests/epic5-5.2-progress-js.atdd.test.js` |

Run all Epic 5 tests:

```bash
# Browser tests (both stories)
npm run test:e2e

# Static source invariant tests (both stories)
node --test tests/epic5-5.1-form-js.atdd.test.js
node --test tests/epic5-5.2-progress-js.atdd.test.js

# Run all unit/ATDD tests together
node --test "tests/**/*.test.js"
```

---

## Story 5.1 — form.js: Validation, Loading & Submission (`public/js/form.js`)

### Source files

- Implementation: `public/js/form.js`
- HTML: `public/index.html` (must NOT be modified by story 5.1)
- Test (browser): `tests/e2e/form.smoke.spec.js`
- Test (static): `tests/epic5-5.1-form-js.atdd.test.js` (new)

### Acceptance Criteria Mapping

| AC | Description | Test(s) |
|----|-------------|---------|
| AC-1 | Empty api_key on submit → red border on `#api-key` + inline error `"Introduz a tua chave API do Worten para continuar."` linked via `aria-describedby` | E2E-1.1, E2E-1.2 |
| AC-2 | Empty email on submit → inline error `"Introduz o teu email para receber o relatório."` linked via `aria-describedby` | E2E-2.1, E2E-2.2 |
| AC-3 | Invalid email format on submit (non-empty, not valid email) → inline error `"Introduz um email válido."` linked via `aria-describedby` | E2E-3.1 |
| AC-4 | Client validation failure: button does NOT enter loading/spinner state | E2E-1.3, E2E-2.3, E2E-3.2 |
| AC-5 | Client validation: focus moves to first invalid field | E2E-1.4 |
| AC-6 | Both fields empty → both errors shown simultaneously; api_key error appears first / focus goes to `#api-key` | E2E-6.1 |
| AC-7 | Valid form + POST → button shows spinner + text `"A gerar..."`, both inputs disabled | E2E-7.1, E2E-7.2 |
| AC-8 | 202 response → navigate to `/progress?job_id={job_id}&report_id={report_id}` | E2E-8.1, E2E-8.2 |
| AC-9 | Non-success HTTP response (5xx, 4xx other than 400 key format) → loading clears, inline error above button `"Algo correu mal. Tenta novamente ou contacta o suporte."` | E2E-9.1, E2E-9.2 |
| AC-10 | Network error (fetch throws) → same inline error as AC-9, button re-enabled | E2E-10.1 |
| AC-11 | Server 400 with key format error → `#api-key` red border + `"O formato da chave não é válido. Verifica se copiaste a chave correcta do portal Worten."` | E2E-11.1 |
| AC-12 (static) | `form.js` never reads or writes `localStorage` or `sessionStorage` | T12.1 (static scan) |
| AC-13 (static) | POST body contains exactly `{ api_key, email }` — no extra fields, no `job_id`, no `report_id` in outbound POST | T13.1 (static scan) |
| AC-14 (DOM smoke) | Page loads with `#api-key`, `#email`, and submit button visible | E2E-smoke.1 |

### E2E Test Case Detail (`tests/e2e/form.smoke.spec.js`)

All behavioural tests below are `test.skip` templates in the scaffold. The Story 5.1 dev agent unskips them as `form.js` gains behaviour.

| Test ID | Scenario | Expected |
|---------|----------|----------|
| E2E-smoke.1 | `DOM smoke` — page loads | `#api-key`, `#email`, submit button, trust message all visible |
| E2E-1.1 | Submit with empty api_key | `#api-key` has `aria-describedby`; linked element contains `/introduz.*chave API.*Worten/i` |
| E2E-1.2 | Submit with blank (whitespace-only) api_key | Same as E2E-1.1 |
| E2E-1.3 | Submit with empty api_key | Button remains enabled (no spinner class) |
| E2E-1.4 | Submit with empty api_key | Focused element === `#api-key` |
| E2E-2.1 | Submit with valid api_key + empty email | `#email` has `aria-describedby`; linked element contains `/introduz.*email para receber/i` |
| E2E-2.2 | Submit with valid api_key + empty email | Button remains enabled |
| E2E-2.3 | Submit with valid api_key + empty email | Focus moves to `#email` |
| E2E-3.1 | Submit with valid api_key + non-email string (`"notanemail"`) | Error contains `/introduz.*email válido/i` |
| E2E-3.2 | Submit with invalid email | Button remains enabled |
| E2E-6.1 | Submit with both fields empty | Both error messages visible; focus on `#api-key` |
| E2E-7.1 | Mocked 202: valid submit in flight | Button label becomes `/a gerar/i`, spinner visible |
| E2E-7.2 | Mocked 202: valid submit in flight | `#api-key` and `#email` both `disabled` during request |
| E2E-8.1 | Mocked 202 `{job_id:"jid", report_id:"rid"}` | URL navigates to `/progress` with `job_id=jid` and `report_id=rid` in query params |
| E2E-8.2 | 202 navigation | Previous validation error messages are NOT present in DOM after navigation |
| E2E-9.1 | Mocked 500 response | Error text `/algo correu mal/i` visible above button |
| E2E-9.2 | Mocked 500 response | Button re-enabled; stays on `/` |
| E2E-10.1 | Network error (route abort) | Same `/algo correu mal/i` error visible; button re-enabled |
| E2E-11.1 | Mocked 400 with key-format body | `#api-key` error contains `/formato da chave não é válido/i` |

### Static Source Test Case Detail (`tests/epic5-5.1-form-js.atdd.test.js`)

These tests read `public/js/form.js` source text and apply regex assertions. They are hermetic (no browser, no server) and run with `node --test`.

| Test ID | Invariant | Scan Pattern |
|---------|-----------|-------------|
| T12.1 | `localStorage` and `sessionStorage` not used | `/(localStorage|sessionStorage)/` — must NOT match |
| T13.1 | No stray fields added to the POST body (only `api_key` and `email`) | `form.js` source must contain a fetch/POST block; the body must include `api_key` and `email`; must NOT contain `job_id` or `report_id` in the outbound POST object construction |

---

## Story 5.2 — progress.js: Progress Bar, Copy & Redirect (`public/js/progress.js`)

### Source files

- Implementation: `public/js/progress.js`
- HTML: `public/progress.html` (must NOT be modified by story 5.2)
- Test (browser): `tests/e2e/progress.smoke.spec.js`
- Test (static): `tests/epic5-5.2-progress-js.atdd.test.js` (new)

### Acceptance Criteria Mapping

| AC | Description | Test(s) |
|----|-------------|---------|
| AC-1 | On page load, URL field immediately populated with `{APP_BASE_URL}/report/{report_id}` from query params — before first poll | E2E-P1.1 |
| AC-2 | `job_id` and `report_id` read from URL query params only — never from `localStorage` / `sessionStorage` | T-P-static.1 |
| AC-3 | Polling: `GET /api/jobs/:job_id` called at ~2-second intervals | E2E-P3.1 |
| AC-4 | Progress bar fill: `fetching_catalog` → ~30%; `scanning_competitors` → ~80% (crawl animation); `building_report` → ~95%; `complete` → 100% | E2E-P4.1, E2E-P4.2 |
| AC-5 | Progress bar ARIA: `role="progressbar"`, `aria-valuemin="0"`, `aria-valuemax="100"`, `aria-valuenow` updated on each phase transition | E2E-P5.1 |
| AC-6 | Live status line: both count fields non-null → `"{phase_message} ({progress_current} / {progress_total} produtos)"` with pt-PT thousand separator (`.`) | E2E-P6.1 |
| AC-7 | Live status line: either count field null → just `{phase_message}` alone (no count suffix) | E2E-P7.1 |
| AC-8 | Copy button calls `navigator.clipboard.writeText()` with the full report URL; icon → checkmark + outline green `#16A34A` for 2s then reverts | E2E-P8.1 |
| AC-9 | Copy button: accessible label `aria-label="Copiar link do relatório"` | E2E-P9.1 |
| AC-10 | Copy fallback: if `navigator.clipboard.writeText` unavailable/throws → select text + tooltip `"Link seleccionado — copia com Ctrl+C"` | E2E-P10.1 |
| AC-11 | `status: "complete"` → bar fills to 100%, after 1.5s navigate to `/report/{report_id}` | E2E-P11.1 |
| AC-12 | `status: "complete"` fallback: if no navigation within 3s → show inline link `"O teu relatório está pronto — [ver relatório →]"` | E2E-P12.1 |
| AC-13 | `status: "error"` → polling stops; bar fill → red `#DC2626` at current position | E2E-P13.1 |
| AC-14 | `status: "error"` → `"Processamento em tempo real"` label hidden (DOM text is mixed-case; visually all-caps via CSS `text-transform: uppercase`) | E2E-P14.1 |
| AC-15 | `status: "error"` → status line shows server `phase_message`; link box label → `"Este link não está disponível — a geração falhou."` | E2E-P15.1 |
| AC-16 | `status: "error"` → `"Tentar novamente"` button (→ `/`) + `"Contacta-nos"` link visible | E2E-P16.1 |
| AC-17 (static) | `job_id` and `report_id` never read from `localStorage` or `sessionStorage` | T-P-static.1 |
| AC-18 (static) | URL field is populated before first `setTimeout` / `setInterval` fires (synchronous assignment on load, not inside a callback) | T-P-static.2 |
| AC-19 (DOM smoke) | Progress page loads with Portuguese headline, tab title, and MarketPilot brand | E2E-P-smoke.1 |

### E2E Test Case Detail (`tests/e2e/progress.smoke.spec.js`)

All behavioural tests below are `test.skip` templates in the scaffold. The Story 5.2 dev agent unskips them as `progress.js` gains behaviour.

| Test ID | Scenario | Expected |
|---------|----------|----------|
| E2E-P-smoke.1 | `DOM smoke` — progress page loads | h1 contains `/a gerar.*relatório/i`; tab title matches `/Gerando Relatório\|MarketPilot/i`; MarketPilot brand text visible |
| E2E-P1.1 | Load with `?job_id=jid&report_id=rid` — before polling fires | `code` or URL text element contains `/report/rid` immediately (before 2s poll) |
| E2E-P3.1 | Mocked polling endpoint; wait 5s | Route handler called at least twice (≥2 calls within 5s) |
| E2E-P4.1 | Phase transitions: queued→fetching_catalog→scanning_competitors→building_report→complete | `aria-valuenow` on progressbar reaches values approximately 30, 80, 95, 100 in order |
| E2E-P4.2 | `scanning_competitors` phase | Bar fill > `fetching_catalog` fill |
| E2E-P5.1 | Any phase after load | Progressbar element has `role="progressbar"`, `aria-valuemin="0"`, `aria-valuemax="100"`, `aria-valuenow` is a numeric string |
| E2E-P6.1 | `fetching_catalog` with `progress_current:12400, progress_total:31179` | Page contains text matching `/12\.400.*31\.179/` (pt-PT dot thousands) |
| E2E-P7.1 | `queued` (both counts null) | Page shows phase_message without count suffix (no `/ produtos` visible for that phase) |
| E2E-P8.1 | Click copy button | `navigator.clipboard.readText()` resolves to string containing `/report/abc-123`; success icon visible briefly |
| E2E-P9.1 | Load page | Copy button has `aria-label` matching `/copiar link/i` |
| E2E-P10.1 | Clipboard unavailable (API denied) | Tooltip `/seleccionado.*copia com Ctrl/i` appears |
| E2E-P11.1 | Mocked `status: "complete"` | URL navigates to `/report/test-report-xyz` within 5s |
| E2E-P12.1 | `status: "complete"` but navigation is blocked (simulate by patching navigate) | Fallback text `/teu relatório está pronto/i` with a link containing `/report/` is shown within 4s |
| E2E-P13.1 | Mocked `status: "error"` | Progressbar or fill element has a red colour class or style (`#DC2626` or `text-red` / `bg-red`) |
| E2E-P14.1 | `status: "error"` | `"Processamento em tempo real"` text element is hidden or not visible (DOM text is mixed-case; CSS `text-transform: uppercase` renders it visually as all-caps — Playwright must match DOM text, e.g. `/processamento em tempo real/i`) |
| E2E-P15.1 | `status: "error"` with `phase_message: "Chave API inválida…"` | That message text is visible; link box label contains `/este link não está disponível/i` |
| E2E-P16.1 | `status: "error"` | "Tentar novamente" button (href `/` or navigates to `/`) visible; "Contacta-nos" link visible |

### Static Source Test Case Detail (`tests/epic5-5.2-progress-js.atdd.test.js`)

| Test ID | Invariant | Scan Pattern |
|---------|-----------|-------------|
| T-P-static.1 | `localStorage` and `sessionStorage` not used in `progress.js` | `/(localStorage\|sessionStorage)/` — must NOT match |
| T-P-static.2 | URL field populated synchronously on page load — not deferred inside a timer | Source must assign the URL field value outside any `setInterval`/`setTimeout` callback; detect by verifying assignment appears in top-level or DOMContentLoaded scope before the polling interval is set up (static heuristic: the URL assignment line appears before the `setInterval` call in source order) |

---

## Security Invariants (Cross-Cutting)

| Invariant | Verified in |
|-----------|-------------|
| `api_key` never stored client-side (localStorage/sessionStorage) | Story 5.1 AC-12 static scan |
| `job_id` / `report_id` from URL params only — no client-side persistence | Story 5.2 AC-17 static scan |
| POST body never includes `job_id`, `report_id`, or any server-generated IDs | Story 5.1 AC-13 static scan |
| Progress polling never sends `api_key` (it has no access to it) | Architecture invariant (key in keyStore.js server-side only); E2E mocks confirm polling endpoint is `/api/jobs/:id` with no auth header in the mocked route |
| Report URL populated before poll completes — URL is always from query params, never from polling response | Story 5.2 AC-18 static scan + E2E-P1.1 |

---

## NFR Coverage

| NFR | Story | Test |
|-----|-------|------|
| NFR-P1: form submit → 202 < 2s | 5.1 | E2E-7.1/8.1 verify submit flow is complete within Playwright's default timeout (30s); actual latency NFR is enforced by Epic 4 AC-8 |
| Inline errors surface without page reload (no round-trip) | 5.1 | E2E-1.1 through E2E-3.2 — all validation assertions checked without page navigation |
| Progress bar updates within 2s of status change | 5.2 | E2E-P4.1 — `toPass({ timeout: 5000 })` ensures state visible within 5s (2s poll + render margin) |
| Live status line numbers use pt-PT locale | 5.2 | E2E-P6.1 — asserts `.` thousand separator, not `,` |

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
- Clipboard tests use explicit `browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] })`
- Timing: `expect.poll` / `toPass` preferred over `waitForTimeout`
- Portuguese copy matched case-insensitively with regex

---

## Pass Criteria

A story may be marked `done` in `sprint-status.yaml` when:

1. All corresponding `test.skip` templates in `tests/e2e/form.smoke.spec.js` / `tests/e2e/progress.smoke.spec.js` have been unskipped and pass (`npm run test:e2e` green).
2. The new static source ATDD file for the story (`tests/epic5-5.1-*.atdd.test.js` or `tests/epic5-5.2-*.atdd.test.js`) passes (`node --test` zero failures).
3. The DOM smoke test (already passing today) continues to pass after the JS ships.
4. `npm test` (full unit/ATDD suite) remains green — no regressions.

---

## Implementation Notes for Dev

- `public/index.html` and `public/progress.html` must NOT be modified structurally — they are committed Stitch mockups. `form.js` and `progress.js` wire behaviour to the existing DOM.
- `public/js/form.js` is currently an empty stub; Story 5.1 fills it in.
- `public/js/progress.js` is currently an empty stub; Story 5.2 fills it in.
- HTML element IDs to target: `#api-key` (api key input), `#email` (email input), submit `<button type="submit">` inside `<form>`.
- Progress bar in `progress.html`: the `<div class="h-full bg-primary...">` inner fill element is the target for width and colour updates. It must gain `role="progressbar"` (or the parent container must) with the ARIA attributes.
- Copy button in `progress.html`: the `<button>` wrapping `content_copy` icon; must gain `aria-label="Copiar link do relatório"`.
- Report URL display: the `<code>` element currently showing `https://marketpilot.pt/report/abc-123` must be replaced with the real `APP_BASE_URL/report/{report_id}` from query params on page load.
- `APP_BASE_URL` is a server-side env var; `progress.js` should read it from a `data-` attribute on the HTML element or from a `<meta>` tag injected at serve time — OR fall back to `window.location.origin` if no server-side injection is configured at MVP. The UX spec says "populate URL field with `{APP_BASE_URL}/report/{report_id}`"; at MVP the static server doesn't inject vars, so `window.location.origin` is the practical fallback.
- The `tests/e2e/*.spec.js` files already exist as scaffolds with DOM smoke + skipped templates — the dev agent only needs to unskip and implement, not create from scratch.
- The new `tests/epic5-5.1-form-js.atdd.test.js` and `tests/epic5-5.2-progress-js.atdd.test.js` files must be created by the dev agent as part of Story 5.1 and 5.2 respectively.
