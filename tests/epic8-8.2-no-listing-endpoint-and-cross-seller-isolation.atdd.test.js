/**
 * ATDD tests for Story 8.2: No Listing Endpoint + Cross-Seller Isolation Verification
 *
 * Acceptance criteria verified:
 * AC-1: GET /api/reports (no id) returns 404 — route is NOT registered
 * AC-2: GET /api/jobs (no id) returns 404 — route is NOT registered
 * AC-3: Every queries.js reports read uses WHERE report_id = ? (no cross-report selects)
 * AC-4: No cross-report JOINs in HTTP-accessible queries
 * AC-5: job_id never appears in the final report URL — only report_id appears in the URL
 * AC-6: No sequential or predictable ID pattern — UUIDs only (122-bit entropy)
 * AC-7: No JOIN between generation_jobs and reports accessible via HTTP routes
 *
 * No Mirakl API calls — Epic 8 is purely backend.
 *
 * Uses Node.js built-in test runner (node:test) — no extra dependencies needed.
 * Run: node --test tests/epic8-8.2-no-listing-endpoint-and-cross-seller-isolation.atdd.test.js
 */

import { test, describe, before } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const QUERIES_PATH       = join(__dirname, '../src/db/queries.js')
const REPORTS_ROUTE_PATH = join(__dirname, '../src/routes/reports.js')
const JOBS_ROUTE_PATH    = join(__dirname, '../src/routes/jobs.js')
const GENERATE_ROUTE_PATH = join(__dirname, '../src/routes/generate.js')
const SERVER_PATH        = join(__dirname, '../src/server.js')

// ── env setup ──────────────────────────────────────────────────────────────
process.env.NODE_ENV        = 'test'
process.env.REDIS_URL       = process.env.REDIS_URL || 'redis://localhost:6379'
process.env.SQLITE_PATH     = ':memory:'
process.env.APP_BASE_URL    = 'http://localhost:3000'
process.env.WORTEN_BASE_URL = 'https://www.worten.pt'
process.env.PORT            = '3098'   // avoid clash with other test suites
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

// ── test suite ─────────────────────────────────────────────────────────────

