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
    // Mock the API route so Story 6.5 error-state code does not replace the h1.
    // Without this mock, the 404 from the test-static-server triggers replaceMainContentWith()
    // which removes the h1 from the DOM (regression introduced by Story 6.5).
    await page.route(`**/api/reports/${SAMPLE_ID}`, (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: SAMPLE_REPORT }),
    }))
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
  // AC-1,2,3: rows render in order, first-row #EFF6FF highlight, pt-PT price + WOW score formatting
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

    // AC-3: Price formatted in pt-PT locale: "€799,00"
    await expect(page.getByText('€799,00')).toBeVisible()

    // AC-3: WOW score rendered as right-aligned integer in first row area
    await expect(page.getByText('974')).toBeVisible()

    // AC-2: first row has #EFF6FF tint applied as inline background-color style
    // (bg-blue-50 = rgb(239, 246, 255) = #EFF6FF — applied inline to avoid JIT purge)
    const firstRow = page.locator('tbody').nth(0).locator('tr').first()
    const bgColor = await firstRow.evaluate((el) => el.style.backgroundColor)
    const isBlue50 = bgColor === 'rgb(239, 246, 255)' || bgColor === '#EFF6FF' || bgColor === '#eff6ff'
    expect(isBlue50).toBe(true)
  })

  // ── Story 6.2: Quick Wins table (unskipped) ───────────────────────────────
  // AC-4,7: rows render; score column shows a horizontal bar div, NOT raw number text
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

    // AC-7: Score bar inner fill div (bg-primary) is present inside the last cell of the first row
    const scoreCell = page.locator('tbody').nth(1).locator('tr').first().locator('td').last()
    await expect(scoreCell.locator('div.bg-primary')).toBeVisible()

    // AC-7: Score bar outer container has overflow-hidden (prevents fill from escaping)
    const barOuter = scoreCell.locator('div.rounded-full.overflow-hidden')
    await expect(barOuter).toBeVisible()

    // AC-7: The raw wow_score number "920" must NOT appear as text content in the score cell
    await expect(scoreCell).not.toHaveText('920')
  })

  // ── Story 6.2: PT/ES toggle re-renders Quick Wins for ES (empty array) ────
  // AC-10: switching channel calls renderQuickWins with new data; empty ES quickwins shows empty state
  test('6.2 — PT/ES toggle re-renders Quick Wins table with ES channel data (empty state)', async ({ page }) => {
    await page.route(`**/api/reports/${SAMPLE_ID}`, (route) => route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ data: SAMPLE_REPORT }),
    }))
    await page.goto(`/report/${SAMPLE_ID}`)

    // Wait for PT quick wins row to appear
    await expect(page.getByText('Apple AirPods Pro 2')).toBeVisible()

    // Switch to ES channel (quickwins_es: [] in SAMPLE_REPORT)
    await page.getByRole('button', { name: 'ES', exact: true }).click()

    // AC-10: PT quick wins row must no longer be present after channel switch
    await expect(page.getByText('Apple AirPods Pro 2')).not.toBeVisible()

    // AC-6: Quick Wins empty state message shown for empty quickwins_es
    await expect(page.getByText('Não há vitórias rápidas disponíveis neste canal.')).toBeVisible()
  })

  // ── Story 6.3: CSV download button ──────────────────────────────────────
  // AC: CSV link hidden until data loaded; data-csv-url confirms URL shape
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
    const csvBtn = page.locator('button').filter({ has: page.locator('.material-symbols-outlined') })
    await expect(csvBtn).toBeVisible()

    // The data-csv-url attribute (set by getCsvDownloadUrl scaffold) confirms URL shape
    const csvUrl = await csvBtn.getAttribute('data-csv-url')
    expect(csvUrl).toContain(`/api/reports/${SAMPLE_ID}/csv`)
  })

  // ── Story 6.3: CTA banner ─────────────────────────────────────────────────
  // AC: CTA banner visible independently of data-fetch state; clicking opens new tab at CTA_URL
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
    // CTA_URL is a wa.me WhatsApp URL; browser may redirect to api.whatsapp.com
    expect(newPage.url()).toMatch(/wa\.me|whatsapp\.com/)  // CTA_URL is a WhatsApp URL

    await newPage.close()
    resolveFetch()
  })

  // ── Story 6.4: mobile & screen-share layout ──────────────────────────────
  test('6.4 — mobile viewport: stat cards stack vertically; tables have horizontal scroll hint', async ({ page }) => {
    await page.route(`**/api/reports/${SAMPLE_ID}`, (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: SAMPLE_REPORT }),
    }))

    // Set mobile viewport BEFORE navigation so matchMedia fires correctly on init
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto(`/report/${SAMPLE_ID}`)

    // Wait for data to load
    await expect(page.locator('.text-6xl').nth(0)).toHaveText('4.821')

    // AC-1: Stat cards grid is single-column on mobile
    const statGrid = page.locator('.grid.grid-cols-1')
    await expect(statGrid).toBeVisible()
    const gridStyle = await statGrid.evaluate((el) =>
      window.getComputedStyle(el).gridTemplateColumns
    )
    // Single column: gridTemplateColumns should be a single track value
    expect(gridStyle.split(' ').length).toBe(1)

    // AC-2: Tables have overflow-x:auto
    const tableWrapper = page.locator('div.overflow-x-auto').first()
    await expect(tableWrapper).toBeVisible()
    const overflow = await tableWrapper.evaluate((el) =>
      window.getComputedStyle(el).overflowX
    )
    expect(overflow).toBe('auto')

    // AC-2: "desliza" hint visible on mobile
    await expect(page.getByText(/← desliza para ver mais →/).first()).toBeVisible()

    // AC-3: Table row font size >= 14px
    const firstTd = page.locator('tbody').first().locator('td').first()
    const fontSize = await firstTd.evaluate((el) =>
      parseFloat(window.getComputedStyle(el).fontSize)
    )
    expect(fontSize).toBeGreaterThanOrEqual(14)

    // AC-4 & AC-5: Desktop checks (resize viewport)
    await page.setViewportSize({ width: 1280, height: 900 })

    // AC-4: No horizontal scroll on desktop
    const hasHorizontalScroll = await page.evaluate(() =>
      document.documentElement.scrollWidth > window.innerWidth
    )
    expect(hasHorizontalScroll).toBe(false)

    // AC-5: Both PT and ES toggle pills visible on desktop
    await expect(page.getByRole('button', { name: 'PT', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'ES', exact: true })).toBeVisible()

    // AC-2: hint hidden on desktop (matchMedia change event fired)
    await expect(page.getByText(/← desliza para ver mais →/).first()).not.toBeVisible()
  })

  // ── Story 6.5: expired + error states ────────────────────────────────────
  test('6.5 — 410/expired report shows Portuguese expired-state card with "Gerar novo" CTA', async ({ page }) => {
    await page.route(`**/api/reports/${SAMPLE_ID}`, (route) => route.fulfill({ status: 410 }))
    await page.goto(`/report/${SAMPLE_ID}`)

    await expect(page.getByText(/Este relat.*j.*n.*dispon/i).first()).toBeVisible()
    const ctaLink = page.getByText(/Gerar um novo relat/i).first()
    await expect(ctaLink).toBeVisible()
    // CTA must link back to the form page (AC-1)
    await expect(ctaLink).toHaveAttribute('href', '/')

    // Header and CTA banner still visible (AC-5)
    await expect(page.locator('header')).toBeVisible()
    await expect(page.locator('section.bg-gradient-to-br')).toBeVisible()
  })

  test('6.5 — generic fetch error (500) shows Portuguese "not available" error card with Reload button', async ({ page }) => {
    await page.route(`**/api/reports/${SAMPLE_ID}`, (route) => route.fulfill({ status: 500 }))
    await page.goto(`/report/${SAMPLE_ID}`)

    await expect(page.getByText(/N.*o foi poss.*vel carregar/i).first()).toBeVisible()
    await expect(page.getByRole('button', { name: /Recarregar/i })).toBeVisible()

    // Header and CTA banner still visible (AC-5)
    await expect(page.locator('header')).toBeVisible()
    await expect(page.locator('section.bg-gradient-to-br')).toBeVisible()
  })

  // ── Story 6.6: a11y baseline (unskipped) ─────────────────────────────────
  test('6.6 — PT/ES toggle container has role=group + aria-label=Canal; pills have correct initial aria-pressed', async ({ page }) => {
    await page.route(`**/api/reports/${SAMPLE_ID}`, (route) => route.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify({ data: SAMPLE_REPORT }),
    }))
    await page.goto(`/report/${SAMPLE_ID}`)

    // AC-3: PT/ES toggle container has role="group" and aria-label="Canal"
    // (set synchronously by report.js init, before fetch resolves)
    const toggleContainer = page.locator('[role="group"][aria-label="Canal"]')
    await expect(toggleContainer).toBeVisible()

    // AC-3: PT pill starts with aria-pressed="true", ES with aria-pressed="false"
    const ptBtn = page.locator('button[aria-pressed="true"]').first()
    const esBtn = page.locator('button[aria-pressed="false"]').first()
    await expect(ptBtn).toHaveAttribute('aria-pressed', 'true')
    await expect(esBtn).toHaveAttribute('aria-pressed', 'false')
  })
})
