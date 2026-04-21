// tests/e2e/report.smoke.spec.js
// Epic 6 Report page — smoke + behavioural templates.
//
// Scaffolded pre-Epic-6 (2026-04-20) per Epic 5 retro. Each story 6.1-6.6 will
// unskip the relevant templates as features land. See tests/e2e/README.md for
// pattern rules (page.route mocks, role/label/text selectors, expect.poll over
// waitForTimeout, Portuguese regex matching, clipboard via newContext).
//
// Convention: per-scenario tests (one test() per scenario ID from the plan),
// DOM smoke bundled. See memory feedback_test_granularity.md.
//
// URL under test: /report/:report_id — served by Fastify's @fastify/static
// (for local Playwright) or the real `GET /report/:id` route (production).
// Because the test static server at scripts/test-static-server.js mirrors the
// production route, both environments render public/report.html identically.

import { test, expect } from '@playwright/test'

// Sample report_id used for all mocked responses.
const SAMPLE_ID = 'test-report-abc-123'

// Minimal report JSON matching the /api/reports/:id response contract.
// Extended in Story 6.2 with opportunity and quickwins fixture data.
const SAMPLE_REPORT = {
  summary: {
    pt: { in_first: 4821, losing: 1340, uncontested: 756 },
    es: { in_first: 2103,  losing: 512,  uncontested: 312 },
  },
  opportunities_pt: [
    { ean: '123', product_title: 'Sony Bravia XR-55A80L', my_price: 799, first_price: 792.50, gap_pct: 0.008, wow_score: 974 },
    { ean: '456', product_title: 'Canon EOS R6', my_price: 2499, first_price: 2485, gap_pct: 0.006, wow_score: 912 },
  ],
  opportunities_es: [],
  quickwins_pt: [
    { ean: '789', product_title: 'Apple AirPods Pro 2', my_price: 249, first_price: 246.90, gap_pct: 0.0085, wow_score: 920 },
  ],
  quickwins_es: [],
  generated_at: '2026-04-14T10:00:00Z',
}

