/**
 * ATDD tests for Story 1.3: SQLite Schema and Drizzle Setup
 *
 * These tests verify all acceptance criteria from the story spec:
 * AC-1: generation_jobs table exists with correct columns (NO api_key)
 * AC-2: reports table exists with correct columns
 * AC-3: idx_reports_expires_at index exists on reports(expires_at)
 * AC-4: queries.js exports exactly the six required functions
 * AC-5: queries.js is the ONLY file that executes SQL reads/writes (static check)
 * AC-6: getReport returns null for non-existent or expired report (never throws)
 * AC-7: database.js reads DB path from config.SQLITE_PATH (static check)
 * AC-8: No api_key anywhere in src/db/ (static check)
 *
 * Uses Node.js built-in test runner (node:test) — no extra dependencies needed.
 * Run: node --test tests/db.atdd.test.js
 *
 * Tests run against a real temp SQLite file so we exercise the actual
 * Drizzle + better-sqlite3 integration without side-effects on production data.
 */

import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, mkdtempSync, rmSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import os from 'node:os'
import Database from 'better-sqlite3'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SRC_DB_DIR = path.join(__dirname, '..', 'src', 'db')

// ── env setup ──────────────────────────────────────────────────────────────
// Point SQLITE_PATH to a temp file so tests don't touch production data.
// Must be set BEFORE any config.js or database.js import resolves.
const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'mp-test-'))
const TEST_DB_PATH = path.join(tmpDir, 'test.db')

// Capture original env values so the after() hook can restore them.
const _origEnv = {
  SQLITE_PATH:     process.env.SQLITE_PATH,
  REDIS_URL:       process.env.REDIS_URL,
  APP_BASE_URL:    process.env.APP_BASE_URL,
  WORTEN_BASE_URL: process.env.WORTEN_BASE_URL,
  PORT:            process.env.PORT,
  LOG_LEVEL:       process.env.LOG_LEVEL,
}

process.env.SQLITE_PATH     = TEST_DB_PATH
process.env.REDIS_URL       = process.env.REDIS_URL       || 'redis://localhost:6379'
process.env.APP_BASE_URL    = process.env.APP_BASE_URL    || 'http://localhost:3000'
process.env.WORTEN_BASE_URL = process.env.WORTEN_BASE_URL || 'https://www.worten.pt'
process.env.PORT            = process.env.PORT            || '3000'
process.env.LOG_LEVEL       = 'silent'

// ── helper: open a raw sqlite3 connection to the test db ──────────────────
function rawDb() {
  return new Database(TEST_DB_PATH)
}

// ── AC-8 / AC-5 / AC-7: Static source-code assertions ────────────────────
// These run without importing db modules so they work even before implementation.

describe('AC-8 — No api_key anywhere in src/db/', () => {
  const dbFiles = ['schema.js', 'database.js', 'migrate.js', 'queries.js']

  for (const filename of dbFiles) {
    test(`${filename} must not contain "api_key"`, () => {
      let src
      try {
        src = readFileSync(path.join(SRC_DB_DIR, filename), 'utf8')
      } catch {
        // File does not yet exist — skip gracefully; dev story will create it
        return
      }
      assert.ok(
        !src.includes('api_key'),
        `SECURITY FAILURE: "${filename}" contains the string "api_key"`,
      )
    })
  }
})

