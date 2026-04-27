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
 * Additional gaps covered by this file (Step 4 test review additions):
 *   - CSV_COLUMNS export in queries.js vs CSV_HEADER in buildReport.js — no drift
 *   - CSV escaping edge cases: commas, double-quotes, newlines in product_title
 *   - CSV null/undefined field handling (null catalog values → empty cell)
 *   - CSV numeric decimal precision is preserved as-is (not truncated)
 *   - Empty catalog produces header-only CSV (no data rows)
 *   - buildAndPersistReport propagates insertReport exceptions (no silent swallow)
 *   - runMigrations() is idempotent — safe to call multiple times
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

  test('buildReport.js contains all 10 required CSV column names (Portuguese, post-overhaul)', () => {
    let src
    try {
      src = readFileSync(BUILD_REPORT_PATH, 'utf8')
    } catch (_) {
      // File does not exist yet — skip with a note (dev story creates it)
      return
    }

    // wow_score columns intentionally OMITTED (internal scoring metric).
    // Column count: 10 (was 12 pre-overhaul).
    const requiredCsvColumns = [
      'EAN', 'Produto', 'SKU', 'O meu preço',
      'Preço 1.º lugar PT', 'Diferença € PT', 'Diferença % PT',
      'Preço 1.º lugar ES', 'Diferença € ES', 'Diferença % ES',
    ]

    for (const col of requiredCsvColumns) {
      assert.ok(
        src.includes(col),
        `buildReport.js must contain CSV column "${col}" — Portuguese client-readable headers per issue 5`
      )
    }

    // Belt-and-suspenders: explicitly verify the omitted columns are NOT present.
    const omittedColumns = ['pt_wow_score', 'es_wow_score']
    for (const col of omittedColumns) {
      assert.ok(
        !src.includes(col),
        `buildReport.js must NOT contain CSV column "${col}" — wow_score is internal-only post-overhaul`
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

    // Header row must be first — Portuguese 10-column header per issue 5 overhaul.
    assert.equal(
      lines[0],
      'EAN,Produto,SKU,O meu preço,Preço 1.º lugar PT,Diferença € PT,Diferença % PT,Preço 1.º lugar ES,Diferença € ES,Diferença % ES',
      'CSV header row must match the exact 10-column post-overhaul spec'
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

    // PT gap columns (cells[4]-[6]) and ES gap columns (cells[7]-[9]) must all
    // be empty for a product winning in PT and uncontested in ES.
    // 10-column post-overhaul layout:
    //   [0]EAN [1]Produto [2]SKU [3]O meu preço
    //   [4]Preço 1.º lugar PT [5]Diferença € PT [6]Diferença % PT
    //   [7]Preço 1.º lugar ES [8]Diferença € ES [9]Diferença % ES
    const cells = dataLine.split(',')
    assert.equal(cells[4], '', 'Preço 1.º lugar PT must be empty for winning product')
    assert.equal(cells[5], '', 'Diferença € PT must be empty for winning product')
    assert.equal(cells[6], '', 'Diferença % PT must be empty for winning product')
    assert.equal(cells[7], '', 'Preço 1.º lugar ES must be empty for uncontested-in-ES product')
    assert.equal(cells[8], '', 'Diferença € ES must be empty for uncontested-in-ES product')
    assert.equal(cells[9], '', 'Diferença % ES must be empty for uncontested-in-ES product')
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
    assert.equal(cells[4], '', 'Preço 1.º lugar PT must be empty for uncontested product')
    assert.equal(cells[5], '', 'Diferença € PT must be empty for uncontested product')
    assert.equal(cells[6], '', 'Diferença % PT must be empty for uncontested product')
    assert.equal(cells[7], '', 'Preço 1.º lugar ES must be empty for uncontested-in-ES product')
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
    // Post-overhaul: prices use formatNumberCell (toFixed(2)) → "15.00" not "15"
    assert.equal(cells[4], '15.00', 'Preço 1.º lugar PT must be populated with 2-decimal format for losing product')
    assert.notEqual(cells[5], '', 'Diferença € PT must not be empty for losing product')
    assert.notEqual(cells[6], '', 'Diferença % PT must not be empty for losing product')
    // Verify percentage format: cells[6] should end with "%" per formatPctCell
    assert.ok(cells[6].endsWith('%'), `Diferença % PT must end with "%" sign per formatPctCell, got "${cells[6]}"`)
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

// ── CSV_COLUMNS / CSV_HEADER drift check ───────────────────────────────────────

describe('CSV_COLUMNS export vs buildReport.js CSV_HEADER — no drift', () => {
  test('CSV_COLUMNS exported from queries.js matches the 10-column post-overhaul header string', async () => {
    const queries = await import('../src/db/queries.js')
    assert.equal(
      typeof queries.CSV_COLUMNS,
      'string',
      'queries.js must export CSV_COLUMNS as a string'
    )
    const expected = 'EAN,Produto,SKU,O meu preço,Preço 1.º lugar PT,Diferença € PT,Diferença % PT,Preço 1.º lugar ES,Diferença € ES,Diferença % ES'
    assert.equal(
      queries.CSV_COLUMNS,
      expected,
      'CSV_COLUMNS must exactly match the 10-column post-overhaul Portuguese header (issue 5)'
    )
  })

  test('buildReport.js CSV_HEADER matches queries.js CSV_COLUMNS (no drift)', async () => {
    // Read the CSV_HEADER string directly from buildReport.js source
    const src = readFileSync(BUILD_REPORT_PATH, 'utf8')
    // Extract the CSV_HEADER value: look for the line that assigns CSV_HEADER
    const match = src.match(/const CSV_HEADER\s*=\s*'([^']+)'/)
    assert.ok(match, 'buildReport.js must declare CSV_HEADER as a string constant')
    const csvHeader = match[1]

    const queries = await import('../src/db/queries.js')
    assert.equal(
      csvHeader,
      queries.CSV_COLUMNS,
      'buildReport.js CSV_HEADER and queries.js CSV_COLUMNS must be identical strings — they define the same contract'
    )
  })
})

// ── CSV escaping edge cases ────────────────────────────────────────────────────

describe('CSV escaping edge cases', () => {
  let buildAndPersistReport
  let getReport
  let available = false

  before(async () => {
    const queries = await import('../src/db/queries.js')
    getReport = queries.getReport
    try {
      const buildMod = await import('../src/workers/scoring/buildReport.js')
      buildAndPersistReport = buildMod.buildAndPersistReport
      available = true
    } catch (_) {}
  })

  test('product_title with a comma is wrapped in double quotes (RFC 4180)', async () => {
    if (!available) return
    const reportId = randomId()
    const catalog = [
      { ean: 'EAN-COMMA', shop_sku: 'SKU-COMMA', product_title: 'TV, 55 inch', price: '399.99' },
    ]
    const computedReport = {
      opportunities_pt: [], opportunities_es: [],
      quickwins_pt: [], quickwins_es: [],
      summary_pt: { total: 1, winning: 1, losing: 0, uncontested: 0 },
      summary_es: { total: 1, winning: 0, losing: 0, uncontested: 1 },
    }
    buildAndPersistReport(reportId, 'esc@example.com', catalog, computedReport)
    const now = Math.floor(Date.now() / 1000)
    const row = getReport(reportId, now)
    const csv = row.csv_data ?? row.csvData
    // The title cell must be wrapped: "TV, 55 inch"
    assert.ok(
      csv.includes('"TV, 55 inch"'),
      `CSV must wrap product_title containing a comma in double quotes. Got:\n${csv}`
    )
  })

  test('product_title with a double-quote has internal quotes doubled (RFC 4180)', async () => {
    if (!available) return
    const reportId = randomId()
    const catalog = [
      { ean: 'EAN-QUOTE', shop_sku: 'SKU-QUOTE', product_title: 'TV 55" Screen', price: '299.99' },
    ]
    const computedReport = {
      opportunities_pt: [], opportunities_es: [],
      quickwins_pt: [], quickwins_es: [],
      summary_pt: { total: 1, winning: 1, losing: 0, uncontested: 0 },
      summary_es: { total: 1, winning: 0, losing: 0, uncontested: 1 },
    }
    buildAndPersistReport(reportId, 'esc@example.com', catalog, computedReport)
    const now = Math.floor(Date.now() / 1000)
    const row = getReport(reportId, now)
    const csv = row.csv_data ?? row.csvData
    // RFC 4180: " → "" inside a quoted field → "TV 55"" Screen"
    assert.ok(
      csv.includes('"TV 55"" Screen"'),
      `CSV must double-escape double-quotes per RFC 4180. Got:\n${csv}`
    )
  })

  test('product_title with a newline is wrapped in double quotes', async () => {
    if (!available) return
    const reportId = randomId()
    const catalog = [
      { ean: 'EAN-NL', shop_sku: 'SKU-NL', product_title: 'Line1\nLine2', price: '49.99' },
    ]
    const computedReport = {
      opportunities_pt: [], opportunities_es: [],
      quickwins_pt: [], quickwins_es: [],
      summary_pt: { total: 1, winning: 1, losing: 0, uncontested: 0 },
      summary_es: { total: 1, winning: 0, losing: 0, uncontested: 1 },
    }
    buildAndPersistReport(reportId, 'esc@example.com', catalog, computedReport)
    const now = Math.floor(Date.now() / 1000)
    const row = getReport(reportId, now)
    const csv = row.csv_data ?? row.csvData
    assert.ok(
      csv.includes('"Line1\nLine2"'),
      `CSV must wrap product_title containing a newline in double quotes. Got:\n${csv}`
    )
  })

  test('null catalog field (e.g. product_title = null) produces an empty cell', async () => {
    if (!available) return
    const reportId = randomId()
    const catalog = [
      { ean: 'EAN-NULL', shop_sku: 'SKU-NULL', product_title: null, price: '9.99' },
    ]
    const computedReport = {
      opportunities_pt: [], opportunities_es: [],
      quickwins_pt: [], quickwins_es: [],
      summary_pt: { total: 1, winning: 1, losing: 0, uncontested: 0 },
      summary_es: { total: 1, winning: 0, losing: 0, uncontested: 1 },
    }
    buildAndPersistReport(reportId, 'esc@example.com', catalog, computedReport)
    const now = Math.floor(Date.now() / 1000)
    const row = getReport(reportId, now)
    const csv = row.csv_data ?? row.csvData
    const dataLine = csv.split('\n')[1]
    const cells = dataLine.split(',')
    // product_title is column index 1
    assert.equal(cells[1], '', 'null product_title must produce an empty CSV cell')
  })

  test('numeric price with decimal places is preserved as-is (not truncated)', async () => {
    if (!available) return
    const reportId = randomId()
    const catalog = [
      { ean: 'EAN-DEC', shop_sku: 'SKU-DEC', product_title: 'Decimal Test', price: 19.99 },
    ]
    const computedReport = {
      opportunities_pt: [], opportunities_es: [],
      quickwins_pt: [], quickwins_es: [],
      summary_pt: { total: 1, winning: 1, losing: 0, uncontested: 0 },
      summary_es: { total: 1, winning: 0, losing: 0, uncontested: 1 },
    }
    buildAndPersistReport(reportId, 'esc@example.com', catalog, computedReport)
    const now = Math.floor(Date.now() / 1000)
    const row = getReport(reportId, now)
    const csv = row.csv_data ?? row.csvData
    const dataLine = csv.split('\n')[1]
    const cells = dataLine.split(',')
    // my_price is column index 3
    assert.equal(cells[3], '19.99', 'numeric price must be preserved with original decimal precision')
  })
})

// ── Empty catalog edge case ────────────────────────────────────────────────────

describe('CSV edge case: empty catalog produces header-only CSV', () => {
  let buildAndPersistReport
  let getReport
  let available = false

  before(async () => {
    const queries = await import('../src/db/queries.js')
    getReport = queries.getReport
    try {
      const buildMod = await import('../src/workers/scoring/buildReport.js')
      buildAndPersistReport = buildMod.buildAndPersistReport
      available = true
    } catch (_) {}
  })

  test('empty catalog array produces a CSV with only the header row', async () => {
    if (!available) return
    const reportId = randomId()
    const computedReport = {
      opportunities_pt: [], opportunities_es: [],
      quickwins_pt: [], quickwins_es: [],
      summary_pt: { total: 0, winning: 0, losing: 0, uncontested: 0 },
      summary_es: { total: 0, winning: 0, losing: 0, uncontested: 0 },
    }
    buildAndPersistReport(reportId, 'empty@example.com', [], computedReport)
    const now = Math.floor(Date.now() / 1000)
    const row = getReport(reportId, now)
    assert.ok(row, 'Report must be persisted even with empty catalog')
    const csv = row.csv_data ?? row.csvData
    const lines = csv.split('\n')
    assert.equal(lines.length, 1, 'Empty catalog must produce a CSV with exactly 1 line (header only)')
    assert.equal(
      lines[0],
      'EAN,Produto,SKU,O meu preço,Preço 1.º lugar PT,Diferença € PT,Diferença % PT,Preço 1.º lugar ES,Diferença € ES,Diferença % ES',
      'The single line must be the post-overhaul 10-column Portuguese header row'
    )
  })
})

// ── Post-overhaul: numeric precision and sort order (issue 5) ──────────────────

describe('CSV post-overhaul: 2-decimal prices, "X.X%" percentages, gap-asc ordering', () => {
  let buildAndPersistReport
  let getReport
  let available = false

  before(async () => {
    const queries = await import('../src/db/queries.js')
    getReport = queries.getReport
    try {
      const buildMod = await import('../src/workers/scoring/buildReport.js')
      buildAndPersistReport = buildMod.buildAndPersistReport
      available = true
    } catch (_) {}
  })

  test('Prices use 2-decimal fixed format (no float artefacts)', async () => {
    if (!available) return
    const reportId = randomId()
    // gap = 213.98000000002 (a real JS float artefact from 1378.45 - 1164.47)
    const catalog = [
      { ean: 'EAN-FLOAT', shop_sku: 'SKU-FLOAT', product_title: 'Float Test', price: '1378.45' },
    ]
    const computedReport = {
      opportunities_pt: [
        { ean: 'EAN-FLOAT', shop_sku: 'SKU-FLOAT', product_title: 'Float Test', my_price: 1378.45,
          competitor_first: 1164.47, gap: 213.98000000002, gap_pct: 0.18375, wow_score: 7501.46, is_quick_win: false },
      ],
      opportunities_es: [],
      quickwins_pt: [], quickwins_es: [],
      summary_pt: { total: 1, winning: 0, losing: 1, uncontested: 0 },
      summary_es: { total: 1, winning: 0, losing: 0, uncontested: 1 },
    }
    buildAndPersistReport(reportId, 'atdd@example.com', catalog, computedReport)
    const now = Math.floor(Date.now() / 1000)
    const row = getReport(reportId, now)
    const cells = row.csv_data.split('\n')[1].split(',')
    // [3]O meu preço [4]Preço 1.º lugar PT [5]Diferença € PT
    assert.equal(cells[3], '1378.45', 'O meu preço must be exactly "1378.45" — no float artefacts')
    assert.equal(cells[4], '1164.47', 'Preço 1.º lugar PT must be exactly "1164.47"')
    assert.equal(cells[5], '213.98', 'Diferença € PT must be exactly "213.98" — float "213.98000000002" must be rounded by toFixed(2)')
  })

  test('Percentages use "X.X%" format (issue 5b)', async () => {
    if (!available) return
    const reportId = randomId()
    const catalog = [{ ean: 'EAN-PCT', shop_sku: 'SKU-PCT', product_title: 'Pct Test', price: '100.00' }]
    const computedReport = {
      opportunities_pt: [
        { ean: 'EAN-PCT', shop_sku: 'SKU-PCT', product_title: 'Pct Test', my_price: 100.00,
          competitor_first: 84.62, gap: 15.38, gap_pct: 0.18175, wow_score: 550.21, is_quick_win: false },
      ],
      opportunities_es: [], quickwins_pt: [], quickwins_es: [],
      summary_pt: { total: 1, winning: 0, losing: 1, uncontested: 0 },
      summary_es: { total: 1, winning: 0, losing: 0, uncontested: 1 },
    }
    buildAndPersistReport(reportId, 'atdd@example.com', catalog, computedReport)
    const now = Math.floor(Date.now() / 1000)
    const row = getReport(reportId, now)
    const cells = row.csv_data.split('\n')[1].split(',')
    // [6]Diferença % PT — formatPctCell((0.18175 * 100).toFixed(1) + '%') === "18.2%"
    assert.equal(cells[6], '18.2%', 'Diferença % PT must be "18.2%" — formatPctCell(0.18175) → (0.18175*100).toFixed(1)+"%" → "18.2%"')
  })

  test('Catalog rows sorted by min(pt_gap_pct, es_gap_pct) ascending; uncontested at end', async () => {
    if (!available) return
    const reportId = randomId()
    const catalog = [
      { ean: 'EAN-MED',  shop_sku: 'SKU-MED',  product_title: 'Medium Gap',     price: '20.00' },
      { ean: 'EAN-LOW',  shop_sku: 'SKU-LOW',  product_title: 'Smallest Gap',   price: '20.00' },
      { ean: 'EAN-NONE', shop_sku: 'SKU-NONE', product_title: 'Uncontested',    price: '20.00' },
      { ean: 'EAN-HIGH', shop_sku: 'SKU-HIGH', product_title: 'Largest Gap',    price: '20.00' },
    ]
    const computedReport = {
      opportunities_pt: [
        // Gap-pct values chosen to be unambiguous: 0.05 < 0.20 < 0.50
        { ean: 'EAN-LOW',  shop_sku: 'SKU-LOW',  product_title: 'Smallest Gap', my_price: 20, competitor_first: 19, gap: 1,  gap_pct: 0.05, wow_score: 400, is_quick_win: false },
        { ean: 'EAN-MED',  shop_sku: 'SKU-MED',  product_title: 'Medium Gap',   my_price: 20, competitor_first: 16, gap: 4,  gap_pct: 0.25, wow_score: 80,  is_quick_win: false },
        { ean: 'EAN-HIGH', shop_sku: 'SKU-HIGH', product_title: 'Largest Gap',  my_price: 20, competitor_first: 10, gap: 10, gap_pct: 1.00, wow_score: 20,  is_quick_win: false },
      ],
      opportunities_es: [],
      quickwins_pt: [], quickwins_es: [],
      summary_pt: { total: 4, winning: 0, losing: 3, uncontested: 1 },
      summary_es: { total: 4, winning: 0, losing: 0, uncontested: 4 },
    }
    buildAndPersistReport(reportId, 'atdd@example.com', catalog, computedReport)
    const now = Math.floor(Date.now() / 1000)
    const row = getReport(reportId, now)
    const dataLines = row.csv_data.split('\n').slice(1)  // skip header
    // Expected order by gap_pct ascending: LOW (0.05), MED (0.25), HIGH (1.00), NONE (Infinity)
    assert.ok(dataLines[0].startsWith('EAN-LOW,'),  `Row 1 must be EAN-LOW (gap_pct=0.05); got: ${dataLines[0].slice(0, 30)}`)
    assert.ok(dataLines[1].startsWith('EAN-MED,'),  `Row 2 must be EAN-MED (gap_pct=0.25); got: ${dataLines[1].slice(0, 30)}`)
    assert.ok(dataLines[2].startsWith('EAN-HIGH,'), `Row 3 must be EAN-HIGH (gap_pct=1.00); got: ${dataLines[2].slice(0, 30)}`)
    assert.ok(dataLines[3].startsWith('EAN-NONE,'), `Row 4 must be EAN-NONE (uncontested → Infinity); got: ${dataLines[3].slice(0, 30)}`)
  })
})

// ── Error propagation from insertReport ───────────────────────────────────────

describe('Error propagation: buildAndPersistReport does not swallow insertReport exceptions', () => {
  test('buildAndPersistReport propagates an exception thrown by insertReport', async () => {
    // Dynamically import buildReport to access the module — we need to verify
    // that if the underlying insertReport call throws, buildAndPersistReport
    // propagates the error rather than swallowing it silently.
    //
    // Strategy: call buildAndPersistReport with a reportId that is not a string
    // or use a duplicate reportId (UNIQUE constraint violation) to trigger a
    // real DB error and verify it surfaces to the caller.
    let buildAndPersistReport
    let insertReport
    let available = false
    try {
      const buildMod = await import('../src/workers/scoring/buildReport.js')
      buildAndPersistReport = buildMod.buildAndPersistReport
      const queries = await import('../src/db/queries.js')
      insertReport = queries.insertReport
      available = true
    } catch (_) {}

    if (!available) return

    const reportId = randomId()
    const catalog = [{ ean: 'EAN-ERR', shop_sku: 'SKU-ERR', product_title: 'Error Test', price: '5.00' }]
    const computedReport = {
      opportunities_pt: [], opportunities_es: [],
      quickwins_pt: [], quickwins_es: [],
      summary_pt: { total: 1, winning: 1, losing: 0, uncontested: 0 },
      summary_es: { total: 1, winning: 0, losing: 0, uncontested: 1 },
    }

    // First call: must succeed
    buildAndPersistReport(reportId, 'err@example.com', catalog, computedReport)

    // Second call with same reportId: UNIQUE constraint violation — must throw
    assert.throws(
      () => buildAndPersistReport(reportId, 'err@example.com', catalog, computedReport),
      (err) => {
        // Must be an Error, not silently swallowed
        return err instanceof Error
      },
      'buildAndPersistReport must propagate the DB error (UNIQUE constraint) instead of silently swallowing it'
    )
  })
})

// ── runMigrations idempotency ──────────────────────────────────────────────────

describe('runMigrations() is idempotent — safe to call multiple times', () => {
  test('calling runMigrations() twice does not throw', async () => {
    const { runMigrations } = await import('../src/db/migrate.js')
    assert.doesNotThrow(
      () => { runMigrations(); runMigrations() },
      'runMigrations() must be idempotent — calling it twice must not throw'
    )
  })

  test('calling runMigrations() at queries.js import time does not corrupt existing data', async () => {
    // Insert a report, then re-run migrations, verify the report is still retrievable
    const { insertReport, getReport } = await import('../src/db/queries.js')
    const { runMigrations } = await import('../src/db/migrate.js')
    const reportId = randomId()
    const now = Math.floor(Date.now() / 1000)
    insertReport({
      report_id: reportId,
      generated_at: now,
      expires_at: now + 172800,
      email: 'idem@example.com',
      summary_json: '{"ok":true}',
      opportunities_pt_json: '[]',
      opportunities_es_json: '[]',
      quickwins_pt_json: '[]',
      quickwins_es_json: '[]',
      csv_data: 'EAN\ntest',
    })
    // Run migrations again — must not throw or destroy data
    assert.doesNotThrow(() => runMigrations(), 'runMigrations() must not throw when tables already exist')
    const row = getReport(reportId, now)
    assert.ok(row, 'Pre-existing report must still be retrievable after a second runMigrations() call')
  })
})
