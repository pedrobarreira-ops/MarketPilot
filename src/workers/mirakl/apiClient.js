// src/workers/mirakl/apiClient.js
// Central Mirakl HTTP client. ALL Mirakl GET calls go through mirAklGet().
// apiKey is ALWAYS a function parameter — never stored at module level.

export class MiraklApiError extends Error {
  constructor(message, status) {
    super(message)
    this.name = 'MiraklApiError'
    this.status = status // HTTP status code (e.g. 429, 500); 0 for transport errors
  }
}

// Per-attempt delay schedule (ms). Max entry (16000) is already under the 30s
// per-delay cap the spec allows; Math.min(..., 30000) is defensive in case the
// schedule is ever extended.
const RETRY_DELAYS_MS = [1000, 2000, 4000, 8000, 16000]
const MAX_RETRIES = 5

function isRetryable(status) {
  return status === 429 || status >= 500
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, Math.min(ms, 30000)))
}

export async function mirAklGet(baseUrl, endpoint, params, apiKey) {
  const url = new URL(baseUrl + endpoint)
  for (const [k, v] of Object.entries(params ?? {})) {
    url.searchParams.set(k, String(v))
  }

  const headers = { 'X-Mirakl-Front-Api-Key': apiKey }

  let lastStatus = 0 // 0 signals transport-level failure (no HTTP status)
  let lastMessage
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    let res
    try {
      res = await fetch(url.toString(), { headers })
    } catch (err) {
      // Transport-level failure (DNS, connection reset, socket hang-up, etc.).
      // Treat as retryable so a transient network blip follows the same
      // backoff schedule as HTTP 5xx/429 rather than bubbling a raw TypeError.
      lastStatus = 0
      lastMessage = err && err.message ? err.message : 'network error'
      if (attempt < MAX_RETRIES) {
        await sleep(RETRY_DELAYS_MS[attempt])
        continue
      }
      break
    }

    if (res.ok) {
      return res.json()
    }

    lastStatus = res.status
    lastMessage = `HTTP ${res.status}`

    if (!isRetryable(res.status)) {
      // 4xx non-retryable: fail immediately
      throw new MiraklApiError(`Mirakl API error: HTTP ${res.status}`, res.status)
    }

    if (attempt < MAX_RETRIES) {
      await sleep(RETRY_DELAYS_MS[attempt])
    }
  }

  throw new MiraklApiError(
    `Mirakl API error after ${MAX_RETRIES} retries: ${lastMessage ?? 'unknown'}`,
    lastStatus
  )
}
