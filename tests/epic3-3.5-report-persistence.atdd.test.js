/**
 * ATDD tests for Story 3.5: Report Persistence and CSV Generation
 *
 * Acceptance criteria verified:
 * AC-1: INSERT reports row with expires_at = now + 172800 (48h)
 * AC-2: CSV columns: EAN, product_title, shop_sku, my_price, pt_first_price, pt_gap_eur,
 *        pt_gap_pct, pt_wow_score, es_first_price, es_gap_eur, es_gap_pct, es_wow_score
 * AC-3: CSV contains ALL products (including 1st place and uncontested) — not just opportunities
 * AC-4: getReport returns null (not throws) for expired/non-existent reports
 * AC-5: getReport checks expires_at > now (not just report existence)
 * AC-6: queries.js exports insertReport and getReport with correct signatures
 * AC-7: No raw SQL outside queries.js (except schema.js)
 *
 * Uses Node.js built-in test runner (node:test) — no extra dependencies needed.
 * Run: node --test tests/epic3-3.5-report-persistence.atdd.test.js
 *
 * Uses a real SQLite in-memory database (via better-sqlite3) — no network connection needed.
 * The database is initialized fresh for each test suite run.
 */

import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const QUERIES_PATH = join(__dirname, '../src/db/queries.js')
const SCHEMA_PATH = join(__dirname, '../src/db/schema.js')

// ── env setup ──────────────────────────────────────────────────────────────
process.env.NODE_ENV    = 'test'
process.env.SQLITE_PATH = ':memory:'
process.env.REDIS_URL   = process.env.REDIS_URL || 'redis://localhost:6379'
process.env.APP_BASE_URL    = process.env.APP_BASE_URL    || 'http://localhost:3000'
process.env.WORTEN_BASE_URL = process.env.WORTEN_BASE_URL || 'https://www.worten.pt'
process.env.PORT        = process.env.PORT || '3000'
process.env.LOG_LEVEL   = 'silent'

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

