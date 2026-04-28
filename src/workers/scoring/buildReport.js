// src/workers/scoring/buildReport.js
// Story 3.5: CSV builder + report persister.
// Builds the CSV string from catalog + computedReport data, then persists
// the complete report to SQLite via insertReport from queries.js.
//
// No direct db import — all DB access goes through queries.js (AC-7).

import { insertReport } from '../../db/queries.js'

// 48 hours in seconds (matches reports table TTL)
const TTL_SECONDS = 172800

// CSV column names — Portuguese client-readable headers, 10 columns total.
// wow_score columns intentionally OMITTED (internal scoring metric, not user-facing).
// Note: "Preço" contains an accented character — escapeTextCell handles UTF-8.
// Note: header values containing commas would need RFC 4180 quoting; current
// Portuguese labels do not contain commas so plain join is safe.
const CSV_HEADER = 'EAN,Produto,SKU,O meu preço,Preço 1.º lugar PT,Diferença € PT,Diferença % PT,Preço 1.º lugar ES,Diferença € ES,Diferença % ES'

// Column classification for CSV formula injection prevention (CWE-1236):
//
// Text columns (ean, product_title, shop_sku) are attacker-controllable via
// Mirakl P11 competitor listings. escapeTextCell prefixes any formula-trigger
// first-character (= + - @ \t \r) with a single quote so Excel/Sheets treat
// the cell as text, not as a formula. Numeric columns are system-computed and
// do NOT go through the prefixer — a legitimate "-0.50" gap must stay a
// machine-parseable number.
//
// Note: leading-whitespace bypass (e.g. " =cmd") is NOT handled — Excel
// generally treats leading whitespace as literal, so this is acceptable for MVP.

// Formula trigger characters per OWASP CSV Injection guidance.
const FORMULA_TRIGGERS = new Set(['=', '+', '-', '@', '\t', '\r'])

/**
 * Escape a single CSV cell value per RFC 4180.
 * - null / undefined / '' → empty cell
 * - Numbers & non-zero falsy values coerce to their String() form (0 → "0", false → "false")
 * - Cells containing commas, double-quotes, CR, or LF are wrapped in double quotes
 *   and any internal double quotes are doubled
 */