describe('AC-7 — database.js uses config.SQLITE_PATH (not hardcoded)', () => {
  test('database.js imports from ../config.js and references SQLITE_PATH', () => {
    let src
    try {
      src = readFileSync(path.join(SRC_DB_DIR, 'database.js'), 'utf8')
    } catch {
      return // not yet created — will be verified post-implementation
    }
    assert.ok(
      src.includes('config.js') || src.includes('../config'),
      'database.js must import from config.js',
    )
    assert.ok(
      src.includes('SQLITE_PATH'),
      'database.js must reference config.SQLITE_PATH',
    )
    assert.ok(
      !/['"`]\/data\//.test(src),
      'database.js must not hard-code a /data/ path',
    )
  })
})

describe('AC-5 — queries.js is the ONLY file in src/ that executes DB reads/writes', () => {
  // Drizzle DML builders: db.insert/select/update/delete
  // Raw better-sqlite3 calls: db.prepare(), db.exec()
  // We check every non-infrastructure source file under src/ to ensure none of
  // these patterns appear — keeping the data-access boundary strict.
  const DB_CALL_PATTERN = /\bdb\.(insert|select|update|delete|prepare|exec)\(/

  // Collect all .js files under src/ except queries.js itself
  function collectJsFiles(dir) {
    const results = []
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry)
      if (statSync(full).isDirectory()) {
        results.push(...collectJsFiles(full))
      } else if (entry.endsWith('.js')) {
        results.push(full)
      }
    }
    return results
  }

  const SRC_DIR = path.join(__dirname, '..', 'src')
  // Sanctioned DB infrastructure files — excluded from the check.
  // queries.js: the authorised DML layer.
  // database.js: opens the connection and sets pragmas (not DML).
  // migrate.js: DDL-only bootstrap (CREATE TABLE / CREATE INDEX — not DML reads/writes).
  const EXCLUDED = new Set([
    path.join(SRC_DB_DIR, 'queries.js'),
    path.join(SRC_DB_DIR, 'database.js'),
    path.join(SRC_DB_DIR, 'migrate.js'),
  ])

  let srcFiles
  try {
    srcFiles = collectJsFiles(SRC_DIR).filter(f => !EXCLUDED.has(f))
  } catch {
    srcFiles = []
  }

  for (const filePath of srcFiles) {
    const relPath = path.relative(path.join(__dirname, '..'), filePath)
    test(`${relPath} must not contain direct DB read/write calls`, () => {
      let src
      try {
        src = readFileSync(filePath, 'utf8')
      } catch {
        return // file not yet created — skip
      }
      assert.ok(
        !DB_CALL_PATTERN.test(src),
        `ARCHITECTURE VIOLATION: "${relPath}" contains direct DB calls (.run/.all/.get/.execute/db.prepare/db.exec). ` +
        'All DB access must go through src/db/queries.js.',
      )
    })
  }
})

// ── Runtime integration tests ──────────────────────────────────────────────
// These import the actual modules and exercise them end-to-end.

