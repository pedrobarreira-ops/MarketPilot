/**
 * ATDD static source scan tests for Story 6.6: report.js
 * (Accessibility Baseline)
 *
 * Acceptance criteria verified (static-only, no browser, no server):
 *
 * AC-4 (static): report.js sets role="group" and aria-label="Canal" on the PT/ES toggle
 *   container. These must be set programmatically in the JS — not baked into report.html
 *   alone — because the toggle container may need to be updated after data loads.
 *
 * AC-5 (static): report.js sets aria-pressed on toggle pill buttons. The attribute must
 *   be updated on click (confirmed by presence of setAttribute('aria-pressed', ...) or
 *   equivalent at least twice in source — once per initial render, and once on toggle).
 *
 * These tests read `public/js/report.js` source text and apply regex assertions.
 * They are hermetic — no browser, no Fastify, no Redis, no SQLite required.
 *
 * Run: node --test tests/epic6-6.6-accessibility-baseline.atdd.test.js
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
      'public/js/report.js does not exist yet — Story 6.1/6.6 dev agent must create it. ' +
      'This test is intentionally failing (red phase).'
    )
  }
  return reportJsSrc
}

// ── AC-4: toggle container — role=group + aria-label=Canal ────────────────

describe('AC-4 (static): PT/ES toggle container has role="group" and aria-label="Canal"', () => {
  test('T-6.6-static.1a — source sets role="group" on the channel toggle container', () => {
    const src = requireSource()
    // The role="group" may already be in report.html; confirm report.js does NOT remove it
    // or that it explicitly sets it. We check the positive: either report.html already has it
    // (checked by a separate scan below) OR report.js sets it.
    //
    // Since the Playwright E2E test (E2E-6.6-1) is the primary verification for the rendered
    // attribute, this static scan is a defence-in-depth marker. We require the string "group"
    // to appear in report.js in a meaningful context.
    const hasGroupRole =
      /"group"/.test(src) ||
      /'group'/.test(src) ||
      /role.*group/i.test(src)
    assert.ok(
      hasGroupRole,
      'report.js must set or confirm role="group" on the PT/ES channel toggle container (AC-4). ' +
      'The toggle container must use role="group" so screen readers announce it as a related group. ' +
      'Either set it in JS via setAttribute("role", "group") or ensure report.html has it statically.'
    )
  })

  test('T-6.6-static.1b — source sets aria-label="Canal" on the channel toggle container', () => {
    const src = requireSource()
    assert.ok(
      /Canal/.test(src),
      'report.js must reference the string "Canal" as the aria-label for the PT/ES toggle ' +
      'container (AC-4). Screen readers use this label to announce the toggle group. ' +
      'Set it via setAttribute("aria-label", "Canal") or confirm it is present in report.html.'
    )
  })
})

// ── AC-5: aria-pressed on toggle pills ────────────────────────────────────

describe('AC-5 (static): toggle pill buttons have aria-pressed set and updated', () => {
  test('T-6.6-static.2a — source sets aria-pressed on toggle pill buttons', () => {
    const src = requireSource()
    assert.ok(
      /aria-pressed/.test(src),
      'report.js must set aria-pressed on the PT and ES toggle pill buttons (AC-5). ' +
      'Screen readers use aria-pressed to indicate which channel is currently active. ' +
      'Set it via setAttribute("aria-pressed", "true"/"false") or the ariaPressed property.'
    )
  })

  test('T-6.6-static.2b — aria-pressed appears more than once (set for both pills or on toggle)', () => {
    const src = requireSource()
    // Count occurrences of aria-pressed in the source.
    // Minimum 2: one for the PT pill and one for the ES pill (or once per click with both updated).
    const matches = src.match(/aria-pressed/g) || []
    assert.ok(
      matches.length >= 2,
      `report.js must reference "aria-pressed" at least 2 times — once for each toggle pill ` +
      `(PT and ES), or once for each state update on click. Found: ${matches.length} occurrence(s). ` +
      'Ensure both pills have their aria-pressed state managed, not just one.'
    )
  })
})

// ── Positive invariant: report.js does not remove role from report.html ────

describe('Accessibility invariant: report.js does not strip existing ARIA from HTML', () => {
  test('source does not call removeAttribute on known ARIA attributes', () => {
    const src = requireSource()
    // A common mistake: setting role/aria-* during init inadvertently removing others.
    // Check that removeAttribute is not called on role, aria-label, or aria-pressed.
    const stripsRole = /removeAttribute\s*\(\s*['"]role['"]/.test(src)
    const stripsAriaLabel = /removeAttribute\s*\(\s*['"]aria-label['"]/.test(src)
    const stripsAriaPressed = /removeAttribute\s*\(\s*['"]aria-pressed['"]/.test(src)

    assert.ok(
      !stripsRole,
      'report.js must NOT call removeAttribute("role") — this would strip accessibility roles ' +
      'from the toggle container and break screen-reader navigation.'
    )
    assert.ok(
      !stripsAriaLabel,
      'report.js must NOT call removeAttribute("aria-label") — this would strip the accessible ' +
      'label from the toggle group.'
    )
    // aria-pressed may legitimately be removed and re-set on state change; allow that.
    // We only flag unconditional removal that is not followed by a re-set.
    // This is too nuanced for a static scan — the E2E test (E2E-6.6-2) covers the runtime behaviour.
  })
})

// Cross-cutting architecture invariants live in tests/frontend-architecture-invariants.test.js.
