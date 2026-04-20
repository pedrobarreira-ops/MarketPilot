# E2E smoke tests (Playwright)

Frontend smoke tests for Epic 5 (form + progress) and Epic 6 (report page).

## When to read this

**If you're a BAD dev subagent working on Story 5.1, 5.2, or any 6.x story:** you MUST read this file before writing or modifying tests under `tests/e2e/`. The pattern rules below are load-bearing — they prevent the frontend suite from coupling to backend implementation.

**If you're Pedro or a human reviewer:** this is the short version. Full context in `_bmad-output/planning-artifacts/epic-4-retro-2026-04-20.md` → Epic 5 Preparation → "Playwright infra + one smoke-test pattern documented".

## Stack

- `@playwright/test` (dev dep, Chromium only at MVP)
- Static files served by `scripts/test-static-server.js` (Fastify + `@fastify/static`, no DB, no queue, no migrations)
- Config: `playwright.config.js` at repo root
- Tests: `tests/e2e/*.spec.js` (note `.spec.js`, NOT `.test.js` — keeps Playwright out of Node's `--test` glob)

## Run

```bash
npm run test:e2e              # headless run
npm run test:e2e:headed       # watch the browser (useful when writing new tests)
npm run test:e2e:ui           # Playwright's interactive test UI
```

The `webServer` config auto-starts the static server on `http://127.0.0.1:3001` before tests run and shuts it down after.

## Pattern rules — non-negotiable

### 1. Mock all backend calls via `page.route()`

The frontend tests must NOT depend on a running Fastify API, Redis, or SQLite. Backend behaviour is covered by `tests/*.atdd.test.js` already. Use:

```js
await page.route('**/api/generate', (route) => route.fulfill({
  status: 202,
  contentType: 'application/json',
  body: JSON.stringify({ data: { job_id: '...', report_id: '...' } }),
}))
```

**Why:** A frontend test that hits real backend routes is slow, flaky, and double-covers ATDD assertions. The frontend contract is: "given this API response, the UI does X." Mock the response, assert the X.

### 2. Selectors: role/label/text first, CSS classes last

Prefer in this order:
1. `page.getByRole('button', { name: /gerar/i })` — accessible name
2. `page.getByLabel(/email/i)` — form labels
3. `page.getByText(/relatório pronto/i)` — visible copy
4. `page.locator('#api-key')` — stable `id` attributes
5. `page.locator('.some-tailwind-class')` — **only as last resort**, Tailwind utility classes are brittle

**Why:** The HTML uses generated Tailwind classes (`cta-gradient`, `font-headline`, etc.) that may change when the visual design iterates. IDs and accessible names are more stable contracts.

### 3. Separate DOM-smoke from behavioural tests

Every new `.spec.js` file starts with ONE `DOM smoke` test that verifies the page loads with the expected static elements (no JS behaviour). This test runs today, even before JS behaviour ships. All behavioural tests are `test.skip(...)` templates until the corresponding `form.js` / `progress.js` / `report.js` ships.

When a story's JS ships, the dev subagent UNSKIPS the relevant template tests and extends them to cover every AC in the story.

### 4. Portuguese copy — match with regex (case-insensitive)

Expected copy is specified in `_bmad-output/planning-artifacts/ux-design.md`. Tests should match it case-insensitively and tolerantly — a minor copy tweak shouldn't fail the test:

```js
await expect(page.getByText(/algo correu mal/i)).toBeVisible()  // ✅
await expect(page.getByText('Algo correu mal. Tenta novamente ou contacta o suporte.')).toBeVisible()  // ❌ brittle
```

### 5. Timing: prefer `expect.poll` / `toPass` over `waitForTimeout`

```js
// ✅ waits up to 5s for the condition, retries on each step
await expect(async () => {
  const value = await bar.getAttribute('aria-valuenow')
  expect(Number(value)).toBeGreaterThanOrEqual(30)
}).toPass({ timeout: 5000 })

// ❌ sleeps blindly even if the condition is met earlier
await page.waitForTimeout(3000)
```

### 6. Isolate clipboard/permissions via explicit `browser.newContext`

Clipboard access needs Chromium permission grants. Don't try to work around it — open a dedicated context for any test that uses `navigator.clipboard`:

```js
const context = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] })
const page = await context.newPage()
// ... test body ...
await context.close()
```

## File conventions

| File | Status | Scope |
|---|---|---|
| `form.smoke.spec.js` | ✅ DOM smoke runs today; 3 behavioural templates `test.skip`-ed | Story 5.1 unskips on dev |
| `progress.smoke.spec.js` | ✅ DOM smoke runs today; 4 behavioural templates `test.skip`-ed | Story 5.2 unskips on dev |
| `report.smoke.spec.js` | Not yet created | Story 6.1 creates it following the pattern of form/progress |

## CI

Not wired to GitHub Actions at MVP — Pedro runs these locally before merging Epic 5/6 PRs. Add to CI when Epic 7 (error handling) is done and the frontend has stabilised enough that flakes won't slow the pipeline.

## Trace and video on failure

`playwright.config.js` captures `trace: 'retain-on-failure'` and `video: 'retain-on-failure'`. When a test fails, find the artifacts under `test-results/` — gitignored, regenerated each run.
