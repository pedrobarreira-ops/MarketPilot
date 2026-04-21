/**
 * ATDD static source scan tests for Story 6.4: report.html + report.js
 * (Mobile & Desktop Layout Verification)
 *
 * Acceptance criteria verified (static-only, no browser, no server):
 *
 * AC-5 (static): report.html uses responsive Tailwind breakpoint classes (`sm:` or `lg:`)
 *   for stat cards and tables, confirming responsive layout is declared in the markup.
 *   The Playwright E2E tests (viewport-based) remain the primary verification layer for
 *   layout behaviour; this scan is a defence-in-depth check that the HTML was not
 *   accidentally stripped of its responsive classes.
 *
 * These tests read `public/report.html` source text.
 * They are hermetic — no browser, no Fastify, no Redis, no SQLite required.
 *
 * Run: node --test tests/epic6-6.4-mobile-layout.atdd.test.js
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPORT_HTML_PATH = join(__dirname, '../public/report.html')
const REPORT_JS_PATH = join(__dirname, '../public/js/report.js')

// ── fixture guard ──────────────────────────────────────────────────────────

let reportHtmlSrc = null
let reportJsSrc = null

if (existsSync(REPORT_HTML_PATH)) {
  reportHtmlSrc = readFileSync(REPORT_HTML_PATH, 'utf8')
}

if (existsSync(REPORT_JS_PATH)) {
  const raw = readFileSync(REPORT_JS_PATH, 'utf8')
  // Strip comments for JS scan
  reportJsSrc = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
}

function requireHtml() {
  if (reportHtmlSrc === null) {
    assert.fail(
      'public/report.html does not exist yet — Story 1.1 scaffold must have created it. ' +
      'This test should not be failing at Epic 6 — investigate.'
    )
  }
  return reportHtmlSrc
}

// ── T-6.4-static.1: report.html contains responsive Tailwind classes ───────

describe('T-6.4-static.1: report.html uses Tailwind responsive breakpoint classes', () => {
  test('report.html contains sm:, md:, or lg: breakpoint classes (mobile → desktop transitions)', () => {
    const html = requireHtml()
    assert.ok(
      /\b(sm|md|lg):/.test(html),
      'public/report.html must use Tailwind responsive breakpoint classes (sm:, md:, or lg:) ' +
      'to implement responsive layout (stat cards stack on mobile, full grid on desktop). ' +
      'Do NOT remove existing breakpoint classes from the Stitch-generated HTML.'
    )
  })

  test('report.html still contains overflow-x-auto or lg: classes for table responsiveness', () => {
    const html = requireHtml()
    const hasOverflowClass = /overflow-x-auto/.test(html)
    const hasLgClass = /\blg:/.test(html)
    assert.ok(
      hasOverflowClass || hasLgClass,
      'public/report.html must retain overflow-x-auto or lg: Tailwind classes for ' +
      'horizontal table scrolling on mobile. These must not be removed from the Stitch mockup.'
    )
  })
})

// ── Invariant: report.html structure must not have been modified by 6.x stories ──

describe('Layout invariant: report.html retains its Stitch structure', () => {
  test('report.html still references Tailwind CDN (not a local build)', () => {
    const html = requireHtml()
    assert.ok(
      /cdn\.tailwindcss\.com/.test(html) || /tailwindcss/.test(html),
      'public/report.html must still load Tailwind via CDN — no bundler build step exists at MVP. ' +
      'Do NOT replace the CDN link with a local build.'
    )
  })

  test('report.html still references Google Fonts (Manrope + Inter)', () => {
    const html = requireHtml()
    assert.ok(
      /fonts\.googleapis\.com/.test(html) || /Manrope/.test(html),
      'public/report.html must still reference Google Fonts (Manrope for headlines, Inter for body). ' +
      'Do NOT strip the font imports — they are part of the committed Stitch design system.'
    )
  })
})

// Cross-cutting architecture invariants live in tests/frontend-architecture-invariants.test.js.
