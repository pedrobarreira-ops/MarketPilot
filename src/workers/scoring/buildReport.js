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

/**
 * Escape a single CSV cell value per RFC 4180.
 * - null / undefined / '' → empty cell
 * - Numbers & non-zero falsy values coerce to their String() form (0 → "0", false → "false")
 * - Cells containing commas, double-quotes, CR, or LF are wrapped in double quotes
 *   and any internal double quotes are doubled
 *
 * Note on formula / CSV injection: cells starting with =, +, -, @, \t, \r when
 * opened in Excel / LibreOffice / Google Sheets can be interpreted as a formula
 * (CWE-1236). This MVP does NOT prefix such cells with a leading ' — it would
 * break the exact-byte contract asserted by ATDD tests (e.g. numeric prices like
 * "19.99"). Deferred as a hardening task once the report contract is stable and
 * we classify cells as "text" vs "numeric" — see deferred-work.md.
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

    const row = [
      escapeCell(entry.ean),
      escapeCell(entry.product_title),
      escapeCell(entry.shop_sku),
      escapeCell(entry.price),                    // my_price
      escapeCell(pt ? pt.competitor_first : ''),  // pt_first_price
      escapeCell(pt ? pt.gap             : ''),   // pt_gap_eur
      escapeCell(pt ? pt.gap_pct         : ''),   // pt_gap_pct
      escapeCell(pt ? pt.wow_score       : ''),   // pt_wow_score
      escapeCell(es ? es.competitor_first : ''),  // es_first_price
      escapeCell(es ? es.gap             : ''),   // es_gap_eur
      escapeCell(es ? es.gap_pct         : ''),   // es_gap_pct
      escapeCell(es ? es.wow_score       : ''),   // es_wow_score
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
