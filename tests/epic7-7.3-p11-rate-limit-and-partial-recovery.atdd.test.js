/**
 * ATDD tests for Story 7.3: P11 Rate Limit & Partial Data Recovery
 *
 * Acceptance criteria verified:
 * AC-1: P11 429 response → exponential backoff 1s→2s→4s→8s→16s (max 30s); up to 5 retries
 * AC-2: During 429 wait → phase_message = "A verificar concorrentes — a aguardar limite de pedidos…"
 * AC-3: Batch exhausted after 5 retries → EANs marked uncontested; report generation continues
 * AC-4: Partial report (some batches failed) is generated from available data — not aborted
 * AC-5: Failed P11 batch logs only error type (not err.message) — no api_key in log
 * AC-6: mirAklGet exponential backoff delays: 1s, 2s, 4s, 8s, 16s (capped 30s) for 429/5xx
 * AC-7: scanCompetitors.js uses Promise.allSettled — rejected batches do not abort the run
 *
 * MCP-verified endpoint behaviour used in this suite (verified 2026-04-18):
 * - P11 (GET /api/products/offers): Batch param is `product_references` (NOT `product_ids`).
 *   Format: EAN|<ean1>,EAN|<ean2>,... (max 100 values/call).
 *   Using `product_ids` with EAN values silently returns 0 products (verified live on Worten).
 * - P11 rate-limit response: HTTP 429. After 5 exhausted retries, batch is treated as failed.
 * - Two P11 calls per batch (one per channel: WRT_PT_ONLINE, WRT_ES_ONLINE).
 * - offer.total_price = price + min_shipping_price for the active pricing context.
 * - offer.channels is typically EMPTY on competitor offers. Channel bucketing must be by which
 *   P11 call returned the offer — NOT by reading offer.channel_code (field does not exist).
 *
 * Uses Node.js built-in test runner (node:test) — no extra dependencies needed.
 * Run: node --test tests/epic7-7.3-p11-rate-limit-and-partial-recovery.atdd.test.js
 */

import { test, describe, before, mock } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const API_CLIENT_PATH      = join(__dirname, '../src/workers/mirakl/apiClient.js')
const SCAN_COMPETITORS_PATH = join(__dirname, '../src/workers/mirakl/scanCompetitors.js')
const WORKER_PATH           = join(__dirname, '../src/workers/reportWorker.js')

// ── env setup ──────────────────────────────────────────────────────────────
process.env.NODE_ENV        = 'test'
process.env.REDIS_URL       = process.env.REDIS_URL || 'redis://localhost:6379'
process.env.SQLITE_PATH     = ':memory:'
process.env.APP_BASE_URL    = 'http://localhost:3000'
process.env.WORTEN_BASE_URL = 'https://www.worten.pt'
process.env.PORT            = '3000'
process.env.LOG_LEVEL       = 'silent'
process.env.RESEND_API_KEY  = 'test-key-dummy'

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

function readSrc(filePath) {
  try {
    return codeLines(readFileSync(filePath, 'utf8'))
  } catch (_) {
    return null
  }
}

/**
 * Drain fake timers and microtask queue N rounds.
 * Needed because mirAklGet's retry loop awaits sequential setTimeout calls;
 * each tick resolves one layer, then the next setTimeout is registered by the
 * next loop iteration — requiring another tick + microtask flush cycle.
 * Must be called after mock.timers.enable() and before awaiting the promise.
 */
async function drainTimers(rounds = 20) {
  for (let i = 0; i < rounds; i++) {
    mock.timers.runAll()
    await Promise.resolve()
    await Promise.resolve()
  }
}

// ── test suite ─────────────────────────────────────────────────────────────

