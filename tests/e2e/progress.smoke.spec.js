// tests/e2e/progress.smoke.spec.js
// Epic 5 Story 5.2 — progress page smoke + behavioural templates.
//
// FIRST test runs TODAY. Remaining tests are scaffolded templates — unskip them
// as progress.js gains behaviour. See tests/e2e/README.md for conventions.

import { test, expect } from '@playwright/test'

test.describe('Progress page (public/progress.html)', () => {
  test('DOM smoke — page loads with expected static elements', async ({ page }) => {
    await page.goto('/progress.html?job_id=test-job&report_id=test-report')

    // Portuguese generating-report headline
    await expect(page.locator('h1')).toContainText(/a gerar.*relatório/i)

    // Tab title
    await expect(page).toHaveTitle(/Gerando Relatório|MarketPilot/i)

    // MarketPilot brand visible
    await expect(page.getByText('MarketPilot', { exact: false }).first()).toBeVisible()
  })

  // ── UNSKIP when Story 5.2 ships progress.js ─────────────────────────────
  // Pattern: polling with mocked status transitions drives the progress bar fill.
  // Must poll every 2s; three phases map to ~30% / ~80% / ~95% / 100% fills.
  test('polling — status transitions update aria-valuenow on the progress bar', async ({ page }) => {
    // Serve a sequence of polling responses
    let pollCount = 0
    const timeline = [
      { status: 'queued',                phase_message: 'A preparar…',                           progress_current: null,  progress_total: null  },
      { status: 'fetching_catalog',      phase_message: 'A obter catálogo…',                     progress_current: 7200,  progress_total: 31179 },
      { status: 'scanning_competitors',  phase_message: 'A verificar concorrentes…',             progress_current: 15427, progress_total: 28440 },
      { status: 'building_report',       phase_message: 'A construir relatório…',                progress_current: null,  progress_total: null  },
      { status: 'complete',              phase_message: 'Relatório pronto!',                     progress_current: null,  progress_total: null  },
    ]
    await page.route('**/api/jobs/test-job', (route) => {
      const idx = Math.min(pollCount++, timeline.length - 1)
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { ...timeline[idx], report_id: 'test-report' } }),
      })
    })

    await page.goto('/progress.html?job_id=test-job&report_id=test-report')

    const bar = page.getByRole('progressbar')
    await expect(bar).toBeVisible()

    // Wait through polls; aria-valuenow should increase
    await expect(async () => {
      const valueNow = Number(await bar.getAttribute('aria-valuenow'))
      expect(valueNow).toBeGreaterThanOrEqual(30)
    }).toPass({ timeout: 5000 })
  })

  // ── UNSKIP when Story 5.2 ships progress.js ─────────────────────────────
  // Pattern: live status line composes phase_message + counts when both count
  // fields are non-null; otherwise just phase_message. Counts use pt-PT locale
  // (thousand separator is `.`).
  test('live status line — composes phase_message + counts in pt-PT locale', async ({ page }) => {
    await page.route('**/api/jobs/test-job', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          status: 'fetching_catalog',
          phase_message: 'A obter catálogo…',
          progress_current: 12400,
          progress_total: 31179,
          report_id: 'test-report',
        },
      }),
    }))

    await page.goto('/progress.html?job_id=test-job&report_id=test-report')

    await expect(page.getByText(/A obter catálogo.*12\.400.*31\.179/)).toBeVisible()
  })

  // ── UNSKIP when Story 5.2 ships progress.js ─────────────────────────────
  // Pattern: status=complete drives a 1.5s-delayed navigate to /report/{report_id}.
  test('completion — status=complete auto-redirects to /report/{report_id} after 1.5s', async ({ page }) => {
    await page.route('**/api/jobs/test-job', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: { status: 'complete', phase_message: 'Relatório pronto!', progress_current: null, progress_total: null, report_id: 'test-report-xyz' },
      }),
    }))

    await page.goto('/progress.html?job_id=test-job&report_id=test-report-xyz')

    await expect(page).toHaveURL(/\/report\/test-report-xyz$/, { timeout: 5000 })
  })

  // AC-1: URL field is populated synchronously on page load — before any poll arrives.
  // This verifies the <code> element shows the correct report URL using the query param,
  // not the placeholder text from progress.html.
  test('URL field — code element shows report URL from query param on load', async ({ page }) => {
    // Stall polling so we can observe the load-time state before any response arrives
    let routeHandler
    const stallPromise = new Promise(resolve => { routeHandler = resolve })
    await page.route('**/api/jobs/stall-job', (route) => {
      stallPromise.then(() => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { status: 'queued', phase_message: 'A preparar…', progress_current: null, progress_total: null } }) }))
    })

    await page.goto('/progress.html?job_id=stall-job&report_id=my-stalled-report')

    // code element must already show the correct URL — not the placeholder
    const codeText = await page.locator('code.text-primary').textContent()
    expect(codeText).toContain('/report/my-stalled-report')
    expect(codeText).not.toContain('abc-123') // placeholder must be replaced

    // Unblock polling to avoid hanging teardown
    routeHandler()
  })

  // AC-13/14/15/16: error state — polling stops; bar turns red; processing label hidden;
  // status shows server phase_message; link box label updated; retry + contact actions visible.
  test('error state — red bar, hidden processing label, retry and contact actions visible', async ({ page }) => {
    await page.route('**/api/jobs/error-job', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          status: 'error',
          phase_message: 'Falha ao obter catálogo.',
          progress_current: null,
          progress_total: null,
          report_id: 'err-report',
        },
      }),
    }))

    await page.goto('/progress.html?job_id=error-job&report_id=err-report')

    // AC-13: bar fill must have bg-red-600 class (red bar)
    const fill = page.locator('.w-full.h-1\\.5 > div').first()
    await expect(fill).toHaveClass(/bg-red-600/, { timeout: 5000 })

    // AC-14: "Processamento em tempo real" label must be hidden
    const processingLabel = page.getByText(/processamento em tempo real/i)
    await expect(processingLabel).toBeHidden({ timeout: 5000 })

    // AC-15: status text shows server phase_message
    await expect(page.getByText('Falha ao obter catálogo.')).toBeVisible({ timeout: 5000 })

    // AC-15: link box label updated
    await expect(page.getByText(/Este link não está disponível — a geração falhou\./i)).toBeVisible({ timeout: 5000 })

    // AC-16: retry button visible
    await expect(page.getByRole('link', { name: /Tentar novamente/i })).toBeVisible({ timeout: 5000 })

    // AC-16: contact link visible
    await expect(page.getByRole('link', { name: /Contacta-nos/i })).toBeVisible({ timeout: 5000 })
  })

  // ── UNSKIP when Story 5.2 ships progress.js ─────────────────────────────
  // Pattern: copy-to-clipboard button calls navigator.clipboard.writeText, then
  // icon swaps to check + outline goes green for 2s.
  test('copy button — writes report URL to clipboard and shows success state', async ({ browser }) => {
    // Grant clipboard permissions (Chromium requires explicit grant)
    const context = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] })
    const page = await context.newPage()
    await page.route('**/api/jobs/test-job', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: { status: 'queued', phase_message: 'A preparar…', progress_current: null, progress_total: null, report_id: 'abc-123' } }),
    }))
    await page.goto('/progress.html?job_id=test-job&report_id=abc-123')

    await page.getByRole('button', { name: /copiar/i }).click()

    const copied = await page.evaluate(() => navigator.clipboard.readText())
    expect(copied).toContain('/report/abc-123')

    // Success state visible briefly
    await expect(page.locator('[data-state="copied"], .text-green-500, .text-\\[\\#16A34A\\]').first()).toBeVisible()

    await context.close()
  })
})
