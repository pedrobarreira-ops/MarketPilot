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

// ── CSV_COLUMNS / CSV_HEADER drift check ───────────────────────────────────────

describe('CSV_COLUMNS export vs buildReport.js CSV_HEADER — no drift', () => {
  test('CSV_COLUMNS exported from queries.js matches the 12-column header string', async () => {
    const queries = await import('../src/db/queries.js')
    assert.equal(
      typeof queries.CSV_COLUMNS,
      'string',
      'queries.js must export CSV_COLUMNS as a string'
    )
    const expected = 'EAN,product_title,shop_sku,my_price,pt_first_price,pt_gap_eur,pt_gap_pct,pt_wow_score,es_first_price,es_gap_eur,es_gap_pct,es_wow_score'
    assert.equal(
      queries.CSV_COLUMNS,
      expected,
      'CSV_COLUMNS must exactly match the 12-column FR17 spec'
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
      'EAN,product_title,shop_sku,my_price,pt_first_price,pt_gap_eur,pt_gap_pct,pt_wow_score,es_first_price,es_gap_eur,es_gap_pct,es_wow_score',
      'The single line must be the header row'
    )
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