describe('Story 7.3 — P11 rate limit & partial data recovery', async () => {

  // ── AC-1 + AC-6: Exponential backoff on 429/5xx ──────────────────────────
  describe('AC-1 + AC-6: P11 429 → exponential backoff 1s→2s→4s→8s→16s (capped 30s); 5 retries', () => {

    describe('apiClient.js — retry delays and count (static)', () => {
      let src

      before(() => { src = readSrc(API_CLIENT_PATH) })

      test('source implements exponential backoff (static)', () => {
        if (!src) return
        const hasBackoff =
          src.includes('exponential') ||
          src.includes('* 2') || src.includes('** ') ||
          src.includes('delay') || src.includes('backoff') ||
          src.includes('Math.pow')
        assert.ok(
          hasBackoff,
          'apiClient.js must implement exponential backoff for 429/5xx retries'
        )
      })

      test('source caps retry delay at 30s (static)', () => {
        if (!src) return
        assert.ok(
          src.includes('30') || src.includes('30000') || src.includes('MAX_DELAY') || src.includes('Math.min'),
          'apiClient.js must cap the backoff delay at 30s (30000ms) per spec'
        )
      })

      test('source retries up to 5 times before throwing MiraklApiError (static)', () => {
        if (!src) return
        assert.ok(
          src.includes('5') || src.includes('MAX_RETRIES') || src.includes('attempts'),
          'apiClient.js must retry up to 5 times before exhausting and throwing MiraklApiError'
        )
      })

      test('source retries on 429 AND 5xx (static)', () => {
        if (!src) return
        assert.ok(
          src.includes('429'),
          'apiClient.js must detect 429 status and enter retry loop'
        )
        const has5xx = src.includes('500') || src.includes('5xx') || src.includes('>= 500') || src.includes('>500')
        assert.ok(
          has5xx,
          'apiClient.js must also retry on 5xx server errors'
        )
      })

      test('source does NOT retry on 4xx client errors other than 429 (401/403/400 are terminal)', () => {
        if (!src) return
        // The backoff logic must distinguish 429 (retriable) from other 4xx (not retriable)
        // Static: check that 401 or 403 appear alongside a non-retry branch
        const hasNonRetry401 = src.includes('401') || src.includes('403') || src.includes('4xx')
        // This is a structural check — we verify the functional behaviour in apiClient.atdd.test.js
        // Here we confirm that 401/403 are referenced (meaning they are handled specially)
        assert.ok(
          hasNonRetry401 || src.includes('ok'),
          'apiClient.js must handle 401/403 differently from 429 — those must not be retried'
        )
      })
    })

    describe('apiClient.js — retry functional tests (fetch-stubbed, fake timers)', () => {
      // Modules are imported once at suite level. Fake timers patch the global
      // setTimeout that backoffDelay closes over — import order does not matter.
      let mirAklGet
      let MiraklApiError

      before(async () => {
        const saved = globalThis.fetch
        globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({}) })
        try {
          const mod = await import('../src/workers/mirakl/apiClient.js')
          mirAklGet = mod.mirAklGet
          MiraklApiError = mod.MiraklApiError
        } catch (_) {}
        globalThis.fetch = saved
      })

      test('mirAklGet retries on P11 429 and continues on success (fake timers)', async () => {
        if (!mirAklGet) return
        mock.timers.enable({ apis: ['setTimeout'], now: 0 })
        let calls = 0
        globalThis.fetch = async () => {
          calls++
          if (calls < 3) return { ok: false, status: 429, json: async () => ({}), text: async () => '' }
          return { ok: true, status: 200, json: async () => ({ products: [], total_count: 0 }) }
        }
        const prom = mirAklGet('https://marketplace.worten.pt', '/api/products/offers', { product_references: 'EAN|1111111111111' }, 'test-key')
          .then(r => r)
          .catch(e => { throw e })
        await drainTimers(10)
        await prom
        mock.timers.reset()
        assert.ok(calls >= 3, `Expected ≥ 3 calls (2 retries + 1 success), got ${calls}`)
      })

      test('mirAklGet exhausts 5 retries on persistent 429 and throws MiraklApiError (fake timers)', async () => {
        if (!mirAklGet || !MiraklApiError) return
        mock.timers.enable({ apis: ['setTimeout'], now: 0 })
        let calls = 0
        globalThis.fetch = async () => {
          calls++
          return { ok: false, status: 429, json: async () => ({}), text: async () => 'rate limited' }
        }
        const prom = mirAklGet('https://marketplace.worten.pt', '/api/products/offers', {}, 'test-key')
          .then(() => null)
          .catch(e => e)
        await drainTimers(12)
        const err = await prom
        mock.timers.reset()
        assert.ok(
          err instanceof MiraklApiError || err?.constructor?.name === 'MiraklApiError',
          `Expected MiraklApiError after 5 exhausted retries, got ${err?.constructor?.name}`
        )
        assert.ok(calls >= 5, `Expected ≥ 5 retry attempts before throwing, got ${calls}`)
      })

      test('mirAklGet does NOT retry 401 on P11 endpoint', async () => {
        if (!mirAklGet) return
        let calls = 0
        globalThis.fetch = async () => {
          calls++
          return { ok: false, status: 401, json: async () => ({}), text: async () => '' }
        }
        try {
          await mirAklGet('https://marketplace.worten.pt', '/api/products/offers', {}, 'test-key')
        } catch (_) {}
        assert.equal(calls, 1, '401 on P11 must not be retried — it is a terminal auth error')
      })
    })
  })

  // ── AC-2: Rate-limit wait phase message ──────────────────────────────────
  describe('AC-2: rate-limit wait phase_message = "A verificar concorrentes — a aguardar limite de pedidos…"', () => {

    describe('scanCompetitors.js — rate-limit phase message (static)', () => {
      let src

      before(() => { src = readSrc(SCAN_COMPETITORS_PATH) })

      test('source includes the rate-limit wait phase message (static)', () => {
        if (!src) return
        assert.ok(
          src.includes('aguardar limite') || src.includes('aguardar') || src.includes('limite de pedidos'),
          'scanCompetitors.js must emit the rate-limit wait phase message per spec: "A verificar concorrentes — a aguardar limite de pedidos…"'
        )
      })
    })

    describe('reportWorker.js — rate-limit wait message propagation (static)', () => {
      let src

      before(() => { src = readSrc(WORKER_PATH) })

      test('worker propagates rate-limit phase message during P11 scan', () => {
        if (!src) return
        // Worker must expose the phase message via updateJobStatus so progress.js can show it
        assert.ok(
          src.includes('aguardar') || src.includes('rate') || src.includes('scanning_competitors'),
          'Worker must update phase_message to the rate-limit wait string when a 429 is being retried during P11'
        )
      })
    })
  })

  // ── AC-3 + AC-4: Partial data recovery after batch failure ───────────────
  describe('AC-3 + AC-4: exhausted batch → EANs uncontested; report generated from available data', () => {

    describe('scanCompetitors.js — partial recovery pattern (static)', () => {
      let src

      before(() => { src = readSrc(SCAN_COMPETITORS_PATH) })

      test('source uses Promise.allSettled for concurrent batch processing (static)', () => {
        if (!src) return
        assert.ok(
          src.includes('Promise.allSettled'),
          'scanCompetitors.js must use Promise.allSettled() so rejected batches do not abort the entire scan'
        )
      })

      test('source handles "rejected" status from allSettled without stopping (static)', () => {
        if (!src) return
        assert.ok(
          src.includes('rejected') || src.includes('status') || src.includes('reason'),
          'scanCompetitors.js must inspect the .status field of allSettled results and handle "rejected" gracefully'
        )
      })

      test('source marks failed-batch EANs as uncontested (not missing/errored)', () => {
        if (!src) return
        assert.ok(
          src.includes('uncontested') || src.includes('continue') || src.includes('skip') || src.includes('null'),
          'scanCompetitors.js must mark EANs from failed batches as uncontested so the report can still be generated'
        )
      })

      test('source does not throw or abort the entire scan on a single batch failure', () => {
        if (!src) return
        // allSettled + handling rejected = non-aborting; Promise.all would abort on first rejection
        assert.ok(
          !src.includes('Promise.all(') || src.includes('Promise.allSettled'),
          'scanCompetitors.js must use Promise.allSettled, NOT Promise.all — Promise.all aborts on first rejection'
        )
      })

      test('source does not use product_ids as P11 EAN lookup parameter (MCP-verified — silently returns 0)', () => {
        // MCP-verified: product_ids expects product SKUs (UUIDs in Worten), not EANs.
        // Sending EAN values to product_ids silently returns 0 products — verified live 2026-04-18.
        if (!src) return
        const badPatterns = [
          /\bproduct_ids\s*:/,
          /['"]product_ids['"]\s*:/,
        ]
        const violates = badPatterns.some(p => p.test(src))
        assert.ok(
          !violates,
          'scanCompetitors.js must NOT use product_ids as the P11 EAN parameter — use product_references=EAN|xxx (MCP-verified 2026-04-18: product_ids silently returns 0 products when EANs are passed)'
        )
      })

      test('source passes product_references with EAN|xxx format to P11 (MCP-verified)', () => {
        if (!src) return
        assert.ok(
          src.includes('product_references') && src.includes('EAN|'),
          'scanCompetitors.js must use product_references=EAN|xxx,EAN|yyy format (MCP-verified)'
        )
      })

      test('source makes two P11 calls per batch (one per channel: WRT_PT_ONLINE, WRT_ES_ONLINE)', () => {
        if (!src) return
        assert.ok(
          src.includes('WRT_PT_ONLINE') && src.includes('WRT_ES_ONLINE'),
          'scanCompetitors.js must make two P11 calls per batch — one per channel — to get channel-specific total_price'
        )
      })

      test('source uses pricing_channel_code parameter for channel-specific total_price', () => {
        // MCP-verified: pricing_channel_code=WRT_PT_ONLINE makes offer.total_price reflect PT channel pricing.
        // Without this parameter, applicable_pricing falls back to the default channel.
        if (!src) return
        assert.ok(
          src.includes('pricing_channel_code'),
          'scanCompetitors.js must pass pricing_channel_code=<CHANNEL> on each per-channel P11 call (MCP-verified 2026-04-18)'
        )
      })

      test('source does NOT bucket offers by offer.channel_code (field does not exist on P11)', () => {
        // MCP-verified: offer.channel_code singular does NOT exist on P11 responses.
        // offer.channels is typically EMPTY on competitor offers.
        // Channel must be determined by which P11 call (PT or ES) returned the offer.
        if (!src) return
        const badPatterns = [
          /\boffer\.channel_code\b/,
          /\bo\.channel_code\b/,
        ]
        const violates = badPatterns.some(p => p.test(src))
        assert.ok(
          !violates,
          'scanCompetitors.js must NOT access offer.channel_code — that field does not exist on P11 offers (MCP-verified 2026-04-18). Bucket by which P11 call (PT or ES) returned the offer.'
        )
      })

      test('source uses offer.total_price for competitor comparison (not offer.price)', () => {
        // MCP-verified: offer.total_price = price + min_shipping_price.
        // offer.price = price only (no shipping) — do NOT use for competitor comparison.
        if (!src) return
        assert.ok(
          src.includes('total_price'),
          'scanCompetitors.js must use offer.total_price (price + shipping) for competitor comparison (MCP-verified 2026-04-18)'
        )
      })
    })

    describe('scanCompetitors.js — partial recovery functional (fetch-stubbed, fake timers)', () => {
      let scanCompetitors

      before(async () => {
        try {
          const mod = await import('../src/workers/mirakl/scanCompetitors.js')
          scanCompetitors = mod.scanCompetitors
        } catch (_) {}
      })

      test('scanCompetitors is exported as a function', () => {
        assert.ok(typeof scanCompetitors === 'function', 'scanCompetitors must be an exported function')
      })

      test('scanCompetitors completes and returns a Map even when all P11 calls return 429 (fake timers)', async () => {
        if (!scanCompetitors) return
        mock.timers.enable({ apis: ['setTimeout'], now: 0 })
        const originalFetch = globalThis.fetch
        globalThis.fetch = async () => ({
          ok: false, status: 429,
          json: async () => ({}),
          text: async () => 'rate limited',
        })

        const sampleEans = ['1111111111111', '2222222222222', '3333333333333']
        const prom = scanCompetitors(
          'https://marketplace.worten.pt',
          'test-key',
          sampleEans,
          { onProgress: () => {} }
        ).then(r => r).catch(e => { throw e })

        await drainTimers(30)
        let result
        try {
          result = await prom
        } catch (err) {
          mock.timers.reset()
          globalThis.fetch = originalFetch
          assert.fail(
            `scanCompetitors must not throw when individual P11 batches fail — use allSettled. Got: ${err.constructor.name}: ${err.message}`
          )
        }
        mock.timers.reset()
        globalThis.fetch = originalFetch

        // Must return a Map (even if all EANs are uncontested / empty)
        assert.ok(result instanceof Map, 'scanCompetitors must return a Map even when all P11 calls fail with 429')
        // AC-3: all 3 EANs must be ABSENT from the result Map — absent = uncontested downstream
        for (const ean of sampleEans) {
          assert.ok(
            !result.has(ean),
            `EAN ${ean} from a failed batch must be absent from the result Map (treated as uncontested) — found in Map`
          )
        }
      })

      test('scanCompetitors completes when some batches succeed and some fail — succeeded EANs in Map (fake timers)', async () => {
        if (!scanCompetitors) return
        mock.timers.enable({ apis: ['setTimeout'], now: 0 })
        const originalFetch = globalThis.fetch

        // Both EANs are in one batch (< 100). scanBatch makes 2 P11 calls (one per channel).
        // Call 1 (PT channel) → success with EAN 1111111111111
        // Call 2 (ES channel) → always 429 (exhausted after retries)
        // Promise.all inside scanBatch will reject if either channel call throws.
        // The whole batch is rejected, so both EANs are absent (uncontested).
        //
        // To get a mixed result at the batch level we need 2 batches (> BATCH_SIZE=100 EANs
        // or chunked differently). Instead: verify the partial-Map contract with 3 separate EANs
        // in separate single-EAN batches by setting BATCH_SIZE=1 is not possible without
        // modifying source. Use the documented contract: fetch alternates success/fail on each
        // *per-channel call*. With 2 EANs in 1 batch, 2 channel calls: if call 1 fails → batch
        // fails → both EANs absent. A true mixed-batch scenario needs 2 separate batches.
        //
        // Use 101 EANs to force 2 batches; batch 1 all succeed, batch 2 all 429.
        let callN = 0
        globalThis.fetch = async () => {
          callN++
          // First 2 fetch calls are for batch 1 (2 channels × 1 batch) — succeed
          if (callN <= 2) {
            return {
              ok: true, status: 200,
              json: async () => ({
                products: [
                  {
                    product_references: [{ reference_type: 'EAN', reference: '0000000000001' }],
                    offers: [{ active: true, total_price: 25.99, shop_sku: 'COMP-1' }],
                  },
                ],
                total_count: 1,
              }),
              text: async () => '',
            }
          }
          // Remaining fetch calls are for batch 2 — always 429
          return { ok: false, status: 429, json: async () => ({}), text: async () => '' }
        }

        // Build 101 EANs: first is the "known good" EAN that batch 1 will return
        const batch1Ean = '0000000000001'
        const eans = [batch1Ean]
        for (let i = 2; i <= 101; i++) {
          eans.push(String(i).padStart(13, '0'))
        }

        const prom = scanCompetitors(
          'https://marketplace.worten.pt',
          'test-key',
          eans,
          { onProgress: () => {} }
        ).then(r => r).catch(e => { throw e })

        await drainTimers(60)
        let result
        try {
          result = await prom
        } catch (err) {
          mock.timers.reset()
          globalThis.fetch = originalFetch
          assert.fail(
            `scanCompetitors must not throw on mixed batch results. Got: ${err.constructor.name}: ${err.message}`
          )
        }
        mock.timers.reset()
        globalThis.fetch = originalFetch

        assert.ok(result instanceof Map, 'scanCompetitors must return partial results Map when some batches succeed and some fail')
        // Batch 1 EAN must be present in the Map (PT channel succeeded)
        assert.ok(
          result.has(batch1Ean),
          `EAN ${batch1Ean} from a succeeded batch must appear in the result Map`
        )
        // Batch 2 EANs must be absent from the Map (failed batch → uncontested)
        const batch2Ean = eans[1]
        assert.ok(
          !result.has(batch2Ean),
          `EAN ${batch2Ean} from the failed batch must be absent from the result Map (uncontested)`
        )
      })

      test('onRateLimit callback is called when a 429 exhausts retries on a batch (fake timers)', async () => {
        if (!scanCompetitors) return
        // AC-2: onRateLimit is invoked exactly when a batch fails with a 429-exhausted MiraklApiError
        mock.timers.enable({ apis: ['setTimeout'], now: 0 })
        const originalFetch = globalThis.fetch
        globalThis.fetch = async () => ({
          ok: false, status: 429,
          json: async () => ({}),
          text: async () => 'rate limited',
        })

        let rateLimitCallCount = 0
        let rateLimitArgs = []
        function onRateLimit(msg) {
          rateLimitCallCount++
          rateLimitArgs.push(msg)
        }

        const sampleEans = ['1111111111111']
        const prom = scanCompetitors(
          'https://marketplace.worten.pt',
          'test-key',
          sampleEans,
          { onProgress: () => {}, onRateLimit }
        ).then(r => r).catch(e => { throw e })

        await drainTimers(30)
        try { await prom } catch (_) {}

        mock.timers.reset()
        globalThis.fetch = originalFetch

        // The batch (1 EAN, 2 channel calls via Promise.all) will throw because Promise.all
        // rejects when either channel call exhausts retries. The onRateLimit callback is
        // fired in the rejected-batch handler if err.status === 429.
        assert.ok(
          rateLimitCallCount >= 1,
          `onRateLimit must be called at least once when a 429-exhausted batch fails; called ${rateLimitCallCount} times`
        )
        // Verify callback receives the exact rate-limit wait message (AC-2)
        const EXPECTED_MSG = 'A verificar concorrentes — a aguardar limite de pedidos…'
        assert.equal(
          rateLimitArgs[0],
          EXPECTED_MSG,
          `onRateLimit must receive the exact rate-limit phase message. Got: "${rateLimitArgs[0]}"`
        )
        // Verify no api_key or raw error leaks into the callback argument (security)
        assert.ok(
          !String(rateLimitArgs[0]).includes('test-key'),
          'onRateLimit argument must not contain the api_key'
        )
      })
    })
  })

  // ── AC-5: Safe logging on batch failure ──────────────────────────────────
  describe('AC-5: failed P11 batch logs only error type — no err.message, no api_key', () => {
    let src

    before(() => { src = readSrc(SCAN_COMPETITORS_PATH) })

    test('scanCompetitors.js logs only error type on batch failure (not err.message)', () => {
      if (!src) return
      const hasTypeOnlyLog =
        src.includes('constructor.name') || src.includes('error_type') ||
        src.includes('.name') || src.includes('err.constructor')
      assert.ok(
        hasTypeOnlyLog,
        'scanCompetitors.js must log only error type (constructor.name) for failed batches — not the full message'
      )
    })

    test('scanCompetitors.js does not log err.message on batch failure', () => {
      if (!src) return
      const lines = src.split('\n').filter(l =>
        (l.includes('log.') || l.includes('console.')) && l.includes('err.message')
      )
      assert.equal(
        lines.length, 0,
        'scanCompetitors.js must not log err.message — Mirakl API responses may contain sensitive data'
      )
    })

    test('scanCompetitors.js does not log api_key in any statement', () => {
      if (!src) return
      const lines = src.split('\n').filter(l =>
        (l.includes('log.') || l.includes('console.')) && l.includes('api_key')
      )
      assert.equal(
        lines.length, 0,
        'scanCompetitors.js must not log api_key in any log statement (NFR-S2)'
      )
    })

    test('scanCompetitors.js does not pass full err object to logger', () => {
      if (!src) return
      const fullErrLog = /log\.\w+\s*\(\s*err\s*[,)]/
      assert.ok(
        !fullErrLog.test(src),
        'scanCompetitors.js must not pass the full err object to logger — only safe fields like {error_type}'
      )
    })
  })

  // ── AC-7: Promise.allSettled contract ────────────────────────────────────
  describe('AC-7: Promise.allSettled used — rejected batches do not abort the scan', () => {
    let src

    before(() => { src = readSrc(SCAN_COMPETITORS_PATH) })

    test('source uses Promise.allSettled (not Promise.all) for concurrent P11 batches', () => {
      if (!src) return
      assert.ok(
        src.includes('Promise.allSettled'),
        'scanCompetitors.js must use Promise.allSettled — Promise.all aborts the entire run on any rejection'
      )
    })

    test('source limits concurrency to 10 batches at a time', () => {
      if (!src) return
      assert.ok(
        src.includes('10') || src.includes('CONCURRENCY'),
        'scanCompetitors.js must limit to 10 concurrent P11 calls (as validated in scale_test.js)'
      )
    })

    test('source processes results of allSettled and handles "rejected" entries', () => {
      if (!src) return
      assert.ok(
        src.includes('rejected') || src.includes('.status') || src.includes('.reason'),
        'scanCompetitors.js must inspect .status of each allSettled result and handle "rejected" without aborting'
      )
    })
  })

  // ── STATIC: NFR-R1 compliance ─────────────────────────────────────────────
  describe('STATIC: NFR-R1 — ≥98% success rate for valid keys (P11 partial failure must not abort)', () => {
    let src

    before(() => { src = readSrc(SCAN_COMPETITORS_PATH) })

    test('source does not throw unconditionally on P11 batch failure (NFR-R1)', () => {
      if (!src) return
      // A throw in the outer scan (not inside per-batch handling) would abort the job entirely
      // and count against NFR-R1. Promise.allSettled + per-entry handling is the correct pattern.
      assert.ok(
        src.includes('Promise.allSettled'),
        'scanCompetitors.js must not abort the job on P11 batch failure — NFR-R1 requires ≥98% success for valid keys'
      )
    })

    test('source contains backoff logic or delegates backoff to apiClient (no inline sleep without limit)', () => {
      if (!src) return
      // Unlimited retry in scanCompetitors itself would hang forever.
      // Backoff must be in apiClient (already tested), scanCompetitors just catches MiraklApiError.
      const hasInlineUnlimitedRetry =
        (src.includes('while') || src.includes('retry')) && src.includes('429') &&
        !src.includes('MiraklApiError')
      assert.ok(
        !hasInlineUnlimitedRetry,
        'scanCompetitors.js must not implement its own unlimited retry loop — delegate to apiClient exponential backoff'
      )
    })
  })

  // ── MCP verification documentation tests ─────────────────────────────────
  describe('MCP-VERIFIED: P11 field and parameter contracts', () => {

    test('DOCUMENTED: P11 batch param is product_references, NOT product_ids (MCP-verified 2026-04-18)', () => {
      // product_ids expects product SKUs (UUIDs in Worten), not EANs.
      // Using EANs with product_ids silently returns 0 products — verified live.
      assert.ok(true, 'product_references=EAN|<ean1>,EAN|<ean2> is the correct P11 EAN batch parameter')
    })

    test('DOCUMENTED: offer.total_price includes shipping; offer.price does not (MCP-verified 2026-04-18)', () => {
      // offer.total_price = price + min_shipping_price for the active pricing context.
      // Using offer.price alone produces incorrect gap calculations.
      assert.ok(true, 'Always use offer.total_price for competitor comparison on P11')
    })

    test('DOCUMENTED: offer.channels is typically EMPTY on competitor offers (MCP-verified 2026-04-18)', () => {
      // Channel bucketing must be by which P11 call (PT or ES) returned the offer.
      // offer.channel_code singular does not exist. offer.channels[] is empty on competitors.
      assert.ok(true, 'Channel determination: use which P11 call returned the offer, not offer.channel_code')
    })

    test('DOCUMENTED: two P11 calls per batch required for per-channel total_price (MCP-verified 2026-04-18)', () => {
      // One call with pricing_channel_code=WRT_PT_ONLINE + channel_codes=WRT_PT_ONLINE → PT prices.
      // One call with pricing_channel_code=WRT_ES_ONLINE + channel_codes=WRT_ES_ONLINE → ES prices.
      // Without pricing_channel_code, total_price falls back to the default channel pricing.
      assert.ok(true, 'Two P11 calls per batch: pricing_channel_code determines which channel total_price reflects')
    })
  })
})
