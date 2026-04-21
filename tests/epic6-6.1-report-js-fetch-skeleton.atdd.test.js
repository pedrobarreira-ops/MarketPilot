/**
 * ATDD static source scan tests for Story 6.1: report.js
 * (Data Fetch, Skeleton, Your Position & PT/ES Toggle)
 *
 * Acceptance criteria verified (static-only, no browser, no server):
 *
 * AC-7 (static): report.js fetches from /api/reports/ — not from any other endpoint.
 *
 * AC-8 (static): report_id is extracted from the URL PATH (window.location.pathname),
 *   not from query params (URLSearchParams) and not from localStorage/sessionStorage.
 *   The route is GET /report/:report_id — the ID is the last path segment.
 *
 * These tests read `public/js/report.js` source text and apply regex assertions.
 * They are hermetic — no browser, no Fastify, no Redis, no SQLite required.
 *
 * Run: node --test tests/epic6-6.1-report-js-fetch-skeleton.atdd.test.js
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPORT_JS_PATH = join(__dirname, '../public/js/report.js')

// ── helpers ────────────────────────────────────────────────────────────────

/**
 * Strip block comments and single-line comments from source text so that
 * commented-out code does not cause false positives/negatives.
 */
function stripComments(src) {
  let stripped = src.replace(/\/\*[\s\S]*?\*\//g, '')
  stripped = stripped.replace(/\/\/[^\n]*/g, '')
  return stripped
}

// ── fixture guard ──────────────────────────────────────────────────────────

let reportJsSrc = null
let reportJsLines = null

if (existsSync(REPORT_JS_PATH)) {
  const raw = readFileSync(REPORT_JS_PATH, 'utf8')
  reportJsSrc = stripComments(raw)
  reportJsLines = reportJsSrc.split('\n')
}

function requireSource() {
  if (reportJsSrc === null) {
    assert.fail(
      'public/js/report.js does not exist yet — Story 6.1 dev agent must create it. ' +
      'This test is intentionally failing (red phase).'
    )
  }
  return reportJsSrc
}

// ── AC-7: fetch endpoint must be /api/reports/ ─────────────────────────────

describe('AC-7 (static): report.js must fetch from /api/reports/', () => {
  test('T-6.1-static.1a — source contains a fetch() call', () => {
    const src = requireSource()
    assert.ok(
      /\bfetch\s*\(/.test(src),
      'report.js must contain a fetch() call to retrieve report data from the API'
    )
  })

  test('T-6.1-static.1b — fetch URL targets /api/reports/', () => {
    const src = requireSource()
    assert.ok(
      /\/api\/reports\//.test(src),
      'report.js must fetch from /api/reports/ — not from a different endpoint path. ' +
      'The full URL will be /api/reports/<report_id>. ' +
      'Ensure the string "/api/reports/" appears in the fetch URL construction.'
    )
  })
})

// ── AC-8: report_id from URL path, not query params or storage ─────────────

describe('AC-8 (static): report_id must be extracted from URL path only', () => {
  test('T-6.1-static.2a — report.js reads the URL path via window.location.pathname', () => {
    const src = requireSource()
    assert.ok(
      /location\.pathname/.test(src),
      'report.js must use window.location.pathname to extract the report_id. ' +
      'The report page route is GET /report/:report_id — the ID is the last path segment. ' +
      'Do not use URLSearchParams or query params for the report_id.'
    )
  })

  test('T-6.1-static.2b — report.js does not read report_id from localStorage', () => {
    const src = requireSource()
    assert.ok(
      !/localStorage/.test(src),
      'report.js must NOT reference localStorage — report_id must come from the URL path only'
    )
  })

  test('T-6.1-static.2c — report.js does not read report_id from sessionStorage', () => {
    const src = requireSource()
    assert.ok(
      !/sessionStorage/.test(src),
      'report.js must NOT reference sessionStorage — report_id must come from the URL path only'
    )
  })

  test('T-6.1-static.2d — report.js does not use URLSearchParams to read report_id', () => {
    const src = requireSource()
    // URLSearchParams is for query params. report.js should never use it to get
    // the report_id because the ID lives in the path, not the query string.
    // URLSearchParams MAY appear legitimately if used for something else (unlikely),
    // but if it does, it must not be used to .get('report_id').
    const hasReportIdFromParams = /URLSearchParams/.test(src) &&
      /\.get\(\s*['"]report_id['"]\s*\)/.test(src)
    assert.ok(
      !hasReportIdFromParams,
      'report.js must NOT extract report_id via URLSearchParams.get("report_id") — ' +
      'the ID is in the URL path (/report/:report_id), not in a query parameter'
    )
  })
})

// Cross-cutting architecture invariants (no eval, no server imports, no innerHTML+user-input)
// live in tests/frontend-architecture-invariants.test.js — applies to every public/js/*.js file.
// Story ATDDs stay AC-mapped.
