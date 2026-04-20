/**
 * ATDD static source scan tests for Story 5.1: form.js
 * (Validation, Loading State, Submission, Error Handling)
 *
 * Acceptance criteria verified (static-only, no browser, no server):
 *
 * AC-12 (static): form.js NEVER reads or writes localStorage or sessionStorage.
 *   api_key must never be persisted client-side.
 *
 * AC-13 (static): The outbound POST body contains exactly { api_key, email } —
 *   no extra fields, no job_id, no report_id injected on the way out.
 *
 * These tests read `public/js/form.js` source text and apply regex assertions.
 * They are hermetic — no browser, no Fastify, no Redis, no SQLite required.
 *
 * Run: node --test tests/epic5-5.1-form-js.atdd.test.js
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const FORM_JS_PATH = join(__dirname, '../public/js/form.js')

// ── helpers ────────────────────────────────────────────────────────────────

/**
 * Strip block comments and single-line comments from source text so that
 * commented-out code does not cause false positives/negatives.
 */
function stripComments(src) {
  // Remove /* ... */ block comments (including multi-line)
  let stripped = src.replace(/\/\*[\s\S]*?\*\//g, '')
  // Remove // ... line comments
  stripped = stripped.replace(/\/\/[^\n]*/g, '')
  return stripped
}

// ── fixture guard ──────────────────────────────────────────────────────────

let formJsSrc = null

// Load source once; individual tests skip gracefully if file absent (pre-implementation).
if (existsSync(FORM_JS_PATH)) {
  formJsSrc = stripComments(readFileSync(FORM_JS_PATH, 'utf8'))
}

function requireSource() {
  if (formJsSrc === null) {
    // The file will be created by the Story 5.1 dev agent.
    // Until then the tests act as RED-phase markers.
    assert.fail(
      'public/js/form.js does not exist yet — Story 5.1 dev agent must create it. ' +
      'This test is intentionally failing (red phase).'
    )
  }
  return formJsSrc
}

// ── AC-12: no localStorage / sessionStorage ────────────────────────────────

describe('AC-12 (static): form.js must not use localStorage or sessionStorage', () => {
  test('T12.1 — localStorage not referenced in form.js source', () => {
    const src = requireSource()
    assert.ok(
      !/localStorage/.test(src),
      'form.js must NOT reference localStorage — api_key must never be persisted client-side'
    )
  })

  test('T12.1 — sessionStorage not referenced in form.js source', () => {
    const src = requireSource()
    assert.ok(
      !/sessionStorage/.test(src),
      'form.js must NOT reference sessionStorage — api_key must never be persisted client-side'
    )
  })
})

// ── AC-13: POST body must contain only { api_key, email } ─────────────────

describe('AC-13 (static): outbound POST body must contain api_key and email — no stray IDs', () => {
  test('T13.1a — form.js source contains a fetch or XMLHttpRequest POST call', () => {
    const src = requireSource()
    const hasFetch = /\bfetch\s*\(/.test(src)
    const hasXHR = /XMLHttpRequest/.test(src)
    assert.ok(
      hasFetch || hasXHR,
      'form.js must contain a fetch() or XMLHttpRequest call to POST to the API'
    )
  })

  test('T13.1b — POST body includes api_key field', () => {
    const src = requireSource()
    assert.ok(
      /api_key/.test(src),
      'form.js must include api_key in the POST body construction'
    )
  })

  test('T13.1c — POST body includes email field', () => {
    const src = requireSource()
    assert.ok(
      /\bemail\b/.test(src),
      'form.js must include email in the POST body construction'
    )
  })

  test('T13.1d — job_id is NOT present in the outbound POST body construction', () => {
    const src = requireSource()
    // job_id must not appear as a key being assigned into the POST body.
    // Pattern: look for job_id inside object literals / JSON.stringify() calls.
    // We detect the presence of the string "job_id" at all — it has no business
    // appearing in form.js, which only submits the form; it never reads a job_id.
    assert.ok(
      !/job_id/.test(src),
      'form.js must NOT reference job_id — it is only returned by the server after POST, ' +
      'never sent in the outbound request body'
    )
  })

  test('T13.1e — report_id is NOT present in the outbound POST body construction', () => {
    const src = requireSource()
    assert.ok(
      !/report_id/.test(src),
      'form.js must NOT reference report_id — it is only returned by the server after POST, ' +
      'never sent in the outbound request body'
    )
  })
})

// ── Architecture invariants (defence-in-depth) ────────────────────────────

describe('Architecture invariants: form.js must not reach outside its scope', () => {
  test('form.js does not import or require server-side modules', () => {
    const src = requireSource()
    // No require() or import of src/ modules — this is a pure browser file
    assert.ok(
      !/require\s*\(\s*['"]\.\.?\/src/.test(src),
      'form.js must not require() any src/ module'
    )
    assert.ok(
      !/import\s+.*from\s+['"]\.\.?\/src/.test(src),
      'form.js must not import from any src/ module'
    )
  })

  test('form.js does not use eval() or document.write()', () => {
    const src = requireSource()
    assert.ok(!/\beval\s*\(/.test(src), 'form.js must not use eval()')
    assert.ok(!/document\.write\s*\(/.test(src), 'form.js must not use document.write()')
  })

  test('form.js does not use innerHTML to inject user-supplied content unsanitised', () => {
    const src = requireSource()
    // innerHTML is allowed for static error message strings (author-controlled),
    // but must not be assigned with template literals containing user input
    // (api_key or email values interpolated directly).
    // Heuristic: flag if innerHTML assignment includes the api_key or email variable
    // being interpolated. This is a best-effort static guard, not exhaustive.
    const innerHTMLWithInput = /innerHTML\s*[+]?=\s*`[^`]*\$\{[^}]*(apiKey|api_key|emailVal|emailValue)\b/.test(src)
    assert.ok(
      !innerHTMLWithInput,
      'form.js must not inject user-supplied api_key or email values via innerHTML template literals'
    )
  })
})
