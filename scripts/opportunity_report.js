#!/usr/bin/env node
/**
 * MarketPilot Opportunity Report Generator
 * Reads _bmad-output/catalog_scan.json (produced by scale_test.js) and generates
 * a ranked CSV showing Gabriel's competitive position across his catalog.
 *
 * Usage: node scripts/opportunity_report.js
 * Input:  _bmad-output/catalog_scan.json
 * Output: _bmad-output/opportunity_report.csv
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.resolve(__dirname, '..')
const OUTPUT_DIR = path.join(PROJECT_ROOT, '_bmad-output')
const INPUT_FILE = path.join(OUTPUT_DIR, 'catalog_scan.json')
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'opportunity_report.csv')

// ─── Load scan data ───────────────────────────────────────────────────────────

if (!fs.existsSync(INPUT_FILE)) {
  console.error('ERROR: catalog_scan.json not found.')
  console.error('Run scale_test.js first to generate it.')
  process.exit(1)
}

let scan
try {
  scan = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf8'))
} catch (e) {
  console.error('ERROR: catalog_scan.json is corrupt or incomplete (truncated run?).')
  console.error('Re-run scale_test.js to regenerate it.')
  process.exit(1)
}

const { offers, p11_results } = scan

if (!Array.isArray(offers) || typeof p11_results !== 'object' || p11_results === null) {
  console.error('ERROR: catalog_scan.json has unexpected schema — missing offers[] or p11_results{}.')
  console.error('Re-run scale_test.js to regenerate it.')
  process.exit(1)
}

console.log('\n═══════════════════════════════════════════════════════')
console.log('  MarketPilot Opportunity Report Generator')
console.log(`  Scan date: ${scan.summary?.run_at ?? 'unknown'}`)
console.log(`  Products loaded: ${offers.length.toLocaleString()}`)
console.log('═══════════════════════════════════════════════════════\n')

// ─── Compute competitive position for each product ───────────────────────────

const rows = []

let totalWithCompetitors = 0
let winnable2pct = 0
let winnable5pct = 0
let notCompetitive = 0
let noCompetitors = 0

for (const offer of offers) {
  const p11 = p11_results[offer.ean]

  if (!p11 || p11.active_competitors === 0) {
    noCompetitors++
    continue
  }

  totalWithCompetitors++

  const currentPrice = offer.current_price
  const firstPrice = p11.first_price    // cheapest active competitor (total_price)
  const secondPrice = p11.second_price  // second cheapest active competitor
  const activeCompetitors = p11.active_competitors
  const firstShop = p11.first_shop ?? ''

  // Gap: positive = competitor is cheaper than Gabriel (he's losing)
  //      negative = Gabriel is already cheaper than 1st place
  const gapToFirst = currentPrice != null && firstPrice != null
    ? parseFloat((currentPrice - firstPrice).toFixed(2))
    : null

  // Winnable = Gabriel can undercut 1st place within the floor discount
  // winnable_2pct: current_price × 0.98 < first_price  →  losing by less than 2%
  const win2 = currentPrice != null && firstPrice != null
    ? (currentPrice * 0.98) < firstPrice
    : false

  // winnable_5pct: current_price × 0.95 < first_price  →  losing by less than 5%
  const win5 = currentPrice != null && firstPrice != null
    ? (currentPrice * 0.95) < firstPrice
    : false

  if (win2) winnable2pct++
  else if (win5) winnable5pct++  // winnable at 5% but not at 2%
  else if (firstPrice != null) notCompetitive++

  rows.push({
    ean: offer.ean,
    product_title: (offer.product_title ?? '').replace(/[",\n\r]/g, ' ').trim(),
    shop_sku: offer.shop_sku ?? '',
    current_price: currentPrice,
    first_place_price: firstPrice,
    second_place_price: secondPrice,
    first_place_shop: firstShop.replace(/[",\n\r]/g, ' ').trim(),
    gap_to_first: gapToFirst,
    active_competitors: activeCompetitors,
    winnable_2pct: win2 ? 'YES' : 'NO',
    winnable_5pct: win5 ? 'YES' : 'NO',
  })
}

// Sort ascending by gap_to_first — smallest gap first (easiest wins)
// Products already cheaper (gap < 0) sort to the very top
rows.sort((a, b) => {
  if (a.gap_to_first === null && b.gap_to_first === null) return 0
  if (a.gap_to_first === null) return 1
  if (b.gap_to_first === null) return -1
  return a.gap_to_first - b.gap_to_first
})

// Top 100
const reportRows = rows.slice(0, 100)

// ─── Write CSV ────────────────────────────────────────────────────────────────

const CSV_HEADER = [
  'ean',
  'product_title',
  'shop_sku',
  'current_price',
  'first_place_price',
  'second_place_price',
  'first_place_shop',
  'gap_to_first',
  'active_competitors',
  'winnable_2pct',
  'winnable_5pct',
].join(',')

function csvRow(row) {
  return [
    row.ean,
    `"${row.product_title}"`,
    row.shop_sku,
    row.current_price ?? '',
    row.first_place_price ?? '',
    row.second_place_price ?? '',
    `"${row.first_place_shop}"`,
    row.gap_to_first ?? '',
    row.active_competitors,
    row.winnable_2pct,
    row.winnable_5pct,
  ].join(',')
}

const csvLines = [CSV_HEADER, ...reportRows.map(csvRow)]
fs.mkdirSync(OUTPUT_DIR, { recursive: true })
fs.writeFileSync(OUTPUT_FILE, csvLines.join('\n') + '\n')

// ─── Print summary ────────────────────────────────────────────────────────────

const totalScanned = offers.length
const winnable5pctTotal = winnable2pct + winnable5pct  // all winnable within 5%

console.log('╔═══════════════════════════════════════════════════════╗')
console.log('║  OPPORTUNITY REPORT SUMMARY                           ║')
console.log('╠═══════════════════════════════════════════════════════╣')
console.log(`║  Total products scanned:        ${String(totalScanned.toLocaleString()).padEnd(10)}             ║`)
console.log(`║  Products with competitors:     ${String(totalWithCompetitors.toLocaleString()).padEnd(10)}             ║`)
console.log(`║  No active competitors:         ${String(noCompetitors.toLocaleString()).padEnd(10)}             ║`)
console.log('╠═══════════════════════════════════════════════════════╣')
console.log(`║  Winnable within 2% drop:       ${String(winnable2pct.toLocaleString()).padEnd(10)}             ║`)
console.log(`║  Winnable within 5% drop:       ${String(winnable5pctTotal.toLocaleString()).padEnd(10)}             ║`)
console.log(`║  Not competitive (5%+ gap):     ${String(notCompetitive.toLocaleString()).padEnd(10)}             ║`)
console.log('╠═══════════════════════════════════════════════════════╣')
console.log(`║  Report rows written (top 100): ${String(reportRows.length.toLocaleString()).padEnd(10)}             ║`)
console.log('╚═══════════════════════════════════════════════════════╝')
console.log(`\nOutput saved to: _bmad-output/opportunity_report.csv\n`)

// Show top 10 preview
if (reportRows.length > 0) {
  console.log('Top 10 easiest wins (smallest gap to 1st place):')
  console.log('─────────────────────────────────────────────────────────────────')
  console.log(
    'EAN'.padEnd(15),
    'Gabriel €'.padStart(9),
    '1st pl. €'.padStart(9),
    'Gap €'.padStart(8),
    'Win2%'.padStart(6),
    'Shop'.padStart(0)
  )
  console.log('─'.repeat(65))

  for (const row of reportRows.slice(0, 10)) {
    const gapStr = row.gap_to_first != null ? row.gap_to_first.toFixed(2) : 'N/A'
    const curStr = row.current_price != null ? row.current_price.toFixed(2) : 'N/A'
    const fstStr = row.first_place_price != null ? row.first_place_price.toFixed(2) : 'N/A'
    console.log(
      String(row.ean).padEnd(15),
      String(curStr).padStart(9),
      String(fstStr).padStart(9),
      String(gapStr).padStart(8),
      String(row.winnable_2pct).padStart(6),
      ' ' + row.first_place_shop.slice(0, 20)
    )
  }
  console.log('')
}
