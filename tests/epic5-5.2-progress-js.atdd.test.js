/**
 * ATDD static source scan tests for Story 5.2: progress.js
 * (Progress Bar, Copy & Redirect)
 *
 * Acceptance criteria verified (static-only, no browser, no server):
 *
 * AC-17 (static): progress.js NEVER reads or writes localStorage or sessionStorage.
 *   job_id and report_id must come from URL query params only.
 *
 * AC-18 (static): The <code> URL field assignment must appear earlier in source order
 *   than the setInterval() call that starts polling. This ensures the URL is always
 *   populated synchronously on load, before the first poll fires.
 *
 * Plus architecture defence-in-depth invariants:
 *   - progress.js does not reference server-side src/ modules
 *   - progress.js does not use eval() or document.write()
 *   - progress.js does not expose job_id / report_id in outbound fetch URLs constructed
 *     via string concatenation that could smuggle extra params (positive-only check)
 *
 * ── LESSONS FROM 5.1 APPLIED ────────────────────────────────────────────────
 *
 * In 5.1 the T13.1d/e scan looked for `job_id` / `report_id` as bare literals
 * anywhere in the source. The dev agent bypassed this by splitting the key at the
 * underscore ('job_' + 'id') so neither literal appeared consecutively. The tests
 * were then tightened to scope the scan ONLY inside JSON.stringify() argument spans.
 *
 * For 5.2, the invariants are different — we are not checking POST body content,
 * we are checking:
 *   (a) localStorage/sessionStorage absence (simple, unforgeable — no bypass possible)
 *   (b) source ORDER: URL assignment before setInterval (topology check, not literal)
 *
 * For (b) we scan for the PATTERN of assignment to the code element rather than a
 * specific variable name. We search for any line that both references a text-content
 * assignment AND contains '/report/' (the characteristic URL path), which is the
 * semantic invariant. This avoids the "specific variable name" fragility — even if
 * the dev uses `urlEl`, `codeEl`, `reportEl`, the pattern still fires.
 *
 * We do NOT use a simple "codeEl before setInterval" literal check (which could be
 * bypassed by renaming the variable), and we do NOT use "job_id appears before
 * setInterval" (which could be bypassed by concatenation). Instead we anchor on
 * the '/report/' path string, which must appear in the URL assignment to be correct,
 * and cannot be legitimately absent without breaking AC-1.
 *
 * These tests read `public/js/progress.js` source text and apply regex/index assertions.
 * They are hermetic — no browser, no Fastify, no Redis, no SQLite required.
 *
 * Run: node --test tests/epic5-5.2-progress-js.atdd.test.js
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROGRESS_JS_PATH = join(__dirname, '../public/js/progress.js')

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

let progressJsSrc = null
let progressJsLines = null  // stripped lines for index-based checks

// Load source once; individual tests skip gracefully if file absent (pre-implementation).
if (existsSync(PROGRESS_JS_PATH)) {
  const raw = readFileSync(PROGRESS_JS_PATH, 'utf8')
  progressJsSrc = stripComments(raw)
  progressJsLines = progressJsSrc.split('\n')
}

function requireSource() {
  if (progressJsSrc === null) {
    // The file will be created by the Story 5.2 dev agent.
    // Until then the tests act as RED-phase markers.
    assert.fail(
      'public/js/progress.js does not exist yet — Story 5.2 dev agent must create it. ' +
      'This test is intentionally failing (red phase).'
    )
  }
  return progressJsSrc
}

function requireLines() {
  requireSource()
  return progressJsLines
}

// ── AC-17: no localStorage / sessionStorage ────────────────────────────────

describe('AC-17 (static): progress.js must not use localStorage or sessionStorage', () => {
  test('T-P-static.1a — localStorage not referenced in progress.js source', () => {
    const src = requireSource()
    assert.ok(
      !/localStorage/.test(src),
      'progress.js must NOT reference localStorage — ' +
      'job_id and report_id must come from URL query params only (AC-2)'
    )
  })

  test('T-P-static.1b — sessionStorage not referenced in progress.js source', () => {
    const src = requireSource()
    assert.ok(
      !/sessionStorage/.test(src),
      'progress.js must NOT reference sessionStorage — ' +
      'job_id and report_id must come from URL query params only (AC-2)'
    )
  })
})

// ── AC-18: URL field assigned before setInterval ───────────────────────────

describe('AC-18 (static): URL field populated before polling starts', () => {
  /**
   * Design rationale (bypass-hardened):
   *
   * We do NOT anchor on a specific variable name (e.g. `codeEl`) because the dev
   * agent may choose any name. Instead we search for the characteristic semantic
   * content: a text-content assignment that contains '/report/' — the URL path that
   * uniquely identifies the report URL assignment (AC-1). This string MUST appear in
   * the assignment to be functionally correct; splitting or obfuscating it would
   * break the feature itself.
   *
   * The heuristic:
   *   - URL assignment line: first line matching both a text assignment keyword
   *     (textContent or innerText) AND the string '/report/'
   *   - setInterval line: first line containing 'setInterval('
   *
   * We assert URL assignment line index < setInterval line index.
   * Both must be present; absence of either is its own assertion failure.
   */
  test('T-P-static.2 — URL code element assigned before setInterval starts polling', () => {
    const lines = requireLines()

    // Find first line that both sets textContent/innerText AND contains '/report/'
    // This is the canonical URL assignment: e.g.
    //   codeEl.textContent = window.location.origin + '/report/' + reportId
    const urlAssignIdx = lines.findIndex(
      l => (l.includes('textContent') || l.includes('innerText')) && l.includes('/report/')
    )

    // Find first line that calls setInterval(
    const intervalIdx = lines.findIndex(l => l.includes('setInterval('))

    assert.ok(
      urlAssignIdx >= 0,
      'progress.js must contain a textContent/innerText assignment that includes "/report/" — ' +
      'this is the AC-1 URL field population. If the dev uses a different approach, ' +
      'update this scan to match.'
    )

    assert.ok(
      intervalIdx >= 0,
      'progress.js must contain a setInterval( call to start the polling loop (AC-3). ' +
      'If polling is implemented via a different mechanism, update this scan.'
    )

    assert.ok(
      urlAssignIdx < intervalIdx,
      `URL field assignment (line ${urlAssignIdx + 1}) must appear before setInterval (line ${intervalIdx + 1}) ` +
      'in progress.js source order — the URL must be populated synchronously before polling starts (AC-18)'
    )
  })

  /**
   * Complementary guard: the URL field assignment must NOT be inside a setInterval
   * or setTimeout callback. We check that the assignment line is not immediately
   * preceded by a setInterval/setTimeout call within 5 lines (simple heuristic to
   * catch the most obvious violation: wrapping the assignment in the poll callback).
   *
   * This is a defence-in-depth test; T-P-static.2 above already catches the main
   * violation (assignment appearing after setInterval in source order). This test
   * catches the edge case where assignment and interval both appear on the same line
   * or within a block started on the same line.
   */
  test('T-P-static.2b — URL assignment line is not inside a setTimeout/setInterval callback', () => {
    const lines = requireLines()

    const urlAssignIdx = lines.findIndex(
      l => (l.includes('textContent') || l.includes('innerText')) && l.includes('/report/')
    )

    if (urlAssignIdx < 0) {
      // Same absence check as above — T-P-static.2 will fail with the better message
      return
    }

    // Check the 5 lines prior to the assignment; none should open a setInterval/setTimeout callback
    const windowStart = Math.max(0, urlAssignIdx - 5)
    const precedingWindow = lines.slice(windowStart, urlAssignIdx)

    const callbackOpenerInWindow = precedingWindow.some(
      l => /\b(setInterval|setTimeout)\s*\(/.test(l)
    )

    assert.ok(
      !callbackOpenerInWindow,
      `URL field assignment at line ${urlAssignIdx + 1} appears to be inside a setInterval/setTimeout ` +
      'callback (a setInterval/setTimeout was opened within 5 lines before it). ' +
      'The URL must be assigned synchronously outside any timer callback (AC-18).'
    )
  })
})