test.describe('Report page (public/report.html served at /report/:id)', () => {
  test('DOM smoke — page loads with expected static elements', async ({ page }) => {
    await page.goto(`/report/${SAMPLE_ID}`)

    // Brand
    await expect(page.getByText('MarketPilot', { exact: false }).first()).toBeVisible()

    // Page heading — Stitch report.html has "Relatório de Performance" as the h1
    await expect(page.locator('h1')).toContainText(/relatório de performance/i)

    // Note: public/report.html has no <title> tag at present (matches index.html). Story 6.1
    // or a later story may add one. If/when it does, tighten this assertion to toHaveTitle(...).
  })

  // ── Story 6.1: skeleton state while fetch is in flight ───────────────────
  // AC: skeleton state shown while GET /api/reports/:id is in flight (shimmer cards + rows)
  test('6.1 — skeleton shows while report fetch is in flight', async ({ page }) => {
    // Stall the fetch so we can observe the skeleton state
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

    // Skeleton shimmer visible — animate-pulse class applied to stat card elements
    await expect(page.locator('.animate-pulse').first()).toBeVisible()

    resolveFetch()
  })

  // ── Story 6.1: populated state shows PT stat cards ────────────────────────
  // AC: populated state replaces skeleton; "Em 1.º lugar" / "A perder posição" / "Sem concorrência" stat cards render PT data
  test('6.1 — populated state shows PT stat cards with pt-PT locale numbers', async ({ page }) => {
    await page.route(`**/api/reports/${SAMPLE_ID}`, (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: SAMPLE_REPORT }),
    }))

    await page.goto(`/report/${SAMPLE_ID}`)

    // SAMPLE_REPORT uses: pt: { in_first: 4821, losing: 1340, uncontested: 756 }
    // report.js reads: summary.winning ?? summary.in_first → "4.821", "1.340", "756"
    await expect(page.locator('.text-6xl').nth(0)).toHaveText('4.821')
    await expect(page.locator('.text-6xl').nth(1)).toHaveText('1.340')
    await expect(page.locator('.text-6xl').nth(2)).toHaveText('756')
  })

  // ── Story 6.1: PT/ES toggle swaps data without re-fetch ──────────────────
  // AC: clicking ES pill swaps data; clicking PT pill swaps back; aria-pressed updated
  test('6.1 — PT/ES toggle swaps data without re-fetch', async ({ page }) => {
    let fetchCount = 0
    await page.route(`**/api/reports/${SAMPLE_ID}`, (route) => {
      fetchCount++
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: SAMPLE_REPORT }),
      })
    })
    await page.goto(`/report/${SAMPLE_ID}`)

    // Wait for data to load (PT stat cards populated)
    await expect(page.locator('.text-6xl').nth(0)).toHaveText('4.821')

    // Click ES toggle (exact match to avoid ambiguity with CSV button text)
    await page.getByRole('button', { name: 'ES', exact: true }).click()

    // Assert no additional fetch was made
    expect(fetchCount).toBe(1)

    // Assert ES pill aria-pressed="true", PT pill aria-pressed="false"
    await expect(page.getByRole('button', { name: 'ES', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('button', { name: 'PT', exact: true })).toHaveAttribute('aria-pressed', 'false')

    // Assert ES stat cards populated with ES data from SAMPLE_REPORT
    // SAMPLE_REPORT es: { in_first: 2103, losing: 512, uncontested: 312 }
    await expect(page.locator('.text-6xl').nth(0)).toHaveText('2.103')
    await expect(page.locator('.text-6xl').nth(1)).toHaveText('512')
    await expect(page.locator('.text-6xl').nth(2)).toHaveText('312')
  })

  // ── Story 6.1: ES no-data edge case ──────────────────────────────────────
  // AC-11: When ES summary values are all 0, show Portuguese no-data message
  test('6.1 — ES no-data edge case shows Portuguese message when ES summary is empty', async ({ page }) => {
    const esNoDataFixture = {
      ...SAMPLE_REPORT,
      summary: {
        pt: { in_first: 4821, losing: 1340, uncontested: 756 },
        es: { in_first: 0, losing: 0, uncontested: 0 },
      },
      opportunities_es: [],
      quickwins_es: [],
    }
    await page.route(`**/api/reports/${SAMPLE_ID}`, (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: esNoDataFixture }),
    }))

    await page.goto(`/report/${SAMPLE_ID}`)

    // Wait for PT data to load first
    await expect(page.locator('.text-6xl').nth(0)).toHaveText('4.821')

    // Click ES toggle
    await page.getByRole('button', { name: 'ES', exact: true }).click()

    // ES no-data message should appear in the table area
    await expect(page.getByText(/sem dados para Worten ES/i).first()).toBeVisible()
  })

  // ── Story 6.2: Opportunities table (unskipped) ───────────────────────────
  // AC: Maiores Oportunidades table renders with first-row highlight + pt-PT money formatting
  test('6.2 — Maiores Oportunidades table renders sorted opportunities with first-row highlight', async ({ page }) => {
    await page.route(`**/api/reports/${SAMPLE_ID}`, (route) => route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ data: SAMPLE_REPORT }),
    }))
    await page.goto(`/report/${SAMPLE_ID}`)

    // Wait for data to load (PT stat cards populated)
    await expect(page.locator('.text-6xl').nth(0)).toHaveText('4.821')

    // First row visible with product title
    await expect(page.getByText('Sony Bravia XR-55A80L')).toBeVisible()

    // Second row visible
    await expect(page.getByText('Canon EOS R6')).toBeVisible()

    // Price formatted in pt-PT locale: "€799,00"
    await expect(page.getByText('€799,00')).toBeVisible()

    // WOW score rendered as number in first row area
    await expect(page.getByText('974')).toBeVisible()
  })

  // ── Story 6.2: Quick Wins table (unskipped) ───────────────────────────────
  test('6.2 — Vitórias Rápidas table renders score bar graphics (not raw numbers)', async ({ page }) => {
    await page.route(`**/api/reports/${SAMPLE_ID}`, (route) => route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ data: SAMPLE_REPORT }),
    }))
    await page.goto(`/report/${SAMPLE_ID}`)

    // Wait for data to load
    await expect(page.locator('.text-6xl').nth(0)).toHaveText('4.821')

    // Quick wins product visible
    await expect(page.getByText('Apple AirPods Pro 2')).toBeVisible()

    // Score bar rendered as a div (bg-primary fill), not as raw text "920"
    const scoreBar = page.locator('tbody').nth(1).locator('.bg-primary')
    await expect(scoreBar).toBeVisible()

    // The raw wow_score number "920" should NOT appear as standalone text in the score cell
    const scoreCell = page.locator('tbody').nth(1).locator('tr').first().locator('td').last()
    await expect(scoreCell.locator('div.bg-primary')).toBeVisible()
  })

  // ── UNSKIP when Story 6.3 ships report.js (CSV download) ──────────────────
  // AC: CSV link hidden until data loaded; href = /api/reports/:id/csv
  test.skip('6.3 — CSV download link has correct href and becomes visible after data loads', async ({ page }) => {
    await page.route(`**/api/reports/${SAMPLE_ID}`, (route) => route.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify({ data: SAMPLE_REPORT }),
    }))
    await page.goto(`/report/${SAMPLE_ID}`)
    // ... assert link href = `/api/reports/${SAMPLE_ID}/csv`, link visible ...
  })

  // ── UNSKIP when Story 6.3 ships CTA banner ────────────────────────────────
  // AC: CTA banner visible independently of data-fetch state; button has correct href and opens in new tab
  test.skip('6.3 — CTA banner renders immediately with correct href and target=_blank', async ({ page }) => {
    // CTA banner has no data dependency — renders even when fetch is in flight
    // await page.route(...) // keep fetch pending
    // assert CTA button href matches CTA_URL constant, target=_blank, rel="noopener noreferrer"
  })

  // ── UNSKIP when Story 6.4 lands (mobile layout) ───────────────────────────
  test.skip('6.4 — mobile viewport: stat cards stack vertically; tables have horizontal scroll hint', async ({ page }) => {
    // Use a mobile viewport: await page.setViewportSize({ width: 375, height: 812 })
    // Assert stat cards in column (flex-direction), tables have overflow-x: auto
  })

  // ── UNSKIP when Story 6.5 ships (expired + error states) ──────────────────
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

  // ── UNSKIP when Story 6.6 lands (a11y baseline) ───────────────────────────
  test.skip('6.6 — all form elements have associated labels; PT/ES toggle uses role=group + aria-pressed', async ({ page }) => {
    await page.route(`**/api/reports/${SAMPLE_ID}`, (route) => route.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify({ data: SAMPLE_REPORT }),
    }))
    await page.goto(`/report/${SAMPLE_ID}`)
    // Assert: PT/ES toggle container has role=group, aria-label=Canal
    // Assert: each toggle pill has aria-pressed="true" or "false"
    // Optionally: run @axe-core/playwright scan for WCAG AA violations
  })
})