function escapeCell(val) {
  if (val === null || val === undefined || val === '') return ''
  const str = String(val)
  if (
    str.includes(',') ||
    str.includes('"') ||
    str.includes('\n') ||
    str.includes('\r')
  ) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

/**
 * Format a numeric cell value with fixed 2-decimal precision (e.g. price,
 * gap_eur). Returns '' for null / undefined / non-finite — preserves the
 * "blank for missing" convention. Avoids JS float artefacts like
 * "213.98000000002" leaking into the CSV.
 */
function formatNumberCell(val) {
  if (val === null || val === undefined || val === '') return ''
  const n = Number(val)
  if (!Number.isFinite(n)) return ''
  return n.toFixed(2)
}

/**
 * Format a fractional value (e.g. 0.184) as a percentage string with one
 * decimal: "18.4%". Matches the UI display in report.js's formatGapPct.
 * Returns '' for null / undefined / non-finite.
 */
function formatPctCell(val) {
  if (val === null || val === undefined || val === '') return ''
  const n = Number(val)
  if (!Number.isFinite(n)) return ''
  return (n * 100).toFixed(1) + '%'
}

/**
 * Escape a text-column CSV cell — applies formula-injection neutralisation
 * (CWE-1236) BEFORE RFC 4180 quoting.
 *
 * Use this for attacker-controllable text columns: ean, product_title, shop_sku.
 * Do NOT use for numeric columns — a legitimate "-0.50" gap must stay numeric.
 *
 * - null / undefined / '' → returns '' (unchanged, parity with escapeCell)
 * - If the first character of String(val) is a formula trigger (= + - @ \t \r),
 *   a single straight-quote ' is prepended BEFORE RFC 4180 quoting.
 * - RFC 4180 quoting is then applied via escapeCell (no duplication).
 */
function escapeTextCell(val) {
  if (val === null || val === undefined || val === '') return ''
  const str = String(val)
  if (FORMULA_TRIGGERS.has(str[0])) {
    return escapeCell(`'${str}`)
  }
  return escapeCell(str)
}

/**
 * Build a CSV string and persist the complete report to SQLite.
 *
 * Includes ALL catalog entries in the CSV — not just losing/opportunity products.
 * PT/ES gap columns are empty string for winning and uncontested products (AC-3).
 *
 * @param {string} reportId  — unique report identifier (UUID or similar)
 * @param {string} email     — recipient email address
 * @param {Array<{ ean: string, shop_sku: string, product_title: string, price: string|number }>} catalog
 * @param {{
 *   opportunities_pt: Array,   opportunities_es: Array,
 *   quickwins_pt: Array,       quickwins_es: Array,
 *   price_headroom_pt: Array,  price_headroom_es: Array,
 *   summary_pt: object,        summary_es: object
 * }} computedReport — output of computeReport (Story 3.4 + 2026-04-27 headroom port)
 */
export function buildAndPersistReport(reportId, email, catalog, computedReport) {
  // Defensive destructuring: default all arrays to [] so a partial upstream
  // shape (e.g. an integration test that only populates the keys it cares about)
  // does not crash with "Cannot read properties of undefined (reading 'map')".
  // Summary objects default to empty objects for symmetric reasons.
  const {
    opportunities_pt  = [],
    opportunities_es  = [],
    quickwins_pt      = [],
    quickwins_es      = [],
    price_headroom_pt = [],
    price_headroom_es = [],
    summary_pt        = {},
    summary_es        = {},
  } = computedReport ?? {}

  // Build EAN → opportunity entry lookup for O(1) access per catalog row.
  // Only losing products appear in opportunities_pt/es; winning and uncontested
  // will produce a Map miss (undefined), giving empty string cells.
  //
  // Note: entry.price in the CSV cell `O meu preço` passes through formatNumberCell.
  // When computeReport classifies a product as uncontested (because price parses
  // to NaN) the CSV will show '' — formatNumberCell rejects non-finite numbers.
  const ptMap = new Map(opportunities_pt.map(o => [o.ean, o]))
  const esMap = new Map(opportunities_es.map(o => [o.ean, o]))

  // Sort catalog by min(pt_gap_pct, es_gap_pct) ascending so the most-competitive
  // products surface at the top of the CSV. Products with no opportunity entry
  // in either channel (winning or uncontested in both) sort to the end (Infinity).
  // Sort is stable on equal keys (V8 in Node ≥22).
  function minGapPct(entry) {
    const pt = ptMap.get(entry.ean)
    const es = esMap.get(entry.ean)
    const ptGap = pt && Number.isFinite(pt.gap_pct) ? pt.gap_pct : Infinity
    const esGap = es && Number.isFinite(es.gap_pct) ? es.gap_pct : Infinity
    return Math.min(ptGap, esGap)
  }
  const sortedCatalog = [...catalog].sort((a, b) => minGapPct(a) - minGapPct(b))

  const rows = [CSV_HEADER]

  for (const entry of sortedCatalog) {
    const pt = ptMap.get(entry.ean)   // undefined if winning or uncontested in PT
    const es = esMap.get(entry.ean)   // undefined if winning or uncontested in ES

    // Text columns (attacker-controllable via Mirakl P11) → escapeTextCell
    // Numeric columns → formatNumberCell (2-decimal) or formatPctCell ("18.4%")
    const row = [
      escapeTextCell(entry.ean),                                              // EAN
      escapeTextCell(entry.product_title),                                    // Produto
      escapeTextCell(entry.shop_sku),                                         // SKU
      escapeCell(formatNumberCell(entry.price)),                              // O meu preço
      escapeCell(formatNumberCell(pt ? pt.competitor_first : null)),          // Preço 1.º lugar PT
      escapeCell(formatNumberCell(pt ? pt.gap             : null)),           // Diferença € PT
      escapeCell(formatPctCell(pt ? pt.gap_pct            : null)),           // Diferença % PT
      escapeCell(formatNumberCell(es ? es.competitor_first : null)),          // Preço 1.º lugar ES
      escapeCell(formatNumberCell(es ? es.gap             : null)),           // Diferença € ES
      escapeCell(formatPctCell(es ? es.gap_pct            : null)),           // Diferença % ES
    ].join(',')

    rows.push(row)
  }

  const csvData = rows.join('\n')

  const now = Math.floor(Date.now() / 1000)

  insertReport({
    report_id:              reportId,
    generated_at:           now,
    expires_at:             now + TTL_SECONDS,
    email,
    summary_json:           JSON.stringify({ pt: summary_pt, es: summary_es }),
    opportunities_pt_json:  JSON.stringify(opportunities_pt),
    opportunities_es_json:  JSON.stringify(opportunities_es),
    quickwins_pt_json:      JSON.stringify(quickwins_pt),
    quickwins_es_json:      JSON.stringify(quickwins_es),
    price_headroom_pt_json: JSON.stringify(price_headroom_pt),
    price_headroom_es_json: JSON.stringify(price_headroom_es),
    csv_data:               csvData,
  })
}
