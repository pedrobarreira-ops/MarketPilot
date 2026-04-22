// src/workers/mirakl/scanCompetitors.js
// P11 competitor scan: batch 100 EANs, 10 concurrent batch-pairs, both channels.
// Returns Map<ean, { pt: { first, second }, es: { first, second } }>
//
// Per-channel pricing pattern (verified against live Worten instance 2026-04-18):
//   - Each batch makes TWO P11 calls in parallel — one per channel — each with
//     pricing_channel_code=<CHANNEL> so offer.total_price reflects that channel.
//   - Batch lookup uses product_references=EAN|xxx (NOT product_ids; product_ids
//     expects product SKUs/UUIDs, silently returns 0 products when given EANs).
//   - Channel bucketing is determined by WHICH call returned the offer — never by
//     reading offer.channel_code (does not exist) or offer.channels (empty on
//     competitor offers).
//
// Security invariants:
//   - apiKey is a function parameter only — never stored at module scope
//   - apiKey is never logged
//   - Failed batches: log { error_type, batch_size } only (no err.message)

import pino from 'pino'
import { mirAklGet } from './apiClient.js'

// Use process.env.LOG_LEVEL directly — scanCompetitors is a pure utility module
// that must be importable without full app config (env var) validation.
const log = pino({ level: process.env.LOG_LEVEL || 'info' })

const BATCH_SIZE = 100
const CONCURRENCY = 10
const PROGRESS_INTERVAL = 500
const CHANNELS = ['WRT_PT_ONLINE', 'WRT_ES_ONLINE']

// Phase message emitted during P11 429 backoff (AC-2)
const RATE_LIMIT_WAIT_MSG = 'A verificar concorrentes — a aguardar limite de pedidos…'

/**
 * Resolve EAN for a product using 3-strategy approach (from scale_test.js).
 *
 * Strategy 1: product.product_references → find reference_type === 'EAN'
 * Strategy 2: product.product_sku if it appears in batchEans
 * Strategy 3: If batchEans.length === 1, return batchEans[0] (unambiguous)
 * Otherwise: return null (cannot resolve EAN — skip product)
 */
function resolveEanForProduct(product, batchEans) {
  const productRefs = product.product_references ?? []
  const eanRef = productRefs.find(r => r.reference_type === 'EAN')
  if (eanRef && batchEans.includes(eanRef.reference)) return eanRef.reference

  if (product.product_sku && batchEans.includes(product.product_sku)) {
    return product.product_sku
  }

  if (batchEans.length === 1) return batchEans[0]

  return null
}

/**
 * Extract Map<ean, {first, second}> from a single-channel P11 response.
 * Filters offer.active === true and takes positions 0 and 1 of offer.total_price.
 * (Since the request passed pricing_channel_code=<CHANNEL>, total_price already
 * reflects that channel's price + min shipping.)
 */
function extractPricesForChannel(products, batchEans) {
  const m = new Map()
  for (const product of products) {
    const ean = resolveEanForProduct(product, batchEans)
    if (!ean) continue

    const activeOffers = (product.offers ?? []).filter(o => o.active === true)
    m.set(ean, {
      first: activeOffers[0]?.total_price ?? null,
      second: activeOffers[1]?.total_price ?? null,
    })
  }
  return m
}

/**
 * Scan competitors for a list of EANs using P11 (GET /api/products/offers).
 *
 * - Batches EANs in groups of BATCH_SIZE (100)
 * - Each batch makes TWO P11 calls in parallel (one per channel in CHANNELS)
 *   with pricing_channel_code set, so offer.total_price reflects that channel
 * - Runs CONCURRENCY (10) batches concurrently via Promise.allSettled()
 *   (so up to CONCURRENCY × CHANNELS.length = 20 in-flight HTTP requests)
 * - Handles failed batches gracefully: EANs absent from result → uncontested
 * - Calls onProgress every PROGRESS_INTERVAL (500) EANs processed
 *
 * @param {string} baseUrl - Mirakl base URL
 * @param {string} apiKey - Mirakl API key (function param only — never stored at module scope)
 * @param {string[]} eans - Array of EANs to scan
 * @param {object} [options] - Optional options object
 * @param {function} [options.onProgress] - Optional progress callback: (processed, total) => void
 * @param {function} [options.onRateLimit] - Optional rate-limit callback: called when a 429 is retried
 * @returns {Promise<Map<string, {pt:{first:number|null,second:number|null},es:{first:number|null,second:number|null}}>>}
 */
