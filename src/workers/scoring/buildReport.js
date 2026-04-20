// src/workers/scoring/buildReport.js
// Story 3.5: CSV builder + report persister.
// Builds the CSV string from catalog + computedReport data, then persists
// the complete report to SQLite via insertReport from queries.js.
//
// No direct db import — all DB access goes through queries.js (AC-7).

import { insertReport } from '../../db/queries.js'

// 48 hours in seconds (matches reports table TTL)
const TTL_SECONDS = 172800

// CSV column names — all 12 required by FR17 spec (AC-2)
// EAN,product_title,shop_sku,my_price,pt_first_price,pt_gap_eur,pt_gap_pct,pt_wow_score,es_first_price,es_gap_eur,es_gap_pct,es_wow_score
const CSV_HEADER = 'EAN,product_title,shop_sku,my_price,pt_first_price,pt_gap_eur,pt_gap_pct,pt_wow_score,es_first_price,es_gap_eur,es_gap_pct,es_wow_score'

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
 *   opportunities_pt: Array, opportunities_es: Array,
 *   quickwins_pt: Array,     quickwins_es: Array,
 *   summary_pt: object,      summary_es: object
 * }} computedReport — output of computeReport (Story 3.4)
 */
export function buildAndPersistReport(reportId, email, catalog, computedReport) {
  // Defensive destructuring: default all arrays to [] so a partial upstream
  // shape (e.g. an integration test that only populates the keys it cares about)
  // does not crash with "Cannot read properties of undefined (reading 'map')".
  // Summary objects default to empty objects for symmetric reasons.
  const {
    opportunities_pt = [],
    opportunities_es = [],
    quickwins_pt     = [],
    quickwins_es     = [],
    summary_pt       = {},
    summary_es       = {},
  } = computedReport ?? {}

  // Build EAN → opportunity entry lookup for O(1) access per catalog row.
  // Only losing products appear in opportunities_pt/es; winning and uncontested
  // will produce a Map miss (undefined), giving empty string cells (AC-3).
  //
  // Note: entry.price in the CSV cell `my_price` passes through as-is. When
  // computeReport classifies a product as uncontested (because price parses to
  // NaN) the CSV still shows the raw upstream string — this is an intentional
  // trade-off so operators can see the actual upstream value when triaging.
  const ptMap = new Map(opportunities_pt.map(o => [o.ean, o]))
  const esMap = new Map(opportunities_es.map(o => [o.ean, o]))

  const rows = [CSV_HEADER]

  for (const entry of catalog) {
    const pt = ptMap.get(entry.ean)   // undefined if winning or uncontested in PT
    const es = esMap.get(entry.ean)   // undefined if winning or uncontested in ES

    // Text columns (attacker-controllable via Mirakl P11) → escapeTextCell
    // Numeric columns (system-computed)                   → escapeCell
    const row = [
      escapeTextCell(entry.ean),                          // text: attacker-controllable
      escapeTextCell(entry.product_title),                // text: attacker-controllable
      escapeTextCell(entry.shop_sku),                     // text: attacker-controllable
      escapeCell(entry.price),                            // my_price (numeric)
      escapeCell(pt ? pt.competitor_first : ''),          // pt_first_price (numeric)
      escapeCell(pt ? pt.gap             : ''),           // pt_gap_eur (numeric)
      escapeCell(pt ? pt.gap_pct         : ''),           // pt_gap_pct (numeric)
      escapeCell(pt ? pt.wow_score       : ''),           // pt_wow_score (numeric)
      escapeCell(es ? es.competitor_first : ''),          // es_first_price (numeric)
      escapeCell(es ? es.gap             : ''),           // es_gap_eur (numeric)
      escapeCell(es ? es.gap_pct         : ''),           // es_gap_pct (numeric)
      escapeCell(es ? es.wow_score       : ''),           // es_wow_score (numeric)
    ].join(',')

    rows.push(row)
  }

  const csvData = rows.join('\n')

  const now = Math.floor(Date.now() / 1000)

  insertReport({
    report_id:             reportId,
    generated_at:          now,
    expires_at:            now + TTL_SECONDS,
    email,
    summary_json:          JSON.stringify({ pt: summary_pt, es: summary_es }),
    opportunities_pt_json: JSON.stringify(opportunities_pt),
    opportunities_es_json: JSON.stringify(opportunities_es),
    quickwins_pt_json:     JSON.stringify(quickwins_pt),
    quickwins_es_json:     JSON.stringify(quickwins_es),
    csv_data:              csvData,
  })
}
