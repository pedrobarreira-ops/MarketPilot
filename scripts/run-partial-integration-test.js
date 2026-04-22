#!/usr/bin/env node
/**
 * Partial integration test — exercises Phases B–E of the report pipeline
 * against REAL Worten P11, REAL SQLite, and REAL Resend. Bypasses Phase A
 * (fetchCatalog) because Gabriel's shop has every offer flagged inactive
 * (all products have ZERO_QUANTITY), which correctly triggers
 * EmptyCatalogError and blocks the full-pipeline test from reaching Phase B+.
 *
 * This verifies the pipeline integration for a shop that DOES have active
 * offers — the coverage gap left over from the full integration run on
 * 2026-04-19 (where Phase A exhaustively fetched 31,618 offers but all
 * were inactive).
 *
 * Usage: node --env-file=.env scripts/run-partial-integration-test.js
 */

import { randomUUID } from 'node:crypto'
import { scanCompetitors } from '../src/workers/mirakl/scanCompetitors.js'
import { computeReport } from '../src/workers/scoring/computeReport.js'
import { buildAndPersistReport } from '../src/workers/scoring/buildReport.js'
import { sendReportEmail } from '../src/email/sendReportEmail.js'
import * as db from '../src/db/queries.js'

// ── Preflight ────────────────────────────────────────────────────────────
const required = ['WORTEN_API_KEY', 'WORTEN_BASE_URL', 'RESEND_API_KEY', 'SQLITE_PATH', 'APP_BASE_URL']
const missing = required.filter(k => !process.env[k])
if (missing.length) {
  console.error('MISSING env vars:', missing.join(', '))
  process.exit(1)
}

const apiKey = process.env.WORTEN_API_KEY
const baseUrl = process.env.WORTEN_BASE_URL
const recipientEmail = 'pedro.belchior.barreira@gmail.com'

console.log('=== Partial Integration Test (Phases B–E) ===\n')

// ── Step 1: Fetch 5 offers from OF21 for EAN seeds (bypassing active filter) ──
console.log('1. Fetching 5 offers from OF21 (manual, bypasses active filter)...')
const of21Url = new URL(baseUrl + '/api/offers')
of21Url.searchParams.set('max', '5')
of21Url.searchParams.set('offset', '0')
const of21Res = await fetch(of21Url, { headers: { Authorization: apiKey } })
if (!of21Res.ok) {
  console.error(`   FAIL: OF21 returned HTTP ${of21Res.status}`)
  process.exit(1)
}
const of21 = await of21Res.json()
const offers = of21.offers || []

const catalog = []
for (const o of offers) {
  const eanRef = (o.product_references ?? []).find(r => r.reference_type === 'EAN')
  if (!eanRef) continue
  catalog.push({
    ean: eanRef.reference,
    shop_sku: o.shop_sku,
    price: o.applicable_pricing?.price ?? o.price,
    product_title: o.product_title,
  })
}
if (catalog.length === 0) {
  console.error('   FAIL: no EANs extracted from OF21')
  process.exit(1)
}

console.log(`   ✓ Got ${catalog.length} catalog entries:`)
for (const c of catalog) {
  console.log(`     ean=${c.ean}  sku=${c.shop_sku}  price=${c.price}  title="${(c.product_title ?? '').slice(0, 40)}"`)
}
console.log()

// ── Step 2: Phase B — scanCompetitors (real P11) ─────────────────────────
console.log('2. Running scanCompetitors (Phase B — real P11)...')
const t2 = Date.now()
const eans = catalog.map(c => c.ean)
// Signature since Story 7.3: (baseUrl, apiKey, eans, options)
const competitors = await scanCompetitors(baseUrl, apiKey, eans)
const t2ElapsedS = ((Date.now() - t2) / 1000).toFixed(1)
console.log(`   ✓ scanCompetitors returned in ${t2ElapsedS}s. Map size: ${competitors.size}`)

for (const [ean, data] of competitors) {
  const ptStr = data.pt.first !== null ? `€${data.pt.first}` : 'none'
  const esStr = data.es.first !== null ? `€${data.es.first}` : 'none'
  console.log(`     EAN ${ean}: pt.first=${ptStr}  es.first=${esStr}`)
}
console.log()