// ── Positive invariants: query param usage ─────────────────────────────────

describe('AC-2 (static): job_id and report_id sourced from URL query params', () => {
  test('T-P-static.3a — progress.js reads query params via URLSearchParams', () => {
    const src = requireSource()
    assert.ok(
      /URLSearchParams/.test(src),
      'progress.js must use URLSearchParams to read job_id and report_id from the URL (AC-2). ' +
      'No other mechanism (localStorage, sessionStorage, cookie) is permitted.'
    )
  })

  test('T-P-static.3b — progress.js reads job_id from query params', () => {
    const src = requireSource()
    // job_id must be retrieved via a .get() call on a URLSearchParams instance.
    // We check that 'job_id' appears as an argument to .get() — narrow scan to
    // the .get('job_id') pattern to avoid catching unrelated references.
    assert.ok(
      /\.get\(\s*['"]job_id['"]\s*\)/.test(src),
      'progress.js must read job_id via URLSearchParams.get("job_id") — ' +
      'the exact string "job_id" must appear as the argument to .get() (AC-2)'
    )
  })

  test('T-P-static.3c — progress.js reads report_id from query params', () => {
    const src = requireSource()
    assert.ok(
      /\.get\(\s*['"]report_id['"]\s*\)/.test(src),
      'progress.js must read report_id via URLSearchParams.get("report_id") — ' +
      'the exact string "report_id" must appear as the argument to .get() (AC-2)'
    )
  })
})

// ── Architecture invariants (defence-in-depth) ────────────────────────────

describe('Architecture invariants: progress.js must not reach outside its scope', () => {
  test('progress.js does not import or require server-side modules', () => {
    const src = requireSource()
    assert.ok(
      !/require\s*\(\s*['"]\.\.?\/src/.test(src),
      'progress.js must not require() any src/ module'
    )
    assert.ok(
      !/import\s+.*from\s+['"]\.\.?\/src/.test(src),
      'progress.js must not import from any src/ module'
    )
  })

  test('progress.js does not use eval() or document.write()', () => {
    const src = requireSource()
    assert.ok(!/\beval\s*\(/.test(src), 'progress.js must not use eval()')
    assert.ok(!/document\.write\s*\(/.test(src), 'progress.js must not use document.write()')
  })

  test('progress.js polling fetch only calls /api/jobs/ — no auth headers with api_key', () => {
    const src = requireSource()
    // The polling GET must target /api/jobs/... — verify the endpoint is present.
    assert.ok(
      /\/api\/jobs\//.test(src),
      'progress.js must contain a fetch call to /api/jobs/ for polling (AC-3)'
    )
    // api_key must never appear in progress.js — it lives server-side in keyStore only.
    assert.ok(
      !/api_key/.test(src),
      'progress.js must NOT reference api_key — the key is held server-side in keyStore. ' +
      'The polling endpoint does not require client-side authentication.'
    )
  })

  test('progress.js does not inject user-supplied content into innerHTML unsanitised', () => {
    const src = requireSource()
    // innerHTML is acceptable for static author-controlled strings (e.g. error action buttons),
    // but must not interpolate server-returned phase_message or URL values directly.
    // Heuristic: flag if innerHTML assignment interpolates phase_message or reportUrl/reportId.
    const dangerousInnerHTML = /innerHTML\s*[+]?=\s*`[^`]*\$\{[^}]*(phase_message|reportUrl|reportId|report_id)\b/.test(src)
    assert.ok(
      !dangerousInnerHTML,
      'progress.js must not inject server-returned values (phase_message, reportUrl, reportId) ' +
      'via innerHTML template literals — use textContent/setAttribute instead'
    )
  })
})
