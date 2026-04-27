/**
 * Unit tests for Story 3.4: WOW Score and Quick Wins Scoring
 *
 * Supplements the protected ATDD file (epic3-3.4-wow-scoring.atdd.test.js).
 * Covers gaps NOT exercised by the ATDD acceptance tests:
 *
 *  G-1: NaN guard — null/undefined/non-numeric price → uncontested (both channels)
 *  G-2: String price parsing — price: "9.99" (live OF21 API shape) parses correctly
 *  G-3: Empty catalog — computeReport([], new Map()) returns valid zero-count structure
 *  G-4: summary_es.total invariant (ATDD only asserts summary_pt.total)
 *  G-5: quickwins are a strict subset of opportunities (same objects by reference)
 *  G-6: Boundary — competitor_first === 0 does not crash (division-by-zero awareness)
 *  G-7: ES channel summary invariant (winning+losing+uncontested === total for ES)
 *
 * DO NOT MODIFY tests/epic3-3.4-wow-scoring.atdd.test.js — that file is protected.
 *
 * Run: node --test tests/epic3-3.4-wow-scoring.unit.test.js
 */

import { test, describe, before } from 'node:test'
import assert from 'node:assert/strict'

// ── helpers ──────────────────────────────────────────────────────────────────

function makeCatalogEntry({ ean = '0000000000001', shopSku = 'SKU-U', price = 10.00, title = 'Product' } = {}) {
  return { ean, shop_sku: shopSku, price, product_title: title }
}

function makeCompetitorEntry({ ptFirst = null, ptSecond = null, esFirst = null, esSecond = null } = {}) {
  return {
    pt: { first: ptFirst, second: ptSecond },
    es: { first: esFirst, second: esSecond },
  }
}

// ── suite ─────────────────────────────────────────────────────────────────────

