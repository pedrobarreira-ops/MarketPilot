// src/workers/mirakl/fetchCatalog.js
// Fetches the full active catalog from the Mirakl OF21 endpoint with pagination.
// Security: apiKey is a function parameter — never stored at module scope.
// Logs only safe fields — never api_key.

import { mirAklGet } from './apiClient.js'
import pino from 'pino'

const log = pino({ level: process.env.LOG_LEVEL || 'info' })

// ── Error classes ────────────────────────────────────────────────────────────

export class EmptyCatalogError extends Error {
  constructor(message) {
    super(message)
    this.name = 'EmptyCatalogError'
  }
}

export class CatalogTruncationError extends Error {
  constructor(message) {
    super(message)
    this.name = 'CatalogTruncationError'
  }
}

// ── fetchCatalog ─────────────────────────────────────────────────────────────

/**
 * Fetch the full active offer catalog from Mirakl using OF21 (GET /api/offers).
 *
 * Paginates with max=100 per page using offset-based pagination.
 * Filters for active offers only (offers.active === true — MCP-verified field).
 * Asserts fetched.length === total_count (NFR-R2 — no silent truncation).
 * Calls onProgress(n, total) every 1,000 offers.
 *
 * @param {string} baseUrl - Mirakl marketplace base URL
 * @param {string} apiKey - Mirakl API key (never logged)
 * @param {Function|undefined} onProgress - Optional callback(n, total)
 * @param {string} jobId - Job ID for safe logging
 * @returns {Promise<Array<{ean: string, shop_sku: string, price: string, product_title: string}>>}
 */
export async function fetchCatalog(baseUrl, apiKey, onProgress, jobId) {
  const PAGE_SIZE = 100
  const allOffers = []
  let offset = 0
  let total_count = null

  // Pagination loop — collect all pages
  while (true) {
    const data = await mirAklGet(baseUrl, '/api/offers', { max: PAGE_SIZE, offset }, apiKey)

    if (total_count === null && data.total_count != null) {
      total_count = data.total_count
    }

    const pageOffers = data.offers ?? []

    // Track boundary before pushing to detect 1,000-offer crossings
    const prevCount = allOffers.length
    allOffers.push(...pageOffers)
    const newCount = allOffers.length

    // AC-4: call onProgress at 1,000-offer boundaries
    if (onProgress && total_count !== null) {
      const prevBucket = Math.floor(prevCount / 1000)
      const newBucket = Math.floor(newCount / 1000)
      if (newBucket > prevBucket) {
        onProgress(newCount, total_count)
      }
    }

    // End-of-results signal: fewer offers than max means this was the last page
    if (pageOffers.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }

  // AC-6: genuinely empty catalog — API explicitly reports 0 offers
  if (total_count === 0) {
    throw new EmptyCatalogError(
      'Não encontrámos ofertas activas no teu catálogo. Verifica se a tua conta está activa no Worten.'
    )
  }

  // AC-2: assert no silent truncation (NFR-R2) — compare raw page count against
  // total_count BEFORE active filter, because total_count reflects all offers (no
  // server-side active filter exists on OF21). Verified against MCP 2026-04-18.
  // Guard: skip if total_count is null (API omitted the field — cannot assert).
  if (total_count !== null && allOffers.length !== total_count) {
    log.error({
      job_id: jobId,
      fetched: allOffers.length,
      declared: total_count,
      error_type: 'CatalogTruncationError',
    })
    throw new CatalogTruncationError('Catálogo obtido parcialmente. Tenta novamente.')
  }

  // AC-3: filter for active offers only — MCP-verified field: offers.active (boolean)
  // NOT offers.state — 'state' is not a documented OF21 response field. Verified 2026-04-18.
  const activeOffers = allOffers.filter(offer => offer.active === true)

  // AC-6: empty after active filter (covers: all offers inactive, or allOffers was empty
  // because total_count was null and pages returned nothing)
  if (activeOffers.length === 0) {
    throw new EmptyCatalogError(
      'Não encontrámos ofertas activas no teu catálogo. Verifica se a tua conta está activa no Worten.'
    )
  }

  // AC-5: map to [{ean, shop_sku, price, product_title}], skip offers without EAN
  const catalog = activeOffers.reduce((acc, offer) => {
    const eanRef = (offer.product_references ?? []).find(r => r.reference_type === 'EAN')
    const ean = eanRef?.reference
    if (!ean) return acc // skip offers with no EAN
    acc.push({
      ean,
      shop_sku: offer.shop_sku,
      price: offer.applicable_pricing?.price,
      product_title: offer.product_title,
    })
    return acc
  }, [])

  return catalog
}