export async function scanCompetitors(baseUrl, apiKey, eans, options) {
  const { onProgress, onRateLimit } = options ?? {}
  const total = eans.length

  const batches = []
  for (let i = 0; i < eans.length; i += BATCH_SIZE) {
    batches.push(eans.slice(i, i + BATCH_SIZE))
  }

  const resultMap = new Map()
  let processed = 0
  let lastProgressAt = 0

  // Per-batch: make one P11 call per channel in parallel, return both products lists
  async function scanBatch(batchEans) {
    // EAN|xxx,EAN|yyy — product_references is the EAN-lookup param (product_ids
    // expects product SKUs, not EANs, and silently returns 0 products)
    const productRefs = batchEans.map(e => `EAN|${e}`).join(',')

    const callsByChannel = await Promise.all(
      CHANNELS.map(channel =>
        mirAklGet(
          baseUrl,
          '/api/products/offers',
          {
            product_references: productRefs,
            channel_codes: channel,           // filter offers sellable on this channel
            pricing_channel_code: channel,    // make total_price reflect this channel
          },
          apiKey
        )
      )
    )

    const productsByChannel = {}
    for (let i = 0; i < CHANNELS.length; i++) {
      productsByChannel[CHANNELS[i]] = callsByChannel[i].products ?? []
    }
    return productsByChannel
  }

  for (let i = 0; i < batches.length; i += CONCURRENCY) {
    const batchWindow = batches.slice(i, i + CONCURRENCY)

    // Promise.allSettled: one failed batch does not abort others
    const results = await Promise.allSettled(
      batchWindow.map(batchEans => scanBatch(batchEans))
    )

    for (let j = 0; j < results.length; j++) {
      const batchEans = batchWindow[j]

      if (results[j].status === 'rejected') {
        // Log only error type — never err.message (may contain API response details)
        const err = results[j].reason
        const isRateLimit = err?.status === 429
        log.warn({ error_type: err?.constructor?.name ?? 'UnknownError', batch_size: batchEans.length })
        // AC-2: emit rate-limit wait message so worker can update phase_message
        if (isRateLimit) {
          onRateLimit?.(RATE_LIMIT_WAIT_MSG)
        }
        processed += batchEans.length
        // EANs from failed batch are absent from resultMap → treated as uncontested downstream
        continue
      }

      const productsByChannel = results[j].value
      const ptMap = extractPricesForChannel(productsByChannel.WRT_PT_ONLINE, batchEans)
      const esMap = extractPricesForChannel(productsByChannel.WRT_ES_ONLINE, batchEans)

      for (const ean of batchEans) {
        const pt = ptMap.get(ean) ?? { first: null, second: null }
        const es = esMap.get(ean) ?? { first: null, second: null }

        // Record only if at least one channel returned data
        if (pt.first !== null || pt.second !== null || es.first !== null || es.second !== null) {
          resultMap.set(ean, { pt, es })
        }
      }

      processed += batchEans.length
    }

    if (processed - lastProgressAt >= PROGRESS_INTERVAL) {
      onProgress?.(processed, total)
      lastProgressAt = processed
    }
  }

  // Final progress emit: ensure caller observes completion when the trailing
  // remainder (< PROGRESS_INTERVAL EANs) never crossed the interval threshold.
  if (total > 0 && processed > lastProgressAt) {
    onProgress?.(processed, total)
  }

  return resultMap
}
