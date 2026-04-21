/**
 * Shared frontend architecture invariants — apply to every file under public/js/
 *
 * Established at Epic 5 retrospective (2026-04-20). Story ATDDs stay AC-mapped;
 * cross-cutting structural/security invariants live here in one place.
 *
 * See `~/.claude/projects/.../memory/feedback_frontend_architecture_invariants.md`
 * for the full rationale.
 *
 * Currently scanned:
 *   - No `eval(` / `document.write(` in any public/js/*.js
 *   - No server-side imports (`import 'fs'`, `require('../src/...')`, etc.)
 *   - No `innerHTML` assignments with interpolated user-supplied values
 *   - Tailwind dynamic-class rule (see feedback_tailwind_dynamic_classes.md)
 *   - CTA_URL placeholder guard (Story 6.3 onward)
 *
 * Run: node --test tests/frontend-architecture-invariants.test.js
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PUBLIC_JS_DIR = join(__dirname, '../public/js')
const PUBLIC_DIR = join(__dirname, '../public')

// ── helpers ────────────────────────────────────────────────────────────────

function stripComments(src) {
  let stripped = src.replace(/\/\*[\s\S]*?\*\//g, '')
  stripped = stripped.replace(/\/\/[^\n]*/g, '')
  return stripped
}

function loadPublicJsFiles() {
  if (!existsSync(PUBLIC_JS_DIR)) return []
  return readdirSync(PUBLIC_JS_DIR)
    .filter(f => f.endsWith('.js'))
    .map(f => {
      const path = join(PUBLIC_JS_DIR, f)
      const raw = readFileSync(path, 'utf8')
      return { name: f, path, raw, src: stripComments(raw) }
    })
    // Skip empty-stub files (pre-implementation) — raw body < 20 chars = nothing to scan
    .filter(file => file.raw.trim().length > 20)
}

function loadPublicHtmlFiles() {
  if (!existsSync(PUBLIC_DIR)) return []
  return readdirSync(PUBLIC_DIR)
    .filter(f => f.endsWith('.html'))
    .map(f => ({ name: f, raw: readFileSync(join(PUBLIC_DIR, f), 'utf8') }))
}

// ── 1. No eval / document.write ────────────────────────────────────────────

