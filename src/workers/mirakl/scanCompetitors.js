// src/workers/mirakl/scanCompetitors.js
// P11 competitor scan: batch 100 EANs, 10 concurrent calls, both channels.
// Returns Map<ean, { pt: { first, second }, es: { first, second } }>
//
// Security invariants:
//   - apiKey is a function parameter only — never stored at module scope
//   - apiKey is never logged
//   - Failed batches: log { error_type, batch_size } only (no err.message)

import pino from 'pino'
import { mirAklGet, MiraklApiError } from './apiClient.js'

// Use process.env.LOG_LEVEL directly — scanCompetitors is a pure utility module
// that must be importable without full app config (env var) validation. This
// keeps the module testable in isolation and avoids coupling to server startup.
const log = pino({ level: process.env.LOG_LEVEL || 'info' })

const BATCH_SIZE = 100
const CONCURRENCY = 10
const PROGRESS_INTERVAL = 500

/**
 * Resolve EAN for a product using 3-strategy approach (from scale_test.js).
 *
 * Strategy 1: product.product_references → find reference_type === 'EAN'
 * Strategy 2: product.product_sku if it appears in batchEans
 * Strategy 3: If batchEans.length === 1, return batchEans[0] (unambiguous)
 * Otherwise: return null (cannot resolve EAN — skip product)
 *
 * @param {object} product - P11 product object
 * @param {string[]} batchEans - EANs in the current batch
 * @returns {string|null}
 */
function resolveEanForProduct(product, batchEans) {
  // Strategy 1: product_references with reference_type === 'EAN'
  const productRefs = product.product_references ?? []
  const eanRef = productRefs.find(r => r.reference_type === 'EAN')
  if (eanRef && batchEans.includes(eanRef.reference)) return eanRef.reference

  // Strategy 2: product_sku matches an EAN in the batch
  if (product.product_sku && batchEans.includes(product.product_sku)) {
    return product.product_sku
  }

  // Strategy 3: single-EAN batch — unambiguous resolution
  if (batchEans.length === 1) return batchEans[0]

  return null
}

/**
 * Scan competitors for a list of EANs using P11 (GET /api/products/offers).
 *
 * - Batches EANs in groups of BATCH_SIZE (100)
 * - Runs CONCURRENCY (10) batches concurrently via Promise.allSettled()
 * - Extracts total_price for first and second active competitor per channel
 * - Handles failed batches gracefully: EANs absent from result → uncontested
 * - Calls onProgress every PROGRESS_INTERVAL (500) EANs processed
 *
 * @param {string[]} eans - Array of EANs to scan
 * @param {string} baseUrl - Mirakl base URL
 * @param {string} apiKey - Mirakl API key (function param only — never stored at module scope)
 * @param {function} [onProgress] - Optional progress callback: (processed, total) => void
 * @returns {Promise<Map<string, {pt:{first:number|null,second:number|null},es:{first:number|null,second:number|null}}>>}
 */
export async function scanCompetitors(eans, baseUrl, apiKey, onProgress) {
  const total = eans.length

  // Split EANs into batches of BATCH_SIZE using slice
  const batches = []
  for (let i = 0; i < eans.length; i += BATCH_SIZE) {
    batches.push(eans.slice(i, i + BATCH_SIZE))
  }

  const resultMap = new Map()
  let processed = 0
  let lastProgressAt = 0

  // Outer loop: process batches in windows of CONCURRENCY
  for (let i = 0; i < batches.length; i += CONCURRENCY) {
    const window = batches.slice(i, i + CONCURRENCY)

    // Promise.allSettled ensures one failed batch does not abort others
    const results = await Promise.allSettled(
      window.map(async (batchEans) => {
        const data = await mirAklGet(
          baseUrl,
          '/api/products/offers',
          {
            product_ids: batchEans.join(','),
            channel_codes: 'WRT_PT_ONLINE,WRT_ES_ONLINE',
          },
          apiKey
        )
        return { products: data.products ?? [], batchEans }
      })
    )

    // Process each settled result
    for (let j = 0; j < results.length; j++) {
      const batchEans = window[j]

      if (results[j].status === 'rejected') {
        // Log only error type — never err.message (may contain API response details)
        // Never log api_key
        const err = results[j].reason
        log.warn({ error_type: err?.constructor?.name ?? 'UnknownError', batch_size: batchEans.length })
        processed += batchEans.length
        // EANs from failed batch are absent from resultMap → treated as uncontested downstream
        continue
      }

      const { products } = results[j].value

      for (const product of products) {
        const ean = resolveEanForProduct(product, batchEans)
        if (!ean) continue

        const allOffers = product.offers ?? []

        // Filter by active === true AND channel_code for each channel
        const ptOffers = allOffers.filter(
          o => o.active === true && o.channel_code === 'WRT_PT_ONLINE'
        )
        const esOffers = allOffers.filter(
          o => o.active === true && o.channel_code === 'WRT_ES_ONLINE'
        )

        // Capture first and second competitor total_price per channel
        // total_price = price + shipping (NOT plain price)
        resultMap.set(ean, {
          pt: {
            first: ptOffers[0]?.total_price ?? null,
            second: ptOffers[1]?.total_price ?? null,
          },
          es: {
            first: esOffers[0]?.total_price ?? null,
            second: esOffers[1]?.total_price ?? null,
          },
        })
      }

      processed += batchEans.length
    }

    // Call onProgress every PROGRESS_INTERVAL (500) EANs processed
    if (processed - lastProgressAt >= PROGRESS_INTERVAL) {
      onProgress?.(processed, total)
      lastProgressAt = processed
    }
  }

  return resultMap
}
