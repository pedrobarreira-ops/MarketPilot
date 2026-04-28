#!/usr/bin/env node
/**
 * MarketPilot — List winning EANs across the full catalog
 *
 * Diagnostic script for the "which products would I be in 1.º place on if I
 * activated them?" question. Re-fetches the OF21 catalog (forcing
 * INCLUDE_INACTIVE_OFFERS=true so the inactive set is included) and runs the
 * P11 competitor scan, then classifies each EAN as winning / losing /
 * uncontested per channel using the same logic the live report uses.
 *
 * Output: a CSV at _bmad-output/winning_eans.csv with columns
 *   EAN, SKU, Produto, O meu preço, Winning PT, Winning ES,
 *   2.º lugar PT, 2.º lugar ES
 *
 * "Winning <CH>" is "Sim" when my_price ≤ competitor_first AND a competitor
 * exists on that channel; blank otherwise (uncontested or losing).
 * "2.º lugar <CH>" is the runner-up's price (competitor_second) — useful for
 * pre-filtering products that will populate "Margem para subir" once active:
 *   filter:  Winning PT == "Sim"  AND  2.º lugar PT NOT EMPTY
 *
 * The script does NOT touch the production database, does NOT activate any
 * offers, and does NOT call PRI01 / OF01. It only READS via OF21 and P11.
 *
 * Runtime expectation for 31k SKUs: ~5-15 min depending on Mirakl rate
 * limits. Logs progress to stderr; CSV lands on disk at the path above.
 *
 * Usage:
 *   node scripts/list-winning-eans.js
 *
 * Requires .env with:
 *   WORTEN_API_KEY=...
 *   WORTEN_BASE_URL=https://marketplace.worten.pt
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.resolve(__dirname, '..')

// ─── Load .env ───────────────────────────────────────────────────────────────

function loadEnv() {
  const envPath = path.join(PROJECT_ROOT, '.env')
  if (!fs.existsSync(envPath)) {
    console.error('ERROR: .env file not found at', envPath)
    process.exit(1)
  }
  const lines = fs.readFileSync(envPath, 'utf8').split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const idx = trimmed.indexOf('=')
    if (idx === -1) continue
    const key = trimmed.slice(0, idx).trim()
    const value = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '')
    process.env[key] = value
  }
}

loadEnv()

const API_KEY = process.env.WORTEN_API_KEY
const BASE_URL = process.env.WORTEN_BASE_URL

if (!API_KEY || !BASE_URL) {
  console.error('ERROR: WORTEN_API_KEY and WORTEN_BASE_URL must be set in .env')
  process.exit(1)
}

// Force the catalog fetch to include inactive offers — the whole point of
// this script is to evaluate the full 31k set, not just the currently-active
// subset. Set BEFORE importing fetchCatalog so the module-level env read
// (if any) sees the override; the per-call check inside fetchCatalog also
// reads process.env so this works either way.
process.env.INCLUDE_INACTIVE_OFFERS = 'true'

const OUTPUT_DIR = path.join(PROJECT_ROOT, '_bmad-output')
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'winning_eans.csv')

if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true })

// ─── Import production worker modules as a library ──────────────────────────

const { fetchCatalog } = await import('../src/workers/mirakl/fetchCatalog.js')
const { scanCompetitors } = await import('../src/workers/mirakl/scanCompetitors.js')

// ─── Classification helpers (mirrors src/workers/scoring/computeReport.js) ──

// Returns true iff the seller is in 1.º place AND there is at least one
// active competitor on this channel. Uncontested (no competitor) is NOT
// classified as winning here — the report uses the same rule.
function isWinning(my_price, channelData) {
  const competitor_first = channelData?.first
  if (
    competitor_first === null ||
    competitor_first === undefined ||
    typeof competitor_first !== 'number' ||
    !Number.isFinite(competitor_first) ||
    competitor_first <= 0
  ) {
    return false
  }
  return my_price <= competitor_first
}

// ─── CSV output helpers ─────────────────────────────────────────────────────

// RFC 4180 minimal escape: quote the cell when it contains comma, quote, or
// newline; double interior quotes.
function escapeCell(val) {
  if (val === null || val === undefined) return ''
  const s = String(val)
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function fmt2(val) {
  if (val === null || val === undefined) return ''
  const n = Number(val)
  if (!Number.isFinite(n)) return ''
  return n.toFixed(2)
}

const HEADER = 'EAN,SKU,Produto,O meu preço,Winning PT,Winning ES,2.º lugar PT,2.º lugar ES'

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const startedAt = Date.now()
  console.error(`[list-winning-eans] start  base=${BASE_URL}  inactive_bypass=ON`)

  // Step 1 — full catalog (active + inactive)
  console.error('[list-winning-eans] step 1/3 — fetching catalog (OF21)…')
  const onCatalogProgress = (n, total) => {
    console.error(`  catalog progress: ${n}${total ? ` / ${total}` : ''}`)
  }
  const catalog = await fetchCatalog(BASE_URL, API_KEY, onCatalogProgress, 'list-winning-eans')
  console.error(`  catalog: ${catalog.length} entries`)

  // Step 2 — competitor scan over the full EAN set
  console.error('[list-winning-eans] step 2/3 — scanning competitors (P11)…')
  const eans = catalog.map(c => c.ean).filter(Boolean)
  const competitors = await scanCompetitors(BASE_URL, API_KEY, eans, {
    onProgress: (processed, total) => {
      console.error(`  competitor scan: ${processed} / ${total} EANs`)
    },
  })
  console.error(`  competitor scan: ${competitors.size} EANs returned data`)

  // Step 3 — classify and emit CSV
  console.error('[list-winning-eans] step 3/3 — classifying and writing CSV…')
  const rows = [HEADER]
  let winningPt = 0
  let winningEs = 0
  for (const product of catalog) {
    const my_price = parseFloat(product.price)
    if (!Number.isFinite(my_price)) continue

    const channelData = competitors.get(product.ean)
    const winPt = isWinning(my_price, channelData?.pt)
    const winEs = isWinning(my_price, channelData?.es)
    if (winPt) winningPt++
    if (winEs) winningEs++

    rows.push([
      escapeCell(product.ean),
      escapeCell(product.shop_sku),
      escapeCell(product.product_title),
      escapeCell(fmt2(my_price)),
      escapeCell(winPt ? 'Sim' : ''),
      escapeCell(winEs ? 'Sim' : ''),
      escapeCell(fmt2(channelData?.pt?.second)),
      escapeCell(fmt2(channelData?.es?.second)),
    ].join(','))
  }

  fs.writeFileSync(OUTPUT_FILE, rows.join('\n'), 'utf8')

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1)
  console.error(`[list-winning-eans] done in ${elapsed}s`)
  console.error(`  wrote ${rows.length - 1} rows to ${OUTPUT_FILE}`)
  console.error(`  winning PT: ${winningPt}    winning ES: ${winningEs}`)
  console.error('')
  console.error('Next step: open the CSV in Excel/Sheets and filter')
  console.error('  Winning PT == "Sim" AND 2.º lugar PT NOT EMPTY')
  console.error('to find the EANs worth activating for the Margem para subir test.')
}

main().catch(err => {
  console.error('[list-winning-eans] FAILED:', err?.message || err)
  console.error(err?.stack)
  process.exit(1)
})
