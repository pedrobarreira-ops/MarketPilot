// src/workers/scoring/computeReport.js
// Pure scoring function — no I/O, no network, no DB.
//
// Story 3.4: WOW Score and Quick Wins Scoring
//
// Consumes:
//   catalog     — Array of catalog entries from OF21 fetchCatalog.
//                 Each entry: { ean, shop_sku, price (string or number), product_title }
//   competitors — Map<ean, { pt: { first, second }, es: { first, second } }>
//                 from P11 scanCompetitors. Absent EAN = fully uncontested.
//
// Returns per-channel report:
//   {
//     opportunities_pt, opportunities_es,   // losing entries sorted by wow_score DESC
//     quickwins_pt,     quickwins_es,        // subset where is_quick_win === true
//     summary_pt,       summary_es           // { total, winning, losing, uncontested }
//   }
//
// Formulas (AC-1, AC-2, AC-3):
//   gap          = my_price - competitor_first
//   gap_pct      = gap / competitor_first
//   wow_score    = my_price / gap_pct  (only when losing: my_price > competitor_first)
//   is_quick_win = gap_pct <= 0.02

/**
 * Score a single catalog product against one channel's competitor data.
 *
 * Classification:
 *   - uncontested: no competitor data, or competitor_first is missing / non-numeric /
 *                  non-finite / negative (malformed upstream — scanCompetitors must
 *                  never emit such values, but we defend in depth)
 *   - winning:     my_price <= competitor_first (no WOW score assigned)
 *   - losing:      my_price >  competitor_first (WOW score + is_quick_win computed)
 *
 * Boundary: competitor_first === 0 is accepted as losing when my_price > 0
 * (gap_pct = Infinity, wow_score = 0, is_quick_win = false). Mathematically
 * degenerate but non-crashing — see unit test G-6.
 *
 * @param {{ ean: string, shop_sku: string, product_title: string }} product
 * @param {number} my_price  — already parsed to a finite number by the caller
 * @param {{ first: number|null, second: number|null }|undefined} channelData
 * @returns {{ status: 'losing'|'winning'|'uncontested', entry?: object }}
 */
function scoreChannel(product, my_price, channelData) {
  const competitorFirst = channelData?.first ?? null

  // Uncontested — no competitor data, or malformed competitor price.
  // Reject: null/undefined (no data), non-numeric (e.g. string from a buggy
  // upstream), non-finite (NaN, Infinity), and non-positive (zero would produce
  // gap_pct = Infinity and misleading "€0,00 first place" UI; negative would
  // make gap_pct negative and incorrectly trigger is_quick_win via `<= 0.02`).
  // scanCompetitors.js is the primary source of zero-filtering — this is
  // defense-in-depth in case a zero ever slips through.
  if (
    competitorFirst === null ||
    typeof competitorFirst !== 'number' ||
    !Number.isFinite(competitorFirst) ||
    competitorFirst <= 0
  ) {
    return { status: 'uncontested' }
  }

  // Winning — my price is at or below the competitor's first price (AC-4)
  if (my_price <= competitorFirst) {
    return { status: 'winning' }
  }

  // Losing — compute gap, gap_pct, wow_score, is_quick_win (AC-1, AC-2, AC-3)
  const gap = my_price - competitorFirst
  const gap_pct = gap / competitorFirst
  const wow_score = my_price / gap_pct
  const is_quick_win = gap_pct <= 0.02

  return {
    status: 'losing',
    entry: {
      ean: product.ean,
      shop_sku: product.shop_sku,
      product_title: product.product_title,
      my_price,
      competitor_first: competitorFirst,
      gap,
      gap_pct,
      wow_score,
      is_quick_win,
    },
  }
}