describe('DB integration — schema, queries, and null-safety', () => {
  let createJob, updateJobStatus, updateJobError, insertReport, getReport, getJobStatus

  before(async () => {
    // Bootstrap the schema first
    try {
      const { runMigrations } = await import('../src/db/migrate.js')
      runMigrations()
    } catch {
      // If module not yet created, runtime tests will fail with clear messages
      return
    }

    try {
      ;({ createJob, updateJobStatus, updateJobError, insertReport, getReport, getJobStatus } =
        await import('../src/db/queries.js'))
    } catch {
      // handled per-test via guard checks
    }
  })

  after(async () => {
    // Close the Drizzle/better-sqlite3 connection before deleting the temp directory.
    // On Windows, an open file handle prevents rmSync from removing the locked DB file.
    try {
      const { sqlite } = await import('../src/db/database.js')
      sqlite.close()
    } catch { /* ignore if module was never loaded */ }
    try { rmSync(tmpDir, { recursive: true, force: true }) } catch { /* ignore */ }

    // Restore original env values so this test file does not pollute other test files.
    for (const [key, val] of Object.entries(_origEnv)) {
      if (val === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = val
      }
    }
  })

  // ── AC-1: generation_jobs table columns ──────────────────────────────────

  describe('AC-1 — generation_jobs table structure', () => {
    test('generation_jobs table exists', () => {
      const db = rawDb()
      const row = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='generation_jobs'",
      ).get()
      db.close()
      assert.ok(row, 'generation_jobs table must exist after runMigrations()')
    })

    test('generation_jobs has all required columns', () => {
      const db = rawDb()
      const cols = db.prepare('PRAGMA table_info(generation_jobs)').all()
      db.close()
      const colNames = cols.map(c => c.name)
      const required = [
        'job_id', 'report_id', 'status', 'phase_message',
        'email', 'marketplace_url', 'created_at', 'completed_at', 'error_message',
      ]
      for (const col of required) {
        assert.ok(colNames.includes(col), `generation_jobs must have column: ${col}`)
      }
    })

    test('generation_jobs.status defaults to "queued"', () => {
      const db = rawDb()
      const cols = db.prepare('PRAGMA table_info(generation_jobs)').all()
      db.close()
      const statusCol = cols.find(c => c.name === 'status')
      assert.ok(statusCol, 'status column must exist')
      assert.equal(statusCol.dflt_value, "'queued'", 'status default must be \'queued\'')
    })

    test('generation_jobs must NOT have an api_key column — SECURITY', () => {
      const db = rawDb()
      const cols = db.prepare('PRAGMA table_info(generation_jobs)').all()
      db.close()
      const colNames = cols.map(c => c.name)
      assert.ok(
        !colNames.includes('api_key'),
        'CRITICAL SECURITY FAILURE: generation_jobs must NEVER have an api_key column',
      )
    })
  })

  // ── AC-2: reports table columns ───────────────────────────────────────────

  describe('AC-2 — reports table structure', () => {
    test('reports table exists', () => {
      const db = rawDb()
      const row = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='reports'",
      ).get()
      db.close()
      assert.ok(row, 'reports table must exist after runMigrations()')
    })

    test('reports has all required columns', () => {
      const db = rawDb()
      const cols = db.prepare('PRAGMA table_info(reports)').all()
      db.close()
      const colNames = cols.map(c => c.name)
      const required = [
        'report_id', 'generated_at', 'expires_at', 'email', 'summary_json',
        'opportunities_pt_json', 'opportunities_es_json',
        'quickwins_pt_json', 'quickwins_es_json', 'csv_data',
      ]
      for (const col of required) {
        assert.ok(colNames.includes(col), `reports must have column: ${col}`)
      }
    })

    test('reports must NOT have an api_key column — SECURITY', () => {
      const db = rawDb()
      const cols = db.prepare('PRAGMA table_info(reports)').all()
      db.close()
      const colNames = cols.map(c => c.name)
      assert.ok(
        !colNames.includes('api_key'),
        'CRITICAL SECURITY FAILURE: reports must NEVER have an api_key column',
      )
    })
  })

  // ── AC-3: idx_reports_expires_at index ────────────────────────────────────

  describe('AC-3 — idx_reports_expires_at index', () => {
    test('idx_reports_expires_at index exists on reports(expires_at)', () => {
      const db = rawDb()
      const idx = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_reports_expires_at'",
      ).get()
      db.close()
      assert.ok(idx, 'idx_reports_expires_at index must exist after runMigrations()')
    })
  })

  // ── AC-4: queries.js named exports ────────────────────────────────────────

  describe('AC-4 — queries.js exports all six required functions', () => {
    const requiredExports = [
      'createJob',
      'updateJobStatus',
      'updateJobError',
      'insertReport',
      'getReport',
      'getJobStatus',
    ]

    for (const fnName of requiredExports) {
      test(`queries.js exports "${fnName}" as a function`, async () => {
        let mod
        try {
          mod = await import('../src/db/queries.js')
        } catch (err) {
          assert.fail(`Failed to import queries.js: ${err.message}`)
        }
        assert.equal(
          typeof mod[fnName],
          'function',
          `queries.js must export ${fnName} as a function`,
        )
      })
    }
  })

  // ── AC-4 + functional: createJob ─────────────────────────────────────────

  describe('AC-4 — createJob inserts a job with status=queued', () => {
    test('createJob inserts row with correct defaults', () => {
      if (!createJob) {
        assert.fail('createJob not importable from queries.js')
      }
      const jobId = 'test-job-' + Date.now()
      createJob(jobId, 'rep-001', 'user@example.com', 'https://marketplace.example.com')

      const db = rawDb()
      const row = db.prepare('SELECT * FROM generation_jobs WHERE job_id = ?').get(jobId)
      db.close()

      assert.ok(row, 'createJob must insert a row')
      assert.equal(row.status, 'queued', 'createJob must set status to "queued"')
      assert.equal(row.report_id, 'rep-001')
      assert.equal(row.email, 'user@example.com')
      assert.equal(row.marketplace_url, 'https://marketplace.example.com')
      assert.ok(row.created_at > 0, 'created_at must be a positive unix timestamp')
      assert.ok(!Object.prototype.hasOwnProperty.call(row, 'api_key'), 'Row must not contain api_key')
    })
  })

  // ── AC-4 + functional: updateJobStatus ────────────────────────────────────

  describe('AC-4 — updateJobStatus updates status and phase_message', () => {
    test('updateJobStatus sets status and phase_message; sets completed_at only on "complete"', () => {
      if (!createJob || !updateJobStatus) {
        assert.fail('createJob or updateJobStatus not importable')
      }
      const jobId = 'test-job-status-' + Date.now()
      createJob(jobId, 'rep-002', 'u@example.com', 'https://mp.example.com')

      updateJobStatus(jobId, 'processing', 'Fetching catalog')
      const db = rawDb()
      let row = db.prepare('SELECT * FROM generation_jobs WHERE job_id = ?').get(jobId)
      assert.equal(row.status, 'processing')
      assert.equal(row.phase_message, 'Fetching catalog')
      assert.equal(row.completed_at, null, 'completed_at must be null before completion')

      updateJobStatus(jobId, 'complete', 'Done')
      row = db.prepare('SELECT * FROM generation_jobs WHERE job_id = ?').get(jobId)
      db.close()
      assert.equal(row.status, 'complete')
      assert.ok(row.completed_at > 0, 'completed_at must be set when status=complete')
    })
  })

  // ── AC-4 + functional: updateJobError ─────────────────────────────────────

  describe('AC-4 — updateJobError sets status=error and error_message', () => {
    test('updateJobError sets status, error_message, and completed_at', () => {
      if (!createJob || !updateJobError) {
        assert.fail('createJob or updateJobError not importable')
      }
      const jobId = 'test-job-err-' + Date.now()
      createJob(jobId, 'rep-003', 'u@example.com', 'https://mp.example.com')
      updateJobError(jobId, 'Something went wrong')

      const db = rawDb()
      const row = db.prepare('SELECT * FROM generation_jobs WHERE job_id = ?').get(jobId)
      db.close()

      assert.equal(row.status, 'error')
      assert.equal(row.error_message, 'Something went wrong')
      assert.ok(row.completed_at > 0, 'completed_at must be set on error')
    })
  })

  // ── AC-4 + functional: insertReport ───────────────────────────────────────

  describe('AC-4 — insertReport inserts with correct expires_at', () => {
    test('insertReport computes expires_at = generated_at + 172800', () => {
      if (!insertReport) {
        assert.fail('insertReport not importable from queries.js')
      }
      const reportId = 'rep-' + Date.now()
      const before = Math.floor(Date.now() / 1000)
      insertReport(
        reportId,
        'user@example.com',
        '{"summary":"test"}',
        null, null, null, null, null,
      )
      const afterTs = Math.floor(Date.now() / 1000)

      const db = rawDb()
      const row = db.prepare('SELECT * FROM reports WHERE report_id = ?').get(reportId)
      db.close()

      assert.ok(row, 'insertReport must insert a row')
      assert.ok(
        row.generated_at >= before && row.generated_at <= afterTs,
        'generated_at must be near current unix timestamp',
      )
      assert.equal(
        row.expires_at,
        row.generated_at + 172800,
        'expires_at must equal generated_at + 172800',
      )
      assert.ok(
        !Object.prototype.hasOwnProperty.call(row, 'api_key'),
        'Row must not contain api_key',
      )
    })
  })

  // ── AC-4 + AC-6: getReport ────────────────────────────────────────────────

  describe('AC-4 + AC-6 — getReport returns row or null (never throws)', () => {
    test('getReport returns the row when expires_at is in the future', () => {
      if (!insertReport || !getReport) {
        assert.fail('insertReport or getReport not importable')
      }
      const reportId = 'rep-live-' + Date.now()
      insertReport(reportId, 'u@example.com', '{"ok":true}', null, null, null, null, null)

      // now is slightly in the past relative to generated_at so expires_at is far ahead
      const now = Math.floor(Date.now() / 1000) - 10
      const row = getReport(reportId, now)
      assert.ok(row !== null, 'getReport must return the row when not expired')
    })

    test('getReport returns null for expired report (never throws)', () => {
      if (!insertReport || !getReport) {
        assert.fail('insertReport or getReport not importable')
      }
      const reportId = 'rep-expired-' + Date.now()
      insertReport(reportId, 'u@example.com', '{"ok":true}', null, null, null, null, null)

      // Pass a "now" far in the future so expires_at <= now
      const futureNow = Math.floor(Date.now() / 1000) + 172800 + 9999
      let result
      assert.doesNotThrow(() => {
        result = getReport(reportId, futureNow)
      }, 'getReport must not throw for an expired report')
      assert.equal(result, null, 'getReport must return null for an expired report')
    })

    test('getReport returns null for a non-existent report_id (never throws)', () => {
      if (!getReport) {
        assert.fail('getReport not importable from queries.js')
      }
      let result
      assert.doesNotThrow(() => {
        result = getReport('non-existent-id-' + Date.now(), Math.floor(Date.now() / 1000))
      }, 'getReport must not throw for a missing report')
      assert.equal(result, null, 'getReport must return null for a missing report')
    })

    test('getReport returns null when now === expires_at (boundary: expires_at > now is strict)', () => {
      // Spec AC-6: getReport must filter expires_at > now. At the exact boundary
      // (now === expires_at) the report is considered expired and must return null.
      // This guards against accidentally switching to a >= comparison that would
      // serve a report in the single second it expires.
      if (!insertReport || !getReport) {
        assert.fail('insertReport or getReport not importable')
      }
      const reportId = 'rep-boundary-' + Date.now()
      insertReport(reportId, 'u@example.com', '{"ok":true}', null, null, null, null, null)

      const db = rawDb()
      const row = db.prepare('SELECT expires_at FROM reports WHERE report_id = ?').get(reportId)
      db.close()

      const result = getReport(reportId, row.expires_at)
      assert.equal(result, null, 'getReport must return null when now === expires_at')
    })
  })

  // ── AC-4: getJobStatus ────────────────────────────────────────────────────

  describe('AC-4 — getJobStatus returns correct shape or null', () => {
    test('getJobStatus returns { status, phase_message, report_id } for existing job', () => {
      if (!createJob || !getJobStatus) {
        assert.fail('createJob or getJobStatus not importable')
      }
      const jobId = 'test-job-gs-' + Date.now()
      createJob(jobId, 'rep-gs-01', 'u@example.com', 'https://mp.example.com')

      const result = getJobStatus(jobId)
      assert.ok(result !== null, 'getJobStatus must return an object for existing job')
      assert.ok('status' in result, 'result must have snake_case key "status"')
      assert.ok('phase_message' in result, 'result must have snake_case key "phase_message"')
      assert.ok('report_id' in result, 'result must have snake_case key "report_id"')
      assert.equal(result.status, 'queued', 'newly created job must have status "queued"')
      assert.equal(result.report_id, 'rep-gs-01')
    })

    test('getJobStatus returns null for unknown job_id (never throws)', () => {
      if (!getJobStatus) {
        assert.fail('getJobStatus not importable from queries.js')
      }
      let result
      assert.doesNotThrow(() => {
        result = getJobStatus('unknown-job-' + Date.now())
      }, 'getJobStatus must not throw for an unknown job')
      assert.equal(result, null, 'getJobStatus must return null for unknown job')
    })
  })
})