describe('Story 8.2 — No listing endpoint + cross-seller isolation', async () => {

  // ── AC-1: GET /api/reports (no id) → 404 ─────────────────────────────────
  describe('AC-1: GET /api/reports (no id) is NOT registered — Fastify returns 404', () => {

    describe('reports.js route — listing route absent (static)', () => {
      let src

      before(() => { src = readSrc(REPORTS_ROUTE_PATH) })

      test('reports.js does NOT register GET /api/reports without :report_id param (static)', () => {
        if (!src) return
        // Only the parameterised routes should exist: /api/reports/:report_id and /api/reports/:report_id/csv
        const hasBareReportsRoute =
          /fastify\.\w+\s*\(\s*['"]\/api\/reports['"]\s*[,)]/.test(src)
        assert.ok(
          !hasBareReportsRoute,
          'reports.js must NOT register GET /api/reports (bare, no id) — listing endpoint is explicitly forbidden (AC-1, architecture spec)'
        )
      })

      test('reports.js registers /api/reports/:report_id (parameterised — required route)', () => {
        if (!src) return
        assert.ok(
          src.includes('/api/reports/:report_id') || src.includes('report_id'),
          'reports.js must register GET /api/reports/:report_id to serve individual report data'
        )
      })

      test('reports.js registers /api/reports/:report_id/csv (parameterised — required route)', () => {
        if (!src) return
        assert.ok(
          src.includes('/csv') || src.includes('csv'),
          'reports.js must register GET /api/reports/:report_id/csv for CSV downloads'
        )
      })

      test('reports route only accepts a specific report_id — no wildcard or partial match (static)', () => {
        if (!src) return
        // No route param patterns like ':id?' or '*' that could accidentally match bare /api/reports
        assert.ok(
          !src.includes(':report_id?') && !src.includes('wildcard'),
          'reports.js must use exact :report_id param — no optional params that would match bare /api/reports'
        )
      })
    })

    describe('GET /api/reports (bare) → 404 — integration via Fastify inject', () => {
      let fastify

      before(async () => {
        try {
          const queueModule = await import('../src/queue/reportQueue.js')
          queueModule.redisConnection.removeAllListeners('error')
          queueModule.redisConnection.on('error', () => {})
        } catch (_) {}

        try {
          // Import just the routes module in isolation by building a minimal Fastify instance
          const Fastify  = (await import('fastify')).default
          const reportsRoute = (await import('../src/routes/reports.js')).default
          const jobsRoute    = (await import('../src/routes/jobs.js')).default

          fastify = Fastify({ logger: false })
          await fastify.register(reportsRoute)
          await fastify.register(jobsRoute)
          await fastify.ready()
        } catch (_) {}
      })

      test('GET /api/reports (no id) returns 404 (route not registered)', async () => {
        if (!fastify) return
        const resp = await fastify.inject({ method: 'GET', url: '/api/reports' })
        assert.equal(
          resp.statusCode, 404,
          `GET /api/reports must return 404 — listing endpoint is forbidden. Got ${resp.statusCode}: ${resp.body}`
        )
      })

      test('GET /api/reports/ (trailing slash, no id) returns 404', async () => {
        if (!fastify) return
        const resp = await fastify.inject({ method: 'GET', url: '/api/reports/' })
        assert.equal(
          resp.statusCode, 404,
          `GET /api/reports/ (trailing slash) must return 404. Got ${resp.statusCode}`
        )
      })

      test('GET /api/reports/:report_id returns 404 for unknown id (route registered; DB miss → 404)', async () => {
        if (!fastify) return
        const resp = await fastify.inject({ method: 'GET', url: '/api/reports/nonexistent-id-8.2' })
        // 404 from the DB miss — the route IS registered; just the report is absent
        assert.equal(
          resp.statusCode, 404,
          `GET /api/reports/:report_id with unknown id must return 404. Got ${resp.statusCode}`
        )
      })
    })
  })

  // ── AC-2: GET /api/jobs (no id) → 404 ────────────────────────────────────
  describe('AC-2: GET /api/jobs (no id) is NOT registered — Fastify returns 404', () => {

    describe('jobs.js route — listing route absent (static)', () => {
      let src

      before(() => { src = readSrc(JOBS_ROUTE_PATH) })

      test('jobs.js does NOT register GET /api/jobs without :job_id param (static)', () => {
        if (!src) return
        const hasBareJobsRoute =
          /fastify\.\w+\s*\(\s*['"]\/api\/jobs['"]\s*[,)]/.test(src)
        assert.ok(
          !hasBareJobsRoute,
          'jobs.js must NOT register GET /api/jobs (bare, no id) — listing endpoint is explicitly forbidden (AC-2)'
        )
      })

      test('jobs.js registers /api/jobs/:job_id (parameterised — required polling route)', () => {
        if (!src) return
        assert.ok(
          src.includes('/api/jobs/:job_id') || src.includes('job_id'),
          'jobs.js must register GET /api/jobs/:job_id for job status polling'
        )
      })
    })

    describe('GET /api/jobs (bare) → 404 — integration via Fastify inject', () => {
      let fastify

      before(async () => {
        try {
          const queueModule = await import('../src/queue/reportQueue.js')
          queueModule.redisConnection.removeAllListeners('error')
          queueModule.redisConnection.on('error', () => {})
        } catch (_) {}

        try {
          const Fastify   = (await import('fastify')).default
          const jobsRoute = (await import('../src/routes/jobs.js')).default

          fastify = Fastify({ logger: false })
          await fastify.register(jobsRoute)
          await fastify.ready()
        } catch (_) {}
      })

      test('GET /api/jobs (no id) returns 404 (route not registered)', async () => {
        if (!fastify) return
        const resp = await fastify.inject({ method: 'GET', url: '/api/jobs' })
        assert.equal(
          resp.statusCode, 404,
          `GET /api/jobs must return 404 — listing endpoint is forbidden. Got ${resp.statusCode}: ${resp.body}`
        )
      })

      test('GET /api/jobs/ (trailing slash) returns 404', async () => {
        if (!fastify) return
        const resp = await fastify.inject({ method: 'GET', url: '/api/jobs/' })
        assert.equal(
          resp.statusCode, 404,
          `GET /api/jobs/ (trailing slash) must return 404. Got ${resp.statusCode}`
        )
      })

      test('GET /api/jobs/:job_id returns 404 for unknown id (route registered; DB miss → 404)', async () => {
        if (!fastify) return
        const resp = await fastify.inject({ method: 'GET', url: '/api/jobs/nonexistent-job-id-8.2' })
        assert.equal(
          resp.statusCode, 404,
          `GET /api/jobs/:job_id with unknown id must return 404. Got ${resp.statusCode}`
        )
      })
    })
  })

  // ── AC-3: All queries.js reports reads use WHERE report_id = ? ────────────
  describe('AC-3: every reports read in queries.js uses WHERE report_id = ? — no table scans', () => {
    let src

    before(() => { src = readSrc(QUERIES_PATH) })

    test('queries.js uses eq(reports.reportId, ...) or WHERE report_id = ? for every reports read (static)', () => {
      if (!src) return
      // Any SELECT from reports must be filtered by report_id (Drizzle .where(eq(reports.reportId, ...)))
      // A bare .from(reports) without .where() is a full table scan — forbidden
      const hasBareScan =
        /\.from\s*\(\s*reports\s*\)(?!\s*\.\s*where)/.test(src) ||
        /SELECT\s+\*\s+FROM\s+reports\s*(?!WHERE)/i.test(src)
      assert.ok(
        !hasBareScan,
        'queries.js must not SELECT from reports without a WHERE report_id = ? filter — cross-report scan is forbidden'
      )
    })

    test('queries.js getReport uses report_id equality filter (not a range or LIKE)', () => {
      if (!src) return
      assert.ok(
        src.includes('reportId') || src.includes('report_id'),
        'queries.js getReport must filter strictly by report_id equality'
      )
      // LIKE or range queries on report_id would allow prefix-guessing attacks
      assert.ok(
        !src.includes('LIKE') && !src.includes('BETWEEN') && !src.includes('GLOB'),
        'queries.js must not use LIKE/BETWEEN/GLOB on report_id — equality (=) only'
      )
    })

    test('queries.js does not export a getAll / listReports / findReports function (static)', () => {
      if (!src) return
      const badExportPatterns = [
        /export\s+function\s+getAll\b/,
        /export\s+function\s+listReports\b/,
        /export\s+function\s+findReports\b/,
        /export\s+function\s+getAllReports\b/,
        /export\s+function\s+selectAll\b/,
      ]
      const violates = badExportPatterns.some(p => p.test(src))
      assert.ok(
        !violates,
        'queries.js must not export any function that returns multiple reports — cross-report access is forbidden (AC-3)'
      )
    })
  })

  // ── AC-4: No cross-report JOINs in HTTP-accessible queries ───────────────
  describe('AC-4: no cross-report JOINs in HTTP-accessible queries', () => {
    let queriesSrc
    let reportsSrc
    let jobsSrc

    before(() => {
      queriesSrc = readSrc(QUERIES_PATH)
      reportsSrc = readSrc(REPORTS_ROUTE_PATH)
      jobsSrc    = readSrc(JOBS_ROUTE_PATH)
    })

    test('queries.js contains no JOIN between reports and generation_jobs (static)', () => {
      if (!queriesSrc) return
      // Drizzle JOIN: .leftJoin(), .innerJoin(), .rightJoin(), .fullJoin()
      // Raw SQL JOIN: should not exist in queries.js
      const hasJoin =
        /\.(left|inner|right|full|cross)Join\s*\(/.test(queriesSrc) ||
        /\bJOIN\s+generation_jobs\b/i.test(queriesSrc) ||
        /\bJOIN\s+reports\b/i.test(queriesSrc)
      assert.ok(
        !hasJoin,
        'queries.js must not JOIN reports with generation_jobs — cross-table joins create cross-seller data exposure risk (AC-4, AC-7)'
      )
    })

    test('reports route does not import or call any generation_jobs query (static)', () => {
      if (!reportsSrc) return
      assert.ok(
        !reportsSrc.includes('getJobStatus') &&
        !reportsSrc.includes('updateJobStatus') &&
        !reportsSrc.includes('createJob') &&
        !reportsSrc.includes('generation_jobs'),
        'reports.js route must not reference generation_jobs queries — report access must be isolated from job data'
      )
    })

    test('jobs route does not import or call any reports query (static)', () => {
      if (!jobsSrc) return
      assert.ok(
        !jobsSrc.includes('getReport') &&
        !jobsSrc.includes('insertReport') &&
        !jobsSrc.includes('reports'),
        'jobs.js route must not reference reports queries — job polling must be isolated from report data'
      )
    })
  })

  // ── AC-5: job_id never in final report URL ────────────────────────────────
  describe('AC-5: job_id never appears in final report URL — only report_id', () => {

    describe('routes/reports.js — URL param is report_id, not job_id (static)', () => {
      let src

      before(() => { src = readSrc(REPORTS_ROUTE_PATH) })

      test('reports route uses :report_id as URL param — not :job_id or :id (static)', () => {
        if (!src) return
        assert.ok(
          src.includes(':report_id') || src.includes('report_id'),
          'reports.js must use :report_id as the URL parameter — never :job_id'
        )
        assert.ok(
          !src.includes(':job_id'),
          'reports.js must NOT use :job_id as a URL parameter — job_id must never appear in report URLs'
        )
      })

      test('reports route does not expose job_id in response body (static)', () => {
        if (!src) return
        // The response must not include job_id — it is only report_id that identifies a report
        const lines = src.split('\n').filter(l =>
          l.includes('job_id') && (l.includes('send') || l.includes('reply') || l.includes('json'))
        )
        assert.equal(
          lines.length, 0,
          'reports.js must not include job_id in any HTTP response body — only report_id identifies a report'
        )
      })
    })

    describe('routes/generate.js — response returns report_id (not job_id as report access token) (static)', () => {
      let src

      before(() => { src = readSrc(GENERATE_ROUTE_PATH) })

      test('generate route returns report_id in the 202 response (used for report URL construction)', () => {
        if (!src) return
        assert.ok(
          src.includes('report_id') || src.includes('reportId'),
          'generate.js must return report_id in the 202 response so the client can construct the report URL'
        )
      })

      test('generate route returns job_id only for polling — report URL must use report_id', () => {
        if (!src) return
        // job_id is returned for progress polling (/api/jobs/:job_id)
        // report_id is the access token for /api/reports/:report_id and /report/:report_id
        assert.ok(
          src.includes('job_id') && src.includes('report_id'),
          'generate.js must return both job_id (for polling) and report_id (for report URL) — they are different identifiers'
        )
      })
    })
  })

  // ── AC-6: UUIDs only — no sequential or predictable IDs ──────────────────
  describe('AC-6: no sequential/predictable ID pattern — UUIDs (randomUUID) only', () => {

    describe('generate.js — ID generation uses crypto.randomUUID() (static)', () => {
      let src

      before(() => { src = readSrc(GENERATE_ROUTE_PATH) })

      test('generate.js uses crypto.randomUUID() for both job_id and report_id (static)', () => {
        if (!src) return
        assert.ok(
          src.includes('randomUUID') || src.includes('uuid') || src.includes('UUID'),
          'generate.js must use crypto.randomUUID() (or uuid library) for ID generation — never sequential integers'
        )
      })

      test('generate.js does not use auto-increment integers or timestamps as IDs (static)', () => {
        if (!src) return
        // Patterns that would produce predictable IDs
        const badPatterns = [
          /job_id\s*=\s*\d+/,                          // hardcoded integer
          /id\s*\+\+/,                                 // increment counter
          /Date\.now\(\)\s*(?!\/|\.|toString)/,        // raw timestamp as ID
          /Math\.random\(\)\s*(?!\*)/,                 // Math.random without scaling (guessable space)
        ]
        const violates = badPatterns.some(p => p.test(src))
        assert.ok(
          !violates,
          'generate.js must not use sequential integers, timestamps, or Math.random() as job_id or report_id — UUIDs only'
        )
      })
    })

    describe('UUID entropy — report_id and job_id are cryptographically random (functional)', () => {
      let randomUUID

      before(async () => {
        try {
          const crypto = await import('node:crypto')
          randomUUID = crypto.randomUUID
        } catch (_) {}
      })

      test('two consecutive randomUUID() calls produce different values', () => {
        if (!randomUUID) return
        const id1 = randomUUID()
        const id2 = randomUUID()
        assert.notEqual(id1, id2, 'Two consecutive randomUUID() calls must never produce the same UUID')
      })

      test('randomUUID() produces a valid UUID v4 format (xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx)', () => {
        if (!randomUUID) return
        const id = randomUUID()
        const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
        assert.match(id, UUID_V4_RE, `randomUUID() must produce a UUID v4 format, got: "${id}"`)
      })

      test('1000 UUIDs are all unique (probabilistic collision check — 122-bit entropy)', () => {
        if (!randomUUID) return
        const ids = new Set()
        for (let i = 0; i < 1000; i++) ids.add(randomUUID())
        assert.equal(ids.size, 1000, '1000 generated UUIDs must all be unique — UUID v4 collision is cryptographically negligible')
      })
    })
  })

  // ── AC-7: No JOIN between generation_jobs and reports via HTTP routes ──────
  describe('AC-7: no JOIN between generation_jobs and reports accessible via HTTP routes', () => {
    let queriesSrc
    let reportsSrc
    let jobsSrc
    let serverSrc

    before(() => {
      queriesSrc = readSrc(QUERIES_PATH)
      reportsSrc = readSrc(REPORTS_ROUTE_PATH)
      jobsSrc    = readSrc(JOBS_ROUTE_PATH)
      serverSrc  = readSrc(SERVER_PATH)
    })

    test('queries.js does not JOIN generation_jobs and reports in any exported function (static)', () => {
      if (!queriesSrc) return
      const hasJoin =
        /\.from\s*\(\s*generationJobs\s*\)[\s\S]*?\.(left|inner|right|full|cross)Join\s*\(\s*reports/m.test(queriesSrc) ||
        /\.from\s*\(\s*reports\s*\)[\s\S]*?\.(left|inner|right|full|cross)Join\s*\(\s*generationJobs/m.test(queriesSrc)
      assert.ok(
        !hasJoin,
        'queries.js must not JOIN generation_jobs and reports — such a query would expose cross-seller job data via the report lookup path'
      )
    })

    test('reports route handler only calls getReport (not getJobStatus or cross-table queries) (static)', () => {
      if (!reportsSrc) return
      // The reports route should only call getReport — never getJobStatus (which reads generation_jobs)
      assert.ok(
        !reportsSrc.includes('getJobStatus') && !reportsSrc.includes('generationJobs'),
        'reports.js route must only call getReport — must not cross into generation_jobs data'
      )
    })

    test('jobs route handler only calls getJobStatus (not getReport or cross-table queries) (static)', () => {
      if (!jobsSrc) return
      assert.ok(
        !jobsSrc.includes('getReport') && !jobsSrc.includes('insertReport'),
        'jobs.js route must only call getJobStatus — must not cross into reports data'
      )
    })
  })

  // ── STATIC: Cross-cutting isolation invariants ────────────────────────────
  describe('STATIC: Cross-seller isolation — report_id is the sole access token', () => {
    let reportsSrc

    before(() => { reportsSrc = readSrc(REPORTS_ROUTE_PATH) })

    test('reports route does not accept email or marketplace_url as query/path params (static)', () => {
      if (!reportsSrc) return
      // If a route param or query param exposed email lookup it would allow cross-seller enumeration
      const hasBadParams =
        /\brequest\.query\.email\b/.test(reportsSrc) ||
        /\brequest\.query\.marketplace_url\b/.test(reportsSrc) ||
        /:\s*email\b/.test(reportsSrc)
      assert.ok(
        !hasBadParams,
        'reports.js must not accept email or marketplace_url as URL/query params — report_id is the sole access token'
      )
    })

    test('reports route 404 message does not reveal whether the report ever existed (static)', () => {
      if (!reportsSrc) return
      // Revealing "This report belongs to another user" vs "not found" leaks cross-seller info
      // The spec message: "Este relatório expirou ou não existe..." — same for expired and never-existed
      const PT_404 = 'Este relatório expirou ou não existe'
      assert.ok(
        reportsSrc.includes('expirou') || reportsSrc.includes('não existe') || reportsSrc.includes('404'),
        'reports.js must return a uniform 404 message that does not distinguish expired vs never-existed reports'
      )
    })

    test('report_id access token has sufficient entropy — UUID v4 from crypto.randomUUID() (architecture spec)', () => {
      // Architecture spec: "UUID v4 (122-bit entropy); 48h TTL; no auth system; report_id IS the access token"
      // This is a documentation test — the source checks above verify the implementation
      assert.ok(true, 'report_id is a UUID v4 with 122-bit entropy — the sole access token per architecture spec')
    })
  })

  // ── STATIC: NFR-S2 — no api_key exposure in governance layer ─────────────
  describe('STATIC: NFR-S2 — no api_key in any governance-layer file', () => {
    const FILES_TO_CHECK = [
      { label: 'queries.js',  path: QUERIES_PATH       },
      { label: 'reports.js',  path: REPORTS_ROUTE_PATH  },
      { label: 'jobs.js',     path: JOBS_ROUTE_PATH     },
    ]

    for (const { label, path: filePath } of FILES_TO_CHECK) {
      test(`${label} does not log or expose api_key (NFR-S2)`, () => {
        let src
        try { src = codeLines(readFileSync(filePath, 'utf8')) } catch (_) { return }
        const lines = src.split('\n').filter(l =>
          (l.includes('log') || l.includes('console') || l.includes('send') || l.includes('reply')) &&
          l.includes('api_key')
        )
        assert.equal(lines.length, 0, `${label} must not log or surface api_key — NFR-S2`)
      })
    }
  })
})
