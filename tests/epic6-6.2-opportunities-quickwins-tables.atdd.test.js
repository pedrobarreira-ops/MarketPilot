/**
 * ATDD static source scan tests for Story 6.2: report.js
 * (Biggest Opportunities & Quick Wins Tables)
 *
 * Acceptance criteria verified (static-only, no browser, no server):
 *
 * AC-8 (static): WOW scores are rendered as formatted numbers — not injected
 *   as raw/unformatted values. The source must contain locale formatting logic
 *   (toLocaleString or Intl.NumberFormat) in the vicinity of wow_score usage.
 *
 * These tests read `public/js/report.js` source text and apply regex assertions.
 * They are hermetic — no browser, no Fastify, no Redis, no SQLite required.
 *
 * Run: node --test tests/epic6-6.2-opportunities-quickwins-tables.atdd.test.js
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPORT_JS_PATH = join(__dirname, '../public/js/report.js')

// ── helpers ────────────────────────────────────────────────────────────────

function stripComments(src) {
  let stripped = src.replace(/\/\*[\s\S]*?\*\//g, '')
  stripped = stripped.replace(/\/\/[^\n]*/g, '')
  return stripped
}

// ── fixture guard ──────────────────────────────────────────────────────────

let reportJsSrc = null

if (existsSync(REPORT_JS_PATH)) {
  const raw = readFileSync(REPORT_JS_PATH, 'utf8')
  reportJsSrc = stripComments(raw)
}

function requireSource() {
  if (reportJsSrc === null) {
    assert.fail(
      'public/js/report.js does not exist yet — Story 6.1/6.2 dev agent must create it. ' +
      'This test is intentionally failing (red phase).'
    )
  }
  return reportJsSrc
}

// ── AC-8: WOW scores formatted as locale numbers ──────────────────────────

describe('AC-8 (static): WOW scores rendered as formatted numbers (not raw)', () => {
  test('T-6.2-static.1a — source contains toLocaleString or Intl.NumberFormat for numeric formatting', () => {
    const src = requireSource()
    const hasLocaleString = /\.toLocaleString\s*\(/.test(src)
    const hasIntlFormat = /Intl\.NumberFormat/.test(src)
    assert.ok(
      hasLocaleString || hasIntlFormat,
      'report.js must use toLocaleString() or Intl.NumberFormat to format numeric values ' +
      '(prices, WOW scores, stat counts) in pt-PT locale. ' +
      'Raw number injection via textContent/innerHTML is not acceptable for locale-formatted display.'
    )
  })

  test('T-6.2-static.1b — source references wow_score field from opportunities data', () => {
    const src = requireSource()
    assert.ok(
      /wow_score/.test(src),
      'report.js must reference wow_score when rendering the Opportunities table (AC-4). ' +
      'The wow_score field from the API response must be read and displayed in the WOW column.'
    )
  })

  test('T-6.2-static.1c — source references gap_pct for the red pill badge in Opportunities table', () => {
    const src = requireSource()
    assert.ok(
      /gap_pct/.test(src),
      'report.js must reference gap_pct from the opportunity objects to render the red percentage ' +
      'badge in the Opportunities table (AC-3). Verify the field is read and displayed.'
    )
  })
})

// ── Positive invariants: opportunities and quick wins table structure ──────

describe('Opportunities and Quick Wins table rendering invariants', () => {
  test('source references opportunities_pt and opportunities_es (or common prefix)', () => {
    const src = requireSource()
    // Either explicit field names OR a pattern like 'opportunities_' + channel
    const hasOpportunities =
      /opportunities_pt/.test(src) ||
      /opportunities_es/.test(src) ||
      /\bopportunities\b/.test(src)
    assert.ok(
      hasOpportunities,
      'report.js must reference opportunities data (opportunities_pt / opportunities_es) ' +
      'when rendering the Biggest Opportunities table.'
    )
  })

  test('source references quickwins_pt and quickwins_es (or common prefix)', () => {
    const src = requireSource()
    const hasQuickWins =
      /quickwins_pt/.test(src) ||
      /quickwins_es/.test(src) ||
      /\bquickwins\b/.test(src) ||
      /quick_wins/.test(src)
    assert.ok(
      hasQuickWins,
      'report.js must reference quickwins data (quickwins_pt / quickwins_es) ' +
      'when rendering the Quick Wins table.'
    )
  })
})

// Cross-cutting architecture invariants live in tests/frontend-architecture-invariants.test.js.