describe('Frontend invariants: no eval() or document.write()', () => {
  for (const file of loadPublicJsFiles()) {
    test(`${file.name} — no eval() or document.write()`, () => {
      assert.ok(!/\beval\s*\(/.test(file.src), `${file.name} must not use eval()`)
      assert.ok(!/document\.write\s*\(/.test(file.src), `${file.name} must not use document.write()`)
    })
  }
})

// ── 2. No server-side imports ──────────────────────────────────────────────

describe('Frontend invariants: no server-side module imports', () => {
  for (const file of loadPublicJsFiles()) {
    test(`${file.name} — no require() or import from src/`, () => {
      assert.ok(
        !/require\s*\(\s*['"]\.\.?\/src/.test(file.src),
        `${file.name} must not require() any src/ module — public/js/ is browser-only`,
      )
      assert.ok(
        !/import\s+.*from\s+['"]\.\.?\/src/.test(file.src),
        `${file.name} must not import from any src/ module — public/js/ is browser-only`,
      )
      assert.ok(
        !/require\s*\(\s*['"]node:/.test(file.src),
        `${file.name} must not require() Node core modules — public/js/ is browser-only`,
      )
      assert.ok(
        !/import\s+.*from\s+['"]node:/.test(file.src),
        `${file.name} must not import from node: scheme — public/js/ is browser-only`,
      )
    })
  }
})

// ── 3. No innerHTML assignments with interpolated user-supplied values ────

describe('Frontend invariants: no innerHTML injection of user-supplied values', () => {
  /**
   * innerHTML is OK for author-controlled static strings (e.g. error button markup).
   * It is NOT OK when interpolating server-returned or user-input values, which could
   * carry HTML/script payloads.
   *
   * Known high-risk interpolation names across the frontend:
   *   apiKey, api_key, email, emailVal, emailValue, phase_message, reportUrl,
   *   reportId, report_id, jobId, job_id
   *
   * Heuristic: flag innerHTML = `...${X}...` where X is any of the above.
   */
  const DANGEROUS_VARS = [
    'apiKey', 'api_key',
    'email', 'emailVal', 'emailValue',
    'phase_message', 'phaseMessage',
    'reportUrl', 'reportId', 'report_id',
    'jobId', 'job_id',
  ]
  const dangerousPattern = new RegExp(
    `innerHTML\\s*[+]?=\\s*\`[^\`]*\\$\\{[^}]*\\b(${DANGEROUS_VARS.join('|')})\\b`,
  )

  for (const file of loadPublicJsFiles()) {
    test(`${file.name} — no innerHTML interpolation of user-supplied values`, () => {
      assert.ok(
        !dangerousPattern.test(file.src),
        `${file.name} must not inject user-supplied / server-returned values via innerHTML template literals. ` +
        `Use textContent or setAttribute instead. Flagged variables: ${DANGEROUS_VARS.join(', ')}.`,
      )
    })
  }
})

// ── 4. Tailwind dynamic-class rule ────────────────────────────────────────

describe('Frontend invariants: Tailwind dynamic classes have static reference or inline fallback', () => {
  /**
   * Tailwind Play CDN (JIT) purges classes that appear only in JavaScript string literals.
   * If a class is added dynamically via classList.add/toggle or className assignment, and
   * the same class never appears statically in any public/*.html, AND no inline style
   * fallback exists at the same write site — the visual will silently fail in production.
   *
   * Observed at Story 5.2 PR #52 (bg-red-600 didn't paint without inline style fallback).
   *
   * Enforcement heuristic:
   *   1. Scan each public/js/*.js for token-literal class additions:
   *        classList.add('X')  |  classList.add("X")  |  classList.toggle('X', ...)
   *      (single-token literal string only — template literals and variables skip the scan)
   *   2. For each such class X:
   *        (a) If X appears anywhere in any public/*.html — OK (JIT will keep it).
   *        (b) Otherwise, look within 3 lines of the classList.add call for an
   *            `element.style.*` assignment at the same write site — OK (inline fallback).
   *        (c) Otherwise, fail.
   *
   * Caveats:
   *   - Multi-class strings (`'bg-red-600 text-white'`) are split and each checked individually.
   *   - This is a best-effort static scan; the escape hatch is to add the class to a
   *     (possibly hidden) template element in HTML or to add the inline-style belt.
   */
  const htmlCorpus = loadPublicHtmlFiles().map(f => f.raw).join('\n')

  function findDynamicClassAdds(src) {
    const results = []
    const rgxAdd = /classList\.(?:add|toggle)\s*\(\s*['"]([^'"]+)['"]/g
    let m
    while ((m = rgxAdd.exec(src)) !== null) {
      for (const cls of m[1].trim().split(/\s+/)) {
        results.push({ cls, index: m.index })
      }
    }
    const rgxClassName = /className\s*=\s*['"]([^'"]+)['"]/g
    while ((m = rgxClassName.exec(src)) !== null) {
      for (const cls of m[1].trim().split(/\s+/)) {
        results.push({ cls, index: m.index })
      }
    }
    return results
  }

  function hasInlineStyleFallback(src, index) {
    // Look within 5 lines around the classList.add call for `.style.` assignment.
    // This is a coarse proximity heuristic — catches the common "belt-and-suspenders" pattern:
    //   progressFill.classList.add('bg-red-600')
    //   progressFill.style.backgroundColor = '#DC2626'
    const before = src.lastIndexOf('\n', Math.max(0, index - 500))
    const after = src.indexOf('\n', index + 500)
    const window = src.slice(before, after < 0 ? src.length : after)
    return /\.style\.\w+\s*=/.test(window)
  }

  for (const file of loadPublicJsFiles()) {
    test(`${file.name} — dynamic classes have static HTML reference or inline style fallback`, () => {
      const dynClasses = findDynamicClassAdds(file.src)
      const missing = []
      for (const { cls, index } of dynClasses) {
        // Skip classes that are not plausibly Tailwind utilities
        // (Tailwind utilities contain `-` and lowercase alphanumerics; skip simple state class names)
        if (!/^[a-z][a-z0-9-]*[a-z0-9]$/i.test(cls)) continue
        if (!cls.includes('-')) continue

        if (htmlCorpus.includes(cls)) continue
        if (hasInlineStyleFallback(file.src, index)) continue

        missing.push(cls)
      }
      assert.deepEqual(
        missing,
        [],
        `${file.name} has Tailwind utility classes added dynamically without a static HTML ` +
        `reference OR a nearby inline style fallback. The Tailwind Play CDN will purge these ` +
        `classes. Fix by adding either (a) a static occurrence of the class in public/*.html, ` +
        `or (b) a sibling element.style.* assignment. Missing: ${missing.join(', ')}`,
      )
    })
  }
})

// ── 5. CTA_URL placeholder guard (Story 6.3 onward) ──────────────────────

describe('Frontend invariants: CTA_URL must not ship with placeholder values', () => {
  /**
   * Deferred from Story 1.1 code review; scheduled to ship in Story 6.3 as an extra AC.
   * At deploy time the CTA_URL should be a real contact channel (WhatsApp, mailto, Typeform)
   * — NOT the literal string 'TODO', 'PLACEHOLDER', 'example.com', or similar placeholder.
   *
   * Scope: public/js/report.js (created by Story 6.3). This scan gracefully skips until
   * the file exists. Extend to other JS files if any future story also holds a CTA URL.
   */
  const REPORT_JS_PATH = join(__dirname, '../public/js/report.js')

  test('public/js/report.js — CTA_URL does not contain TODO / PLACEHOLDER / example.com', () => {
    if (!existsSync(REPORT_JS_PATH)) {
      // Pre-implementation — skip gracefully. Story 6.3 will add report.js.
      return
    }
    const raw = readFileSync(REPORT_JS_PATH, 'utf8')
    const src = stripComments(raw)

    const ctaMatch = src.match(/CTA_URL\s*[:=]\s*['"]([^'"]*)['"]/)
    if (!ctaMatch) {
      // Report.js exists but no CTA_URL const yet — Story 6.3 may still be in progress.
      return
    }
    const ctaValue = ctaMatch[1]
    const placeholders = /\b(TODO|PLACEHOLDER|example\.com|localhost|your[-_]?domain|fixme)\b/i
    assert.ok(
      !placeholders.test(ctaValue),
      `CTA_URL contains a placeholder token ('${ctaValue}'). Set a real contact channel ` +
      `(WhatsApp wa.me URL, mailto:, Typeform, Calendly) before shipping. Launch-checklist per UX-DR15.`,
    )
  })
})