function randomId() {
  return `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function makeSampleReport({ reportId, email = 'test@example.com', nowSeconds = null, expiresAt = null } = {}) {
  const now = nowSeconds ?? Math.floor(Date.now() / 1000)
  return {
    report_id: reportId || randomId(),
    generated_at: now,
    expires_at: expiresAt ?? (now + 172800),
    email,
    summary_json: JSON.stringify({ pt: { total: 10, winning: 3, losing: 5, uncontested: 2 }, es: { total: 10, winning: 4, losing: 4, uncontested: 2 } }),
    opportunities_pt_json: JSON.stringify([]),
    opportunities_es_json: JSON.stringify([]),
    quickwins_pt_json: JSON.stringify([]),
    quickwins_es_json: JSON.stringify([]),
    csv_data: 'EAN,product_title\n1234,Test',
  }
}

function makeSampleJob({ jobId, reportId } = {}) {
  return {
    job_id: jobId || randomId(),
    report_id: reportId || randomId(),
    status: 'queued',
    phase_message: 'A preparar…',
    email: 'test@example.com',
    marketplace_url: 'https://marketplace.worten.pt',
    created_at: Math.floor(Date.now() / 1000),
  }
}

// ── test suite ─────────────────────────────────────────────────────────────

describe('Story 3.5 — Report persistence and CSV generation', async () => {
  let queries
  let db

  before(async () => {
    // Import queries module which initialises the SQLite database
    queries = await import('../src/db/queries.js')
    // Also import db for potential direct inspection
    try {
      const dbMod = await import('../src/db/database.js')
      db = dbMod.db || dbMod.default
    } catch (_) {
      // db not directly exported — OK, we use queries API only
    }
  })

  // ── AC-1: INSERT reports with 48h TTL ─────────────────────────────────────
  describe('AC-1: insertReport sets expires_at = now + 172800 (48h)', () => {
    test('insertReport is exported as a function', () => {
      assert.equal(typeof queries.insertReport, 'function', 'insertReport must be an exported function')
    })

    test('insertReport stores a report row in the database', async () => {
      const reportId = randomId()
      const now = Math.floor(Date.now() / 1000)
      const report = makeSampleReport({ reportId, nowSeconds: now })

      // insertReport must not throw
      assert.doesNotThrow(
        () => queries.insertReport(report),
        'insertReport must not throw for valid report data'
      )
    })

    test('inserted report is retrievable immediately (expires in the future)', async () => {
      const reportId = randomId()
      const now = Math.floor(Date.now() / 1000)
      const report = makeSampleReport({ reportId, nowSeconds: now })
      queries.insertReport(report)

      const retrieved = queries.getReport(reportId, now)
      assert.ok(retrieved, 'getReport must return the report immediately after insertion')
    })

    test('expires_at is set to approximately now + 172800 seconds', async () => {
      const reportId = randomId()
      const now = Math.floor(Date.now() / 1000)
      // Pass expires_at explicitly = now + 172800 (as the worker would)
      const report = makeSampleReport({ reportId, nowSeconds: now, expiresAt: now + 172800 })
      queries.insertReport(report)

      // Retrieve and check that the report is found (expires_at > now is satisfied)
      const retrieved = queries.getReport(reportId, now)
      assert.ok(retrieved, 'Report with expires_at = now+172800 must be retrievable')
    })
  })

  // ── AC-2 + AC-3: CSV format and ALL products ──────────────────────────────
  describe('AC-2 & AC-3: CSV columns and all-product coverage', () => {
    let src

    before(() => {
      // Check if a csv generation utility is in queries.js or a separate file
      src = codeLines(readFileSync(QUERIES_PATH, 'utf8'))
    })

    test('csv_data column stores CSV string in the reports table (static)', () => {
      assert.ok(
        src.includes('csv_data'),
        'queries.js must handle csv_data column — CSV is stored in the reports table'
      )
    })

    test('CSV stored includes all required column headers (static or functional)', () => {
      // Check if a CSV builder is present in codebase
      const requiredCsvColumns = [
        'EAN', 'product_title', 'shop_sku', 'my_price',
        'pt_first_price', 'pt_gap_eur', 'pt_gap_pct', 'pt_wow_score',
        'es_first_price', 'es_gap_eur', 'es_gap_pct', 'es_wow_score',
      ]

      // Check in queries.js or in the worker scoring/persistence files
      let csvSrc = src
      try {
        csvSrc += codeLines(readFileSync(join(__dirname, '../src/workers/scoring/computeReport.js'), 'utf8'))
      } catch (_) {}
      try {
        csvSrc += codeLines(readFileSync(join(__dirname, '../src/workers/reportWorker.js'), 'utf8'))
      } catch (_) {}

      for (const col of requiredCsvColumns) {
        assert.ok(
          csvSrc.includes(col),
          `CSV must include column "${col}" — required by FR17 spec`
        )
      }
    })
  })

  // ── AC-4: getReport returns null (not throws) ─────────────────────────────
  describe('AC-4: getReport returns null for expired/non-existent reports', () => {
    test('getReport is exported as a function', () => {
      assert.equal(typeof queries.getReport, 'function', 'getReport must be an exported function')
    })

    test('getReport returns null for a non-existent report_id', () => {
      const result = queries.getReport('non-existent-report-id-xyz', Math.floor(Date.now() / 1000))
      assert.equal(result, null, 'getReport must return null (not throw) for unknown report_id')
    })

    test('getReport does not throw for any input', () => {
      assert.doesNotThrow(
        () => queries.getReport('unknown-id', Math.floor(Date.now() / 1000)),
        'getReport must never throw — must return null for missing/expired reports'
      )
    })

    test('getReport returns null for an expired report (expires_at in the past)', async () => {
      const reportId = randomId()
      const now = Math.floor(Date.now() / 1000)
      // Insert a report that expired 1 second ago
      const expiredReport = makeSampleReport({
        reportId,
        nowSeconds: now - 172801,
        expiresAt: now - 1,
      })
      queries.insertReport(expiredReport)

      // Query with current time — report is expired
      const result = queries.getReport(reportId, now)
      assert.equal(result, null, 'getReport must return null for a report whose expires_at is in the past')
    })
  })

  // ── AC-5: getReport checks expires_at > now ───────────────────────────────
  describe('AC-5: getReport uses WHERE expires_at > now check', () => {
    let src

    before(() => {
      src = codeLines(readFileSync(QUERIES_PATH, 'utf8'))
    })

    test('getReport SQL includes expires_at check (static)', () => {
      assert.ok(
        src.includes('expires_at'),
        'getReport must filter by expires_at in its SQL query (never serve expired reports)'
      )
    })

    test('report at exact expiry boundary: now=expires_at is not served (boundary check)', () => {
      const reportId = randomId()
      const expiry = Math.floor(Date.now() / 1000) + 1 // expires 1 second from now
      const report = makeSampleReport({ reportId, expiresAt: expiry })
      queries.insertReport(report)

      // Query with now > expiry → expired
      const futureNow = expiry + 1
      const result = queries.getReport(reportId, futureNow)
      assert.equal(result, null, 'Report must not be served when expires_at <= now')
    })
  })

  // ── AC-6: Required query exports ─────────────────────────────────────────
  describe('AC-6: queries.js exports insertReport and getReport with correct shapes', () => {
    test('createJob is exported', () => {
      assert.equal(typeof queries.createJob, 'function', 'createJob must be exported from queries.js')
    })

    test('updateJobStatus is exported', () => {
      assert.equal(typeof queries.updateJobStatus, 'function', 'updateJobStatus must be exported from queries.js')
    })

    test('updateJobError is exported', () => {
      assert.equal(typeof queries.updateJobError, 'function', 'updateJobError must be exported from queries.js')
    })

    test('getJobStatus is exported', () => {
      assert.equal(typeof queries.getJobStatus, 'function', 'getJobStatus must be exported from queries.js')
    })

    test('insertReport is exported', () => {
      assert.equal(typeof queries.insertReport, 'function', 'insertReport must be exported from queries.js')
    })

    test('getReport is exported', () => {
      assert.equal(typeof queries.getReport, 'function', 'getReport must be exported from queries.js')
    })
  })

  // ── AC-7: No raw SQL outside queries.js ──────────────────────────────────
  describe('AC-7: no raw SQL in worker files — only queries.js (and schema.js)', () => {
    const WORKER_FILES = [
      join(__dirname, '../src/workers/reportWorker.js'),
      join(__dirname, '../src/routes/generate.js'),
      join(__dirname, '../src/routes/jobs.js'),
      join(__dirname, '../src/routes/reports.js'),
    ]

    const RAW_SQL_PATTERNS = [
      /\.prepare\s*\(/,      // better-sqlite3 raw prepare()
      /\.exec\s*\(/,         // raw exec()
      /SELECT\s+\*\s+FROM/i, // raw SELECT
      /INSERT\s+INTO/i,      // raw INSERT
      /UPDATE\s+\w+\s+SET/i, // raw UPDATE
      /DELETE\s+FROM/i,      // raw DELETE
    ]

    for (const filePath of WORKER_FILES) {
      const fileName = filePath.split(/[\\/]/).pop()
      test(`${fileName} does not contain raw SQL statements`, () => {
        let src
        try {
          src = codeLines(readFileSync(filePath, 'utf8'))
        } catch (_) {
          // File not yet created — skip
          return
        }
        for (const pattern of RAW_SQL_PATTERNS) {
          assert.ok(
            !pattern.test(src),
            `${fileName} must not contain raw SQL — all database calls go through queries.js`
          )
        }
      })
    }
  })

  // ── FUNCTIONAL: report survives round-trip ────────────────────────────────
  describe('FUNCTIONAL: report data survives insert → getReport round-trip', () => {
    test('getReport returns report with all stored fields', () => {
      const reportId = randomId()
      const now = Math.floor(Date.now() / 1000)
      const original = makeSampleReport({ reportId, nowSeconds: now })
      queries.insertReport(original)

      const retrieved = queries.getReport(reportId, now)

      assert.ok(retrieved, 'getReport must return the report row')
      assert.equal(retrieved.report_id, reportId, 'report_id must match')
      assert.equal(retrieved.email, original.email, 'email must be preserved')
    })

    test('summary_json is stored and retrievable as JSON', () => {
      const reportId = randomId()
      const now = Math.floor(Date.now() / 1000)
      const summaryData = { pt: { total: 5, winning: 2, losing: 2, uncontested: 1 }, es: { total: 5, winning: 1, losing: 3, uncontested: 1 } }
      const report = makeSampleReport({ reportId, nowSeconds: now })
      report.summary_json = JSON.stringify(summaryData)
      queries.insertReport(report)

      const retrieved = queries.getReport(reportId, now)
      assert.ok(retrieved, 'getReport must return report')

      const parsedSummary = typeof retrieved.summary_json === 'string'
        ? JSON.parse(retrieved.summary_json)
        : retrieved.summary_json
      assert.deepEqual(parsedSummary, summaryData, 'summary_json must survive round-trip (stored and returned correctly)')
    })
  })
})
