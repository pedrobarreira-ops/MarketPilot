/**
 * Regression test for the "Margem para subir" persistence bug shipped in PR #79.
 *
 * Bug: PR #79 added `price_headroom_pt` / `price_headroom_es` arrays to the
 * computeReport return value and to the report.html / report.js renderer, but
 * never plumbed them through the storage path. The computed arrays evaporated
 * before the DB write, so the GET /api/reports/:id response had no headroom
 * keys at all and the section always rendered empty in production. Hotfixed
 * 2026-04-28 by adding the missing DB columns and persistence wiring across
 * migrate.js, schema.js, queries.js, buildReport.js, and reports.js.
 *
 * This test exercises the full computeReport → buildAndPersistReport →
 * insertReport → getReport round-trip and asserts the arrays survive. None
 * of the existing tests covered the round-trip — unit tests stayed inside
 * computeReport's return object, the smoke test seeded fixture data straight
 * into the renderer, and 3.5's persistence tests never asserted on the
 * headroom JSON columns. This file closes that gap.
 *
 * Run: node --test tests/headroom-persistence.regression.test.js
 */

import { test, describe, before } from 'node:test'
import assert from 'node:assert/strict'

// Provide minimum env required by src/config.js at import time (CI runs without
// a .env file). Mirrors the pattern in epic3-3.5-report-persistence.atdd.test.js.
process.env.NODE_ENV        = 'test'
process.env.SQLITE_PATH     = ':memory:'
process.env.REDIS_URL       = process.env.REDIS_URL       || 'redis://localhost:6379'
process.env.APP_BASE_URL    = process.env.APP_BASE_URL    || 'http://localhost:3000'
process.env.WORTEN_BASE_URL = process.env.WORTEN_BASE_URL || 'https://marketplace.worten.pt'

function randomId() {
  return `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

describe('Regression: price_headroom_pt/es survive the DB round-trip', () => {
  let buildAndPersistReport
  let getReport
  let computeReport

  before(async () => {
    const queries = await import('../src/db/queries.js')
    getReport = queries.getReport
    const buildMod = await import('../src/workers/scoring/buildReport.js')
    buildAndPersistReport = buildMod.buildAndPersistReport
    const computeMod = await import('../src/workers/scoring/computeReport.js')
    computeReport = computeMod.computeReport
  })

  test('headroom arrays persisted via buildAndPersistReport are returned intact by getReport', () => {
    const reportId = randomId()
    const email = 'regression@example.com'

    // Catalog: one product per channel-state-of-interest, all winning at a
    // comfortable headroom (matches the conditions where the bug surfaces).
    const catalog = [
      { ean: 'HR-PT-1', shop_sku: 'HR-PT-1', product_title: 'PT Headroom Product 1', price: '100.00' },
      { ean: 'HR-PT-2', shop_sku: 'HR-PT-2', product_title: 'PT Headroom Product 2', price: '200.00' },
      { ean: 'HR-ES-1', shop_sku: 'HR-ES-1', product_title: 'ES Headroom Product 1', price:  '50.00' },
    ]
    // competitor map shape per scanCompetitors output: Map<ean, {pt:{first,second}, es:{first,second}}>
    const competitors = new Map([
      ['HR-PT-1', { pt: { first: 100.00, second: 110.00 }, es: { first: null,  second: null  } }],
      ['HR-PT-2', { pt: { first: 200.00, second: 220.00 }, es: { first: null,  second: null  } }],
      ['HR-ES-1', { pt: { first: null,  second: null   }, es: { first: 50.00, second: 55.00 } }],
    ])

    const computedReport = computeReport(catalog, competitors)

    // Sanity guard — if computeReport's contract changes, fail loud here so the
    // test isn't passing for the wrong reason.
    assert.equal(computedReport.price_headroom_pt.length, 2, 'computeReport should produce 2 PT headroom entries')
    assert.equal(computedReport.price_headroom_es.length, 1, 'computeReport should produce 1 ES headroom entry')

    buildAndPersistReport(reportId, email, catalog, computedReport)

    const now = Math.floor(Date.now() / 1000)
    const row = getReport(reportId, now)
    assert.ok(row, 'getReport must return the persisted report')

    // The bug: these JSON columns were silently NULL because insertReport never
    // wrote them. The fix routes them through. Asserting they are non-null
    // strings directly catches the regression class.
    assert.equal(typeof row.price_headroom_pt_json, 'string',
      'price_headroom_pt_json must be a JSON string on the persisted row (was NULL pre-fix)')
    assert.equal(typeof row.price_headroom_es_json, 'string',
      'price_headroom_es_json must be a JSON string on the persisted row (was NULL pre-fix)')

    const ptArr = JSON.parse(row.price_headroom_pt_json)
    const esArr = JSON.parse(row.price_headroom_es_json)

    assert.ok(Array.isArray(ptArr), 'price_headroom_pt_json must deserialize to an array')
    assert.ok(Array.isArray(esArr), 'price_headroom_es_json must deserialize to an array')
    assert.equal(ptArr.length, 2, 'PT headroom array length must survive the round-trip')
    assert.equal(esArr.length, 1, 'ES headroom array length must survive the round-trip')

    // Spot-check a single entry's shape — every field that the renderer reads
    // must be present after the round-trip.
    const pt1 = ptArr.find(e => e.ean === 'HR-PT-1')
    assert.ok(pt1, 'HR-PT-1 entry must be present after round-trip')
    assert.equal(pt1.my_price, 100.00)
    assert.equal(pt1.competitor_second, 110.00)
    assert.equal(pt1.headroom_eur, 10.00)
    assert.ok(Math.abs(pt1.headroom_pct - 0.10) < 1e-9, 'headroom_pct survives float precision')
  })

  test('empty headroom arrays still persist as JSON "[]" (not NULL)', () => {
    // Edge case the renderer cares about: empty array vs null. The retrieval
    // route falls back to [] for null, but a fresh report should always emit
    // explicit JSON rather than relying on the fallback.
    const reportId = randomId()
    const catalog = [
      { ean: 'NO-HR-1', shop_sku: 'NO-HR-1', product_title: 'Sole Seller', price: '50.00' },
    ]
    const competitors = new Map([
      ['NO-HR-1', { pt: { first: null, second: null }, es: { first: null, second: null } }],
    ])

    const computedReport = computeReport(catalog, competitors)
    buildAndPersistReport(reportId, 'regression@example.com', catalog, computedReport)
    const row = getReport(reportId, Math.floor(Date.now() / 1000))

    assert.ok(row)
    assert.equal(row.price_headroom_pt_json, '[]', 'empty PT headroom must persist as "[]"')
    assert.equal(row.price_headroom_es_json, '[]', 'empty ES headroom must persist as "[]"')
  })
})
