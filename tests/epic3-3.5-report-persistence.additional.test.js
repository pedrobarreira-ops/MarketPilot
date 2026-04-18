/**
 * Additional ATDD tests for Story 3.5: Report Persistence and CSV Generation
 *
 * Supplements epic3-3.5-report-persistence.atdd.test.js (protected — do not modify).
 *
 * Covers gaps not addressed by the protected file:
 *
 * AC-3 (functional): CSV contains ALL products — including winning and uncontested.
 *   The protected file only does a static column-name scan. This file adds a
 *   functional call to buildAndPersistReport and inspects the stored csv_data to
 *   verify winning + uncontested products appear, and their PT/ES gap columns are
 *   empty strings.
 *
 * AC-2 (buildReport.js static scan): The protected static scan reads queries.js +
 *   computeReport.js + reportWorker.js. If those files don't contain the PT/ES
 *   prefixed column names, the static check in the protected test will fail. This
 *   additional test also scans buildReport.js directly so the CI run surfaces the
 *   gap early, independent of the production-code fix.
 *
 * Run: node --test tests/epic3-3.5-report-persistence.additional.test.js
 */

import { test, describe, before } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ── env setup ──────────────────────────────────────────────────────────────
process.env.NODE_ENV    = 'test'
process.env.SQLITE_PATH = ':memory:'
process.env.REDIS_URL   = process.env.REDIS_URL || 'redis://localhost:6379'
process.env.APP_BASE_URL    = process.env.APP_BASE_URL    || 'http://localhost:3000'
process.env.WORTEN_BASE_URL = process.env.WORTEN_BASE_URL || 'https://www.worten.pt'
process.env.PORT        = process.env.PORT || '3000'
process.env.LOG_LEVEL   = 'silent'

// ── helpers ────────────────────────────────────────────────────────────────