/**
 * Compute the full pricing opportunity report across PT and ES channels.
 *
 * @param {Array<{ ean: string, shop_sku: string, price: string|number, product_title: string }>} catalog
 * @param {Map<string, { pt: { first: number|null, second: number|null }, es: { first: number|null, second: number|null } }>} competitors
 * @returns {{
 *   opportunities_pt: Array, opportunities_es: Array,
 *   quickwins_pt: Array, quickwins_es: Array,
 *   summary_pt: { total, winning, losing, uncontested, within_reach,
 *                  winning_value, losing_value, uncontested_value, within_reach_value },
 *   summary_es: { total, winning, losing, uncontested, within_reach,
 *                  winning_value, losing_value, uncontested_value, within_reach_value }
 * }}
 *
 * `*_value` fields are Σ(my_price) per bucket — surfaced as "valor de catálogo
 * a vencer / exposto / exclusivo / ao alcance" on the report cards. Honest
 * framing per the design discussion: never multiplied by stock or velocity.
 * Products with non-numeric price contribute to `uncontested` count only,
 * not to any `*_value` sum.
 */
// Threshold for "within reach" classification — losing products with gap_pct
// at or below this value are competitive (closing the gap is realistic without
// pricing below cost). Surfaced in summary.within_reach for the WOW hero card.
// Distinct from is_quick_win threshold (0.02) used for the Vitórias Rápidas table.
const WITHIN_REACH_THRESHOLD = 0.05

export function computeReport(catalog, competitors) {
  const opportunities_pt = []
  const opportunities_es = []

  // AC-7: total equals catalog.length for both channels — both channels see every
  // product, they just classify it differently.
  // within_reach is a subset of losing — counted independently per channel.
  const summary_pt = {
    total: catalog.length, winning: 0, losing: 0, uncontested: 0, within_reach: 0,
    winning_value: 0, losing_value: 0, uncontested_value: 0, within_reach_value: 0,
  }
  const summary_es = {
    total: catalog.length, winning: 0, losing: 0, uncontested: 0, within_reach: 0,
    winning_value: 0, losing_value: 0, uncontested_value: 0, within_reach_value: 0,
  }

  for (const product of catalog) {
    const my_price = parseFloat(product.price)

    // NaN guard (AC-1 dev note): price is null/undefined/non-numeric → treat as
    // uncontested for both channels. Still counted in summary totals to preserve
    // the invariant winning + losing + uncontested === total. *_value sums
    // skip these rows since there's no price to add.
    if (Number.isNaN(my_price)) {
      summary_pt.uncontested++
      summary_es.uncontested++
      continue
    }

    const competitorData = competitors.get(product.ean)

    // PT channel — scored independently (AC-8)
    const ptResult = scoreChannel(product, my_price, competitorData?.pt)
    if (ptResult.status === 'losing') {
      opportunities_pt.push(ptResult.entry)
      summary_pt.losing++
      summary_pt.losing_value += my_price
      if (ptResult.entry.gap_pct <= WITHIN_REACH_THRESHOLD) {
        summary_pt.within_reach++
        summary_pt.within_reach_value += my_price
      }
    } else if (ptResult.status === 'winning') {
      summary_pt.winning++
      summary_pt.winning_value += my_price
    } else {
      summary_pt.uncontested++
      summary_pt.uncontested_value += my_price
    }

    // ES channel — scored independently (AC-8)
    const esResult = scoreChannel(product, my_price, competitorData?.es)
    if (esResult.status === 'losing') {
      opportunities_es.push(esResult.entry)
      summary_es.losing++
      summary_es.losing_value += my_price
      if (esResult.entry.gap_pct <= WITHIN_REACH_THRESHOLD) {
        summary_es.within_reach++
        summary_es.within_reach_value += my_price
      }
    } else if (esResult.status === 'winning') {
      summary_es.winning++
      summary_es.winning_value += my_price
    } else {
      summary_es.uncontested++
      summary_es.uncontested_value += my_price
    }
  }

  // Sort by wow_score DESC (AC-6). Array.sort is stable in modern V8 (Node >=22),
  // so products with equal wow_score retain catalog order.
  opportunities_pt.sort((a, b) => b.wow_score - a.wow_score)
  opportunities_es.sort((a, b) => b.wow_score - a.wow_score)

  // Quick wins are the losing entries where is_quick_win === true (AC-3).
  // Same object references — downstream consumers can rely on identity.
  const quickwins_pt = opportunities_pt.filter(o => o.is_quick_win)
  const quickwins_es = opportunities_es.filter(o => o.is_quick_win)

  return {
    opportunities_pt,
    opportunities_es,
    quickwins_pt,
    quickwins_es,
    summary_pt,
    summary_es,
  }
}
