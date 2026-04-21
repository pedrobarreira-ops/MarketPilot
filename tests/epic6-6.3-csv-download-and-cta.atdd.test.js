/**
 * ATDD static source scan tests for Story 6.3: report.js
 * (CSV Download & CTA Banner)
 *
 * Acceptance criteria verified (static-only, no browser, no server):
 *
 * AC-4/AC-5 (static): const CTA_URL is declared at the top of report.js — not embedded
 *   in report.html. The `target="_blank"` and `rel="noopener noreferrer"` must be set
 *   in JS (can be confirmed via static scan).
 *
 * AC-6 (static): CTA_URL must not contain placeholder values (TODO, PLACEHOLDER,
 *   example.com, localhost). This is also enforced globally by
 *   frontend-architecture-invariants.test.js section 5, but the story-level assertion
 *   here makes the failing test output more actionable.
 *
 * T-6.3-static.1: CSV URL constructed as /api/reports/<id>/csv — not hardcoded.
 *
 * These tests read `public/js/report.js` source text and apply regex assertions.
 * They are hermetic — no browser, no Fastify, no Redis, no SQLite required.
 *
 * Run: node --test tests/epic6-6.3-csv-download-and-cta.atdd.test.js
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
      'public/js/report.js does not exist yet — Story 6.1/6.3 dev agent must create it. ' +
      'This test is intentionally failing (red phase).'
    )
  }
  return reportJsSrc
}

// ── T-6.3-static.1: CSV URL constructed correctly ─────────────────────────

describe('T-6.3-static.1: CSV download URL constructed as /api/reports/<id>/csv', () => {
  test('report.js source contains "/csv" in a URL construction context', () => {
    const src = requireSource()
    assert.ok(
      /\/csv/.test(src),
      'report.js must construct a CSV download URL ending in "/csv". ' +
      'The URL must be built dynamically from the report_id — not hardcoded with a specific ID.'
    )
  })

  test('report.js CSV URL is built dynamically — not hardcoded with a static report_id', () => {
    const src = requireSource()
    // A hardcoded UUID or fixed report ID in the CSV URL would mean the link is broken for
    // all reports except one. Check that /csv is adjacent to a variable or template expression.
    // Heuristic: the pattern `/<literal-uuid>/csv` or `"<word>/csv"` where the word does not
    // look like a variable should not appear. We allow '/csv' as part of a template literal or
    // concatenation (e.g. `/api/reports/${reportId}/csv`), but NOT standalone.
    const hardcodedCsvPattern = /['"`]\/api\/reports\/[a-f0-9-]{8,}\/csv['"`]/
    assert.ok(
      !hardcodedCsvPattern.test(src),
      'report.js must NOT hardcode a specific report_id in the CSV URL — ' +
      'the URL must be built using the dynamic report_id variable (e.g. template literal). ' +
      'A hardcoded UUID means the CSV link breaks for every other report.'
    )
  })
})

// ── T-6.3-static.2: CTA_URL declared as a const in report.js ──────────────

describe('T-6.3-static.2: CTA_URL declared as const in report.js — not in HTML', () => {
  test('report.js source contains `const CTA_URL` declaration', () => {
    const src = requireSource()
    assert.ok(
      /const\s+CTA_URL/.test(src),
      'report.js must declare `const CTA_URL = "..."` at the top of the file (AC-5). ' +
      'The CTA URL must NOT be hardcoded in report.html — it is a deployment-time config ' +
      'that belongs in the JS file, not in the markup.'
    )
  })
})

// ── T-6.3-static.3: CTA_URL must not contain placeholder values ───────────

describe('T-6.3-static.3: CTA_URL must not contain placeholder / dev-only values', () => {
  /**
   * This is also enforced globally by frontend-architecture-invariants.test.js section 5.
   * The assertion here surfaces a more specific failure message.
   */
  test('CTA_URL value is not a placeholder or localhost URL', () => {
    const src = requireSource()

    // Extract the CTA_URL value from a const declaration.
    // Supports both: const CTA_URL = 'https://...'  and  const CTA_URL = "https://..."
    const match = src.match(/const\s+CTA_URL\s*=\s*['"]([^'"]*)['"]/);
    if (!match) {
      // const CTA_URL exists but uses a template literal or expression — that's unusual
      // for a static URL. Skip the value check; structural presence is already tested above.
      return
    }

    const value = match[1]
    const placeholderPattern = /\b(TODO|PLACEHOLDER|example\.com|localhost|your[-_]?domain|fixme)\b/i
    assert.ok(
      !placeholderPattern.test(value),
      `CTA_URL contains a placeholder value: "${value}". ` +
      'Set a real contact channel (e.g. WhatsApp wa.me URL, mailto:, Typeform) before shipping. ' +
      'See UX-DR15 launch checklist.'
    )
  })
})

// ── Positive invariant: noopener noreferrer on external links ─────────────

describe('External link security: target=_blank links must have rel=noopener noreferrer', () => {
  test('report.js sets rel="noopener noreferrer" alongside target="_blank"', () => {
    const src = requireSource()
    // If _blank is used, noopener/noreferrer must also appear.
    // This prevents tabnapping on the CTA and any other external links.
    if (!/_blank/.test(src)) {
      // No _blank targets found — if CTA opens in new tab, this will fail E2E-6.3-4 instead.
      return
    }
    assert.ok(
      /noopener/.test(src) && /noreferrer/.test(src),
      'report.js uses target="_blank" but is missing rel="noopener noreferrer". ' +
      'All external links opened in new tabs must have rel="noopener noreferrer" to prevent ' +
      'tabnapping. Set both values on the CTA anchor (AC-4).'
    )
  })
})

// Cross-cutting architecture invariants (CTA_URL placeholder also checked globally)
// live in tests/frontend-architecture-invariants.test.js section 5.
