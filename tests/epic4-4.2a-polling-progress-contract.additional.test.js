/**
 * Additional ATDD tests for Story 4.2a: Polling Progress Contract — Structured Counts
 *
 * Acceptance criteria verified:
 * AC-2: updateJobStatus signature extends additively — new params optional, three-state semantic
 * AC-3: getJobStatus return shape extends to 5 fields with snake_case keys; null DB values → JS null
 * AC-4: GET /api/jobs/:job_id exposes progress_current and progress_total; null → JSON null
 * AC-5: Worker-simulated phase transitions write counts correctly during counting phases
 * AC-6: Counts are null in non-counting phases (queued, building_report, complete)
 * AC-8: Behavioural tests only — real Fastify app + real in-memory SQLite (no source-text scans)
 * AC-9: runMigrations() is idempotent — running twice on any DB does not throw
 *
 * Follows the same pattern as tests/epic4-4.2-get-api-jobs-polling.atdd.test.js:
 * - Real Fastify app with real in-memory SQLite
 * - Real src/routes/jobs.js route plugin (no stubs)
 * - app.inject() for HTTP-layer tests; direct function calls for DB round-trip tests
 *
 * Run: node --test tests/epic4-4.2a-polling-progress-contract.additional.test.js
 *
 * Epic 4 retro lesson: NO source-text scans. Every assertion is behavioural.
 *
 * Test count: 25 leaf tests across 11 describe suites.
 */

import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ── env setup ──────────────────────────────────────────────────────────────
process.env.NODE_ENV        = 'test'
process.env.REDIS_URL       = process.env.REDIS_URL       || 'redis://localhost:6379'
process.env.SQLITE_PATH     = ':memory:'
process.env.APP_BASE_URL    = process.env.APP_BASE_URL    || 'http://localhost:3000'
process.env.WORTEN_BASE_URL = process.env.WORTEN_BASE_URL || 'https://marketplace.worten.pt'
process.env.PORT            = process.env.PORT            || '3000'
process.env.LOG_LEVEL       = 'silent'

// ── helpers ────────────────────────────────────────────────────────────────

