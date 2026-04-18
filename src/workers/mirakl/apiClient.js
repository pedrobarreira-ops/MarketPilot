// src/workers/mirakl/apiClient.js
// Central Mirakl HTTP client. ALL Mirakl GET calls go through mirAklGet().
// apiKey is ALWAYS a function parameter — never stored at module level.

export class MiraklApiError extends Error {
  constructor(message, status) {
    super(message)
    this.name = 'MiraklApiError'
    this.status = status // HTTP status code (e.g. 429, 500)
  }
}

const RETRY_DELAYS_MS = [1000, 2000, 4000, 8000, 16000] // max 30s cap applied per-entry
const MAX_RETRIES = 5

function isRetryable(status) {
  return status === 429 || status >= 500
}

export async function mirAklGet(baseUrl, endpoint, params, apiKey) {
  const url = new URL(baseUrl + endpoint)
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, String(v))
  }

  const headers = { 'X-Mirakl-Front-Api-Key': apiKey }

  let lastStatus
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const res = await fetch(url.toString(), { headers })

    if (res.ok) {
      return res.json()
    }

    lastStatus = res.status

    if (!isRetryable(res.status)) {
      // 4xx non-retryable: fail immediately
      throw new MiraklApiError(`Mirakl API error: HTTP ${res.status}`, res.status)
    }

    if (attempt < MAX_RETRIES) {
      const delay = Math.min(RETRY_DELAYS_MS[attempt], 30000)
      await new Promise(r => setTimeout(r, delay))
    }
  }

  throw new MiraklApiError(`Mirakl API error after ${MAX_RETRIES} retries: HTTP ${lastStatus}`, lastStatus)
}