// ── Step 3: Phase C — computeReport (pure function) ───────────────────────
console.log('3. Running computeReport (Phase C — pure scoring)...')
const t3 = Date.now()
const computed = computeReport(catalog, competitors)
console.log(`   ✓ computeReport returned in ${((Date.now() - t3) / 1000).toFixed(2)}s`)
console.log(`     PT: total=${computed.summary_pt.total} winning=${computed.summary_pt.winning} losing=${computed.summary_pt.losing} uncontested=${computed.summary_pt.uncontested}`)
console.log(`     ES: total=${computed.summary_es.total} winning=${computed.summary_es.winning} losing=${computed.summary_es.losing} uncontested=${computed.summary_es.uncontested}`)
console.log(`     opportunities_pt=${computed.opportunities_pt.length} / quickwins_pt=${computed.quickwins_pt.length}`)
console.log(`     opportunities_es=${computed.opportunities_es.length} / quickwins_es=${computed.quickwins_es.length}`)
console.log()

// ── Step 4: Phase D — buildAndPersistReport (real SQLite + CSV) ──────────
console.log('4. Running buildAndPersistReport (Phase D — SQLite + CSV)...')
const reportId = randomUUID()
const t4 = Date.now()
buildAndPersistReport(reportId, recipientEmail, catalog, computed)
console.log(`   ✓ buildAndPersistReport returned in ${((Date.now() - t4) / 1000).toFixed(2)}s`)

const persistedReport = db.getReport(reportId, Math.floor(Date.now() / 1000))
if (!persistedReport) {
  console.error('   FAIL: getReport returned null right after insert')
  process.exit(1)
}
const ttl = persistedReport.expires_at - persistedReport.generated_at
console.log(`     report_id=${persistedReport.report_id}`)
console.log(`     expires_at - generated_at = ${ttl}s (expected 172800)`)
console.log(`     csv_data length: ${persistedReport.csv_data.length} chars`)
console.log(`     summary_json preview: ${persistedReport.summary_json.slice(0, 120)}`)
console.log()

// ── Step 5: Phase E — sendReportEmail (real Resend) ──────────────────────
console.log('5. Running sendReportEmail (Phase E — real Resend)...')
const t5 = Date.now()
await sendReportEmail({
  email: recipientEmail,
  reportId,
  summary: { pt: computed.summary_pt, es: computed.summary_es },
})
console.log(`   ✓ sendReportEmail returned in ${((Date.now() - t5) / 1000).toFixed(2)}s`)
console.log(`     Sender: ${process.env.RESEND_FROM}`)
console.log(`     Recipient: ${recipientEmail}`)
console.log(`     NOTE: Resend failures are swallowed per Story 3.6 contract — check inbox to confirm`)
console.log()

// ── 6-point verification ─────────────────────────────────────────────────
console.log('=== 6-point verification ===')
let pass = 0
let fail = 0
function check(n, label, ok, detail = '') {
  const mark = ok ? '✓' : '✗'
  console.log(`  ${mark} ${n}. ${label}${detail ? ' — ' + detail : ''}`)
  if (ok) pass++; else fail++
}

check(1, 'Catalog constructed from OF21 (Phase A substitute)',
  catalog.length > 0,
  `${catalog.length} entries`)

const hasAnyCompetitor = [...competitors.values()].some(d =>
  d.pt.first !== null || d.pt.second !== null ||
  d.es.first !== null || d.es.second !== null
)
check(2, 'scanCompetitors returned competitor data for at least one EAN',
  hasAnyCompetitor,
  `map size ${competitors.size}`)

check(3, 'Report persisted with TTL = 172800 (48h)',
  ttl === 172800,
  `actual ${ttl}s`)

console.log('  ? 4. Email delivery — verify manually in your inbox within ~2 min')

check(5, 'getReport retrieves the persisted row',
  !!persistedReport,
  persistedReport ? `row exists` : 'missing')

check(6, 'Pipeline completed without exceptions',
  true,
  'no throws across Phases B–E')

console.log()
console.log(`Summary: ${pass} automated passed / ${fail} failed / 1 manual (email)`)
console.log()

if (fail === 0) {
  console.log('✅ Phases B–E verified against live Worten + SQLite + Resend.')
  console.log('   Remaining unknown: Phase A at full scale with a shop that has active offers.')
  console.log('   (That is the "production smoke test" — defer until a shop with active inventory is available.)')
  process.exit(0)
} else {
  console.log('❌ Partial integration test failed. See above for specifics.')
  process.exit(1)
}