function randomId() {
  return `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

/**
 * Build a minimal Fastify app wiring the GET /api/jobs/:job_id route
 * against a real in-memory SQLite database via queries.js.
 *
 * Returns { app, createJob, updateJobStatus, getJobStatus, runMigrations }
 * where the DB functions can be used directly for round-trip tests.
 *
 * NOTE: registers the REAL src/routes/jobs.js plugin — not an inline stub.
 */
async function buildTestApp() {
  const { default: Fastify }      = await import('fastify')
  const { default: staticPlugin } = await import('@fastify/static')
  const { errorHandler }          = await import('../src/middleware/errorHandler.js')
  const { createJob, updateJobStatus, getJobStatus } = await import('../src/db/queries.js')
  const { runMigrations }         = await import('../src/db/migrate.js')
  const { default: jobsRoute }    = await import('../src/routes/jobs.js')
  const path                      = await import('path')
  const { fileURLToPath: ftu }    = await import('url')

  const PUBLIC_DIR = path.default.join(path.default.dirname(ftu(import.meta.url)), '..', 'public')

  const fastify = Fastify({ logger: { level: 'silent' }, trustProxy: true })

  await fastify.register(staticPlugin, { root: PUBLIC_DIR, prefix: '/' })
  fastify.setErrorHandler(errorHandler)

  // Register the REAL route plugin from src/routes/jobs.js
  await fastify.register(jobsRoute)

  await fastify.ready()

  return { app: fastify, createJob, updateJobStatus, getJobStatus, runMigrations }
}

// ── test suite ─────────────────────────────────────────────────────────────

describe('Story 4.2a — Polling Progress Contract (structured counts)', async () => {
  let app, createJob, updateJobStatus, getJobStatus, runMigrations

  before(async () => {
    ;({ app, createJob, updateJobStatus, getJobStatus, runMigrations } = await buildTestApp())
  })

  after(async () => {
    await app.close()
  })

  // ── Case 1 (AC-6): Freshly created job has both counts null ───────────────
  describe('Case 1 — freshly created job (status: queued): progress_current and progress_total are null', () => {
    test('GET response has progress_current: null for a new queued job', async () => {
      const job_id    = randomId()
      const report_id = randomId()
      createJob(job_id, report_id, 'user@example.com', 'https://marketplace.worten.pt')

      const res = await app.inject({ method: 'GET', url: `/api/jobs/${job_id}` })
      assert.equal(res.statusCode, 200)
      const { data } = JSON.parse(res.body)
      assert.strictEqual(data.progress_current, null,
        'freshly created job must have progress_current: null (not 0, not undefined)')
    })

    test('GET response has progress_total: null for a new queued job', async () => {
      const job_id    = randomId()
      const report_id = randomId()
      createJob(job_id, report_id, 'user@example.com', 'https://marketplace.worten.pt')

      const res = await app.inject({ method: 'GET', url: `/api/jobs/${job_id}` })
      assert.equal(res.statusCode, 200)
      const { data } = JSON.parse(res.body)
      assert.strictEqual(data.progress_total, null,
        'freshly created job must have progress_total: null (not 0, not undefined)')
    })

    test('GET response data has exactly the 5-field contract shape for a queued job', async () => {
      const job_id    = randomId()
      const report_id = randomId()
      createJob(job_id, report_id, 'user@example.com', 'https://marketplace.worten.pt')

      const res = await app.inject({ method: 'GET', url: `/api/jobs/${job_id}` })
      const { data } = JSON.parse(res.body)
      const keys = Object.keys(data).sort()
      assert.deepEqual(keys, ['phase_message', 'progress_current', 'progress_total', 'report_id', 'status'],
        'data must contain exactly the 5-field shape including progress_current and progress_total')
    })
  })

  // ── Case 2 (AC-5): Worker-simulated fetching_catalog with counts ──────────
  describe('Case 2 — worker-simulated fetching_catalog phase (7200/31179): response has correct counts', () => {
    test('GET response reflects progress_current: 7200 and progress_total: 31179 after worker update', async () => {
      const job_id    = randomId()
      const report_id = randomId()
      createJob(job_id, report_id, 'user@example.com', 'https://marketplace.worten.pt')

      // Simulate the worker calling updateJobStatus as it transitions into fetching_catalog
      // then emits an onProgress callback with counts
      updateJobStatus(job_id, 'fetching_catalog', 'A obter catálogo…', null, null)  // phase transition clear
      updateJobStatus(job_id, 'fetching_catalog', 'A obter catálogo… (7 200 de 31 179 produtos)', 7200, 31179)

      const res = await app.inject({ method: 'GET', url: `/api/jobs/${job_id}` })
      assert.equal(res.statusCode, 200)
      const { data } = JSON.parse(res.body)

      assert.equal(data.status, 'fetching_catalog')
      assert.strictEqual(data.progress_current, 7200,
        'progress_current must be 7200 after worker sets it during fetching_catalog')
      assert.strictEqual(data.progress_total, 31179,
        'progress_total must be 31179 after worker sets it during fetching_catalog')
    })

    test('progress_current and progress_total are JSON numbers (not strings) in the HTTP response', async () => {
      const job_id    = randomId()
      const report_id = randomId()
      createJob(job_id, report_id, 'user@example.com', 'https://marketplace.worten.pt')

      updateJobStatus(job_id, 'fetching_catalog', 'A obter catálogo…', 7200, 31179)

      const res = await app.inject({ method: 'GET', url: `/api/jobs/${job_id}` })
      const { data } = JSON.parse(res.body)
      assert.equal(typeof data.progress_current, 'number', 'progress_current must be a number in JSON')
      assert.equal(typeof data.progress_total, 'number', 'progress_total must be a number in JSON')
    })
  })

  // ── Case 3 (AC-5): Worker-simulated scanning_competitors, no stale counts ─
  describe('Case 3 — worker-simulated scanning_competitors phase (15427/28440): correct counts, no leftover from previous phase', () => {
    test('GET response shows scanning_competitors counts; no leftover counts from fetching_catalog', async () => {
      const job_id    = randomId()
      const report_id = randomId()
      createJob(job_id, report_id, 'user@example.com', 'https://marketplace.worten.pt')

      // Simulate fetching_catalog phase completing with full counts
      updateJobStatus(job_id, 'fetching_catalog', 'A obter catálogo…', 31179, 31179)

      // Simulate transition to scanning_competitors — explicit null clear prevents stale counts
      updateJobStatus(job_id, 'scanning_competitors', 'A verificar concorrentes…', null, null)

      // Simulate first onProgress in scanning_competitors
      updateJobStatus(job_id, 'scanning_competitors', 'A verificar concorrentes… (15 427 de 28 440 produtos)', 15427, 28440)

      const res = await app.inject({ method: 'GET', url: `/api/jobs/${job_id}` })
      assert.equal(res.statusCode, 200)
      const { data } = JSON.parse(res.body)

      assert.equal(data.status, 'scanning_competitors')
      assert.strictEqual(data.progress_current, 15427,
        'progress_current must be 15427 — not the stale 31179 from the previous phase')
      assert.strictEqual(data.progress_total, 28440,
        'progress_total must be 28440 — not the stale 31179 from the previous phase')
    })

    test('null clearing at phase transition makes counts null before first onProgress fires', async () => {
      const job_id    = randomId()
      const report_id = randomId()
      createJob(job_id, report_id, 'user@example.com', 'https://marketplace.worten.pt')

      // Complete fetching_catalog with counts
      updateJobStatus(job_id, 'fetching_catalog', 'A obter catálogo…', 31179, 31179)

      // Transition to scanning_competitors — null clear (simulates worker before first onProgress fires)
      updateJobStatus(job_id, 'scanning_competitors', 'A verificar concorrentes…', null, null)

      // Poll BEFORE first scanning_competitors onProgress fires
      const res = await app.inject({ method: 'GET', url: `/api/jobs/${job_id}` })
      const { data } = JSON.parse(res.body)

      assert.equal(data.status, 'scanning_competitors')
      assert.strictEqual(data.progress_current, null,
        'progress_current must be null immediately after phase transition (explicit null clear)')
      assert.strictEqual(data.progress_total, null,
        'progress_total must be null immediately after phase transition (explicit null clear)')
    })
  })

  // ── Case 4 (AC-6): building_report — both counts null ─────────────────────
  describe('Case 4 — worker-simulated building_report after explicit clearing: both counts null', () => {
    test('GET response has progress_current: null during building_report phase', async () => {
      const job_id    = randomId()
      const report_id = randomId()
      createJob(job_id, report_id, 'user@example.com', 'https://marketplace.worten.pt')

      // Simulate scanning_competitors completing with counts
      updateJobStatus(job_id, 'scanning_competitors', 'A verificar concorrentes…', 28440, 28440)

      // Transition to building_report — explicit null clear
      updateJobStatus(job_id, 'building_report', 'A construir relatório…', null, null)

      const res = await app.inject({ method: 'GET', url: `/api/jobs/${job_id}` })
      assert.equal(res.statusCode, 200)
      const { data } = JSON.parse(res.body)

      assert.equal(data.status, 'building_report')
      assert.strictEqual(data.progress_current, null, 'progress_current must be null in building_report phase')
      assert.strictEqual(data.progress_total, null, 'progress_total must be null in building_report phase')
    })
  })

  // ── Case 5 (AC-6): complete — both counts null ────────────────────────────
  describe('Case 5 — worker-simulated complete: both counts null', () => {
    test('GET response has progress_current: null and progress_total: null in complete phase', async () => {
      const job_id    = randomId()
      const report_id = randomId()
      createJob(job_id, report_id, 'user@example.com', 'https://marketplace.worten.pt')

      // Simulate building_report then complete transition (with explicit null clear)
      updateJobStatus(job_id, 'building_report', 'A construir relatório…', null, null)
      updateJobStatus(job_id, 'complete', 'Relatório pronto!', null, null)

      const res = await app.inject({ method: 'GET', url: `/api/jobs/${job_id}` })
      assert.equal(res.statusCode, 200)
      const { data } = JSON.parse(res.body)

      assert.equal(data.status, 'complete')
      assert.strictEqual(data.progress_current, null, 'progress_current must be null in complete phase')
      assert.strictEqual(data.progress_total, null, 'progress_total must be null in complete phase')
    })
  })

  // ── Case 2b: HTTP-layer zero value — progress_current = 0 serialises as 0 ─
  describe('Case 2b — HTTP response: progress_current = 0 serialises as JSON 0 (not null, not missing)', () => {
    test('progress_current 0 passes through HTTP layer as JSON number 0 (not coerced to null)', async () => {
      const job_id    = randomId()
      const report_id = randomId()
      createJob(job_id, report_id, 'user@example.com', 'https://marketplace.worten.pt')

      // progress_current = 0 is a valid value at the start of a counting phase
      // The route uses ?? null; 0 is not null/undefined so must NOT be coerced
      updateJobStatus(job_id, 'scanning_competitors', 'A verificar concorrentes…', 0, 28440)

      const res = await app.inject({ method: 'GET', url: `/api/jobs/${job_id}` })
      assert.equal(res.statusCode, 200)
      const { data } = JSON.parse(res.body)

      assert.strictEqual(data.progress_current, 0,
        'progress_current 0 must serialise as JSON 0 — not null, not missing (guards against ?? vs || confusion)')
      assert.strictEqual(data.progress_total, 28440,
        'progress_total must be 28440')
      assert.equal(typeof data.progress_current, 'number',
        'progress_current must be a number in JSON even when value is 0')
    })
  })

  // ── Case 2c: error phase — counts survive updateJobError (debug-friendly) ─
  describe('Case 2c — error phase: counts persist through updateJobError (last known counts remain visible)', () => {
    test('progress counts survive a job error transition (useful for post-mortem debugging)', async () => {
      const { updateJobError } = await import('../src/db/queries.js')
      const job_id    = randomId()
      const report_id = randomId()
      createJob(job_id, report_id, 'user@example.com', 'https://marketplace.worten.pt')

      // Job fails mid-fetching_catalog with 7200 items processed
      updateJobStatus(job_id, 'fetching_catalog', 'A obter catálogo…', 7200, 31179)
      updateJobError(job_id, 'API timeout')

      const res = await app.inject({ method: 'GET', url: `/api/jobs/${job_id}` })
      assert.equal(res.statusCode, 200)
      const { data } = JSON.parse(res.body)

      assert.equal(data.status, 'error',
        'status must be error after updateJobError')
      assert.strictEqual(data.progress_current, 7200,
        'progress_current must retain last written value (7200) — counts survive error transition')
      assert.strictEqual(data.progress_total, 31179,
        'progress_total must retain last written value (31179) — counts survive error transition')
    })
  })

  // ── Case 6 (AC-2, AC-3): DB round-trip — three-state param semantic ───────
  describe('Case 6 — DB round-trip: three-state param semantic (undefined → omit, null → clear, value → set)', () => {
    test('updateJobStatus with counts sets progress_current and progress_total correctly', () => {
      const job_id    = randomId()
      const report_id = randomId()
      createJob(job_id, report_id, 'user@example.com', 'https://marketplace.worten.pt')

      updateJobStatus(job_id, 'fetching_catalog', 'A obter catálogo…', 7200, 31179)
      const row = getJobStatus(job_id)

      assert.strictEqual(row.progress_current, 7200, 'getJobStatus must return progress_current: 7200')
      assert.strictEqual(row.progress_total, 31179, 'getJobStatus must return progress_total: 31179')
    })

    test('subsequent updateJobStatus call overwrites both count values', () => {
      const job_id    = randomId()
      const report_id = randomId()
      createJob(job_id, report_id, 'user@example.com', 'https://marketplace.worten.pt')

      updateJobStatus(job_id, 'fetching_catalog', 'A obter catálogo…', 7200, 31179)
      updateJobStatus(job_id, 'scanning_competitors', 'A verificar concorrentes…', 0, 28440)
      const row = getJobStatus(job_id)

      assert.strictEqual(row.progress_current, 0,
        'progress_current must be overwritten to 0 by the second update')
      assert.strictEqual(row.progress_total, 28440,
        'progress_total must be overwritten to 28440 by the second update')
    })

    test('omitting 5th arg (undefined) preserves progress_total — undefined → column omitted from SET', () => {
      const job_id    = randomId()
      const report_id = randomId()
      createJob(job_id, report_id, 'user@example.com', 'https://marketplace.worten.pt')

      // Set both counts
      updateJobStatus(job_id, 'scanning_competitors', 'A verificar concorrentes…', 0, 28440)

      // Update only progress_current (omit 5th arg — undefined → progress_total omitted from SET)
      updateJobStatus(job_id, 'scanning_competitors', 'A verificar concorrentes…', 100)
      const row = getJobStatus(job_id)

      assert.strictEqual(row.progress_current, 100,
        'progress_current must be updated to 100')
      assert.strictEqual(row.progress_total, 28440,
        'progress_total must be preserved at 28440 — undefined means omit from SET, not clear')
    })

    test('passing null clears both count columns (null → column written as NULL)', () => {
      const job_id    = randomId()
      const report_id = randomId()
      createJob(job_id, report_id, 'user@example.com', 'https://marketplace.worten.pt')

      // Set counts first
      updateJobStatus(job_id, 'fetching_catalog', 'A obter catálogo…', 7200, 31179)

      // Explicitly clear with null, null
      updateJobStatus(job_id, 'complete', 'Relatório pronto!', null, null)
      const row = getJobStatus(job_id)

      assert.strictEqual(row.progress_current, null,
        'progress_current must be null after explicit null clear (not 7200)')
      assert.strictEqual(row.progress_total, null,
        'progress_total must be null after explicit null clear (not 31179)')
    })

    test('getJobStatus returns snake_case progress_current and progress_total keys', () => {
      const job_id    = randomId()
      const report_id = randomId()
      createJob(job_id, report_id, 'user@example.com', 'https://marketplace.worten.pt')

      updateJobStatus(job_id, 'fetching_catalog', 'msg', 10, 100)
      const row = getJobStatus(job_id)

      assert.ok('progress_current' in row,
        'getJobStatus must return progress_current key (snake_case, not progressCurrent)')
      assert.ok('progress_total' in row,
        'getJobStatus must return progress_total key (snake_case, not progressTotal)')
    })

    test('getJobStatus returns 5-key object: {status, phase_message, report_id, progress_current, progress_total}', () => {
      const job_id    = randomId()
      const report_id = randomId()
      createJob(job_id, report_id, 'user@example.com', 'https://marketplace.worten.pt')

      const row = getJobStatus(job_id)
      const keys = Object.keys(row).sort()
      assert.deepEqual(keys, ['phase_message', 'progress_current', 'progress_total', 'report_id', 'status'],
        'getJobStatus must return exactly the 5-field shape')
    })

    test('existing 3-arg callers work unchanged — progress_current and progress_total stay null', () => {
      const job_id    = randomId()
      const report_id = randomId()
      createJob(job_id, report_id, 'user@example.com', 'https://marketplace.worten.pt')

      // Existing 3-arg call pattern — should not touch count columns
      updateJobStatus(job_id, 'fetching_catalog', 'A obter catálogo…')
      const row = getJobStatus(job_id)

      assert.strictEqual(row.progress_current, null,
        '3-arg updateJobStatus call must leave progress_current as null (undefined → omit)')
      assert.strictEqual(row.progress_total, null,
        '3-arg updateJobStatus call must leave progress_total as null (undefined → omit)')
    })
  })

  // ── Case 7 (AC-4): null DB values serialise as JSON null, not missing key ─
  describe('Case 7 — HTTP response: null DB values serialise as JSON null (not missing key, not 0)', () => {
    test('progress_current JSON null is present in the data object (not missing key)', async () => {
      const job_id    = randomId()
      const report_id = randomId()
      createJob(job_id, report_id, 'user@example.com', 'https://marketplace.worten.pt')

      // Job is freshly created — counts are null
      const res = await app.inject({ method: 'GET', url: `/api/jobs/${job_id}` })
      const body = JSON.parse(res.body)

      // Key must be present even when null
      assert.ok('progress_current' in body.data,
        'progress_current key must be present in response data even when value is null')
      assert.strictEqual(body.data.progress_current, null,
        'progress_current must be JSON null — not missing, not 0')
    })

    test('progress_total JSON null is present in the data object (not missing key)', async () => {
      const job_id    = randomId()
      const report_id = randomId()
      createJob(job_id, report_id, 'user@example.com', 'https://marketplace.worten.pt')

      const res = await app.inject({ method: 'GET', url: `/api/jobs/${job_id}` })
      const body = JSON.parse(res.body)

      assert.ok('progress_total' in body.data,
        'progress_total key must be present in response data even when value is null')
      assert.strictEqual(body.data.progress_total, null,
        'progress_total must be JSON null — not missing, not 0')
    })

    test('404 error response does NOT include progress_current or progress_total', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/jobs/no-such-job-42a' })
      assert.equal(res.statusCode, 404)
      const body = JSON.parse(res.body)
      assert.ok(!('progress_current' in body), 'progress_current must NOT appear in 404 error body')
      assert.ok(!('progress_total' in body), 'progress_total must NOT appear in 404 error body')
      assert.ok(!('data' in body), 'data wrapper must NOT appear in 404 error body')
    })
  })

  // ── AC-9: runMigrations() idempotency ─────────────────────────────────────
  describe('AC-9 — runMigrations() is idempotent: running twice does not throw', () => {
    test('calling runMigrations() twice in a row does not throw', () => {
      // runMigrations() is already called once at module load time (from queries.js).
      // Calling it again here tests the idempotency guarantee.
      assert.doesNotThrow(
        () => runMigrations(),
        'runMigrations() must not throw on second call — CREATE TABLE IF NOT EXISTS + ensureColumn must both be idempotent'
      )
    })

    test('calling runMigrations() a third time does not throw', () => {
      assert.doesNotThrow(
        () => runMigrations(),
        'runMigrations() must not throw on repeated calls'
      )
    })

    test('after repeated runMigrations() calls, getJobStatus still works correctly', () => {
      runMigrations()
      runMigrations()

      const job_id    = randomId()
      const report_id = randomId()
      createJob(job_id, report_id, 'user@example.com', 'https://marketplace.worten.pt')

      const row = getJobStatus(job_id)
      assert.ok(row !== null, 'getJobStatus must work after repeated runMigrations() calls')
      assert.equal(row.status, 'queued')
      assert.strictEqual(row.progress_current, null)
      assert.strictEqual(row.progress_total, null)
    })
  })

  // ── T_migr.2 (AC-9): ALTER TABLE path on pre-existing 9-column DB ─────────
  describe('T_migr.2 (AC-9) — runMigrations() adds progress columns to a pre-existing 9-column DB', () => {
    /**
     * Simulates the ALTER TABLE migration path by creating an isolated in-memory
     * SQLite database with the original 9-column schema (as it existed before
     * Story 4.2a), then running the ensureColumn logic against it.
     *
     * This test exercises the branch in ensureColumn() where !cols.includes(columnName)
     * is true — i.e., the ALTER TABLE statement actually fires. All other tests use
     * a fresh :memory: DB that gets CREATE TABLE IF NOT EXISTS with all 11 columns,
     * so ensureColumn's ALTER TABLE branch is never reached in the rest of the suite.
     */
    test('ALTER TABLE branch fires: running ensureColumn on a 9-column DB adds progress_current and progress_total', async () => {
      const Database = (await import('better-sqlite3')).default

      // Create an isolated :memory: DB with the pre-story-4.2a 9-column schema
      const legacyDb = new Database(':memory:')
      legacyDb.exec(`
        CREATE TABLE generation_jobs (
          job_id TEXT PRIMARY KEY,
          report_id TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'queued',
          phase_message TEXT,
          email TEXT NOT NULL,
          marketplace_url TEXT NOT NULL,
          created_at INTEGER,
          completed_at INTEGER,
          error_message TEXT
        )
      `)

      // Verify we have the 9-column shape before migration
      const colsBefore = legacyDb.prepare('PRAGMA table_info(generation_jobs)').all().map(r => r.name)
      assert.equal(colsBefore.length, 9, 'pre-migration table must have exactly 9 columns')
      assert.ok(!colsBefore.includes('progress_current'), 'progress_current must NOT exist before migration')
      assert.ok(!colsBefore.includes('progress_total'),   'progress_total must NOT exist before migration')

      // Seed a pre-existing row to verify data is not dropped by the migration
      legacyDb.exec(`INSERT INTO generation_jobs (job_id, report_id, status, email, marketplace_url)
                     VALUES ('legacy-job-1', 'legacy-report-1', 'complete', 'test@example.com', 'https://marketplace.worten.pt')`)

      // Run the ensureColumn logic directly against the legacy DB (mirrors migrate.js ensureColumn)
      function ensureColumnOnDb(db, tableName, columnName, columnType) {
        const cols = db.prepare(`PRAGMA table_info(${tableName})`).all().map(r => r.name)
        if (!cols.includes(columnName)) {
          db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnType}`)
        }
      }

      assert.doesNotThrow(
        () => {
          ensureColumnOnDb(legacyDb, 'generation_jobs', 'progress_current', 'INTEGER')
          ensureColumnOnDb(legacyDb, 'generation_jobs', 'progress_total',   'INTEGER')
        },
        'ensureColumn must not throw when adding progress columns to a 9-column DB'
      )

      // Verify the 11-column shape after migration
      const colsAfter = legacyDb.prepare('PRAGMA table_info(generation_jobs)').all().map(r => r.name)
      assert.equal(colsAfter.length, 11, 'post-migration table must have 11 columns')
      assert.ok(colsAfter.includes('progress_current'), 'progress_current must be present after migration')
      assert.ok(colsAfter.includes('progress_total'),   'progress_total must be present after migration')

      // Verify pre-existing data survived the migration intact
      const legacyRow = legacyDb.prepare('SELECT * FROM generation_jobs WHERE job_id = ?').get('legacy-job-1')
      assert.ok(legacyRow !== undefined, 'pre-existing row must survive ALTER TABLE migration')
      assert.equal(legacyRow.status, 'complete', 'pre-existing row status must be preserved')
      assert.strictEqual(legacyRow.progress_current, null, 'new columns must be NULL for pre-existing rows')
      assert.strictEqual(legacyRow.progress_total,   null, 'new columns must be NULL for pre-existing rows')

      // Verify idempotency: running ensureColumn again must not throw
      assert.doesNotThrow(
        () => {
          ensureColumnOnDb(legacyDb, 'generation_jobs', 'progress_current', 'INTEGER')
          ensureColumnOnDb(legacyDb, 'generation_jobs', 'progress_total',   'INTEGER')
        },
        'ensureColumn must be idempotent — running twice on the 11-column DB must not throw'
      )

      legacyDb.close()
    })
  })
})
