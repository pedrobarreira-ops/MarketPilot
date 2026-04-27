/**
 * Unit tests for Story 3.2 — supplements the protected ATDD file.
 *
 * Covers the INCLUDE_INACTIVE_OFFERS env-flag bypass added 2026-04-27 to
 * support full-catalog dry runs against shops where most SKUs are inactive
 * (e.g., 31k catalog with only 16 SKUs activated for live-smoke testing).
 *
 * The bypass is static-scan-only: behaviour-test would require mocking the
 * Mirakl API client and is covered indirectly by a manual run with the env
 * var set on Coolify.
 *
 * Invariants asserted:
 *   - Source reads `INCLUDE_INACTIVE_OFFERS` from process.env.
 *   - Source emits a warn-level log when the bypass is active (so accidental
 *     "left on" state is obvious in the run log).
 *   - Source still references `active === true` in the default-path filter
 *     (the bypass is a branch, not a replacement).
 *
 * DO NOT MODIFY tests/epic3-3.2-fetch-catalog.atdd.test.js — that file is
 * protected. New invariants live here.
 *
 * Run: node --test tests/epic3-3.2-fetch-catalog.unit.test.js
 */

import { test, describe, before } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const FETCH_CATALOG_PATH = join(__dirname, '../src/workers/mirakl/fetchCatalog.js')

function stripComments(src) {
  let stripped = src.replace(/\/\*[\s\S]*?\*\//g, '')
  stripped = stripped.replace(/\/\/[^\n]*/g, '')
  return stripped
}

describe('Story 3.2 unit — INCLUDE_INACTIVE_OFFERS bypass', () => {
  let src

  before(() => {
    src = stripComments(readFileSync(FETCH_CATALOG_PATH, 'utf8'))
  })

  test('source reads INCLUDE_INACTIVE_OFFERS from process.env', () => {
    assert.ok(
      /process\.env\.INCLUDE_INACTIVE_OFFERS/.test(src),
      'fetchCatalog.js must read INCLUDE_INACTIVE_OFFERS from process.env to enable the bypass'
    )
  })

  test('bypass is gated on the literal string "true" (not just truthy)', () => {
    // Guards against accidentally enabling on any non-empty value (e.g., "false")
    assert.ok(
      /INCLUDE_INACTIVE_OFFERS\s*===\s*['"]true['"]/.test(src),
      'fetchCatalog.js must compare INCLUDE_INACTIVE_OFFERS strictly to "true" to prevent surprise activation from non-empty strings like "false"'
    )
  })

  test('source emits a warn log when bypass is active', () => {
    // The warn log is the audit trail — without it, an accidentally-on flag
    // would silently change report contents in production.
    assert.ok(
      /log\.warn\([^)]*INCLUDE_INACTIVE_OFFERS/s.test(src) ||
        /log\.warn\([^)]*bypass/s.test(src),
      'fetchCatalog.js must call log.warn with a reference to the bypass when the flag is active'
    )
  })

  test('default path still filters by offers.active === true', () => {
    // The bypass is a branch, not a replacement — production behaviour is
    // unchanged when the env var is unset.
    assert.ok(
      /offer\.active\s*===\s*true/.test(src),
      'fetchCatalog.js must keep the offers.active === true filter on the default code path'
    )
  })
})
