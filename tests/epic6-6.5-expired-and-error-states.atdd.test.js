/**
 * ATDD static source scan tests for Story 6.5: report.js
 * (Expired Report & Fetch Error States)
 *
 * Acceptance criteria verified (static-only, no browser, no server):
 *
 * AC-3 (static): Error and expiry UI is driven by report.js — not by default/static
 *   HTML content. The source must explicitly handle non-200 HTTP responses and must
 *   contain the Portuguese copy strings for both error states.
 *
 * These tests read `public/js/report.js` source text and apply regex assertions.
 * They are hermetic — no browser, no Fastify, no Redis, no SQLite required.
 *
 * Run: node --test tests/epic6-6.5-expired-and-error-states.atdd.test.js
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
      'public/js/report.js does not exist yet — Story 6.1/6.5 dev agent must create it. ' +
      'This test is intentionally failing (red phase).'
    )
  }
  return reportJsSrc
}

// ── AC-3: HTTP status handled explicitly ──────────────────────────────────

describe('AC-3 (static): report.js handles non-200 responses explicitly', () => {
  test('T-6.5-static.1a — source checks response.ok or response.status for HTTP errors', () => {
    const src = requireSource()
    const checksOk = /response\.ok/.test(src)
    const checksStatus = /response\.status/.test(src) || /\.status\s*===/.test(src) || /\.status\s*!==/.test(src)
    assert.ok(
      checksOk || checksStatus,
      'report.js must check the HTTP response status (response.ok or response.status) ' +
      'to distinguish success from 404/5xx error responses. ' +
      'Without this check, all non-200 responses silently render broken data.'
    )
  })

  test('T-6.5-static.1b — source contains 404 handling path', () => {
    const src = requireSource()
    // 404 can be detected as a literal status code comparison or via response.ok check
    const handles404 =
      /404/.test(src) ||
      // response.ok covers 404, but we still require an explicit non-success branch.
      // If the dev uses response.ok, they must handle the !response.ok case distinctly from
      // a network error — a simple try/catch that uses a generic message for both is acceptable
      // only if the 404-specific copy is present in the source.
      (/response\.ok/.test(src) && /Este relat/.test(src))
    assert.ok(
      handles404,
      'report.js must handle 404 responses explicitly — either by checking response.status === 404 ' +
      'or by branching on response.ok and displaying the 404-specific expiry copy.'
    )
  })
})

// ── Expiry card Portuguese copy ─────────────────────────────────────────────

describe('AC-1 (static): expiry card copy present in report.js', () => {
  test('source contains the "Este relatório já não está disponível" expiry message', () => {
    const src = requireSource()
    // Allow partial match — the exact Portuguese text must be present (not generated at runtime
    // from server response). This ensures the JS explicitly sets the expiry UI copy.
    assert.ok(
      /Este relat.*j.*n.*est.*dispon/.test(src) ||
      /Este relat/.test(src) && /j.*n.*dispon/.test(src),
      'report.js must contain the expiry card copy: "Este relatório já não está disponível". ' +
      'This text must originate in report.js — not be relayed from the server error response. ' +
      'The server returns a structured 404; the UI chooses the human-readable message.'
    )
  })

  test('source contains "Gerar um novo relatório" CTA button for 404 state', () => {
    const src = requireSource()
    assert.ok(
      /Gerar.*novo relat/.test(src) || /novo relat.*Gerar/.test(src) || /Gerar um novo/.test(src),
      'report.js must render a "Gerar um novo relatório →" button in the 404 (expiry) state. ' +
      'The button must link to "/" (the form page).'
    )
  })
})

// ── Fetch error card Portuguese copy ───────────────────────────────────────

describe('AC-2 (static): fetch error card copy present in report.js', () => {
  test('source contains "Não foi possível carregar o relatório" error message', () => {
    const src = requireSource()
    assert.ok(
      /N.*o foi poss.*vel carregar/.test(src) || /Não foi poss/.test(src),
      'report.js must contain the error card copy: "Não foi possível carregar o relatório". ' +
      'This is displayed for 5xx and network errors. ' +
      'It must be distinct from the 404 expiry message.'
    )
  })

  test('source contains window.location.reload() for the Recarregar button', () => {
    const src = requireSource()
    assert.ok(
      /window\.location\.reload\s*\(\s*\)/.test(src),
      'report.js must call window.location.reload() when the "Recarregar" button is clicked (AC-2). ' +
      'This is the only acceptable reload mechanism — no server redirect, no pushState.'
    )
  })
})

// Cross-cutting architecture invariants live in tests/frontend-architecture-invariants.test.js.