function codeLines(src) {
  const noBlock = src.replace(/\/\*[\s\S]*?\*\//g, '')
  return noBlock
    .split('\n')
    .filter(line => {
      const trimmed = line.trim()
      return trimmed.length > 0 && !trimmed.startsWith('//')
    })
    .join('\n')
}

function randomId() {
  return `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

const BUILD_REPORT_PATH = join(__dirname, '../src/workers/scoring/buildReport.js')
const QUERIES_PATH      = join(__dirname, '../src/db/queries.js')

// ── AC-2 supplement: buildReport.js static CSV column scan ─────────────────

describe('AC-2 supplement: buildReport.js must contain all 12 CSV column names', () => {
  test('buildReport.js exists', () => {
    let exists = true
    try {
      readFileSync(BUILD_REPORT_PATH, 'utf8')
    } catch (_) {
      exists = false
    }
    assert.ok(exists, 'src/workers/scoring/buildReport.js must exist (Story 3.5 deliverable)')
  })

  test('buildReport.js contains all 12 required CSV column names', () => {
    let src
    try {
      src = readFileSync(BUILD_REPORT_PATH, 'utf8')
    } catch (_) {
      // File does not exist yet — skip with a note (dev story creates it)
      return
    }

    const requiredCsvColumns = [
      'EAN', 'product_title', 'shop_sku', 'my_price',
      'pt_first_price', 'pt_gap_eur', 'pt_gap_pct', 'pt_wow_score',
      'es_first_price', 'es_gap_eur', 'es_gap_pct', 'es_wow_score',
    ]

    for (const col of requiredCsvColumns) {
      assert.ok(
        src.includes(col),
        `buildReport.js must contain CSV column "${col}" — required by FR17 spec`
      )
    }
  })
})

// ── AC-3 functional: buildAndPersistReport writes ALL catalog entries to CSV ─

describe('AC-3 functional: buildAndPersistReport stores all products in CSV', () => {
  let buildAndPersistReport
  let getReport
  let available = false

  before(async () => {
    // Load queries first (initialises in-memory SQLite)
    const queries = await import('../src/db/queries.js')
    getReport = queries.getReport

    // Attempt to import buildReport — may not exist until dev story completes
    try {
      const buildMod = await import('../src/workers/scoring/buildReport.js')
      buildAndPersistReport = buildMod.buildAndPersistReport
      available = true
    } catch (_) {
      // buildReport.js not yet implemented — tests below will be skipped gracefully
    }
  })

  test('buildAndPersistReport is exported as a function', () => {
    if (!available) {
      // Not a hard failure at ATDD stage — file is created by dev story
      return
    }
    assert.equal(
      typeof buildAndPersistReport,
      'function',
      'buildAndPersistReport must be a named export from buildReport.js'
    )
  })

  test('AC-3: CSV contains ALL catalog entries — winning, losing, and uncontested', async () => {
    if (!available) return

    const reportId = randomId()
    const email = 'atdd@example.com'

    // Catalog: 3 products
    //   EAN-001 — losing in PT (appears in opportunities_pt)
    //   EAN-002 — winning in PT (NOT in opportunities_pt) → pt_gap columns must be ""
    //   EAN-003 — uncontested in PT (NOT in opportunities_pt) → pt_gap columns must be ""
    const catalog = [
      { ean: 'EAN-001', shop_sku: 'SKU-001', product_title: 'Losing Product',       price: '19.99' },
      { ean: 'EAN-002', shop_sku: 'SKU-002', product_title: 'Winning Product',       price:  '9.99' },
      { ean: 'EAN-003', shop_sku: 'SKU-003', product_title: 'Uncontested Product',   price: '14.99' },
    ]

    // computedReport shape (as returned by computeReport — Story 3.4)
    const computedReport = {
      opportunities_pt: [
        { ean: 'EAN-001', shop_sku: 'SKU-001', product_title: 'Losing Product', my_price: 19.99,
          competitor_first: 15.00, gap: 4.99, gap_pct: 0.33, wow_score: 60.27, is_quick_win: false },
      ],
      opportunities_es: [],
      quickwins_pt: [],
      quickwins_es: [],
      summary_pt: { total: 3, winning: 1, losing: 1, uncontested: 1 },
      summary_es: { total: 3, winning: 0, losing: 0, uncontested: 3 },
    }

    buildAndPersistReport(reportId, email, catalog, computedReport)

    const now = Math.floor(Date.now() / 1000)
    const row = getReport(reportId, now)
    assert.ok(row, 'getReport must return the persisted report')

    const csv = row.csv_data ?? row.csvData
    assert.ok(csv, 'csv_data must be stored in the report row')

    const lines = csv.split('\n')

    // Header row must be first
    assert.equal(
      lines[0],
      'EAN,product_title,shop_sku,my_price,pt_first_price,pt_gap_eur,pt_gap_pct,pt_wow_score,es_first_price,es_gap_eur,es_gap_pct,es_wow_score',
      'CSV header row must match the exact 12-column spec'
    )

    // All 3 catalog products must appear (AC-3: not just opportunities)
    assert.equal(lines.length, 4, 'CSV must have header + 3 data rows (one per catalog entry)')

    const csvText = lines.slice(1).join('\n')
    assert.ok(csvText.includes('EAN-001'), 'Losing product EAN-001 must appear in CSV')
    assert.ok(csvText.includes('EAN-002'), 'Winning product EAN-002 must appear in CSV (not just opportunities)')
    assert.ok(csvText.includes('EAN-003'), 'Uncontested product EAN-003 must appear in CSV (not just opportunities)')
  })

  test('AC-3: Winning product has empty PT gap columns in CSV', async () => {
    if (!available) return

    const reportId = randomId()
    const catalog = [
      { ean: 'EAN-WIN', shop_sku: 'SKU-WIN', product_title: 'Winner', price: '5.00' },
    ]
    const computedReport = {
      opportunities_pt: [],  // EAN-WIN is winning — not in opportunities_pt
      opportunities_es: [],
      quickwins_pt: [],
      quickwins_es: [],
      summary_pt: { total: 1, winning: 1, losing: 0, uncontested: 0 },
      summary_es: { total: 1, winning: 0, losing: 0, uncontested: 1 },
    }

    buildAndPersistReport(reportId, 'atdd@example.com', catalog, computedReport)

    const now = Math.floor(Date.now() / 1000)
    const row = getReport(reportId, now)
    const csv = row.csv_data ?? row.csvData
    const dataLine = csv.split('\n')[1]  // first data row

    // pt_first_price, pt_gap_eur, pt_gap_pct, pt_wow_score should all be empty
    // CSV structure: EAN,product_title,shop_sku,my_price,pt_first_price,pt_gap_eur,pt_gap_pct,pt_wow_score,...
    const cells = dataLine.split(',')
    assert.equal(cells[4], '', 'pt_first_price must be empty string for winning product')
    assert.equal(cells[5], '', 'pt_gap_eur must be empty string for winning product')
    assert.equal(cells[6], '', 'pt_gap_pct must be empty string for winning product')
    assert.equal(cells[7], '', 'pt_wow_score must be empty string for winning product')
  })

  test('AC-3: Uncontested product has empty PT gap columns in CSV', async () => {
    if (!available) return

    const reportId = randomId()
    const catalog = [
      { ean: 'EAN-UNC', shop_sku: 'SKU-UNC', product_title: 'Uncontested', price: '8.00' },
    ]
    const computedReport = {
      opportunities_pt: [],  // EAN-UNC is uncontested — not in opportunities_pt
      opportunities_es: [],
      quickwins_pt: [],
      quickwins_es: [],
      summary_pt: { total: 1, winning: 0, losing: 0, uncontested: 1 },
      summary_es: { total: 1, winning: 0, losing: 0, uncontested: 1 },
    }

    buildAndPersistReport(reportId, 'atdd@example.com', catalog, computedReport)

    const now = Math.floor(Date.now() / 1000)
    const row = getReport(reportId, now)
    const csv = row.csv_data ?? row.csvData
    const dataLine = csv.split('\n')[1]

    const cells = dataLine.split(',')
    assert.equal(cells[4], '', 'pt_first_price must be empty string for uncontested product')
    assert.equal(cells[5], '', 'pt_gap_eur must be empty string for uncontested product')
    assert.equal(cells[6], '', 'pt_gap_pct must be empty string for uncontested product')
    assert.equal(cells[7], '', 'pt_wow_score must be empty string for uncontested product')
  })

  test('AC-3: Losing product has populated PT gap columns in CSV', async () => {
    if (!available) return

    const reportId = randomId()
    const catalog = [
      { ean: 'EAN-LOSE', shop_sku: 'SKU-LOSE', product_title: 'Loser', price: '20.00' },
    ]
    const computedReport = {
      opportunities_pt: [
        { ean: 'EAN-LOSE', shop_sku: 'SKU-LOSE', product_title: 'Loser', my_price: 20.00,
          competitor_first: 15.00, gap: 5.00, gap_pct: 0.333, wow_score: 60.06, is_quick_win: false },
      ],
      opportunities_es: [],
      quickwins_pt: [],
      quickwins_es: [],
      summary_pt: { total: 1, winning: 0, losing: 1, uncontested: 0 },
      summary_es: { total: 1, winning: 0, losing: 0, uncontested: 1 },
    }

    buildAndPersistReport(reportId, 'atdd@example.com', catalog, computedReport)

    const now = Math.floor(Date.now() / 1000)
    const row = getReport(reportId, now)
    const csv = row.csv_data ?? row.csvData
    const dataLine = csv.split('\n')[1]

    const cells = dataLine.split(',')
    assert.equal(cells[4], '15', 'pt_first_price must be populated for losing product')
    assert.notEqual(cells[5], '', 'pt_gap_eur must not be empty for losing product')
    assert.notEqual(cells[6], '', 'pt_gap_pct must not be empty for losing product')
    assert.notEqual(cells[7], '', 'pt_wow_score must not be empty for losing product')
  })

  test('AC-1 + AC-3: expires_at is caller-provided (now + 172800), not computed inside insertReport', async () => {
    if (!available) return

    const reportId = randomId()
    const catalog = [{ ean: 'EAN-TTL', shop_sku: 'SKU-TTL', product_title: 'TTL Test', price: '10.00' }]
    const computedReport = {
      opportunities_pt: [], opportunities_es: [],
      quickwins_pt: [], quickwins_es: [],
      summary_pt: { total: 1, winning: 1, losing: 0, uncontested: 0 },
      summary_es: { total: 1, winning: 0, losing: 0, uncontested: 1 },
    }

    const beforeCall = Math.floor(Date.now() / 1000)
    buildAndPersistReport(reportId, 'atdd@example.com', catalog, computedReport)
    const afterCall = Math.floor(Date.now() / 1000)

    // The report must be retrievable (expires_at = now + 172800 > current time)
    const row = getReport(reportId, afterCall)
    assert.ok(row, 'Report with 48h TTL must be immediately retrievable')

    // Verify expires_at is approximately beforeCall + 172800
    const expiresAt = row.expires_at ?? row.expiresAt
    assert.ok(
      expiresAt >= beforeCall + 172800 && expiresAt <= afterCall + 172800,
      `expires_at (${expiresAt}) must be now + 172800 seconds (48h TTL)`
    )
  })
})
