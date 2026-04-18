/**
 * computeReport — Story 3.4: WOW Score and Quick Wins Scoring
 *
 * Consumes:
 *   catalog     — Array of catalog entries from OF21 fetchCatalog.
 *                 Each entry: { ean, shop_sku, price (string or number), product_title }
 *   competitors — Map<ean, { pt: { first, second }, es: { first, second } }>
 *                 from P11 scanCompetitors. Absent EAN = fully uncontested.
 *
 * Returns per-channel report:
 *   {
 *     opportunities_pt, opportunities_es,   // losing entries sorted by wow_score DESC
 *     quickwins_pt,     quickwins_es,        // subset where is_quick_win === true
 *     summary_pt,       summary_es           // { total, winning, losing, uncontested }
 *   }
 *
 * Formulas (AC-1, AC-2, AC-3):
 *   gap        = my_price - competitor_first
 *   gap_pct    = gap / competitor_first
 *   wow_score  = my_price / gap_pct  (only when losing: my_price > competitor_first)
 *   is_quick_win = gap_pct <= 0.02
 */

/**
 * Score a single catalog product against one channel's competitor data.
 *
 * @param {number} my_price
 * @param {{ first: number|null, second: number|null }|undefined} channelData
 * @returns {{ status: 'losing'|'winning'|'uncontested', entry?: object }}
 */
function scoreChannel(ean, shopSku, my_price, title, channelData) {
  const competitorFirst = channelData?.first ?? null

  // Uncontested — no competitor data for this channel
  if (competitorFirst === null || competitorFirst === undefined) {
    return { status: 'uncontested' }
  }

  if (my_price <= competitorFirst) {
    // Winning — my price is at or below the competitor's first price
    return { status: 'winning' }
  }

  // Losing — compute gap, gap_pct, wow_score
  const gap = my_price - competitorFirst
  const gap_pct = gap / competitorFirst
  const wow_score = my_price / gap_pct
  const is_quick_win = gap_pct <= 0.02

  return {
    status: 'losing',
    entry: {
      ean,
      shop_sku: shopSku,
      product_title: title,
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
 *   summary_pt: { total: number, winning: number, losing: number, uncontested: number },
 *   summary_es: { total: number, winning: number, losing: number, uncontested: number }
 * }}
 */
export function computeReport(catalog, competitors) {
  const opportunities_pt = []
  const opportunities_es = []

  const summary_pt = { total: 0, winning: 0, losing: 0, uncontested: 0 }
  const summary_es = { total: 0, winning: 0, losing: 0, uncontested: 0 }

  for (const product of catalog) {
    const { ean, shop_sku, product_title } = product
    const my_price = parseFloat(product.price)

    summary_pt.total++
    summary_es.total++

    const competitorData = competitors.get(ean)

    // PT channel
    const ptResult = scoreChannel(ean, shop_sku, my_price, product_title, competitorData?.pt)
    if (ptResult.status === 'losing') {
      opportunities_pt.push(ptResult.entry)
      summary_pt.losing++
    } else if (ptResult.status === 'winning') {
      summary_pt.winning++
    } else {
      summary_pt.uncontested++
    }

    // ES channel — scored independently
    const esResult = scoreChannel(ean, shop_sku, my_price, product_title, competitorData?.es)
    if (esResult.status === 'losing') {
      opportunities_es.push(esResult.entry)
      summary_es.losing++
    } else if (esResult.status === 'winning') {
      summary_es.winning++
    } else {
      summary_es.uncontested++
    }
  }

  // Sort by wow_score DESC (AC-6)
  opportunities_pt.sort((a, b) => b.wow_score - a.wow_score)
  opportunities_es.sort((a, b) => b.wow_score - a.wow_score)

  // Quick wins are the losing entries where is_quick_win === true (AC-3)
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
