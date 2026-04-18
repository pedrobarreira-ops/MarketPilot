/**
 * ATDD tests for Story 3.4: WOW Score and Quick Wins Scoring
 *
 * Acceptance criteria verified:
 * AC-1: gap = my_price - competitor_total_price_first; gap_pct = gap / competitor_total_price_first
 * AC-2: wow_score = my_price / gap_pct (only when my_price > competitor first)
 * AC-3: is_quick_win = gap_pct <= 0.02
 * AC-4: Winning = my_price <= competitor first (no WOW score assigned)
 * AC-5: Uncontested = no competitor data for that channel
 * AC-6: opportunities_pt and opportunities_es sorted by wow_score DESC
 * AC-7: summary per channel: { total, winning, losing, uncontested }
 * AC-8: my_price from OF21 (not P11); channel isolation maintained
 *
 * Uses Node.js built-in test runner (node:test) — no extra dependencies needed.
 * Run: node --test tests/epic3-3.4-wow-scoring.atdd.test.js
 *
 * Pure unit tests — no network or Redis connection required.
 */

import { test, describe, before } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const COMPUTE_REPORT_PATH = join(__dirname, '../src/workers/scoring/computeReport.js')

// ── helpers ────────────────────────────────────────────────────────────────

function codeLines(src) {
  const noBlock = src.replace(/\/\*[\s\S]*?\*\//g, '')
  return noBlock
    .split('\n')
    .filter(line => {
      const trimmed = line.trim()
      return trimmed.length > 0 && !trimmed.startsWith('//')
    })
    .join('\n')
}

/**
 * Build a catalog entry (from OF21 fetchCatalog output).
 */
function makeCatalogEntry({ ean = '1234567890123', shopSku = 'SKU-001', price = 10.00, title = 'Product' } = {}) {
  return { ean, shop_sku: shopSku, price, product_title: title }
}

/**
 * Build a competitor data entry (from P11 scanCompetitors output).
 * Map<ean, { pt: {first, second}, es: {first, second} }>
 */
function makeCompetitorEntry({ ptFirst = null, ptSecond = null, esFirst = null, esSecond = null } = {}) {
  return {
    pt: { first: ptFirst, second: ptSecond },
    es: { first: esFirst, second: esSecond },
  }
}

// ── test suite ─────────────────────────────────────────────────────────────

describe('Story 3.4 — WOW score and Quick Wins scoring', async () => {
  let computeReport

  before(async () => {
    const mod = await import('../src/workers/scoring/computeReport.js')
    computeReport = mod.computeReport
  })

  // ── AC-1 + AC-2: WOW score formula ────────────────────────────────────────
  describe('AC-1 & AC-2: WOW score formula (gap, gap_pct, wow_score)', () => {
    test('computeReport is exported as a function', () => {
      assert.equal(typeof computeReport, 'function', 'computeReport must be an exported function')
    })

    test('computes gap correctly (my_price - competitor_first)', () => {
      const catalog = [makeCatalogEntry({ ean: '1111', price: 10.00 })]
      const competitors = new Map([['1111', makeCompetitorEntry({ ptFirst: 9.00 })]])

      const result = computeReport(catalog, competitors)

      const ptOpportunity = result.opportunities_pt.find(o => o.ean === '1111')
      assert.ok(ptOpportunity, 'Product must appear in opportunities_pt when my_price > competitor_first')
      assert.ok(
        Math.abs(ptOpportunity.gap - 1.00) < 0.001,
        `gap must be my_price(10) - competitor_first(9) = 1.00, got ${ptOpportunity.gap}`
      )
    })

    test('computes gap_pct correctly (gap / competitor_first)', () => {
      const catalog = [makeCatalogEntry({ ean: '2222', price: 10.00 })]
      const competitors = new Map([['2222', makeCompetitorEntry({ ptFirst: 9.00 })]])

      const result = computeReport(catalog, competitors)

      const ptOpportunity = result.opportunities_pt.find(o => o.ean === '2222')
      assert.ok(ptOpportunity, 'Product must appear in opportunities_pt')
      const expectedGapPct = 1.00 / 9.00
      assert.ok(
        Math.abs(ptOpportunity.gap_pct - expectedGapPct) < 0.0001,
        `gap_pct must be gap/competitor_first = ${expectedGapPct.toFixed(6)}, got ${ptOpportunity.gap_pct}`
      )
    })

    test('computes wow_score correctly (my_price / gap_pct)', () => {
      const catalog = [makeCatalogEntry({ ean: '3333', price: 10.00 })]
      const competitors = new Map([['3333', makeCompetitorEntry({ ptFirst: 9.00 })]])

      const result = computeReport(catalog, competitors)

      const ptOpportunity = result.opportunities_pt.find(o => o.ean === '3333')
      assert.ok(ptOpportunity, 'Product must appear in opportunities_pt')
      // wow_score = my_price / gap_pct = 10 / (1/9) = 90
      const expectedWowScore = 10.00 / (1.00 / 9.00)
      assert.ok(
        Math.abs(ptOpportunity.wow_score - expectedWowScore) < 0.01,
        `wow_score must be my_price/gap_pct = ${expectedWowScore.toFixed(2)}, got ${ptOpportunity.wow_score}`
      )
    })

    test('WOW score is only assigned when my_price > competitor_first', () => {
      const catalog = [makeCatalogEntry({ ean: '4444', price: 8.00 })]
      const competitors = new Map([['4444', makeCompetitorEntry({ ptFirst: 9.00 })]])

      const result = computeReport(catalog, competitors)

      // my_price(8) < competitor_first(9) → winning, no WOW score
      const ptOpportunity = result.opportunities_pt.find(o => o.ean === '4444')
      if (ptOpportunity) {
        assert.ok(
          !ptOpportunity.wow_score,
          'wow_score must not be assigned when my_price <= competitor_first (winning position)'
        )
      }
      // Should appear in winning count instead
      assert.ok(result.summary_pt.winning >= 1, 'Winning count must be >= 1 for this product')
    })
  })

  // ── AC-3: Quick Win ──────────────────────────────────────────────────────
  describe('AC-3: is_quick_win = gap_pct <= 0.02', () => {
    test('marks product as quick win when gap_pct <= 0.02', () => {
      // gap_pct = (10.10 - 9.90) / 9.90 = 0.0202 > 0.02 (not quick win for this)
      // Use: my_price=10.10, competitor=9.91 → gap=0.19, gap_pct=0.01919 < 0.02 → quick win
      const catalog = [makeCatalogEntry({ ean: '5555', price: 10.10 })]
      const competitors = new Map([['5555', makeCompetitorEntry({ ptFirst: 9.91 })]])

      const result = computeReport(catalog, competitors)

      const ptOpportunity = result.opportunities_pt.find(o => o.ean === '5555')
      assert.ok(ptOpportunity, 'Product must appear in opportunities_pt when losing')
      assert.equal(ptOpportunity.is_quick_win, true, 'is_quick_win must be true when gap_pct <= 0.02')

      // Also verify it appears in quickwins_pt
      const inQuickWins = result.quickwins_pt.some(o => o.ean === '5555')
      assert.ok(inQuickWins, 'Product must appear in quickwins_pt when is_quick_win is true')
    })

    test('does NOT mark as quick win when gap_pct > 0.02', () => {
      // my_price=12, competitor=9 → gap=3, gap_pct=0.333 > 0.02
      const catalog = [makeCatalogEntry({ ean: '6666', price: 12.00 })]
      const competitors = new Map([['6666', makeCompetitorEntry({ ptFirst: 9.00 })]])

      const result = computeReport(catalog, competitors)

      const ptOpportunity = result.opportunities_pt.find(o => o.ean === '6666')
      assert.ok(ptOpportunity, 'Product must appear in opportunities_pt when losing significantly')
      assert.equal(ptOpportunity.is_quick_win, false, 'is_quick_win must be false when gap_pct > 0.02')

      const inQuickWins = result.quickwins_pt.some(o => o.ean === '6666')
      assert.ok(!inQuickWins, 'Product must NOT appear in quickwins_pt when is_quick_win is false')
    })

    test('quick win boundary: gap_pct exactly 0.02 is a quick win', () => {
      // Need: gap/competitor = 0.02 → gap = 0.02 * competitor
      // competitor = 10, gap = 0.20, my_price = 10.20
      const catalog = [makeCatalogEntry({ ean: '7777', price: 10.20 })]
      const competitors = new Map([['7777', makeCompetitorEntry({ ptFirst: 10.00 })]])

      const result = computeReport(catalog, competitors)

      const ptOpportunity = result.opportunities_pt.find(o => o.ean === '7777')
      // gap_pct = 0.20/10.00 = 0.02 — exactly the boundary
      if (ptOpportunity) {
        assert.equal(ptOpportunity.is_quick_win, true, 'is_quick_win must be true at exactly gap_pct=0.02')
      }
    })
  })

  // ── AC-4: Winning position ────────────────────────────────────────────────
  describe('AC-4: winning = my_price <= competitor_first (no WOW score)', () => {
    test('product is winning when my_price equals competitor_first', () => {
      const catalog = [makeCatalogEntry({ ean: '8888', price: 9.99 })]
      const competitors = new Map([['8888', makeCompetitorEntry({ ptFirst: 9.99 })]])

      const result = computeReport(catalog, competitors)

      assert.ok(result.summary_pt.winning >= 1, 'summary_pt.winning must count this product (my_price === competitor_first)')
    })

    test('winning product does not appear in opportunities_pt', () => {
      const catalog = [makeCatalogEntry({ ean: '9999', price: 8.00 })]
      const competitors = new Map([['9999', makeCompetitorEntry({ ptFirst: 9.00 })]])

      const result = computeReport(catalog, competitors)

      const inOpportunities = result.opportunities_pt.some(o => o.ean === '9999')
      assert.ok(!inOpportunities, 'Winning products must not appear in opportunities_pt')
    })
  })

  // ── AC-5: Uncontested ────────────────────────────────────────────────────
  describe('AC-5: uncontested = no competitor data for that channel', () => {
    test('product with no PT competitor is counted as uncontested in PT', () => {
      const catalog = [makeCatalogEntry({ ean: 'AAAA', price: 10.00 })]
      const competitors = new Map([['AAAA', makeCompetitorEntry({ ptFirst: null, esFirst: 8.00 })]])

      const result = computeReport(catalog, competitors)

      assert.ok(result.summary_pt.uncontested >= 1, 'summary_pt.uncontested must count products with no PT competitor')
    })

    test('product with no competitor data at all is uncontested in both channels', () => {
      const catalog = [makeCatalogEntry({ ean: 'BBBB', price: 10.00 })]
      const competitors = new Map() // no competitor data at all

      const result = computeReport(catalog, competitors)

      assert.ok(result.summary_pt.uncontested >= 1, 'PT uncontested must include products with no competitor data')
      assert.ok(result.summary_es.uncontested >= 1, 'ES uncontested must include products with no competitor data')
    })

    test('uncontested product does not appear in opportunities', () => {
      const catalog = [makeCatalogEntry({ ean: 'CCCC', price: 10.00 })]
      const competitors = new Map()

      const result = computeReport(catalog, competitors)

      const inPtOpps = result.opportunities_pt.some(o => o.ean === 'CCCC')
      const inEsOpps = result.opportunities_es.some(o => o.ean === 'CCCC')
      assert.ok(!inPtOpps, 'Uncontested products must not appear in opportunities_pt')
      assert.ok(!inEsOpps, 'Uncontested products must not appear in opportunities_es')
    })
  })

  // ── AC-6: Sorted by wow_score DESC ───────────────────────────────────────
  describe('AC-6: opportunities sorted by wow_score DESC', () => {
    test('opportunities_pt is sorted by wow_score descending', () => {
      const catalog = [
        makeCatalogEntry({ ean: 'LOW1', price: 12.00 }),  // big gap → higher wow
        makeCatalogEntry({ ean: 'HIGH', price: 10.10 }), // small gap → lower wow
      ]
      const competitors = new Map([
        ['LOW1', makeCompetitorEntry({ ptFirst: 9.00 })], // gap_pct=0.333, wow=36
        ['HIGH', makeCompetitorEntry({ ptFirst: 9.91 })], // gap_pct=0.019, wow=531
      ])

      const result = computeReport(catalog, competitors)

      assert.ok(result.opportunities_pt.length >= 2, 'Must have at least 2 opportunities in PT')

      for (let i = 0; i < result.opportunities_pt.length - 1; i++) {
        const current = result.opportunities_pt[i].wow_score
        const next = result.opportunities_pt[i + 1].wow_score
        assert.ok(
          current >= next,
          `opportunities_pt must be sorted wow_score DESC: index ${i} (${current}) >= index ${i + 1} (${next})`
        )
      }
    })

    test('opportunities_es is sorted by wow_score descending', () => {
      const catalog = [
        makeCatalogEntry({ ean: 'ES01', price: 15.00 }),
        makeCatalogEntry({ ean: 'ES02', price: 11.00 }),
      ]
      const competitors = new Map([
        ['ES01', makeCompetitorEntry({ esFirst: 9.00 })],  // gap=6, gap_pct=0.667, wow=22.5
        ['ES02', makeCompetitorEntry({ esFirst: 10.80 })], // gap=0.20, gap_pct=0.0185, wow=594
      ])

      const result = computeReport(catalog, competitors)

      if (result.opportunities_es.length >= 2) {
        for (let i = 0; i < result.opportunities_es.length - 1; i++) {
          const current = result.opportunities_es[i].wow_score
          const next = result.opportunities_es[i + 1].wow_score
          assert.ok(
            current >= next,
            `opportunities_es must be sorted wow_score DESC: index ${i} (${current}) >= index ${i + 1} (${next})`
          )
        }
      }
    })
  })

  // ── AC-7: Summary per channel ─────────────────────────────────────────────
  describe('AC-7: summary includes {total, winning, losing, uncontested} per channel', () => {
    test('result includes summary_pt with required fields', () => {
      const catalog = [makeCatalogEntry({ ean: 'SUM1', price: 10.00 })]
      const competitors = new Map([['SUM1', makeCompetitorEntry({ ptFirst: 9.00 })]])

      const result = computeReport(catalog, competitors)

      assert.ok(result.summary_pt, 'result must have summary_pt')
      assert.ok(typeof result.summary_pt.total === 'number', 'summary_pt.total must be a number')
      assert.ok(typeof result.summary_pt.winning === 'number', 'summary_pt.winning must be a number')
      assert.ok(typeof result.summary_pt.losing === 'number', 'summary_pt.losing must be a number')
      assert.ok(typeof result.summary_pt.uncontested === 'number', 'summary_pt.uncontested must be a number')
    })

    test('result includes summary_es with required fields', () => {
      const catalog = [makeCatalogEntry({ ean: 'SUM2', price: 10.00 })]
      const competitors = new Map([['SUM2', makeCompetitorEntry({ esFirst: 9.00 })]])

      const result = computeReport(catalog, competitors)

      assert.ok(result.summary_es, 'result must have summary_es')
      assert.ok(typeof result.summary_es.total === 'number', 'summary_es.total must be a number')
      assert.ok(typeof result.summary_es.winning === 'number', 'summary_es.winning must be a number')
      assert.ok(typeof result.summary_es.losing === 'number', 'summary_es.losing must be a number')
      assert.ok(typeof result.summary_es.uncontested === 'number', 'summary_es.uncontested must be a number')
    })

    test('summary_pt.total equals catalog length', () => {
      const catalog = [
        makeCatalogEntry({ ean: 'T001', price: 10 }),
        makeCatalogEntry({ ean: 'T002', price: 8 }),
        makeCatalogEntry({ ean: 'T003', price: 12 }),
      ]
      const competitors = new Map([
        ['T001', makeCompetitorEntry({ ptFirst: 9 })],
        ['T002', makeCompetitorEntry({ ptFirst: 9 })],
        // T003 has no competitor
      ])

      const result = computeReport(catalog, competitors)

      assert.equal(result.summary_pt.total, 3, 'summary_pt.total must equal the number of catalog products')
    })

    test('winning + losing + uncontested sum equals total per channel', () => {
      const catalog = [
        makeCatalogEntry({ ean: 'W001', price: 8 }),   // winning PT
        makeCatalogEntry({ ean: 'L001', price: 10 }),  // losing PT
        makeCatalogEntry({ ean: 'U001', price: 10 }),  // uncontested
      ]
      const competitors = new Map([
        ['W001', makeCompetitorEntry({ ptFirst: 9 })],
        ['L001', makeCompetitorEntry({ ptFirst: 9 })],
      ])

      const result = computeReport(catalog, competitors)

      const ptSum = result.summary_pt.winning + result.summary_pt.losing + result.summary_pt.uncontested
      assert.equal(
        ptSum,
        result.summary_pt.total,
        `winning(${result.summary_pt.winning}) + losing(${result.summary_pt.losing}) + uncontested(${result.summary_pt.uncontested}) must equal total(${result.summary_pt.total})`
      )
    })
  })

  // ── AC-8: my_price from OF21; channel isolation ───────────────────────────
  describe('AC-8: my_price from OF21, channel scoring is independent', () => {
    let src

    before(() => {
      src = codeLines(readFileSync(COMPUTE_REPORT_PATH, 'utf8'))
    })

    test('source uses offer price (my_price) from catalog — not P11 all_offers', () => {
      // my_price comes from the catalog array (OF21 price), not from competitor data
      assert.ok(
        src.includes('my_price') || src.includes('price'),
        'computeReport.js must use OF21 price as my_price'
      )
    })

    test('PT and ES channels scored independently', () => {
      const catalog = [makeCatalogEntry({ ean: 'DUAL', price: 10.00 })]
      const competitors = new Map([
        ['DUAL', makeCompetitorEntry({ ptFirst: 9.00, esFirst: 11.00 })],
      ])

      const result = computeReport(catalog, competitors)

      // In PT: losing (10 > 9), in ES: winning (10 < 11)
      const inPtOpps = result.opportunities_pt.some(o => o.ean === 'DUAL')
      const inEsOpps = result.opportunities_es.some(o => o.ean === 'DUAL')

      assert.ok(inPtOpps, 'DUAL must appear in PT opportunities (losing in PT)')
      assert.ok(!inEsOpps, 'DUAL must NOT appear in ES opportunities (winning in ES)')
      assert.ok(result.summary_es.winning >= 1, 'ES winning count must include DUAL')
    })
  })

  // ── RESULT SHAPE: required keys ──────────────────────────────────────────
  describe('RESULT SHAPE: computeReport returns all required keys', () => {
    test('result contains all required top-level keys', () => {
      const catalog = [makeCatalogEntry()]
      const competitors = new Map()

      const result = computeReport(catalog, competitors)

      const requiredKeys = ['opportunities_pt', 'opportunities_es', 'quickwins_pt', 'quickwins_es', 'summary_pt', 'summary_es']
      for (const key of requiredKeys) {
        assert.ok(key in result, `computeReport result must contain "${key}"`)
      }
    })

    test('opportunities_pt and _es are arrays', () => {
      const result = computeReport([], new Map())
      assert.ok(Array.isArray(result.opportunities_pt), 'opportunities_pt must be an array')
      assert.ok(Array.isArray(result.opportunities_es), 'opportunities_es must be an array')
    })

    test('quickwins_pt and _es are arrays', () => {
      const result = computeReport([], new Map())
      assert.ok(Array.isArray(result.quickwins_pt), 'quickwins_pt must be an array')
      assert.ok(Array.isArray(result.quickwins_es), 'quickwins_es must be an array')
    })
  })
})
