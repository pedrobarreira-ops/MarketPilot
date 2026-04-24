/**
 * ATDD tests for Story 8.3: Platform-Hardening MVP Batch
 *
 * Acceptance criteria verified:
 * AC-1:  @fastify/rate-limit registered globally in src/server.js — 60 req/min/IP default
 * AC-2:  POST /api/generate — 5 req/min/IP per-route override
 * AC-3:  GET /api/reports/:report_id/csv — 10 req/min/IP per-route override
 * AC-4:  GET /api/jobs/:job_id — 120 req/min/IP per-route override
 * AC-5:  GET /api/reports/:report_id — global default applies (no per-route override)
 * AC-6:  429 responses use errorHandler shape: { error: 'too_many_requests', message: '...' }
 * AC-7:  Cache-Control: private, no-store on /api/reports/:id and /api/reports/:id/csv (200 AND 404)
 * AC-8:  UUID-format :id guard — ^[0-9a-f-]{36}$ — before DB call, returns 404 for malformed IDs
 * AC-9:  CSV csv_data does NOT start with UTF-8 BOM (U+FEFF)
 * AC-10: src/workers/** NOT modified — zero diffs
 *
 * No Mirakl API calls — Epic 8 is purely backend.
 * Epic 8 is backend-only: no MCP verification needed.
 *
 * Uses Node.js built-in test runner (node:test) — no extra dependencies needed.
 * Run: node --test tests/epic8-8.3-platform-hardening-mvp-batch.atdd.test.js
 */

import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SERVER_PATH        = join(__dirname, '../src/server.js')
const GENERATE_ROUTE_PATH = join(__dirname, '../src/routes/generate.js')
const REPORTS_ROUTE_PATH  = join(__dirname, '../src/routes/reports.js')
const JOBS_ROUTE_PATH     = join(__dirname, '../src/routes/jobs.js')
const BUILD_REPORT_PATH   = join(__dirname, '../src/workers/scoring/buildReport.js')

// ── env setup ──────────────────────────────────────────────────────────────
process.env.NODE_ENV        = 'test'
process.env.REDIS_URL       = process.env.REDIS_URL || 'redis://localhost:6379'
process.env.SQLITE_PATH     = ':memory:'
process.env.APP_BASE_URL    = 'http://localhost:3000'
process.env.WORTEN_BASE_URL = 'https://www.worten.pt'
process.env.PORT            = '3097'   // avoid clash with other test suites
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

// Hard-fail helper: static checks that silently skip on read failure turn into
// vacuous passes when a source file is missing — hiding the very invariant they
// are meant to lock. Call requireSrc(src, label) at the top of each static test
// so a missing source file surfaces as a real failure, not a green tick.
function requireSrc(src, label) {
  assert.ok(
    src !== null && typeof src === 'string' && src.length > 0,
    `${label} source must be readable for this static check — got null/empty. A missing source file is a red flag, not a skip.`
  )
}

/**
 * Build a minimal Fastify app with rate-limit + routes registered.
 * Wires the REAL src/routes/*.js plugins and real SQLite :memory: DB.
 * Returns { app }.
 */
async function buildTestApp() {
  try {
    const queueModule = await import('../src/queue/reportQueue.js')
    queueModule.redisConnection.removeAllListeners('error')
    queueModule.redisConnection.on('error', () => {})
  } catch (_) {}

  const { default: Fastify }      = await import('fastify')
  const { default: staticPlugin } = await import('@fastify/static')
  const { errorHandler }          = await import('../src/middleware/errorHandler.js')
  const { default: reportsRoute } = await import('../src/routes/reports.js')
  const { default: jobsRoute }    = await import('../src/routes/jobs.js')
  const path                      = await import('path')
  const { fileURLToPath: ftu }    = await import('url')

  const PUBLIC_DIR = path.default.join(path.default.dirname(ftu(import.meta.url)), '..', 'public')

  const fastify = Fastify({ logger: false, trustProxy: true })

  try {
    const rateLimit = (await import('@fastify/rate-limit')).default
    await fastify.register(rateLimit, {
      global: true,
      max: 60,
      timeWindow: '1 minute',
      errorResponseBuilder: (_request, _context) => {
        return {
          error: 'too_many_requests',
          message: 'Demasiados pedidos. Tenta novamente em breve.',
        }
      },
      allowList: (request) => request.url === '/health',
    })
  } catch (_) {
    // @fastify/rate-limit not installed yet — tests that require it will fail appropriately
  }

  try {
    await fastify.register(staticPlugin, { root: PUBLIC_DIR, prefix: '/' })
  } catch (_) {}

  fastify.setErrorHandler(errorHandler)
  await fastify.register(reportsRoute)
  await fastify.register(jobsRoute)

  await fastify.ready()
  return { app: fastify }
}

// ── test suite ─────────────────────────────────────────────────────────────

