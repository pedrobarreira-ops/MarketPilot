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

// Hard-fail helper: static checks that silently skip on read failure (`if (!src) return`)
// turn into vacuous passes when a source file is missing or accidentally deleted — hiding
// the very invariant they are meant to lock. Call `requireSrc(src, label)` at the top of
// each static test so a missing source file surfaces as a real failure, not a green tick.
function requireSrc(src, label) {
  assert.ok(
    src !== null && typeof src === 'string' && src.length > 0,
    `${label} source must be readable for this static check — got null/empty. A missing governance source file is a red flag, not a skip.`
  )
}

// ── test suite ─────────────────────────────────────────────────────────────

describe('Story 8.2 — No listing endpoint + cross-seller isolation', async () => {

  // ── AC-1: GET /api/reports (no id) → 404 ─────────────────────────────────
  describe('AC-1: GET /api/reports (no id) is NOT registered — Fastify returns 404', () => {

    describe('reports.js route — listing route absent (static)', () => {
      let src

      before(() => { src = readSrc(REPORTS_ROUTE_PATH) })

      test('reports.js does NOT register GET /api/reports without :report_id param (static)', () => {
        requireSrc(src, 'reports.js')
        // Only the parameterised routes should exist: /api/reports/:report_id and /api/reports/:report_id/csv
        // Cover all Fastify registration shapes:
        //   (1) fastify.get('/api/reports', ...)                     — any HTTP verb method
        //   (2) fastify.route({ url: '/api/reports', ... })          — object form with url key
        //   (3) fastify.route({ path: '/api/reports', ... })         — object form with path key (Fastify accepts both)
        //   (4) fastify.get(`/api/reports`, ...)                     — backtick template literal
        // The string-quote class [`'"] covers all three quote styles in a single pass.
        // Use [\s\S]*? (lazy dot-all) instead of [^}]* so that a `schema: { ... }` block
        // appearing before the url/path property does not defeat the match.
        const hasBareReportsRoute =
          /fastify\.\w+\s*\(\s*[`'"]\/api\/reports[`'"]\s*[,)]/.test(src) ||
          /fastify\.route\s*\(\s*\{[\s\S]*?\b(?:url|path)\s*:\s*[`'"]\/api\/reports[`'"]/.test(src)
        assert.ok(
          !hasBareReportsRoute,
          'reports.js must NOT register GET /api/reports (bare, no id) — listing endpoint is explicitly forbidden (AC-1, architecture spec). Checked all forms: fastify.<verb>(path, …), fastify.route({url|path, …}), single/double/backtick quotes.'
        )
      })

      test('reports.js registers /api/reports/:report_id (parameterised — required route)', () => {
        requireSrc(src, 'reports.js')
        // Tight: require the actual parameterised path, not the loose `report_id` fallback
        // (which matches anywhere the token appears — import aliases, comments, etc.)
        assert.ok(
          src.includes('/api/reports/:report_id'),
          'reports.js must register /api/reports/:report_id literally — loose token presence is not enough'
        )
      })

      test('reports.js registers /api/reports/:report_id/csv (parameterised — required route)', () => {
        requireSrc(src, 'reports.js')
        // Require the full CSV route path — the bare `csv` substring would pass on any mention
        // of the word (e.g. `csv_data` variable), which is not the same as registering the route.
        assert.ok(
          src.includes('/api/reports/:report_id/csv'),
          'reports.js must register /api/reports/:report_id/csv literally for CSV downloads'
        )
      })

      test('reports route only accepts a specific report_id — no wildcard or partial match (static)', () => {
        requireSrc(src, 'reports.js')
        // No route param patterns like ':id?' or '*' that could accidentally match bare /api/reports
        assert.ok(
          !src.includes(':report_id?') && !src.includes('wildcard'),
          'reports.js must use exact :report_id param — no optional params that would match bare /api/reports'
        )
      })
    })

    describe('GET /api/reports (bare) → 404 — integration via Fastify inject', () => {
      let fastify
      let setupError = null

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
        } catch (err) {
          setupError = err
        }
      })

      test('GET /api/reports (no id) returns 404 (route not registered)', async () => {
        assert.ok(!setupError, `Fastify setup must succeed for integration tests — error: ${setupError}`)
        const resp = await fastify.inject({ method: 'GET', url: '/api/reports' })
        assert.equal(
          resp.statusCode, 404,
          `GET /api/reports must return 404 — listing endpoint is forbidden. Got ${resp.statusCode}: ${resp.body}`
        )
      })

      test('GET /api/reports/ (trailing slash, no id) returns 404', async () => {
        assert.ok(!setupError, `Fastify setup must succeed for integration tests — error: ${setupError}`)
        const resp = await fastify.inject({ method: 'GET', url: '/api/reports/' })
        assert.equal(
          resp.statusCode, 404,
          `GET /api/reports/ (trailing slash) must return 404. Got ${resp.statusCode}`
        )
      })

      test('GET /api/reports/:report_id returns 404 for unknown id (route registered; DB miss → 404)', async () => {
        assert.ok(!setupError, `Fastify setup must succeed for integration tests — error: ${setupError}`)
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
        requireSrc(src, 'jobs.js')
        // Cover all Fastify registration shapes (same as AC-1 reports check):
        //   (1) fastify.<verb>('/api/jobs', ...)
        //   (2) fastify.route({ url: '/api/jobs', ... })  or  { path: '/api/jobs', ... }
        //   (3) backtick template literals
        // Use [\s\S]*? (lazy dot-all) so a schema:{} block before url/path is not a gap.
        const hasBareJobsRoute =
          /fastify\.\w+\s*\(\s*[`'"]\/api\/jobs[`'"]\s*[,)]/.test(src) ||
          /fastify\.route\s*\(\s*\{[\s\S]*?\b(?:url|path)\s*:\s*[`'"]\/api\/jobs[`'"]/.test(src)
        assert.ok(
          !hasBareJobsRoute,
          'jobs.js must NOT register GET /api/jobs (bare, no id) — listing endpoint is explicitly forbidden (AC-2). Checked all forms: fastify.<verb>(path, …), fastify.route({url|path, …}), single/double/backtick quotes.'
        )
      })

      test('jobs.js registers /api/jobs/:job_id (parameterised — required polling route)', () => {
        requireSrc(src, 'jobs.js')
        // Tight: require the literal parameterised path — `job_id` alone matches too many
        // incidental references (destructuring, variable names, comments) to be evidence
        // that the route is actually registered.
        assert.ok(
          src.includes('/api/jobs/:job_id'),
          'jobs.js must register /api/jobs/:job_id literally for job status polling'
        )
      })
    })

    describe('GET /api/jobs (bare) → 404 — integration via Fastify inject', () => {
      let fastify
      let setupError = null

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
        } catch (err) {
          setupError = err
        }
      })

      test('GET /api/jobs (no id) returns 404 (route not registered)', async () => {
        assert.ok(!setupError, `Fastify setup must succeed for integration tests — error: ${setupError}`)
        const resp = await fastify.inject({ method: 'GET', url: '/api/jobs' })
        assert.equal(
          resp.statusCode, 404,
          `GET /api/jobs must return 404 — listing endpoint is forbidden. Got ${resp.statusCode}: ${resp.body}`
        )
      })

      test('GET /api/jobs/ (trailing slash) returns 404', async () => {
        assert.ok(!setupError, `Fastify setup must succeed for integration tests — error: ${setupError}`)
        const resp = await fastify.inject({ method: 'GET', url: '/api/jobs/' })
        assert.equal(
          resp.statusCode, 404,
          `GET /api/jobs/ (trailing slash) must return 404. Got ${resp.statusCode}`
        )
      })

      test('GET /api/jobs/:job_id returns 404 for unknown id (route registered; DB miss → 404)', async () => {
        assert.ok(!setupError, `Fastify setup must succeed for integration tests — error: ${setupError}`)
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
      requireSrc(src, 'queries.js')
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
      requireSrc(src, 'queries.js')
      // Must verify getReport specifically uses Drizzle eq(reports.reportId, ...) — not just that
      // 'reportId' appears somewhere (insertReport also uses it and would give a false pass).
      assert.ok(
        /eq\s*\(\s*reports\.reportId/.test(src),
        'queries.js getReport must use Drizzle eq(reports.reportId, ...) for strict equality — mere presence of "reportId" is insufficient'
      )
      // LIKE or range queries on report_id would allow prefix-guessing attacks
      assert.ok(
        !src.includes('LIKE') && !src.includes('BETWEEN') && !src.includes('GLOB'),
        'queries.js must not use LIKE/BETWEEN/GLOB on report_id — equality (=) only'
      )
    })

    test('queries.js does not export a getAll / listReports / findReports function (static)', () => {
      requireSrc(src, 'queries.js')
      // Cover all ESM export forms: `export function`, `export const`, `export let`, `export var`
      // (including async variants). `export function <name>` alone misses arrow-function exports
      // like `export const getAll = () => ...`.
      // Use regex literals (not new RegExp()) to avoid template-literal double-escaping pitfalls.
      const badExportPatterns = [
        /export\s+(?:async\s+)?(?:function|const|let|var)\s+getAll\b/,
        /export\s+(?:async\s+)?(?:function|const|let|var)\s+listReports\b/,
        /export\s+(?:async\s+)?(?:function|const|let|var)\s+findReports\b/,
        /export\s+(?:async\s+)?(?:function|const|let|var)\s+getAllReports\b/,
        /export\s+(?:async\s+)?(?:function|const|let|var)\s+selectAll\b/,
      ]
      const violates = badExportPatterns.some(p => p.test(src))
      assert.ok(
        !violates,
        'queries.js must not export any function that returns multiple reports — cross-report access is forbidden (AC-3). Checked: export function/const/let/var (including async variants).'
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
      requireSrc(queriesSrc, 'queries.js')
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
      requireSrc(reportsSrc, 'reports.js')
      // Word-boundary scan: catch any job-query identifier appearing in reports.js.
      // Plain substring checks would miss e.g. a rename to `createJobV2` but the word-boundary
      // regex still matches the stem. Extended set: original missed updateJobError.
      const JOB_QUERY_NAMES = [
        /\bgetJobStatus\b/,
        /\bupdateJobStatus\b/,
        /\bupdateJobError\b/,
        /\bcreateJob\b/,
        /\bgenerationJobs\b/,         // Drizzle schema import name
        /\bgeneration_jobs\b/,        // raw SQL table name
      ]
      const offenders = JOB_QUERY_NAMES.filter(re => re.test(reportsSrc))
      assert.equal(
        offenders.length, 0,
        `reports.js must not reference generation_jobs queries — report access is isolated from job data. Matched: ${offenders.map(r => r.source).join(', ')}`
      )
    })

    test('jobs route does not import or call any reports query (static)', () => {
      requireSrc(jobsSrc, 'jobs.js')
      // Word-boundary scan: plain includes('reports') would match comments or longer words.
      // Target explicit names + Drizzle query-builder patterns against the `reports` table.
      const REPORT_QUERY_NAMES = [
        /\bgetReport\b/,
        /\binsertReport\b/,
        /\.from\s*\(\s*reports\s*\)/,  // Drizzle .from(reports) — cross-table access
        /\beq\s*\(\s*reports\./,       // Drizzle eq(reports.<col>, …)
      ]
      const offenders = REPORT_QUERY_NAMES.filter(re => re.test(jobsSrc))
      assert.equal(
        offenders.length, 0,
        `jobs.js must not reference reports queries — job polling is isolated from report data. Matched: ${offenders.map(r => r.source).join(', ')}`
      )
    })
  })

  // ── AC-5: job_id never in final report URL ────────────────────────────────
  describe('AC-5: job_id never appears in final report URL — only report_id', () => {

    describe('routes/reports.js — URL param is report_id, not job_id (static)', () => {
      let src

      before(() => { src = readSrc(REPORTS_ROUTE_PATH) })

      test('reports route uses :report_id as URL param — not :job_id or :id (static)', () => {
        requireSrc(src, 'reports.js')
        // Tight: require the literal `:report_id` route-param form.
        // The previous `|| src.includes('report_id')` fallback matched any occurrence
        // of the token (comments, variable names) and made the positive check vacuous.
        assert.ok(
          src.includes(':report_id'),
          'reports.js must use :report_id as the URL parameter — literal `:report_id` must appear'
        )
        assert.ok(
          !src.includes(':job_id'),
          'reports.js must NOT use :job_id as a URL parameter — job_id must never appear in report URLs'
        )
      })

      test('reports route does not expose job_id in response body (static)', () => {
        requireSrc(src, 'reports.js')
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
        requireSrc(src, 'generate.js')
        // Verify report_id appears in the reply.status(202).send(...) expression specifically,
        // not just anywhere in the file (it also appears in db.createJob call arguments).
        assert.ok(
          /reply\.status\s*\(\s*202\s*\)[\s\S]{0,100}report_id/.test(src),
          'generate.js must include report_id in the reply.status(202).send() body so the client can construct the report URL'
        )
      })

      test('generate route returns job_id only for polling — report URL must use report_id', () => {
        requireSrc(src, 'generate.js')
        // Tight: require BOTH identifiers inside the 202 response body specifically,
        // not "somewhere in the file" (they also appear in createJob args and imports).
        // Window is 200 chars to cover a multi-line `send({ data: { job_id, report_id } })`.
        const replyWindow = src.match(/reply\.status\s*\(\s*202\s*\)[\s\S]{0,200}/)
        assert.ok(
          replyWindow && /\bjob_id\b/.test(replyWindow[0]) && /\breport_id\b/.test(replyWindow[0]),
          'generate.js 202 response must include BOTH job_id (for polling) and report_id (for report URL) — distinct identifiers for distinct flows'
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
        requireSrc(src, 'generate.js')
        // Verify randomUUID() is called at least twice (once for job_id, once for report_id)
        const randomUUIDCalls = (src.match(/randomUUID\(\)/g) || []).length
        assert.ok(
          randomUUIDCalls >= 2,
          `generate.js must call randomUUID() at least twice — once for job_id and once for report_id. Found ${randomUUIDCalls} call(s)`
        )
        // Verify each ID variable is specifically assigned via randomUUID()
        assert.ok(
          /job_id\s*=\s*randomUUID\(\)/.test(src),
          'generate.js must assign job_id via randomUUID() — never a sequential integer or timestamp'
        )
        assert.ok(
          /report_id\s*=\s*randomUUID\(\)/.test(src),
          'generate.js must assign report_id via randomUUID() — never a sequential integer or timestamp'
        )
      })

      test('generate.js does not use auto-increment integers or timestamps as IDs (static)', () => {
        requireSrc(src, 'generate.js')
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
      let importError = null

      before(async () => {
        try {
          const crypto = await import('node:crypto')
          randomUUID = crypto.randomUUID
        } catch (err) {
          importError = err
        }
      })

      test('node:crypto.randomUUID is available (required — Node ≥ 22)', () => {
        // Fail loudly if the built-in is missing. Original `if (!randomUUID) return`
        // would silently pass even on a broken runtime.
        assert.ok(!importError, `node:crypto import must succeed — got error: ${importError}`)
        assert.equal(typeof randomUUID, 'function', 'node:crypto.randomUUID must be a function')
      })

      test('two consecutive randomUUID() calls produce different values', () => {
        assert.equal(typeof randomUUID, 'function', 'randomUUID must be available')
        const id1 = randomUUID()
        const id2 = randomUUID()
        assert.notEqual(id1, id2, 'Two consecutive randomUUID() calls must never produce the same UUID')
      })

      test('randomUUID() produces a valid UUID v4 format (xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx)', () => {
        assert.equal(typeof randomUUID, 'function', 'randomUUID must be available')
        const id = randomUUID()
        const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
        assert.match(id, UUID_V4_RE, `randomUUID() must produce a UUID v4 format, got: "${id}"`)
      })

      test('10000 UUIDs are all unique AND structurally distributed (probabilistic collision + entropy smoke)', () => {
        // 10k ≫ 1k: collision probability for UUID v4 (122-bit) at N=10⁴ is
        //   ≈ N²/(2·2¹²²) ≈ 10⁸ / 10³⁷ ≈ 10⁻²⁹ — still vanishing, but now we also
        // run a weak entropy smoke: the first hex nibble of each UUID should span
        // more than 8 distinct values over 10k samples. A sequential/timestamp-based
        // replacement of randomUUID would fail this structural check even if uniqueness
        // held by chance.
        assert.equal(typeof randomUUID, 'function', 'randomUUID must be available')
        const ids = new Set()
        const firstHexNibbles = new Set()
        for (let i = 0; i < 10_000; i++) {
          const id = randomUUID()
          ids.add(id)
          firstHexNibbles.add(id.charAt(0))
        }
        assert.equal(ids.size, 10_000, '10,000 generated UUIDs must all be unique — UUID v4 collision is cryptographically negligible')
        // 16 possible hex nibbles; over 10k samples we expect all 16 to appear.
        // Accept ≥ 12 as a conservative floor to avoid flakiness on rare outliers.
        assert.ok(
          firstHexNibbles.size >= 12,
          `UUID first-char nibble distribution is suspiciously narrow (${firstHexNibbles.size}/16 distinct values in 10k samples) — possible non-random source`
        )
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
      requireSrc(queriesSrc, 'queries.js')
      const hasJoin =
        /\.from\s*\(\s*generationJobs\s*\)[\s\S]*?\.(left|inner|right|full|cross)Join\s*\(\s*reports/m.test(queriesSrc) ||
        /\.from\s*\(\s*reports\s*\)[\s\S]*?\.(left|inner|right|full|cross)Join\s*\(\s*generationJobs/m.test(queriesSrc)
      assert.ok(
        !hasJoin,
        'queries.js must not JOIN generation_jobs and reports — such a query would expose cross-seller job data via the report lookup path'
      )
    })

    test('reports route handler only calls getReport (not getJobStatus or cross-table queries) (static)', () => {
      requireSrc(reportsSrc, 'reports.js')
      // The reports route should only call getReport — never getJobStatus (which reads generation_jobs)
      assert.ok(
        !reportsSrc.includes('getJobStatus') && !reportsSrc.includes('generationJobs'),
        'reports.js route must only call getReport — must not cross into generation_jobs data'
      )
    })

    test('jobs route handler only calls getJobStatus (not getReport or cross-table queries) (static)', () => {
      requireSrc(jobsSrc, 'jobs.js')
      assert.ok(
        !jobsSrc.includes('getReport') && !jobsSrc.includes('insertReport'),
        'jobs.js route must only call getJobStatus — must not cross into reports data'
      )
    })

    test('server.js does not register bare /api/reports or /api/jobs listing routes directly (static)', () => {
      // server.js is the composition root — it could bypass route plugins by registering a bare
      // listing route directly. This test locks that invariant so no future refactor silently
      // introduces a listing endpoint at the server level.
      requireSrc(serverSrc, 'server.js')
      const hasBareReportsInServer =
        /fastify\.\w+\s*\(\s*[`'"]\/api\/reports[`'"]\s*[,)]/.test(serverSrc) ||
        /fastify\.route\s*\(\s*\{[\s\S]*?\b(?:url|path)\s*:\s*[`'"]\/api\/reports[`'"]/.test(serverSrc)
      const hasBareJobsInServer =
        /fastify\.\w+\s*\(\s*[`'"]\/api\/jobs[`'"]\s*[,)]/.test(serverSrc) ||
        /fastify\.route\s*\(\s*\{[\s\S]*?\b(?:url|path)\s*:\s*[`'"]\/api\/jobs[`'"]/.test(serverSrc)
      assert.ok(
        !hasBareReportsInServer,
        'server.js must not register GET /api/reports (bare) directly — listing endpoint is forbidden at the server level too (AC-1)'
      )
      assert.ok(
        !hasBareJobsInServer,
        'server.js must not register GET /api/jobs (bare) directly — listing endpoint is forbidden at the server level too (AC-2)'
      )
    })
  })

  // ── STATIC: Cross-cutting isolation invariants ────────────────────────────
  describe('STATIC: Cross-seller isolation — report_id is the sole access token', () => {
    let reportsSrc

    before(() => { reportsSrc = readSrc(REPORTS_ROUTE_PATH) })

    test('reports route does not accept email or marketplace_url as query/path params (static)', () => {
      requireSrc(reportsSrc, 'reports.js')
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
      requireSrc(reportsSrc, 'reports.js')
      // Uniform-404 invariant: the same message must be returned for "expired" and "never-existed"
      // so an attacker cannot distinguish the two cases and enumerate report_ids.
      //
      // Negative guard: no distinguishing wording (would leak existence).
      //   - "pertence a" / "belongs to"       — cross-owner leak
      //   - "expired" as a separate branch    — different message for expired vs missing
      //   - "nunca existiu" / "never existed" — distinguishes from expired
      const DISTINGUISHING_PATTERNS = [
        /pertence\s+a/i,
        /belongs\s+to/i,
        /nunca\s+existiu/i,
        /never\s+existed/i,
        /already\s+expired/i,
      ]
      const hasDistinguishingWording = DISTINGUISHING_PATTERNS.some(p => p.test(reportsSrc))
      assert.ok(
        !hasDistinguishingWording,
        'reports.js must not contain wording that distinguishes expired-vs-never-existed 404s — uniform 404 message is required (AC-8)'
      )
      // Positive guard: the uniform Portuguese 404 message root MUST be present
      // (the next test pins the exact spec string; this one only enforces uniformity).
      // The previous `|| reportsSrc.includes('404')` clause was trivially true because
      // reports.js uses `.status(404)` — making the whole assertion vacuous. Removed.
      assert.ok(
        reportsSrc.includes('expirou') && reportsSrc.includes('não existe'),
        'reports.js must contain the uniform Portuguese 404 message stem ("expirou ou não existe") — same text for expired and never-existed'
      )
    })

    test('reports route 404 message is the exact spec-mandated Portuguese string (no ambiguity about expired vs never-existed)', () => {
      // Architecture spec: uniform 404 prevents enumeration attacks (expired vs never-existed must look identical).
      // The constant PT_404_MESSAGE in reports.js must match the spec-mandated string exactly.
      // assert.ok(true) was used here before — replaced with a meaningful static assertion.
      const PT_404_SPEC = 'Este relatório expirou ou não existe. Gera um novo relatório para obteres dados actualizados.'
      assert.ok(
        reportsSrc && reportsSrc.includes(PT_404_SPEC),
        `reports.js must contain the exact spec-mandated 404 message: "${PT_404_SPEC}" — any deviation risks leaking existence information`
      )
    })
  })

  // ── STATIC: NFR-S2 — no api_key exposure in governance layer ─────────────
  describe('STATIC: NFR-S2 — no api_key in any governance-layer file', () => {
    const FILES_TO_CHECK = [
      { label: 'queries.js',  path: QUERIES_PATH       },
      { label: 'reports.js',  path: REPORTS_ROUTE_PATH  },
      { label: 'jobs.js',     path: JOBS_ROUTE_PATH     },
    ]

    // Cover every naming convention that could carry a Mirakl credential through
    // a log or HTTP response in the governance layer:
    //   api_key, apiKey, api-key, API_KEY  — variable/field naming styles (snake/camel/kebab/screaming)
    //   Authorization                      — header name (raw Mirakl key goes in this header)
    //   Bearer                             — token scheme prefix
    // The original test only matched `api_key`, which would miss `apiKey` (the camelCase
    // name used throughout the worker layer) — a silent gap identified in the Step 5
    // adversarial review.
    const CREDENTIAL_TOKEN_RE = /\b(?:api_key|apiKey|api-key|API_KEY|Authorization|Bearer)\b/

    // Sinks that would leak a credential if it flowed into them:
    //   log  — fastify.log.*, request.log.*, pino instances
    //   console — any console.*
    //   send / reply — HTTP response bodies/headers
    //   JSON.stringify — could serialise an object containing the key into a log
    const SINK_RE = /\b(?:log|console|send|reply|JSON\.stringify)\b/

    for (const { label, path: filePath } of FILES_TO_CHECK) {
      test(`${label} does not log or expose credential tokens — NFR-S2 (api_key, apiKey, Authorization, Bearer)`, () => {
        let src
        try { src = codeLines(readFileSync(filePath, 'utf8')) } catch (_) {
          // Missing governance-layer file is itself a failure — do not silently skip.
          assert.fail(`${label} must be readable for NFR-S2 static scan — file not found at ${filePath}`)
        }
        const offendingLines = src.split('\n').filter(l =>
          SINK_RE.test(l) && CREDENTIAL_TOKEN_RE.test(l)
        )
        assert.equal(
          offendingLines.length, 0,
          `${label} must not surface any credential token (api_key/apiKey/api-key/API_KEY/Authorization/Bearer) via log/console/send/reply/JSON.stringify — NFR-S2. Offending lines:\n${offendingLines.join('\n')}`
        )
      })
    }

    // Additionally assert that governance-layer files do not even reference credential
    // tokens at all — the governance layer should be credential-free by construction.
    // (Mirakl API keys flow through generate.js → keyStore → worker, never through
    // queries.js / reports.js / jobs.js.)
    for (const { label, path: filePath } of FILES_TO_CHECK) {
      test(`${label} contains no credential-token references at all (defence-in-depth for NFR-S2)`, () => {
        let src
        try { src = codeLines(readFileSync(filePath, 'utf8')) } catch (_) {
          assert.fail(`${label} must be readable — file not found at ${filePath}`)
        }
        const referencingLines = src.split('\n').filter(l => CREDENTIAL_TOKEN_RE.test(l))
        assert.equal(
          referencingLines.length, 0,
          `${label} must not reference any credential token — the governance layer is credential-free by design. Offending lines:\n${referencingLines.join('\n')}`
        )
      })
    }
  })
})