describe('Story 3.4 unit — gaps not covered by ATDD', async () => {
  let computeReport

  before(async () => {
    const mod = await import('../src/workers/scoring/computeReport.js')
    computeReport = mod.computeReport
  })

  // ── G-1: NaN guard ──────────────────────────────────────────────────────────
  describe('G-1: NaN guard — invalid price treated as uncontested for both channels', () => {
    test('price: null → product counted as uncontested in both PT and ES', () => {
      const catalog = [makeCatalogEntry({ ean: 'NAN1', price: null })]
      const competitors = new Map([
        ['NAN1', makeCompetitorEntry({ ptFirst: 9.00, esFirst: 9.00 })],
      ])

      const result = computeReport(catalog, competitors)

      assert.equal(result.summary_pt.uncontested, 1, 'null price: must be uncontested in PT')
      assert.equal(result.summary_es.uncontested, 1, 'null price: must be uncontested in ES')
      assert.equal(result.summary_pt.losing, 0, 'null price: must NOT be counted as losing in PT')
      assert.equal(result.summary_es.losing, 0, 'null price: must NOT be counted as losing in ES')
      assert.equal(result.opportunities_pt.length, 0, 'null price: must NOT appear in opportunities_pt')
      assert.equal(result.opportunities_es.length, 0, 'null price: must NOT appear in opportunities_es')
    })

    test('price: undefined (raw catalog entry) → product counted as uncontested in both PT and ES', () => {
      // Cannot use makeCatalogEntry helper here — JS default params treat `undefined` as "use default".
      // Build the entry directly to simulate a catalog entry with a missing price field.
      const catalog = [{ ean: 'NAN2', shop_sku: 'SKU-NAN2', price: undefined, product_title: 'Product' }]
      const competitors = new Map([
        ['NAN2', makeCompetitorEntry({ ptFirst: 9.00, esFirst: 9.00 })],
      ])

      const result = computeReport(catalog, competitors)

      assert.equal(result.summary_pt.uncontested, 1, 'undefined price: must be uncontested in PT')
      assert.equal(result.summary_es.uncontested, 1, 'undefined price: must be uncontested in ES')
    })

    test('price: non-numeric string → product counted as uncontested in both channels', () => {
      const catalog = [makeCatalogEntry({ ean: 'NAN3', price: 'N/A' })]
      const competitors = new Map([
        ['NAN3', makeCompetitorEntry({ ptFirst: 9.00, esFirst: 9.00 })],
      ])

      const result = computeReport(catalog, competitors)

      assert.equal(result.summary_pt.uncontested, 1, '"N/A" price: must be uncontested in PT')
      assert.equal(result.summary_es.uncontested, 1, '"N/A" price: must be uncontested in ES')
    })

    test('NaN product still counted in summary totals', () => {
      const catalog = [
        makeCatalogEntry({ ean: 'NAN4', price: null }),
        makeCatalogEntry({ ean: 'VAL1', price: 10.00 }),
      ]
      const competitors = new Map([
        ['NAN4', makeCompetitorEntry({ ptFirst: 9.00 })],
        ['VAL1', makeCompetitorEntry({ ptFirst: 9.00 })],
      ])

      const result = computeReport(catalog, competitors)

      assert.equal(result.summary_pt.total, 2, 'total must count NaN products too')
      const ptSum = result.summary_pt.winning + result.summary_pt.losing + result.summary_pt.uncontested
      assert.equal(ptSum, 2, 'winning+losing+uncontested must still equal total when one price is NaN')
    })
  })

  // ── G-2: String price parsing ─────────────────────────────────────────────
  describe('G-2: String price parsing — price:"9.99" from live OF21 API', () => {
    test('price as string "10.00" is parsed and compared correctly', () => {
      const catalog = [makeCatalogEntry({ ean: 'STR1', price: '10.00' })]
      const competitors = new Map([['STR1', makeCompetitorEntry({ ptFirst: 9.00 })]])

      const result = computeReport(catalog, competitors)

      assert.equal(result.opportunities_pt.length, 1, 'string price "10.00" > 9.00 must produce opportunity')
      const opp = result.opportunities_pt[0]
      assert.ok(Math.abs(opp.gap - 1.00) < 0.001, `gap must be 1.00, got ${opp.gap}`)
      assert.equal(typeof opp.my_price, 'number', 'my_price must be a number (not a string) after parseFloat')
    })

    test('price as string "9.99" (winning case) is parsed correctly', () => {
      const catalog = [makeCatalogEntry({ ean: 'STR2', price: '9.99' })]
      const competitors = new Map([['STR2', makeCompetitorEntry({ ptFirst: 9.99 })]])

      const result = computeReport(catalog, competitors)

      assert.equal(result.summary_pt.winning, 1, 'string price "9.99" === 9.99 must be winning (tied)')
      assert.equal(result.opportunities_pt.length, 0, 'winning product must not appear in opportunities')
    })
  })

  // ── G-3: Empty catalog ───────────────────────────────────────────────────
  describe('G-3: Empty catalog returns valid zero-count structure', () => {
    test('empty catalog produces zero totals and empty arrays', () => {
      const result = computeReport([], new Map())

      assert.equal(result.summary_pt.total, 0, 'summary_pt.total must be 0')
      assert.equal(result.summary_es.total, 0, 'summary_es.total must be 0')
      assert.equal(result.summary_pt.winning, 0)
      assert.equal(result.summary_pt.losing, 0)
      assert.equal(result.summary_pt.uncontested, 0)
      assert.equal(result.opportunities_pt.length, 0)
      assert.equal(result.opportunities_es.length, 0)
      assert.equal(result.quickwins_pt.length, 0)
      assert.equal(result.quickwins_es.length, 0)
    })
  })

  // ── G-4: summary_es.total invariant ──────────────────────────────────────
  describe('G-4: summary_es.total equals catalog.length', () => {
    test('summary_es.total matches catalog length when catalog has multiple products', () => {
      const catalog = [
        makeCatalogEntry({ ean: 'ES_T1', price: 10 }),
        makeCatalogEntry({ ean: 'ES_T2', price: 8 }),
        makeCatalogEntry({ ean: 'ES_T3', price: 12 }),
      ]
      const competitors = new Map([
        ['ES_T1', makeCompetitorEntry({ esFirst: 9 })],
        ['ES_T2', makeCompetitorEntry({ esFirst: 9 })],
        // ES_T3 has no competitor
      ])

      const result = computeReport(catalog, competitors)

      assert.equal(result.summary_es.total, 3, 'summary_es.total must equal catalog.length')
    })
  })

  // ── G-5: quickwins are a strict subset of opportunities ───────────────────
  describe('G-5: quickwins_pt/es are a strict subset of their opportunity arrays', () => {
    test('every entry in quickwins_pt also exists in opportunities_pt', () => {
      const catalog = [
        makeCatalogEntry({ ean: 'QW01', price: 10.10 }),  // gap_pct ~0.019 → quick win
        makeCatalogEntry({ ean: 'QW02', price: 12.00 }),  // gap_pct ~0.333 → not quick win
      ]
      const competitors = new Map([
        ['QW01', makeCompetitorEntry({ ptFirst: 9.91 })],
        ['QW02', makeCompetitorEntry({ ptFirst: 9.00 })],
      ])

      const result = computeReport(catalog, competitors)

      for (const qw of result.quickwins_pt) {
        const inOpps = result.opportunities_pt.some(o => o.ean === qw.ean)
        assert.ok(inOpps, `quickwins_pt entry (ean=${qw.ean}) must also be in opportunities_pt`)
        assert.equal(qw.is_quick_win, true, 'every quickwins_pt entry must have is_quick_win===true')
      }
    })

    test('every entry in quickwins_es also exists in opportunities_es', () => {
      const catalog = [
        makeCatalogEntry({ ean: 'QWE1', price: 10.10 }),
        makeCatalogEntry({ ean: 'QWE2', price: 15.00 }),
      ]
      const competitors = new Map([
        ['QWE1', makeCompetitorEntry({ esFirst: 9.91 })],
        ['QWE2', makeCompetitorEntry({ esFirst: 9.00 })],
      ])

      const result = computeReport(catalog, competitors)

      for (const qw of result.quickwins_es) {
        const inOpps = result.opportunities_es.some(o => o.ean === qw.ean)
        assert.ok(inOpps, `quickwins_es entry (ean=${qw.ean}) must also be in opportunities_es`)
        assert.equal(qw.is_quick_win, true, 'every quickwins_es entry must have is_quick_win===true')
      }
    })

    test('non-quick-win losing products are NOT in quickwins arrays', () => {
      const catalog = [makeCatalogEntry({ ean: 'NQW1', price: 12.00 })]
      const competitors = new Map([['NQW1', makeCompetitorEntry({ ptFirst: 9.00, esFirst: 9.00 })]])

      const result = computeReport(catalog, competitors)

      // gap_pct = (12-9)/9 = 0.333 > 0.02 → not a quick win
      assert.equal(result.quickwins_pt.length, 0, 'non-quick-win must not appear in quickwins_pt')
      assert.equal(result.quickwins_es.length, 0, 'non-quick-win must not appear in quickwins_es')
      assert.equal(result.opportunities_pt.length, 1, 'non-quick-win still appears in opportunities_pt')
    })
  })

  // ── G-6: competitor_first === 0 boundary ─────────────────────────────────
  describe('G-6: competitor_first === 0 is classified as uncontested (not losing)', () => {
    test('competitor_first === 0 with my_price > 0 yields uncontested classification', () => {
      // A zero competitor price is a degenerate data point (typically a hidden
      // or placeholder Mirakl offer). Treating it as a legitimate losing case
      // produces gap_pct = Infinity, wow_score = 0 in the CSV and "€0,00 first
      // place" in the UI — both misleading to end users. scanCompetitors.js
      // should filter these at the source; computeReport enforces it as
      // defense-in-depth.
      const catalog = [makeCatalogEntry({ ean: 'ZERO', price: 10.00 })]
      const competitors = new Map([['ZERO', makeCompetitorEntry({ ptFirst: 0 })]])

      let result
      assert.doesNotThrow(() => {
        result = computeReport(catalog, competitors)
      }, 'computeReport must not throw when competitor_first === 0')

      assert.equal(result.summary_pt.uncontested, 1, 'competitor_first(0) → uncontested (degenerate input)')
      assert.equal(result.summary_pt.losing, 0, 'competitor_first(0) must NOT be classified as losing')
      assert.equal(result.opportunities_pt.length, 0, 'uncontested product must NOT appear in opportunities_pt')
    })
  })

  // ── G-7: ES channel summary invariant ────────────────────────────────────
  describe('G-7: ES channel summary invariant (winning+losing+uncontested === total)', () => {
    test('ES summary invariant holds for mixed catalog', () => {
      const catalog = [
        makeCatalogEntry({ ean: 'ESI1', price: 8 }),   // winning ES
        makeCatalogEntry({ ean: 'ESI2', price: 10 }),  // losing ES
        makeCatalogEntry({ ean: 'ESI3', price: 10 }),  // uncontested ES
      ]
      const competitors = new Map([
        ['ESI1', makeCompetitorEntry({ esFirst: 9 })],   // winning: 8 < 9
        ['ESI2', makeCompetitorEntry({ esFirst: 9 })],   // losing: 10 > 9
        // ESI3 absent from Map → uncontested
      ])

      const result = computeReport(catalog, competitors)

      const esSum = result.summary_es.winning + result.summary_es.losing + result.summary_es.uncontested
      assert.equal(
        esSum,
        result.summary_es.total,
        `ES: winning(${result.summary_es.winning})+losing(${result.summary_es.losing})+uncontested(${result.summary_es.uncontested}) must equal total(${result.summary_es.total})`
      )
    })
  })

  // ── G-8: *_value fields — Σ(my_price) per bucket ─────────────────────────
  // Surfaced as "valor de catálogo" lines on the report cards. Honest framing:
  // sum of catalog prices, never multiplied by stock or velocity.
  describe('G-8: summary *_value fields sum my_price per bucket', () => {
    test('winning_value, losing_value, uncontested_value, within_reach_value sum correctly', () => {
      // gap_pct = (my_price - competitor_first) / competitor_first
      // within_reach threshold = 0.05 (≤5%)
      const catalog = [
        makeCatalogEntry({ ean: 'V001', price: 100 }),  // winning PT (100 <= 120)
        makeCatalogEntry({ ean: 'V002', price: 105 }),  // losing PT, within_reach (gap_pct = 5/100 = 0.05)
        makeCatalogEntry({ ean: 'V003', price: 300 }),  // losing PT, NOT within_reach (gap_pct = 100/200 = 0.50)
        makeCatalogEntry({ ean: 'V004', price: 400 }),  // uncontested PT (no competitor)
      ]
      const competitors = new Map([
        ['V001', makeCompetitorEntry({ ptFirst: 120 })],
        ['V002', makeCompetitorEntry({ ptFirst: 100 })],
        ['V003', makeCompetitorEntry({ ptFirst: 200 })],
        // V004 absent → uncontested PT
      ])

      const result = computeReport(catalog, competitors)

      assert.equal(result.summary_pt.winning_value, 100, 'winning_value = sum of winning prices')
      assert.equal(result.summary_pt.losing_value, 405, 'losing_value = sum of all losing prices (105 + 300)')
      assert.equal(result.summary_pt.within_reach_value, 105, 'within_reach_value = sum of within-reach prices only (105, not 300)')
      assert.equal(result.summary_pt.uncontested_value, 400, 'uncontested_value = sum of uncontested prices')
    })

    test('NaN-priced product contributes to uncontested count but not to *_value sums', () => {
      const catalog = [
        makeCatalogEntry({ ean: 'NAN1', price: null }),   // NaN → uncontested both channels, no value
        makeCatalogEntry({ ean: 'GOOD', price: 50 }),     // uncontested both (no competitor data) → adds 50
      ]
      const competitors = new Map()

      const result = computeReport(catalog, competitors)

      assert.equal(result.summary_pt.uncontested, 2, 'NaN product still counted in uncontested')
      assert.equal(result.summary_pt.uncontested_value, 50, 'NaN price must NOT add to uncontested_value')
      assert.equal(result.summary_es.uncontested_value, 50, 'ES: NaN price must NOT add to uncontested_value')
    })

    test('all *_value fields exist as numbers for both channels (shape contract)', () => {
      const result = computeReport([], new Map())
      for (const channel of ['summary_pt', 'summary_es']) {
        for (const field of ['winning_value', 'losing_value', 'uncontested_value', 'within_reach_value']) {
          assert.equal(typeof result[channel][field], 'number', `${channel}.${field} must be a number`)
          assert.equal(result[channel][field], 0, `${channel}.${field} must be 0 for empty catalog`)
        }
      }
    })
  })
})