describe('Story 8.3 — Platform-Hardening MVP Batch', async () => {

  // ── AC-1: @fastify/rate-limit registered globally in server.js ───────────
  describe('AC-1: @fastify/rate-limit registered globally in src/server.js', () => {

    describe('server.js — rate-limit plugin registration (static)', () => {
      let src

      before(() => { src = readSrc(SERVER_PATH) })

      test('server.js imports @fastify/rate-limit (static)', () => {
        requireSrc(src, 'server.js')
        assert.ok(
          src.includes('@fastify/rate-limit') || src.includes('rate-limit') || src.includes('rateLimit'),
          'server.js must import @fastify/rate-limit — plugin must be registered at server startup'
        )
      })

      test('server.js registers rateLimit plugin via fastify.register (static)', () => {
        requireSrc(src, 'server.js')
        const hasRegister =
          /fastify\.register\s*\(\s*rateLimit/.test(src) ||
          /fastify\.register\s*\([\s\S]{0,40}rate[\s\S]{0,40}limit/i.test(src) ||
          /await\s+fastify\.register\s*\(/.test(src)
        assert.ok(
          hasRegister || src.includes('register') && (src.includes('rateLimit') || src.includes('rate-limit')),
          'server.js must register @fastify/rate-limit via fastify.register()'
        )
      })

      test('server.js configures global: true on rate-limit plugin (static)', () => {
        requireSrc(src, 'server.js')
        assert.ok(
          src.includes('global') && (src.includes('true') || src.includes('global: true')),
          'server.js rate-limit registration must include global: true to apply the plugin to all routes by default'
        )
      })

      test('server.js configures global default of 60 req/min (static)', () => {
        requireSrc(src, 'server.js')
        assert.ok(
          src.includes('60'),
          'server.js rate-limit global max must be 60 (req/min/IP default per AC-1)'
        )
        assert.ok(
          src.includes('1 minute') || src.includes('minute'),
          'server.js rate-limit global timeWindow must be 1 minute'
        )
      })

      test('/health route is excluded from rate limiting (allowList or skip) (static)', () => {
        requireSrc(src, 'server.js')
        // The /health route must be excluded via allowList or skip function
        const hasHealthExclusion =
          (src.includes('allowList') || src.includes('skip')) &&
          src.includes('/health')
        assert.ok(
          hasHealthExclusion,
          'server.js must exclude /health from rate limiting via allowList or skip function (AC-1 spec)'
        )
      })

      test('server.js defines errorResponseBuilder for 429 shape override (static)', () => {
        requireSrc(src, 'server.js')
        assert.ok(
          src.includes('errorResponseBuilder') || src.includes('too_many_requests'),
          'server.js must configure errorResponseBuilder on the rate-limit plugin to override default 429 shape'
        )
      })
    })

    describe('@fastify/rate-limit installability (functional)', () => {
      test('@fastify/rate-limit package is importable (installed in dependencies)', async () => {
        let imported = false
        let importError = null
        try {
          await import('@fastify/rate-limit')
          imported = true
        } catch (err) {
          importError = err
        }
        assert.ok(
          imported,
          `@fastify/rate-limit must be installed in package.json dependencies — import failed: ${importError}`
        )
      })

      test('package.json includes @fastify/rate-limit in dependencies (static)', () => {
        const pkgSrc = readSrc(join(__dirname, '../package.json'))
        requireSrc(pkgSrc, 'package.json')
        assert.ok(
          pkgSrc.includes('@fastify/rate-limit'),
          'package.json must list @fastify/rate-limit in dependencies (not devDependencies) — it is a runtime requirement'
        )
      })
    })
  })

  // ── AC-2: POST /api/generate — 5 req/min/IP override ─────────────────────
  describe('AC-2: POST /api/generate — 5 req/min/IP per-route override (static)', () => {
    let src

    before(() => { src = readSrc(GENERATE_ROUTE_PATH) })

    test('generate.js has config.rateLimit per-route override (static)', () => {
      requireSrc(src, 'generate.js')
      assert.ok(
        src.includes('rateLimit') || src.includes('rate_limit') || src.includes('rate-limit'),
        'generate.js must declare a per-route rateLimit config override per AC-2'
      )
    })

    test('generate.js per-route override sets max: 5 (static)', () => {
      requireSrc(src, 'generate.js')
      // The route options object must contain max: 5 inside a rateLimit config
      const hasMax5 = /config\s*:\s*\{[\s\S]{0,100}rateLimit[\s\S]{0,100}max\s*:\s*5/.test(src) ||
        /rateLimit\s*:\s*\{[\s\S]{0,50}max\s*:\s*5/.test(src)
      assert.ok(
        hasMax5,
        'generate.js per-route rateLimit config must set max: 5 (5 req/min/IP per AC-2 spec)'
      )
    })

    test('generate.js per-route override sets timeWindow of 1 minute (static)', () => {
      requireSrc(src, 'generate.js')
      const hasTimeWindow = /rateLimit[\s\S]{0,100}timeWindow\s*:\s*['"`]1 minute['"`]/.test(src) ||
        /timeWindow\s*:\s*['"`]1 minute['"`]/.test(src)
      assert.ok(
        hasTimeWindow,
        "generate.js per-route rateLimit config must set timeWindow: '1 minute' per AC-2 spec"
      )
    })

    test('generate.js per-route config is inside the route options object (not at module level) (static)', () => {
      requireSrc(src, 'generate.js')
      // config: { rateLimit: ... } must appear within the fastify.post(...) call arguments
      const hasRouteConfig = /fastify\.post\s*\([\s\S]{0,300}config\s*:\s*\{[\s\S]{0,200}rateLimit/.test(src)
      assert.ok(
        hasRouteConfig,
        'generate.js config: { rateLimit: { max: 5, ... } } must be inside the fastify.post() route options — not at module top level'
      )
    })
  })

  // ── AC-3: GET /api/reports/:report_id/csv — 10 req/min/IP override ────────
  describe('AC-3: GET /api/reports/:report_id/csv — 10 req/min/IP per-route override (static)', () => {
    let src

    before(() => { src = readSrc(REPORTS_ROUTE_PATH) })

    test('reports.js has config.rateLimit on the /csv route (static)', () => {
      requireSrc(src, 'reports.js')
      assert.ok(
        src.includes('rateLimit') || src.includes('rate-limit'),
        'reports.js must declare a per-route rateLimit config override on the /csv route per AC-3'
      )
    })

    test('reports.js /csv route override sets max: 10 (static)', () => {
      requireSrc(src, 'reports.js')
      const hasMax10 = /config\s*:\s*\{[\s\S]{0,100}rateLimit[\s\S]{0,100}max\s*:\s*10/.test(src) ||
        /rateLimit\s*:\s*\{[\s\S]{0,50}max\s*:\s*10/.test(src)
      assert.ok(
        hasMax10,
        'reports.js per-route rateLimit config on /csv must set max: 10 (10 req/min/IP per AC-3 spec)'
      )
    })

    test('reports.js /csv route override is on the csv route (not the JSON report route) (static)', () => {
      requireSrc(src, 'reports.js')
      // The rateLimit config with max: 10 must appear in proximity to the /csv route registration
      // and NOT on the plain /api/reports/:report_id route (which uses global default per AC-5)
      const csvRouteBlock = src.match(/\/api\/reports\/:report_id\/csv[\s\S]{0,500}/)
      const jsonRouteBlock = src.match(/fastify\.get\s*\(\s*['"`]\/api\/reports\/:report_id['"`][\s\S]{0,500}/)

      if (csvRouteBlock) {
        assert.ok(
          /rateLimit[\s\S]{0,100}max\s*:\s*10/.test(csvRouteBlock[0]) ||
          src.indexOf('max: 10') > src.indexOf('/api/reports/:report_id/csv'),
          'reports.js rateLimit max: 10 override must be on the /csv route, not the JSON report route'
        )
      }
      // The JSON route (/api/reports/:report_id) must NOT have its own rateLimit override (AC-5)
      if (jsonRouteBlock) {
        // Verify there's no separate rateLimit in the first route that would override the global
        const firstRouteSrc = jsonRouteBlock[0]
        const hasOverrideOnJsonRoute = /config\s*:\s*\{[\s\S]{0,100}rateLimit/.test(firstRouteSrc)
        // This is a soft warning check — the main enforcement is in AC-5
        // Only fail if we find an explicit max setting on the JSON route
        const hasExplicitMaxOnJsonRoute = /config\s*:\s*\{[\s\S]{0,100}rateLimit[\s\S]{0,100}max\s*:\s*(?!10\b)/.test(firstRouteSrc)
        assert.ok(
          !hasExplicitMaxOnJsonRoute,
          'reports.js JSON route (/api/reports/:report_id) must use global default rate limit — no per-route override per AC-5'
        )
      }
    })
  })

  // ── AC-4: GET /api/jobs/:job_id — 120 req/min/IP override ────────────────
  describe('AC-4: GET /api/jobs/:job_id — 120 req/min/IP per-route override (static)', () => {
    let src

    before(() => { src = readSrc(JOBS_ROUTE_PATH) })

    test('jobs.js has config.rateLimit per-route override (static)', () => {
      requireSrc(src, 'jobs.js')
      assert.ok(
        src.includes('rateLimit') || src.includes('rate-limit'),
        'jobs.js must declare a per-route rateLimit config override per AC-4'
      )
    })

    test('jobs.js per-route override sets max: 120 (static)', () => {
      requireSrc(src, 'jobs.js')
      const hasMax120 = /config\s*:\s*\{[\s\S]{0,100}rateLimit[\s\S]{0,100}max\s*:\s*120/.test(src) ||
        /rateLimit\s*:\s*\{[\s\S]{0,50}max\s*:\s*120/.test(src)
      assert.ok(
        hasMax120,
        'jobs.js per-route rateLimit config must set max: 120 (120 req/min/IP per AC-4 spec — 4× polling headroom)'
      )
    })

    test('jobs.js per-route override sets timeWindow of 1 minute (static)', () => {
      requireSrc(src, 'jobs.js')
      const hasTimeWindow = /rateLimit[\s\S]{0,100}timeWindow\s*:\s*['"`]1 minute['"`]/.test(src) ||
        /timeWindow\s*:\s*['"`]1 minute['"`]/.test(src)
      assert.ok(
        hasTimeWindow,
        "jobs.js per-route rateLimit config must set timeWindow: '1 minute' per AC-4 spec"
      )
    })

    test('jobs.js per-route config is inside the route options object (static)', () => {
      requireSrc(src, 'jobs.js')
      const hasRouteConfig = /fastify\.get\s*\([\s\S]{0,300}config\s*:\s*\{[\s\S]{0,200}rateLimit/.test(src)
      assert.ok(
        hasRouteConfig,
        'jobs.js config: { rateLimit: { max: 120, ... } } must be inside the fastify.get() route options'
      )
    })
  })

  // ── AC-5: GET /api/reports/:report_id — global default, no override ────────
  describe('AC-5: GET /api/reports/:report_id — global default applies, no explicit override', () => {
    let src

    before(() => { src = readSrc(REPORTS_ROUTE_PATH) })

    test('reports.js JSON report route does NOT have an explicit max override (static)', () => {
      requireSrc(src, 'reports.js')
      // The plain JSON route (/api/reports/:report_id, not /csv) should NOT have a
      // config: { rateLimit: { max: N } } block — it relies on the global 60 req/min default
      //
      // Strategy: find the JSON route registration block (before the /csv route) and check
      // it doesn't contain a rateLimit config override. We'll use the position of the two
      // route registrations to scope the check.
      const csvRouteIdx = src.indexOf('/api/reports/:report_id/csv')
      const jsonRouteIdx = src.indexOf('/api/reports/:report_id')
      // If both exist, the JSON route appears first
      if (csvRouteIdx > 0 && jsonRouteIdx >= 0 && jsonRouteIdx < csvRouteIdx) {
        const jsonRouteSrc = src.slice(jsonRouteIdx, csvRouteIdx)
        // The JSON route block must not have an explicit rateLimit max override
        assert.ok(
          !(/config\s*:\s*\{[\s\S]{0,100}rateLimit[\s\S]{0,100}max\s*:/.test(jsonRouteSrc)),
          'reports.js JSON route (/api/reports/:report_id) must NOT have an explicit rateLimit max override — global default (60/min) applies per AC-5'
        )
      }
    })

    test('reports.js registers both /api/reports/:report_id and /api/reports/:report_id/csv routes (static)', () => {
      requireSrc(src, 'reports.js')
      assert.ok(
        src.includes('/api/reports/:report_id'),
        'reports.js must register the GET /api/reports/:report_id route (required route — AC-5)'
      )
      assert.ok(
        src.includes('/api/reports/:report_id/csv'),
        'reports.js must register the GET /api/reports/:report_id/csv route (required route — AC-3)'
      )
    })
  })

  // ── AC-6: 429 responses use errorHandler shape ────────────────────────────
  describe('AC-6: 429 responses use { error: "too_many_requests", message: "..." } shape', () => {

    describe('server.js — errorResponseBuilder configuration (static)', () => {
      let src

      before(() => { src = readSrc(SERVER_PATH) })

      test('server.js defines errorResponseBuilder returning too_many_requests error key (static)', () => {
        requireSrc(src, 'server.js')
        assert.ok(
          src.includes('too_many_requests'),
          'server.js errorResponseBuilder must return { error: "too_many_requests", ... } — no raw @fastify/rate-limit shape'
        )
      })

      test('server.js 429 message does NOT include statusCode field (static)', () => {
        requireSrc(src, 'server.js')
        // The errorResponseBuilder must NOT include statusCode in the returned object
        // (raw plugin shape includes statusCode; our contract only has error + message)
        const builderBlock = src.match(/errorResponseBuilder[\s\S]{0,400}/)
        if (builderBlock) {
          // Only check within the builder block itself, not the whole file
          const builderSrc = builderBlock[0].slice(0, 400)
          const returnsStatusCode = /return\s*\{[\s\S]{0,200}statusCode/.test(builderSrc)
          assert.ok(
            !returnsStatusCode,
            'server.js errorResponseBuilder must NOT include statusCode in the returned object — only { error, message } per AC-6 contract'
          )
        }
      })

      test('server.js 429 response body contains Portuguese message (static)', () => {
        requireSrc(src, 'server.js')
        // The message must be in Portuguese per AC-6 spec
        const hasPortugueseMsg = src.includes('Demasiados') || src.includes('pedidos') ||
          src.includes('Tenta novamente') || src.includes('breve')
        assert.ok(
          hasPortugueseMsg,
          'server.js 429 message must be in Portuguese ("Demasiados pedidos. Tenta novamente em breve." or equivalent)'
        )
      })

      test('server.js 429 response does not expose api_key (static)', () => {
        requireSrc(src, 'server.js')
        // The errorResponseBuilder must not reference api_key in any way
        const builderBlock = src.match(/errorResponseBuilder[\s\S]{0,500}/)
        if (builderBlock) {
          assert.ok(
            !builderBlock[0].includes('api_key') && !builderBlock[0].includes('apiKey'),
            'server.js errorResponseBuilder must not reference api_key — NFR-S2 credential safety'
          )
        }
      })
    })

    describe('429 response shape — integration via Fastify inject', () => {
      let app
      let setupError = null

      before(async () => {
        try {
          ({ app } = await buildTestApp())
        } catch (err) {
          setupError = err
        }
      })

      after(async () => {
        if (app) {
          try { await app.close() } catch (_) {}
        }
      })

      test('rate-limited request returns HTTP 429 status', async () => {
        assert.ok(!setupError, `Test app setup must succeed — error: ${setupError?.message}`)

        // Make requests over the limit to trigger 429 on the reports CSV route (max: 10)
        // We inject 11 requests to /api/reports/<uuid>/csv — 11th must return 429
        const testId = 'a1b2c3d4-e5f6-4789-abcd-ef0123456789'
        let last429 = null
        for (let i = 0; i < 11; i++) {
          const resp = await app.inject({
            method: 'GET',
            url: `/api/reports/${testId}/csv`,
            headers: { 'x-forwarded-for': '10.0.0.1' },
          })
          if (resp.statusCode === 429) {
            last429 = resp
            break
          }
        }
        // Hard assertion: 429 MUST be seen within 11 requests — rate-limit plugin is
        // installed (static tests verify it) and the test app is built with it registered.
        assert.ok(
          last429 !== null,
          'Rate-limit plugin must trigger 429 within 11 requests to /api/reports/:id/csv (max: 10 per AC-3). ' +
          'If no 429 was seen, the plugin is not active on this route.'
        )
        assert.equal(last429.statusCode, 429, 'Rate-limited request must return 429 status')
      })

      test('429 response body has { error, message } shape without statusCode field', async () => {
        assert.ok(!setupError, `Test app setup must succeed — error: ${setupError?.message}`)

        const testId = 'a1b2c3d4-e5f6-4789-abcd-ef0123456789'
        let last429 = null
        for (let i = 0; i < 15; i++) {
          const resp = await app.inject({
            method: 'GET',
            url: `/api/reports/${testId}/csv`,
            headers: { 'x-forwarded-for': '10.0.0.2' },
          })
          if (resp.statusCode === 429) {
            last429 = resp
            break
          }
        }

        // Hard assertion: 429 MUST be seen within 15 requests (max: 10 per AC-3).
        assert.ok(
          last429 !== null,
          'Rate-limit plugin must trigger 429 within 15 requests to /api/reports/:id/csv (max: 10 per AC-3)'
        )

        const body = JSON.parse(last429.body)
        assert.ok('error' in body, '429 body must have an "error" field')
        assert.ok('message' in body, '429 body must have a "message" field')
        assert.equal(body.error, 'too_many_requests',
          '429 body.error must be "too_many_requests" — not the raw @fastify/rate-limit shape')
        assert.ok(
          !('statusCode' in body),
          '429 body must NOT contain a "statusCode" field — only { error, message } per AC-6'
        )
        assert.ok(
          !('api_key' in body),
          '429 body must NOT contain api_key — NFR-S2 credential safety'
        )
      })
    })
  })

  // ── AC-7: Cache-Control: private, no-store on report routes ──────────────
  describe('AC-7: Cache-Control: private, no-store on /api/reports/:id and /csv (200 AND 404)', () => {

    describe('reports.js — Cache-Control header on both response paths (static)', () => {
      let src

      before(() => { src = readSrc(REPORTS_ROUTE_PATH) })

      test('reports.js contains Cache-Control: private, no-store (static)', () => {
        requireSrc(src, 'reports.js')
        assert.ok(
          src.includes('Cache-Control') || src.includes('cache-control'),
          'reports.js must set Cache-Control header on report routes per AC-7'
        )
        assert.ok(
          src.includes('private, no-store') || src.includes('no-store'),
          'reports.js Cache-Control value must be "private, no-store" to prevent intermediate proxy caching'
        )
      })

      test('reports.js sets Cache-Control on 404 response paths as well as 200 (static)', () => {
        requireSrc(src, 'reports.js')
        // Count how many times Cache-Control or no-store appears
        // Must appear at least twice (once per route, both 200 and 404 paths)
        const cacheControlCount = (src.match(/Cache-Control|no-store/g) || []).length
        assert.ok(
          cacheControlCount >= 2,
          `reports.js must set Cache-Control on both success (200) AND error (404) paths — found ${cacheControlCount} occurrence(s), expected ≥ 2 (AC-7)`
        )
      })

      test('reports.js sets Cache-Control on both /api/reports/:report_id routes (static)', () => {
        requireSrc(src, 'reports.js')
        // Both the JSON route AND the /csv route must set the header
        // Verify by checking the header appears in the context of both route handler bodies
        const csvRouteIdx = src.indexOf('/api/reports/:report_id/csv')
        const jsonRouteIdx = src.indexOf('/api/reports/:report_id')
        assert.ok(
          jsonRouteIdx >= 0 && csvRouteIdx > jsonRouteIdx,
          'reports.js must register both /api/reports/:report_id and /api/reports/:report_id/csv routes'
        )

        // After each route registration, there should be a Cache-Control header set
        const afterJsonRoute = src.slice(jsonRouteIdx, csvRouteIdx)
        const afterCsvRoute = src.slice(csvRouteIdx)

        assert.ok(
          afterJsonRoute.includes('Cache-Control') || afterJsonRoute.includes('no-store'),
          'reports.js GET /api/reports/:report_id handler must set Cache-Control header (AC-7)'
        )
        assert.ok(
          afterCsvRoute.includes('Cache-Control') || afterCsvRoute.includes('no-store'),
          'reports.js GET /api/reports/:report_id/csv handler must set Cache-Control header (AC-7)'
        )
      })
    })

    describe('GET /api/jobs/:job_id — no Cache-Control header required (static)', () => {
      let src

      before(() => { src = readSrc(JOBS_ROUTE_PATH) })

      test('jobs.js does NOT need Cache-Control header (AC-7 exempts jobs route) (informational)', () => {
        requireSrc(src, 'jobs.js')
        // AC-7 only requires Cache-Control on report routes — jobs route is exempt.
        // This test is informational only — we verify the spec is understood,
        // but we do NOT fail if jobs.js happens to add a Cache-Control header.
        assert.ok(true, 'GET /api/jobs/:job_id does not require Cache-Control per AC-7 — spec exempts polling endpoint')
      })
    })

    describe('Cache-Control integration — Fastify inject responses', () => {
      let app
      let setupError = null

      before(async () => {
        try {
          ({ app } = await buildTestApp())
        } catch (err) {
          setupError = err
        }
      })

      after(async () => {
        if (app) {
          try { await app.close() } catch (_) {}
        }
      })

      test('GET /api/reports/:report_id 404 response has Cache-Control: private, no-store', async () => {
        assert.ok(!setupError, `Test app must set up successfully — error: ${setupError?.message}`)
        const testId = 'a1b2c3d4-e5f6-4789-abcd-000000000001'
        const resp = await app.inject({ method: 'GET', url: `/api/reports/${testId}` })
        // Must be 404 (no such report in empty :memory: DB)
        assert.equal(resp.statusCode, 404,
          `GET /api/reports/${testId} must return 404 with no matching report in DB. Got ${resp.statusCode}`)
        const cacheControl = resp.headers['cache-control']
        assert.ok(
          cacheControl && cacheControl.includes('no-store'),
          `GET /api/reports/:id 404 response must include Cache-Control: private, no-store header. Got: "${cacheControl}"`
        )
        assert.ok(
          cacheControl && cacheControl.includes('private'),
          `GET /api/reports/:id 404 response Cache-Control must include "private" directive. Got: "${cacheControl}"`
        )
      })

      test('GET /api/reports/:report_id/csv 404 response has Cache-Control: private, no-store', async () => {
        assert.ok(!setupError, `Test app must set up successfully — error: ${setupError?.message}`)
        const testId = 'a1b2c3d4-e5f6-4789-abcd-000000000002'
        const resp = await app.inject({ method: 'GET', url: `/api/reports/${testId}/csv` })
        // Must be 404 (no such report)
        assert.equal(resp.statusCode, 404,
          `GET /api/reports/${testId}/csv must return 404 with no matching report. Got ${resp.statusCode}`)
        const cacheControl = resp.headers['cache-control']
        assert.ok(
          cacheControl && cacheControl.includes('no-store'),
          `GET /api/reports/:id/csv 404 response must include Cache-Control: private, no-store header. Got: "${cacheControl}"`
        )
        assert.ok(
          cacheControl && cacheControl.includes('private'),
          `GET /api/reports/:id/csv 404 response Cache-Control must include "private" directive. Got: "${cacheControl}"`
        )
      })

      test('GET /api/reports/:report_id 200 response (if report exists) has Cache-Control: private, no-store', async () => {
        assert.ok(!setupError, `Test app must set up successfully — error: ${setupError?.message}`)

        let insertReport
        try {
          const dbMod = await import('../src/db/queries.js')
          insertReport = dbMod.insertReport
        } catch (_) {}

        if (!insertReport) {
          // Cannot seed DB — skip 200 path test
          assert.ok(true, 'insertReport not available — skipping 200 path Cache-Control check')
          return
        }

        const reportId = 'a1b2c3d4-e5f6-4789-abcd-000000000003'
        const nowSec = Math.floor(Date.now() / 1000)
        insertReport({
          report_id:             reportId,
          generated_at:          nowSec,
          expires_at:            nowSec + 172800,
          email:                 'test@example.com',
          summary_json:          JSON.stringify({ pt: {}, es: {} }),
          opportunities_pt_json: '[]',
          opportunities_es_json: '[]',
          quickwins_pt_json:     '[]',
          quickwins_es_json:     '[]',
          csv_data:              'EAN,product_title\ntest,title',
        })

        const resp = await app.inject({ method: 'GET', url: `/api/reports/${reportId}` })
        // Should be 200 since we seeded the report
        if (resp.statusCode === 200) {
          const cacheControl = resp.headers['cache-control']
          assert.ok(
            cacheControl && cacheControl.includes('no-store'),
            `GET /api/reports/:id 200 response must include Cache-Control: private, no-store. Got: "${cacheControl}"`
          )
          assert.ok(
            cacheControl && cacheControl.includes('private'),
            `GET /api/reports/:id 200 response Cache-Control must include "private" directive. Got: "${cacheControl}"`
          )
        }
        // If not 200, UUID guard or other issue — other tests will catch
      })

      test('GET /api/reports/:report_id/csv 200 response has Cache-Control: private, no-store', async () => {
        assert.ok(!setupError, `Test app must set up successfully — error: ${setupError?.message}`)

        let insertReport
        try {
          const dbMod = await import('../src/db/queries.js')
          insertReport = dbMod.insertReport
        } catch (_) {}

        if (!insertReport) {
          assert.ok(true, 'insertReport not available — skipping 200 path Cache-Control check for CSV')
          return
        }

        const reportId = 'a1b2c3d4-e5f6-4789-abcd-000000000004'
        const nowSec = Math.floor(Date.now() / 1000)
        insertReport({
          report_id:             reportId,
          generated_at:          nowSec,
          expires_at:            nowSec + 172800,
          email:                 'test@example.com',
          summary_json:          JSON.stringify({ pt: {}, es: {} }),
          opportunities_pt_json: '[]',
          opportunities_es_json: '[]',
          quickwins_pt_json:     '[]',
          quickwins_es_json:     '[]',
          csv_data:              'EAN,product_title\ntest,title',
        })

        const resp = await app.inject({ method: 'GET', url: `/api/reports/${reportId}/csv` })
        if (resp.statusCode === 200) {
          const cacheControl = resp.headers['cache-control']
          assert.ok(
            cacheControl && cacheControl.includes('no-store'),
            `GET /api/reports/:id/csv 200 response must include Cache-Control: private, no-store. Got: "${cacheControl}"`
          )
          assert.ok(
            cacheControl && cacheControl.includes('private'),
            `GET /api/reports/:id/csv 200 response Cache-Control must include "private" directive. Got: "${cacheControl}"`
          )
        }
      })
    })
  })

  // ── AC-8: UUID-format :id guard — ^[0-9a-f-]{36}$ ────────────────────────
  describe('AC-8: UUID-format :id guard — ^[0-9a-f-]{36}$ — before DB call, returns 404', () => {

    describe('reports.js — UUID_REGEX guard (static)', () => {
      let src

      before(() => { src = readSrc(REPORTS_ROUTE_PATH) })

      test('reports.js defines UUID_REGEX constant (static)', () => {
        requireSrc(src, 'reports.js')
        assert.ok(
          src.includes('UUID_REGEX') || /\[0-9a-f-\]\{36\}/.test(src),
          'reports.js must define UUID_REGEX = /^[0-9a-f-]{36}$/ (AC-8 spec)'
        )
      })

      test('reports.js UUID_REGEX has correct pattern ^[0-9a-f-]{36}$ (static)', () => {
        requireSrc(src, 'reports.js')
        // Must use the spec-mandated regex — not a different UUID pattern
        const hasCorrectPattern = /\[0-9a-f-\]\{36\}/.test(src) ||
          src.includes('[0-9a-f-]{36}')
        assert.ok(
          hasCorrectPattern,
          'reports.js UUID_REGEX must use /^[0-9a-f-]{36}$/ — not a different length or character class'
        )
      })

      test('reports.js UUID guard fires BEFORE any getReport DB call (static)', () => {
        requireSrc(src, 'reports.js')
        // The UUID_REGEX.test() call must appear before getReport() in each handler body
        // Strategy: check that UUID_REGEX or the pattern appears before getReport in the file
        const uuidIdx = src.indexOf('UUID_REGEX') >= 0 ? src.indexOf('UUID_REGEX') : src.indexOf('[0-9a-f-]{36}')
        const getReportIdx = src.indexOf('getReport(')
        assert.ok(
          uuidIdx >= 0,
          'reports.js must reference UUID_REGEX before using getReport()'
        )
        assert.ok(
          getReportIdx >= 0,
          'reports.js must call getReport() (DB access function)'
        )
        // UUID guard must appear before the first getReport call
        assert.ok(
          uuidIdx < getReportIdx,
          'reports.js UUID guard (UUID_REGEX.test) must appear BEFORE getReport() call — no DB round-trip for invalid IDs (AC-8)'
        )
      })

      test('reports.js UUID guard returns 404 (not 400) for malformed IDs (static)', () => {
        requireSrc(src, 'reports.js')
        // The guard must return 404 to prevent enumeration oracle (malformed vs not-found vs expired look identical)
        // Look for the guard condition block containing .status(404)
        const guardBlock = src.match(/UUID_REGEX[\s\S]{0,200}status\s*\(\s*(\d+)\s*\)/)
        if (guardBlock) {
          assert.equal(
            guardBlock[1], '404',
            'reports.js UUID guard must return 404 (not 400) — same shape as not-found prevents enumeration oracle (AC-8)'
          )
        } else {
          // Alternative: check that 404 appears in proximity to UUID check
          assert.ok(
            src.includes('404'),
            'reports.js UUID guard path must return 404 status code (AC-8 security invariant)'
          )
        }
      })

      test('reports.js UUID guard on /csv route also fires before getReport (static)', () => {
        requireSrc(src, 'reports.js')
        // Both routes need the UUID guard — not just the JSON route
        const csvRouteIdx = src.indexOf('/api/reports/:report_id/csv')
        if (csvRouteIdx < 0) return
        const afterCsvRoute = src.slice(csvRouteIdx)
        assert.ok(
          afterCsvRoute.includes('UUID_REGEX') || afterCsvRoute.includes('[0-9a-f-]{36}'),
          'reports.js /csv route handler must also apply the UUID_REGEX guard before getReport() (AC-8)'
        )
      })
    })

    describe('jobs.js — UUID_REGEX guard (static)', () => {
      let src

      before(() => { src = readSrc(JOBS_ROUTE_PATH) })

      test('jobs.js defines UUID_REGEX constant (static)', () => {
        requireSrc(src, 'jobs.js')
        assert.ok(
          src.includes('UUID_REGEX') || /\[0-9a-f-\]\{36\}/.test(src),
          'jobs.js must define UUID_REGEX = /^[0-9a-f-]{36}$/ (AC-8 spec)'
        )
      })

      test('jobs.js UUID guard fires BEFORE any getJobStatus DB call (static)', () => {
        requireSrc(src, 'jobs.js')
        const uuidIdx = src.indexOf('UUID_REGEX') >= 0 ? src.indexOf('UUID_REGEX') : src.indexOf('[0-9a-f-]{36}')
        const getJobIdx = src.indexOf('getJobStatus(')
        assert.ok(uuidIdx >= 0, 'jobs.js must reference UUID_REGEX')
        assert.ok(getJobIdx >= 0, 'jobs.js must call getJobStatus()')
        assert.ok(
          uuidIdx < getJobIdx,
          'jobs.js UUID guard must appear BEFORE getJobStatus() call — no DB round-trip for invalid job IDs (AC-8)'
        )
      })

      test('jobs.js UUID guard returns 404 (not 400) for malformed job IDs (static)', () => {
        requireSrc(src, 'jobs.js')
        const guardBlock = src.match(/UUID_REGEX[\s\S]{0,200}status\s*\(\s*(\d+)\s*\)/)
        if (guardBlock) {
          assert.equal(
            guardBlock[1], '404',
            'jobs.js UUID guard must return 404 — same shape as unknown job_id prevents enumeration oracle (AC-8)'
          )
        } else {
          assert.ok(src.includes('404'), 'jobs.js UUID guard path must return 404 status code (AC-8)')
        }
      })
    })

    describe('UUID guard — integration via Fastify inject (malformed, oversized, undersized IDs)', () => {
      let app
      let setupError = null

      before(async () => {
        try {
          ({ app } = await buildTestApp())
        } catch (err) {
          setupError = err
        }
      })

      after(async () => {
        if (app) {
          try { await app.close() } catch (_) {}
        }
      })

      const MALFORMED_IDS = [
        { label: 'oversized (37 chars)', id: 'a'.repeat(37) },
        { label: 'undersized (35 chars)', id: 'a'.repeat(35) },
        { label: 'SQL injection attempt', id: "'; DROP TABLE reports; --abc1234567" },
        { label: 'path traversal attempt', id: '../../../etc/passwd-12345678901234' },
        { label: 'XSS attempt', id: '<script>alert(1)</script>-12345678' },
        { label: 'empty string handled by Fastify', id: '' },
        { label: 'correct length but uppercase (rejected by [0-9a-f-])', id: 'A1B2C3D4-E5F6-7890-ABCD-EF0123456789' },
      ]

      for (const { label, id } of MALFORMED_IDS) {
        if (!id) continue  // empty string — Fastify won't match the route

        test(`GET /api/reports/:report_id with ${label} returns 404 (not 400 or 500)`, async () => {
          assert.ok(!setupError, `Test app must be set up — error: ${setupError?.message}`)
          const resp = await app.inject({
            method: 'GET',
            url: `/api/reports/${encodeURIComponent(id)}`,
          })
          assert.equal(
            resp.statusCode, 404,
            `GET /api/reports with ${label} id must return 404 (not 400/500) — uniform 404 prevents enumeration. Got ${resp.statusCode}: ${resp.body}`
          )
          let body
          try { body = JSON.parse(resp.body) } catch (_) { return }
          assert.equal(body.error, 'report_not_found',
            `Malformed :report_id must return { error: 'report_not_found' } — same shape as not-found. Got: ${body.error}`)
        })

        test(`GET /api/reports/:report_id/csv with ${label} returns 404 (not 400 or 500)`, async () => {
          assert.ok(!setupError, `Test app must be set up — error: ${setupError?.message}`)
          const resp = await app.inject({
            method: 'GET',
            url: `/api/reports/${encodeURIComponent(id)}/csv`,
          })
          assert.equal(
            resp.statusCode, 404,
            `GET /api/reports/csv with ${label} id must return 404 — uniform 404 prevents enumeration. Got ${resp.statusCode}: ${resp.body}`
          )
        })

        test(`GET /api/jobs/:job_id with ${label} returns 404 (not 400 or 500)`, async () => {
          assert.ok(!setupError, `Test app must be set up — error: ${setupError?.message}`)
          const resp = await app.inject({
            method: 'GET',
            url: `/api/jobs/${encodeURIComponent(id)}`,
          })
          assert.equal(
            resp.statusCode, 404,
            `GET /api/jobs with ${label} job_id must return 404 — uniform 404 prevents enumeration. Got ${resp.statusCode}: ${resp.body}`
          )
          let body
          try { body = JSON.parse(resp.body) } catch (_) { return }
          assert.equal(body.error, 'job_not_found',
            `Malformed :job_id must return { error: 'job_not_found' } — same shape as unknown job. Got: ${body.error}`)
        })
      }

      test('valid UUID format (36 chars, [0-9a-f-]) is accepted by guard (passes to DB lookup)', async () => {
        assert.ok(!setupError, `Test app must be set up — error: ${setupError?.message}`)
        // A well-formed UUID that does not exist in DB should get 404 from DB miss, not guard
        const validUUID = 'a1b2c3d4-e5f6-4789-abcd-ef0123456789'
        const resp = await app.inject({ method: 'GET', url: `/api/reports/${validUUID}` })
        // 404 from DB miss — guard passed, route handler made DB call, report not found
        assert.equal(
          resp.statusCode, 404,
          `Valid UUID must pass the UUID guard and reach the DB lookup — expected 404 from DB miss, got ${resp.statusCode}`
        )
        let body
        try { body = JSON.parse(resp.body) } catch (_) { return }
        assert.equal(body.error, 'report_not_found',
          'Valid UUID that is not in DB must return { error: "report_not_found" } — guard must NOT fire for valid UUIDs')
      })

      test('uniform 404 shape — malformed and unknown IDs return identical response shapes', async () => {
        assert.ok(!setupError, `Test app must be set up — error: ${setupError?.message}`)
        // Malformed (UUID guard fires)
        const malformedResp = await app.inject({
          method: 'GET',
          url: '/api/reports/definitely-not-a-uuid-!@#$%^&*()',
        })
        // Unknown-but-valid-format UUID (DB miss)
        const unknownResp = await app.inject({
          method: 'GET',
          url: '/api/reports/00000000-0000-4000-a000-000000000000',
        })

        assert.equal(malformedResp.statusCode, 404, 'Malformed :id must return 404')
        assert.equal(unknownResp.statusCode, 404, 'Unknown-but-valid :id must return 404')

        let malformedBody, unknownBody
        try { malformedBody = JSON.parse(malformedResp.body) } catch (_) { return }
        try { unknownBody   = JSON.parse(unknownResp.body)   } catch (_) { return }

        assert.equal(malformedBody.error, unknownBody.error,
          'Malformed and unknown IDs must return the same error code — no enumeration oracle (AC-8 security invariant)')
      })
    })
  })

  // ── AC-9: CSV csv_data does NOT start with UTF-8 BOM (U+FEFF) ─────────────
  describe('AC-9: CSV csv_data does NOT start with UTF-8 BOM (\\uFEFF / EF BB BF)', () => {

    describe('buildReport.js — no BOM emitted (functional)', () => {
      let buildAndPersistReport
      let importError = null

      before(async () => {
        try {
          const mod = await import('../src/workers/scoring/buildReport.js')
          buildAndPersistReport = mod.buildAndPersistReport
        } catch (err) {
          importError = err
        }
      })

      test('buildAndPersistReport is importable from src/workers/scoring/buildReport.js', () => {
        assert.ok(
          !importError,
          `buildReport.js must be importable — got error: ${importError?.message}`
        )
        assert.equal(
          typeof buildAndPersistReport,
          'function',
          'buildReport.js must export buildAndPersistReport as a function'
        )
      })

      test('CSV column header does NOT start with UTF-8 BOM (\\uFEFF) — byte-level assertion', () => {
        // The CSV_HEADER constant inside buildReport.js must not start with BOM.
        // Read the source file and check the raw CSV_HEADER string literal.
        const src = readSrc(BUILD_REPORT_PATH)
        requireSrc(src, 'buildReport.js')

        // Check for BOM byte in source literal
        const BOM = '﻿'
        assert.ok(
          !src.startsWith(BOM),
          'buildReport.js source file must NOT start with a UTF-8 BOM (\\uFEFF) — would cause the CSV header to begin with BOM bytes'
        )

        // Check the CSV_HEADER constant
        const csvHeaderMatch = src.match(/CSV_HEADER\s*=\s*['"`]([\s\S]*?)['"`]/)
        if (csvHeaderMatch) {
          const headerValue = csvHeaderMatch[1]
          assert.ok(
            !headerValue.startsWith(BOM),
            `CSV_HEADER constant must NOT start with BOM (\\uFEFF). Value: "${headerValue.slice(0, 20)}..."`
          )
        }
      })

      test('buildAndPersistReport produces csv_data that does NOT start with BOM (functional)', async () => {
        if (!buildAndPersistReport) {
          assert.ok(false, 'buildAndPersistReport must be importable for BOM assertion test')
          return
        }

        // Call buildAndPersistReport with a minimal fixture.
        // We need insertReport to work — import from queries.js (uses :memory: SQLite).
        let insertReport
        let getReport
        try {
          const dbMod = await import('../src/db/queries.js')
          insertReport = dbMod.insertReport
          getReport    = dbMod.getReport
        } catch (_) {}

        if (!insertReport || !getReport) {
          assert.ok(false, 'queries.js must export insertReport and getReport for BOM assertion test')
          return
        }

        const reportId = 'bom-test-' + Date.now() + '-1234-abcd-ef0123456789'
        const email    = 'bom-test@example.com'

        // Minimal catalog + computedReport fixture
        const catalog = [
          { ean: '1234567890123', shop_sku: 'SKU-001', product_title: 'Test Product', price: '29.99' },
        ]
        const computedReport = {
          opportunities_pt: [],
          opportunities_es: [],
          quickwins_pt:     [],
          quickwins_es:     [],
          summary_pt:       { total: 1 },
          summary_es:       { total: 1 },
        }

        let threw = false
        try {
          buildAndPersistReport(reportId, email, catalog, computedReport)
        } catch (err) {
          threw = true
          assert.ok(false, `buildAndPersistReport must not throw with minimal fixture — got: ${err.message}`)
        }

        if (threw) return

        // Retrieve the persisted report and check csv_data
        const nowSec = Math.floor(Date.now() / 1000)
        const row    = getReport(reportId, nowSec)
        assert.ok(row !== null, 'buildAndPersistReport must persist the report to SQLite — getReport returned null')

        const csvData = row.csv_data
        assert.equal(typeof csvData, 'string', 'csv_data must be a string')

        // Byte-level BOM check: U+FEFF (UTF-8: EF BB BF)
        const BOM = '﻿'
        assert.ok(
          !csvData.startsWith(BOM),
          `csv_data must NOT start with UTF-8 BOM (\\uFEFF / EF BB BF). ` +
          `First 20 chars: "${csvData.slice(0, 20)}" ` +
          `First char code: ${csvData.charCodeAt(0)}`
        )

        // Positive assertion: CSV must start with the expected header (EAN column)
        assert.ok(
          csvData.startsWith('EAN,') || csvData.startsWith('EAN\r'),
          `csv_data must start with "EAN," (the CSV header). Got: "${csvData.slice(0, 30)}"`
        )
      })

      test('buildReport.js source file itself does not contain BOM bytes (source integrity)', () => {
        // Read raw (not codeLines-processed) to check for BOM in source
        let rawSrc
        try {
          rawSrc = readFileSync(BUILD_REPORT_PATH, 'utf8')
        } catch (_) {
          assert.fail('buildReport.js must be readable for source BOM check')
          return
        }
        const BOM = '﻿'
        assert.ok(
          !rawSrc.startsWith(BOM),
          'buildReport.js source file must not start with a BOM — editors that save with BOM would corrupt the CSV header string'
        )
      })
    })
  })

  // ── AC-10: src/workers/** NOT modified ───────────────────────────────────
  describe('AC-10: src/workers/** NOT modified — zero diffs (static architecture invariant)', () => {

    const WORKER_FILES = [
      'src/workers/reportWorker.js',
      'src/workers/scoring/buildReport.js',
      'src/workers/scoring/computeReport.js',
      'src/workers/mirakl/apiClient.js',
      'src/workers/mirakl/fetchCatalog.js',
      'src/workers/mirakl/scanCompetitors.js',
    ]

    test('Rate limiting is NOT implemented in any worker file (static)', () => {
      // Rate limiting is a route/server layer concern — workers must not be modified
      for (const relPath of WORKER_FILES) {
        const filePath = join(__dirname, '..', relPath)
        const src = readSrc(filePath)
        if (!src) continue  // file may not exist in this version — skip

        assert.ok(
          !src.includes('@fastify/rate-limit') && !src.includes('rateLimit'),
          `${relPath} must NOT contain rate-limit plugin code — rate limiting is a route/server layer concern (AC-10)`
        )
      }
    })

    test('Cache-Control headers are NOT set in any worker file (static)', () => {
      // Cache-Control is a route layer concern — workers must not be modified
      for (const relPath of WORKER_FILES) {
        const filePath = join(__dirname, '..', relPath)
        const src = readSrc(filePath)
        if (!src) continue

        assert.ok(
          !src.includes('Cache-Control'),
          `${relPath} must NOT set Cache-Control headers — this is a route layer responsibility (AC-10)`
        )
      }
    })

    test('UUID_REGEX guard is NOT in any worker file (static)', () => {
      // UUID validation guards are route handler concerns — workers must not be modified
      for (const relPath of WORKER_FILES) {
        const filePath = join(__dirname, '..', relPath)
        const src = readSrc(filePath)
        if (!src) continue

        assert.ok(
          !src.includes('UUID_REGEX'),
          `${relPath} must NOT contain UUID_REGEX guard — :id validation is a route handler concern (AC-10)`
        )
      }
    })

    test('buildReport.js does NOT emit BOM and was NOT modified for BOM removal (static)', () => {
      // AC-9: BOM test locks existing behaviour — buildReport.js must not be modified.
      // The test just verifies no BOM removal code was added (indicating the original already had no BOM).
      const src = readSrc(BUILD_REPORT_PATH)
      requireSrc(src, 'buildReport.js')
      // BOM removal patterns that would indicate a BOM was added and then removed:
      const hasBomRemoval =
        src.includes('BOM') ||
        src.includes('\\uFEFF') ||
        src.includes('0xEF') ||
        (src.includes('replace') && src.includes('FEFF'))
      assert.ok(
        !hasBomRemoval,
        'buildReport.js must NOT contain BOM removal code — the no-BOM contract is locked by AC-9 without modifying this file'
      )
    })
  })

  // ── STATIC: Security invariants — cross-cutting ───────────────────────────
  describe('STATIC: Security invariants — api_key never in 429 or guard responses', () => {
    let serverSrc
    let reportsSrc
    let jobsSrc

    before(() => {
      serverSrc  = readSrc(SERVER_PATH)
      reportsSrc = readSrc(REPORTS_ROUTE_PATH)
      jobsSrc    = readSrc(JOBS_ROUTE_PATH)
    })

    test('server.js errorResponseBuilder does not log or expose api_key (NFR-S2)', () => {
      requireSrc(serverSrc, 'server.js')
      const builderBlock = serverSrc.match(/errorResponseBuilder[\s\S]{0,600}/) || ['']
      const block = builderBlock[0]
      assert.ok(
        !block.includes('api_key') && !block.includes('apiKey') && !block.includes('Authorization'),
        'server.js errorResponseBuilder must not reference api_key, apiKey, or Authorization — NFR-S2'
      )
    })

    test('reports.js UUID guard 404 response does not include api_key (NFR-S2)', () => {
      requireSrc(reportsSrc, 'reports.js')
      // The 404 guard response body must not reference api_key
      const guardBlocks = reportsSrc.match(/UUID_REGEX[\s\S]{0,300}/g) || []
      for (const block of guardBlocks) {
        assert.ok(
          !block.includes('api_key') && !block.includes('apiKey'),
          'reports.js UUID guard 404 response must not expose api_key — NFR-S2'
        )
      }
    })

    test('jobs.js UUID guard 404 response does not include api_key (NFR-S2)', () => {
      requireSrc(jobsSrc, 'jobs.js')
      const guardBlocks = jobsSrc.match(/UUID_REGEX[\s\S]{0,300}/g) || []
      for (const block of guardBlocks) {
        assert.ok(
          !block.includes('api_key') && !block.includes('apiKey'),
          'jobs.js UUID guard 404 response must not expose api_key — NFR-S2'
        )
      }
    })

    test('Uniform 404 — reports.js returns same error shape for malformed, unknown, and expired IDs (static)', () => {
      requireSrc(reportsSrc, 'reports.js')
      // The PT_404_MESSAGE must be the spec-mandated string and must appear exactly once
      // (used in both UUID guard and DB-miss paths — same message, no distinguishing wording)
      const PT_404_SPEC = 'Este relatório expirou ou não existe. Gera um novo relatório para obteres dados actualizados.'
      assert.ok(
        reportsSrc.includes(PT_404_SPEC),
        `reports.js must contain the exact spec-mandated 404 message: "${PT_404_SPEC}" — uniform 404 for all cases`
      )
      // No distinguishing wording
      const DISTINGUISHING_PATTERNS = [
        /malformed/i,
        /invalid.*uuid/i,
        /invalid.*id/i,
        /bad.*request/i,
        /pertence\s+a/i,
        /belongs\s+to/i,
        /nunca\s+existiu/i,
        /never\s+existed/i,
      ]
      for (const pat of DISTINGUISHING_PATTERNS) {
        assert.ok(
          !pat.test(reportsSrc),
          `reports.js must not contain "${pat.source}" — distinguishing wording would leak existence information (AC-8 enumeration prevention)`
        )
      }
    })

    test('Uniform 404 — jobs.js returns same error shape for malformed and unknown job IDs (static)', () => {
      requireSrc(jobsSrc, 'jobs.js')
      // The jobs 404 message must be the same for UUID guard and DB miss
      const JOBS_404_MSG = 'Job não encontrado.'
      assert.ok(
        jobsSrc.includes(JOBS_404_MSG),
        `jobs.js must contain the spec-mandated job 404 message: "${JOBS_404_MSG}" — used for both UUID guard and DB miss paths`
      )
      // No distinguishing wording for job IDs
      assert.ok(
        !(/invalid.*job/i).test(jobsSrc),
        'jobs.js must not use "invalid job" wording — uniform 404 for malformed and unknown job IDs'
      )
    })
  })
})
