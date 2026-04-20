// tests/e2e/form.smoke.spec.js
// Epic 5 Story 5.1 — form page smoke + behavioural templates.
//
// The FIRST test in this file (DOM smoke) runs TODAY against the existing static
// index.html. The remaining tests are scaffolded templates guarded by `test.skip`
// — the Story 5.1 dev agent should unskip them as form.js gains behaviour.
//
// Pattern conventions (Epic 5/6 reuse this):
//   - Selectors prefer role/label/text over CSS class (Tailwind utility classes are
//     brittle). Use getByRole, getByLabel, getByText.
//   - API calls are mocked via `page.route()` — frontend tests must NOT hit the real
//     /api/* routes. Backend behaviour is covered by the ATDD suite under tests/*.atdd.test.js.
//   - The static server (scripts/test-static-server.js) serves public/** only; no DB or queue.

import { test, expect } from '@playwright/test'

test.describe('Form page (public/index.html)', () => {
  test('DOM smoke — page loads with expected elements', async ({ page }) => {
    await page.goto('/')

    // Hero headline in Portuguese
    await expect(page.locator('h1')).toContainText(/relatório gratuito/i)

    // Two form inputs wired by id (stable contract for form.js to rely on)
    await expect(page.locator('#api-key')).toBeVisible()
    await expect(page.locator('#email')).toBeVisible()

    // Submit button with Portuguese label
    await expect(page.getByRole('button', { name: /gerar o meu relatório/i })).toBeVisible()

    // Trust message — must be visually prominent per UX-DR (not fine print)
    await expect(page.getByText(/chave.*usada.*uma vez|nunca.*armazenada/i)).toBeVisible()
  })

  // ── UNSKIP when Story 5.1 ships form.js ───────────────────────────────────
  // Pattern: validation on empty submit should surface inline error messages
  // linked via aria-describedby (per epics-distillate.md:145).
  test('validation — empty submit surfaces Portuguese inline errors with aria-describedby', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: /gerar/i }).click()

    // api_key empty
    const apiKey = page.locator('#api-key')
    await expect(apiKey).toHaveAttribute('aria-describedby', /.+/)
    const apiKeyErrId = await apiKey.getAttribute('aria-describedby')
    await expect(page.locator(`#${apiKeyErrId}`)).toContainText(/introduz.*chave API.*Worten/i)

    // email empty
    const email = page.locator('#email')
    await expect(email).toHaveAttribute('aria-describedby', /.+/)
    const emailErrId = await email.getAttribute('aria-describedby')
    await expect(page.locator(`#${emailErrId}`)).toContainText(/introduz.*email/i)

    // Button must NOT enter loading state when client validation fails
    await expect(page.getByRole('button', { name: /gerar/i })).toBeEnabled()
  })

  // ── UNSKIP when Story 5.1 ships form.js ───────────────────────────────────
  // Pattern: valid submission mocks POST /api/generate → 202, then frontend
  // navigates to /progress?job_id=...&report_id=...
  test('valid submission — mocked 202 response navigates to progress page', async ({ page }) => {
    await page.route('**/api/generate', (route) => {
      expect(route.request().method()).toBe('POST')
      route.fulfill({
        status: 202,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { job_id: 'test-job-abc', report_id: 'test-report-xyz' },
        }),
      })
    })

    await page.goto('/')
    await page.locator('#api-key').fill('test-worten-key')
    await page.locator('#email').fill('pedro@example.com')
    await page.getByRole('button', { name: /gerar/i }).click()

    await expect(page).toHaveURL(/\/progress.*job_id=test-job-abc.*report_id=test-report-xyz|\/progress.*report_id=test-report-xyz.*job_id=test-job-abc/)
  })

  // ── UNSKIP when Story 5.1 ships form.js ───────────────────────────────────
  // Pattern: server error response surfaces inline error above submit, button returns to default.
  test('server error — non-success response shows inline error and preserves retry-ability', async ({ page }) => {
    await page.route('**/api/generate', (route) => route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'internal_server_error', message: 'Falha interna' }),
    }))

    await page.goto('/')
    await page.locator('#api-key').fill('test-key')
    await page.locator('#email').fill('test@example.com')
    await page.getByRole('button', { name: /gerar/i }).click()

    await expect(page.getByText(/algo correu mal/i)).toBeVisible()
    await expect(page.getByRole('button', { name: /gerar/i })).toBeEnabled()
    await expect(page).toHaveURL('/')
  })

  // AC-8: server 400 with api_key format error → field-level error on #api-key
  // (not a general above-button error — the specific field is identified from the response body)
  test('server 400 api_key format error — shows field-level error on #api-key', async ({ page }) => {
    await page.route('**/api/generate', (route) => route.fulfill({
      status: 400,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'validation_error', message: 'body/api_key must be a non-empty string' }),
    }))

    await page.goto('/')
    await page.locator('#api-key').fill('bad-key')
    await page.locator('#email').fill('test@example.com')
    await page.getByRole('button', { name: /gerar/i }).click()

    // Field-level error on #api-key (not general above-button error)
    const apiKey = page.locator('#api-key')
    await expect(apiKey).toHaveAttribute('aria-describedby', /.+/)
    const errId = await apiKey.getAttribute('aria-describedby')
    await expect(page.locator(`#${errId}`)).toContainText(/formato da chave não é válido/i)

    // Button must be re-enabled (loading state cleared)
    await expect(page.getByRole('button', { name: /gerar/i })).toBeEnabled()
    await expect(page).toHaveURL('/')
  })
})
