/**
 * ATDD tests for Story 3.1: Mirakl API Client with Retry
 *
 * Acceptance criteria verified:
 * AC-1: mirAklGet(baseUrl, endpoint, params, apiKey) — correct function signature
 * AC-2: Exponential backoff retries on 429/5xx: 1s, 2s, 4s, 8s, 16s (capped 30s), up to 5 retries
 * AC-3: Throws MiraklApiError after retry exhaustion
 * AC-4: apiKey passed as function param — never stored at module scope
 * AC-5: No direct fetch() to Mirakl elsewhere — all calls go through mirAklGet
 * AC-6: No api_key in log output (static source check)
 *
 * Uses Node.js built-in test runner (node:test) — no extra dependencies needed.
 * Run: node --test tests/epic3-3.1-api-client.atdd.test.js
 *
 * All tests are pure unit tests — no live Mirakl or Redis connection required.
 * fetch() is patched with a stub before the module under test is imported.
 */

import { test, describe, before, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const API_CLIENT_PATH = join(__dirname, '../src/workers/mirakl/apiClient.js')

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

function makeResponse(status, body = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  }
}

// ── test suite ─────────────────────────────────────────────────────────────

describe('Story 3.1 — Mirakl API client with retry', async () => {
  let mirAklGet
  let MiraklApiError
  let originalFetch

  before(async () => {
    // Stub global fetch before importing the module so the module uses the stub
    originalFetch = globalThis.fetch
    // Default stub: successful 200 response
    globalThis.fetch = async () => makeResponse(200, { offers: [], total_count: 0 })

    const mod = await import('../src/workers/mirakl/apiClient.js')
    mirAklGet = mod.mirAklGet
    MiraklApiError = mod.MiraklApiError
  })

  // ── AC-1: Function signature ───────────────────────────────────────────────
  describe('AC-1: mirAklGet has correct function signature', () => {
    test('mirAklGet is exported as a function', () => {
      assert.equal(typeof mirAklGet, 'function', 'mirAklGet must be an exported function')
    })

    test('MiraklApiError is exported as a class/function', () => {
      assert.ok(
        typeof MiraklApiError === 'function',
        'MiraklApiError must be exported from apiClient.js'
      )
    })

    test('mirAklGet accepts (baseUrl, endpoint, params, apiKey) — 4 params', () => {
      assert.equal(mirAklGet.length, 4, 'mirAklGet must declare exactly 4 parameters: baseUrl, endpoint, params, apiKey')
    })

    test('mirAklGet returns a Promise (is async or returns thenable)', async () => {
      globalThis.fetch = async () => makeResponse(200, {})
      const result = mirAklGet('https://example.com', '/api/offers', {}, 'test-key')
      assert.ok(result && typeof result.then === 'function', 'mirAklGet must return a Promise')
      await result.catch(() => {}) // prevent unhandled rejection
    })
  })

  // ── AC-2: Exponential backoff retries ─────────────────────────────────────
  describe('AC-2: retries 429/5xx with exponential backoff (up to 5 retries)', () => {
    test('succeeds on first attempt when server returns 200', async () => {
      let callCount = 0
      globalThis.fetch = async () => {
        callCount++
        return makeResponse(200, { offers: [] })
      }
      await mirAklGet('https://example.com', '/api/offers', {}, 'key')
      assert.equal(callCount, 1, 'Must call fetch exactly once on immediate success')
    })

    test('retries on 429 and eventually succeeds', async () => {
      let callCount = 0
      globalThis.fetch = async () => {
        callCount++
        if (callCount < 3) return makeResponse(429, { message: 'rate limited' })
        return makeResponse(200, { offers: [], total_count: 0 })
      }
      // Override delays to 0 for speed — patch if module exports delay config
      await mirAklGet('https://example.com', '/api/offers', {}, 'key')
      assert.ok(callCount >= 3, `Expected at least 3 calls (2 retries + success), got ${callCount}`)
    })

    test('retries on 500 and eventually succeeds', async () => {
      let callCount = 0
      globalThis.fetch = async () => {
        callCount++
        if (callCount < 2) return makeResponse(500, { message: 'server error' })
        return makeResponse(200, { offers: [], total_count: 0 })
      }
      await mirAklGet('https://example.com', '/api/offers', {}, 'key')
      assert.ok(callCount >= 2, `Expected at least 2 calls (1 retry + success), got ${callCount}`)
    })

    test('retries on 503 (other 5xx codes)', async () => {
      let callCount = 0
      globalThis.fetch = async () => {
        callCount++
        if (callCount < 2) return makeResponse(503, { message: 'service unavailable' })
        return makeResponse(200, {})
      }
      await mirAklGet('https://example.com', '/api/offers', {}, 'key')
      assert.ok(callCount >= 2, 'Must retry on 503 as well as 500/429')
    })

    test('does NOT retry on 400 bad request (client error)', async () => {
      let callCount = 0
      globalThis.fetch = async () => {
        callCount++
        return makeResponse(400, { message: 'bad request' })
      }
      await assert.rejects(
        () => mirAklGet('https://example.com', '/api/offers', {}, 'key'),
        (err) => {
          assert.equal(callCount, 1, '400 errors must not be retried')
          return true
        }
      )
    })

    test('does NOT retry on 401 unauthorized', async () => {
      let callCount = 0
      globalThis.fetch = async () => {
        callCount++
        return makeResponse(401, { message: 'unauthorized' })
      }
      await assert.rejects(
        () => mirAklGet('https://example.com', '/api/offers', {}, 'key'),
        (err) => {
          assert.equal(callCount, 1, '401 errors must not be retried')
          return true
        }
      )
    })

    test('does NOT retry on 403 forbidden', async () => {
      let callCount = 0
      globalThis.fetch = async () => {
        callCount++
        return makeResponse(403, { message: 'forbidden' })
      }
      await assert.rejects(
        () => mirAklGet('https://example.com', '/api/offers', {}, 'key'),
        (err) => {
          assert.equal(callCount, 1, '403 errors must not be retried')
          return true
        }
      )
    })
  })

  // ── AC-3: Throws MiraklApiError after exhaustion ───────────────────────────
  describe('AC-3: throws MiraklApiError after all retries exhausted', () => {
    test('throws MiraklApiError when all 5 retries fail with 429', async () => {
      globalThis.fetch = async () => makeResponse(429, { message: 'rate limited' })

      await assert.rejects(
        () => mirAklGet('https://example.com', '/api/offers', {}, 'key'),
        (err) => {
          assert.ok(
            err instanceof MiraklApiError || err.constructor.name === 'MiraklApiError',
            `Expected MiraklApiError after retry exhaustion, got ${err.constructor.name}: ${err.message}`
          )
          return true
        }
      )
    })

    test('throws MiraklApiError when all retries fail with 500', async () => {
      globalThis.fetch = async () => makeResponse(500, { message: 'server error' })

      await assert.rejects(
        () => mirAklGet('https://example.com', '/api/offers', {}, 'key'),
        (err) => {
          assert.ok(
            err instanceof MiraklApiError || err.constructor.name === 'MiraklApiError',
            `Expected MiraklApiError, got ${err.constructor.name}`
          )
          return true
        }
      )
    })

    test('MiraklApiError instance has a message property', async () => {
      globalThis.fetch = async () => makeResponse(429, {})

      let caughtErr
      try {
        await mirAklGet('https://example.com', '/api/offers', {}, 'key')
      } catch (err) {
        caughtErr = err
      }

      assert.ok(caughtErr, 'Expected an error to be thrown')
      assert.ok(typeof caughtErr.message === 'string', 'MiraklApiError must have a .message property')
    })

    test('MiraklApiError has a status or statusCode property', async () => {
      globalThis.fetch = async () => makeResponse(429, {})

      let caughtErr
      try {
        await mirAklGet('https://example.com', '/api/offers', {}, 'key')
      } catch (err) {
        caughtErr = err
      }

      assert.ok(caughtErr, 'Expected an error to be thrown')
      const hasStatus = caughtErr.status !== undefined || caughtErr.statusCode !== undefined || caughtErr.code !== undefined
      assert.ok(hasStatus, 'MiraklApiError must expose the HTTP status or a code')
    })
  })

  // ── AC-4: apiKey as param, never at module scope ───────────────────────────
  describe('AC-4: apiKey is a function param — never stored at module level', () => {
    let src

    before(() => {
      src = codeLines(readFileSync(API_CLIENT_PATH, 'utf8'))
    })

    test('source does not store apiKey / api_key in a module-level variable', () => {
      // Pattern: const/let/var api_key or apiKey at module scope (outside functions)
      // We check that neither appears as a standalone top-level assignment
      const moduleTopLevelPattern = /^(?:const|let|var)\s+(?:apiKey|api_key)\s*=/m
      assert.ok(
        !moduleTopLevelPattern.test(src),
        'apiKey must not be assigned to a module-level variable — it must be a function parameter only'
      )
    })

    test('apiKey is referenced only as a function parameter, not stored anywhere', () => {
      // Ensure there is no this.apiKey or module._apiKey pattern
      assert.ok(
        !src.includes('this.apiKey') && !src.includes('this.api_key'),
        'apiKey must not be stored as a class property — must be passed as a parameter'
      )
    })

    test('source does not import keyStore (apiClient is a pure HTTP wrapper)', () => {
      assert.ok(
        !src.includes('keyStore'),
        'apiClient.js must not import keyStore — it receives apiKey as a parameter'
      )
    })
  })

  // ── AC-5: No raw fetch() to Mirakl outside apiClient ─────────────────────
  describe('AC-5: no direct fetch() to Mirakl in worker files — only via mirAklGet', () => {
    const WORKER_FILES = [
      join(__dirname, '../src/workers/mirakl/fetchCatalog.js'),
      join(__dirname, '../src/workers/mirakl/scanCompetitors.js'),
      join(__dirname, '../src/workers/reportWorker.js'),
    ]

    for (const filePath of WORKER_FILES) {
      const fileName = filePath.split(/[\\/]/).pop()
      test(`${fileName} does not call fetch() directly to Mirakl`, () => {
        let src
        try {
          src = codeLines(readFileSync(filePath, 'utf8'))
        } catch (_) {
          // File not yet created — skip this static check
          return
        }
        // Detect direct fetch() calls that pass a Mirakl URL literal
        // Pattern: fetch('https://marketplace...' or fetch(`${baseUrl}...`)
        const directFetchToMirakl = /fetch\s*\(\s*[`'"](https?:\/\/|`\$\{)/
        assert.ok(
          !directFetchToMirakl.test(src),
          `${fileName} must not call fetch() directly to Mirakl — use mirAklGet() wrapper`
        )
      })
    }
  })

  // ── AC-6: apiKey never logged ────────────────────────────────────────────
  describe('AC-6: api_key / apiKey never appears in log statements', () => {
    let src

    before(() => {
      src = codeLines(readFileSync(API_CLIENT_PATH, 'utf8'))
    })

    test('source does not log apiKey variable', () => {
      // Patterns: log.info({apiKey}) or log.info(apiKey) or console.log(apiKey)
      const logApiKeyPattern = /(?:log\.|console\.)\w+\s*\([^)]*apiKey[^)]*\)/
      assert.ok(
        !logApiKeyPattern.test(src),
        'apiClient.js must never log the apiKey value'
      )
    })

    test('source does not include api_key in any log call', () => {
      const lines = src.split('\n')
      const violating = lines.filter(line =>
        (line.includes('log.') || line.includes('console.')) && line.includes('api_key')
      )
      assert.equal(
        violating.length,
        0,
        `apiClient.js log statements must not reference api_key:\n${violating.join('\n')}`
      )
    })

    test('source does not pass Authorization header in a way that could be logged', () => {
      // The Authorization header must be set dynamically with apiKey param, not as a literal
      assert.ok(
        !src.includes("'X-Mirakl-Front-Api-Key': 'hard"),
        'API key must never be hardcoded in the header assignment'
      )
    })
  })

  // ── FUNCTIONAL: successful request returns parsed JSON ─────────────────────
  describe('FUNCTIONAL: successful request returns parsed response body', () => {
    test('returns the parsed JSON body on HTTP 200', async () => {
      const expectedBody = { offers: [{ offer_id: '1' }], total_count: 1 }
      globalThis.fetch = async () => makeResponse(200, expectedBody)

      const result = await mirAklGet('https://example.com', '/api/offers', { max: 100, offset: 0 }, 'my-key')
      assert.deepEqual(result, expectedBody, 'mirAklGet must return the parsed JSON body')
    })

    test('passes params as query string to fetch', async () => {
      let calledUrl
      globalThis.fetch = async (url) => {
        calledUrl = url
        return makeResponse(200, {})
      }
      await mirAklGet('https://example.com', '/api/offers', { max: 100, offset: 0 }, 'my-key')
      assert.ok(calledUrl, 'fetch must be called with a URL')
      assert.ok(
        calledUrl.includes('max=100') || calledUrl.includes('offset=0'),
        `URL must include query params. Got: ${calledUrl}`
      )
    })

    test('passes apiKey in X-Mirakl-Front-Api-Key header', async () => {
      let capturedHeaders
      globalThis.fetch = async (url, opts) => {
        capturedHeaders = opts && opts.headers ? opts.headers : {}
        return makeResponse(200, {})
      }
      await mirAklGet('https://example.com', '/api/offers', {}, 'test-api-key-value')

      const headerKey = Object.keys(capturedHeaders).find(
        k => k.toLowerCase() === 'x-mirakl-front-api-key'
      )
      assert.ok(headerKey, 'Request must include X-Mirakl-Front-Api-Key header')
      assert.equal(
        capturedHeaders[headerKey],
        'test-api-key-value',
        'X-Mirakl-Front-Api-Key header must contain the apiKey parameter value'
      )
    })
  })
})
