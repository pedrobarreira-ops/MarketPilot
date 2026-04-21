/**
 * ATDD tests for Story 4.3: GET /api/reports/:id + CSV routes
 *
 * Acceptance criteria verified:
 * AC-1: GET /api/reports/:id returns report JSON when valid and not expired
 * AC-2: GET /api/reports/:id → 404 with correct message when expired
 * AC-3: GET /api/reports/:id → 404 with correct message when non-existent
 * AC-4: GET /api/reports/:id/csv returns csv_data with correct headers
 * AC-5: GET /api/reports/:id/csv Content-Type is text/csv
 * AC-6: GET /api/reports/:id/csv Content-Disposition: attachment; filename="marketpilot-report.csv"
 * AC-7: GET /api/reports/:id/csv response time < 3s (smoke)
 * AC-8: GET /api/reports (no id) → 404 — listing endpoint NOT registered
 * AC-9: GET /report/:id → returns public/report.html (static shell)
 * AC-10: 404 error body uses { error: "report_not_found", message: "..." } exact shape
 *
 * Uses Node.js built-in test runner (node:test) — no extra dependencies needed.
 * Run: node --test tests/epic4-4.3-get-api-reports-and-csv.atdd.test.js
 *
 * Uses a real SQLite :memory: database. No live Redis or Mirakl connection needed.
 */

import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

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

const SAMPLE_SUMMARY = JSON.stringify({
  pt: { total: 5, winning: 2, losing: 2, uncontested: 1 },
  es: { total: 5, winning: 1, losing: 3, uncontested: 1 },
})

const SAMPLE_OPPORTUNITIES = JSON.stringify([
  { ean: '1234567890123', product_title: 'Test Product', shop_sku: 'SKU-001', my_price: 99.99, competitor_price: 95.00, gap: 4.99, gap_pct: 0.0525, wow_score: 1904.76 },
])

const SAMPLE_QUICKWINS = JSON.stringify([
  { ean: '9876543210987', product_title: 'Quick Win Product', shop_sku: 'SKU-002', my_price: 10.20, competitor_price: 10.00, gap: 0.20, gap_pct: 0.02, wow_score: 510.0 },
])

const SAMPLE_CSV = [
  'EAN,product_title,shop_sku,my_price,pt_first_price,pt_gap_eur,pt_gap_pct,pt_wow_score,es_first_price,es_gap_eur,es_gap_pct,es_wow_score',
  '1234567890123,"Test Product",SKU-001,99.99,95.00,4.99,0.0525,1904.76,96.00,3.99,0.0415,2408.67',
].join('\n')

function makeReport({ reportId = null, expiresAt = null, email = 'user@example.com' } = {}) {
  const now = Math.floor(Date.now() / 1000)
  return {
    report_id:              reportId || randomId(),
    generated_at:           now,
    expires_at:             expiresAt ?? (now + 172800),
    email,
    summary_json:           SAMPLE_SUMMARY,
    opportunities_pt_json:  SAMPLE_OPPORTUNITIES,
    opportunities_es_json:  SAMPLE_OPPORTUNITIES,
    quickwins_pt_json:      SAMPLE_QUICKWINS,
    quickwins_es_json:      SAMPLE_QUICKWINS,
    csv_data:               SAMPLE_CSV,
  }
}

/**
 * Build a minimal Fastify app with the report routes wired against a real
 * in-memory SQLite database.
 */
async function buildTestApp() {
  const { default: Fastify }        = await import('fastify')
  const { default: staticPlugin }   = await import('@fastify/static')
  const { errorHandler }            = await import('../src/middleware/errorHandler.js')
  const { insertReport, getReport } = await import('../src/db/queries.js')
  const { default: reportsRoute }   = await import('../src/routes/reports.js')
  const path                        = await import('path')
  const { fileURLToPath: ftu }      = await import('url')

  const PUBLIC_DIR = path.default.join(path.default.dirname(ftu(import.meta.url)), '..', 'public')

  const fastify = Fastify({ logger: { level: 'silent' }, trustProxy: true })

  await fastify.register(staticPlugin, { root: PUBLIC_DIR, prefix: '/' })
  fastify.setErrorHandler(errorHandler)

  // GET /report/:report_id — static HTML shell (must be registered after staticPlugin)
  fastify.get('/report/:report_id', async (_req, reply) => {
    return reply.sendFile('report.html')
  })

  // Register the real report routes from src/routes/reports.js
  // (covers GET /api/reports/:report_id and GET /api/reports/:report_id/csv)
  await fastify.register(reportsRoute)

  await fastify.ready()

  return { app: fastify, insertReport, getReport }
}

// ── test suite ─────────────────────────────────────────────────────────────

describe('Story 4.3 — GET /api/reports/:id + CSV routes', async () => {
  let app, insertReport

  before(async () => {
    ({ app, insertReport } = await buildTestApp())
  })

  after(async () => {
    await app.close()
  })

  // ── AC-1: GET /api/reports/:id — valid report ─────────────────────────────
  describe('AC-1: returns report JSON for valid, non-expired report', () => {
    test('valid report → HTTP 200', async () => {
      const report = makeReport()
      insertReport(report)

      const res = await app.inject({ method: 'GET', url: `/api/reports/${report.report_id}` })
      assert.equal(res.statusCode, 200, 'valid non-expired report must return HTTP 200')
    })

    test('response body has data wrapper', async () => {
      const report = makeReport()
      insertReport(report)

      const res = await app.inject({ method: 'GET', url: `/api/reports/${report.report_id}` })
      const body = JSON.parse(res.body)
      assert.ok('data' in body, 'response must have data wrapper')
    })

    test('data contains summary field', async () => {
      const report = makeReport()
      insertReport(report)

      const res = await app.inject({ method: 'GET', url: `/api/reports/${report.report_id}` })
      const { data } = JSON.parse(res.body)
      assert.ok('summary' in data, 'data must contain summary field')
    })

    test('data contains opportunities_pt field', async () => {
      const report = makeReport()
      insertReport(report)

      const res = await app.inject({ method: 'GET', url: `/api/reports/${report.report_id}` })
      const { data } = JSON.parse(res.body)
      assert.ok('opportunities_pt' in data, 'data must contain opportunities_pt field')
    })

    test('data contains opportunities_es field', async () => {
      const report = makeReport()
      insertReport(report)

      const res = await app.inject({ method: 'GET', url: `/api/reports/${report.report_id}` })
      const { data } = JSON.parse(res.body)
      assert.ok('opportunities_es' in data, 'data must contain opportunities_es field')
    })

    test('data contains quickwins_pt field', async () => {
      const report = makeReport()
      insertReport(report)

      const res = await app.inject({ method: 'GET', url: `/api/reports/${report.report_id}` })
      const { data } = JSON.parse(res.body)
      assert.ok('quickwins_pt' in data, 'data must contain quickwins_pt field')
    })

    test('data contains quickwins_es field', async () => {
      const report = makeReport()
      insertReport(report)

      const res = await app.inject({ method: 'GET', url: `/api/reports/${report.report_id}` })
      const { data } = JSON.parse(res.body)
      assert.ok('quickwins_es' in data, 'data must contain quickwins_es field')
    })

    test('data object has exactly the required fields — no extra fields', async () => {
      const report = makeReport()
      insertReport(report)

      const res = await app.inject({ method: 'GET', url: `/api/reports/${report.report_id}` })
      const { data } = JSON.parse(res.body)
      const keys = Object.keys(data).sort()
      assert.deepEqual(
        keys,
        ['generated_at', 'opportunities_es', 'opportunities_pt', 'quickwins_es', 'quickwins_pt', 'summary'],
        'data must contain exactly {generated_at, summary, opportunities_pt, opportunities_es, quickwins_pt, quickwins_es}'
      )
    })

    test('summary parses as object with pt and es channels', async () => {
      const report = makeReport()
      insertReport(report)

      const res = await app.inject({ method: 'GET', url: `/api/reports/${report.report_id}` })
      const { data } = JSON.parse(res.body)
      assert.ok(typeof data.summary === 'object', 'summary must be an object')
      assert.ok('pt' in data.summary, 'summary must have pt channel')
      assert.ok('es' in data.summary, 'summary must have es channel')
    })

    test('opportunities_pt is an array', async () => {
      const report = makeReport()
      insertReport(report)

      const res = await app.inject({ method: 'GET', url: `/api/reports/${report.report_id}` })
      const { data } = JSON.parse(res.body)
      assert.ok(Array.isArray(data.opportunities_pt), 'opportunities_pt must be an array')
    })

    test('Content-Type is application/json', async () => {
      const report = makeReport()
      insertReport(report)

      const res = await app.inject({ method: 'GET', url: `/api/reports/${report.report_id}` })
      assert.match(res.headers['content-type'], /application\/json/, 'Content-Type must be application/json')
    })
  })

  // ── AC-2: expired report → 404 ───────────────────────────────────────────
  describe('AC-2: GET /api/reports/:id → 404 for expired report', () => {
    test('report with expires_at in the past → HTTP 404', async () => {
      const pastExpiry = Math.floor(Date.now() / 1000) - 1  // 1 second in the past
      const report = makeReport({ expiresAt: pastExpiry })
      insertReport(report)

      const res = await app.inject({ method: 'GET', url: `/api/reports/${report.report_id}` })
      assert.equal(res.statusCode, 404, 'expired report must return HTTP 404')
    })

    test('expired report 404 body has { error: "report_not_found", message }', async () => {
      const pastExpiry = Math.floor(Date.now() / 1000) - 3600  // 1 hour ago
      const report = makeReport({ expiresAt: pastExpiry })
      insertReport(report)

      const res = await app.inject({ method: 'GET', url: `/api/reports/${report.report_id}` })
      const body = JSON.parse(res.body)
      assert.equal(body.error, 'report_not_found', '404 error field must be "report_not_found"')
      assert.ok(typeof body.message === 'string' && body.message.length > 0, '404 must have a non-empty message')
    })

    test('expired report 404 message matches spec exactly', async () => {
      const EXPECTED_MESSAGE = 'Este relatório expirou ou não existe. Gera um novo relatório para obteres dados actualizados.'
      const pastExpiry = Math.floor(Date.now() / 1000) - 1
      const report = makeReport({ expiresAt: pastExpiry })
      insertReport(report)

      const res = await app.inject({ method: 'GET', url: `/api/reports/${report.report_id}` })
      const body = JSON.parse(res.body)
      assert.equal(body.message, EXPECTED_MESSAGE, '404 message must match the spec exactly')
    })
  })

  // ── AC-3: non-existent report → 404 ─────────────────────────────────────
  describe('AC-3: GET /api/reports/:id → 404 for non-existent report', () => {
    test('unknown report_id → HTTP 404', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/reports/definitely-does-not-exist' })
      assert.equal(res.statusCode, 404, 'unknown report_id must return HTTP 404')
    })

    test('non-existent report 404 body has { error: "report_not_found", message }', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/reports/no-such-report' })
      const body = JSON.parse(res.body)
      assert.equal(body.error, 'report_not_found', 'error field must be "report_not_found"')
      assert.ok(body.message, '404 must have message field')
    })

    test('non-existent UUID-shaped report_id → 404', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000'
      const res = await app.inject({ method: 'GET', url: `/api/reports/${fakeId}` })
      assert.equal(res.statusCode, 404, 'UUID-shaped non-existent report_id must return 404')
    })
  })

  // ── AC-4: GET /api/reports/:id/csv — csv_data returned ───────────────────
  describe('AC-4: GET /api/reports/:id/csv returns csv_data body', () => {
    test('valid report CSV endpoint → HTTP 200', async () => {
      const report = makeReport()
      insertReport(report)

      const res = await app.inject({ method: 'GET', url: `/api/reports/${report.report_id}/csv` })
      assert.equal(res.statusCode, 200, 'valid CSV route must return HTTP 200')
    })

    test('response body matches the stored csv_data', async () => {
      const report = makeReport()
      insertReport(report)

      const res = await app.inject({ method: 'GET', url: `/api/reports/${report.report_id}/csv` })
      assert.equal(res.body, SAMPLE_CSV, 'CSV response body must match stored csv_data exactly')
    })

    test('CSV response contains the expected column headers', async () => {
      const report = makeReport()
      insertReport(report)

      const res = await app.inject({ method: 'GET', url: `/api/reports/${report.report_id}/csv` })
      const firstLine = res.body.split('\n')[0]
      assert.ok(firstLine.includes('EAN'), 'CSV must contain EAN column')
      assert.ok(firstLine.includes('product_title'), 'CSV must contain product_title column')
      assert.ok(firstLine.includes('shop_sku'), 'CSV must contain shop_sku column')
      assert.ok(firstLine.includes('my_price'), 'CSV must contain my_price column')
      assert.ok(firstLine.includes('pt_first_price'), 'CSV must contain pt_first_price column')
      assert.ok(firstLine.includes('es_first_price'), 'CSV must contain es_first_price column')
    })

    test('expired report CSV → 404', async () => {
      const pastExpiry = Math.floor(Date.now() / 1000) - 1
      const report = makeReport({ expiresAt: pastExpiry })
      insertReport(report)

      const res = await app.inject({ method: 'GET', url: `/api/reports/${report.report_id}/csv` })
      assert.equal(res.statusCode, 404, 'expired report CSV must return 404')
    })

    test('non-existent report CSV → 404', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/reports/no-such-report/csv' })
      assert.equal(res.statusCode, 404, 'unknown report CSV must return 404')
    })

    test('CSV first line is the exact spec header', async () => {
      const EXPECTED_CSV_HEADER = 'EAN,product_title,shop_sku,my_price,pt_first_price,pt_gap_eur,pt_gap_pct,pt_wow_score,es_first_price,es_gap_eur,es_gap_pct,es_wow_score'
      const report = makeReport()
      insertReport(report)

      const res = await app.inject({ method: 'GET', url: `/api/reports/${report.report_id}/csv` })
      const firstLine = res.body.split('\n')[0]
      // CSV column order is part of the spec contract — refactoring to alphabetize or set-based structure must not regress this. See test-plan-epic-4-http-api-layer.md.
      assert.strictEqual(firstLine, EXPECTED_CSV_HEADER, 'CSV first line must be exactly the 12-column header in spec order')
    })
  })

  // ── AC-5: CSV Content-Type ────────────────────────────────────────────────
  describe('AC-5: GET /api/reports/:id/csv Content-Type is text/csv', () => {
    test('CSV response has Content-Type: text/csv', async () => {
      const report = makeReport()
      insertReport(report)

      const res = await app.inject({ method: 'GET', url: `/api/reports/${report.report_id}/csv` })
      assert.equal(res.statusCode, 200)
      assert.match(
        res.headers['content-type'],
        /text\/csv/,
        'Content-Type must be text/csv'
      )
    })
  })

  // ── AC-6: CSV Content-Disposition ────────────────────────────────────────
  describe('AC-6: GET /api/reports/:id/csv Content-Disposition attachment with correct filename', () => {
    test('Content-Disposition is "attachment; filename=\\"marketpilot-report.csv\\""', async () => {
      const report = makeReport()
      insertReport(report)

      const res = await app.inject({ method: 'GET', url: `/api/reports/${report.report_id}/csv` })
      assert.equal(res.statusCode, 200)
      const disposition = res.headers['content-disposition']
      assert.ok(disposition, 'Content-Disposition header must be present')
      assert.ok(disposition.includes('attachment'), 'Content-Disposition must include "attachment"')
      assert.ok(disposition.includes('marketpilot-report.csv'), 'Content-Disposition must include filename "marketpilot-report.csv"')
    })
  })

  // ── AC-7: CSV response time < 3s ─────────────────────────────────────────
  describe('AC-7: GET /api/reports/:id/csv response time < 3s (smoke)', () => {
    test('CSV download responds within 3000ms', async () => {
      const report = makeReport()
      insertReport(report)

      const start = Date.now()
      await app.inject({ method: 'GET', url: `/api/reports/${report.report_id}/csv` })
      const elapsed = Date.now() - start
      assert.ok(elapsed < 3000, `CSV download must respond within 3000ms (got ${elapsed}ms)`)
    })
  })

  // ── AC-8: GET /api/reports (no id) → 404 ─────────────────────────────────
  describe('AC-8: GET /api/reports (listing path) is NOT registered', () => {
    test('GET /api/reports (no id segment) returns 404', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/reports' })
      assert.equal(res.statusCode, 404, 'GET /api/reports (listing) must return 404 — not registered')
    })

    test('GET /api/reports/ (trailing slash) returns 404', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/reports/' })
      assert.ok(res.statusCode === 404, 'GET /api/reports/ must return 404')
    })
  })

  // ── AC-9: GET /report/:id → report.html ──────────────────────────────────
  describe('AC-9: GET /report/:id returns public/report.html (static shell)', () => {
    test('GET /report/:id returns HTTP 200', async () => {
      const res = await app.inject({ method: 'GET', url: '/report/some-report-id' })
      assert.equal(res.statusCode, 200, 'GET /report/:id must return HTTP 200')
    })

    test('response body is HTML (contains <!DOCTYPE html> or <html)', async () => {
      const res = await app.inject({ method: 'GET', url: '/report/any-id' })
      assert.match(res.body, /<!DOCTYPE html>|<html/i, 'GET /report/:id must return HTML from report.html')
    })

    test('different report_id values all return report.html', async () => {
      const ids = ['abc123', 'def456', '00000000-0000-0000-0000-000000000000']
      for (const id of ids) {
        const res = await app.inject({ method: 'GET', url: `/report/${id}` })
        assert.equal(res.statusCode, 200, `GET /report/${id} must return 200`)
      }
    })
  })

  // ── AC-10: 404 error body shape ───────────────────────────────────────────
  describe('AC-10: 404 error body uses { error: "report_not_found", message } shape', () => {
    test('404 body has exactly { error, message } top-level keys', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/reports/no-such-report' })
      const body = JSON.parse(res.body)
      assert.deepEqual(
        Object.keys(body).sort(),
        ['error', 'message'],
        '404 body must contain exactly { error, message }'
      )
    })

    test('404 error field is the string "report_not_found"', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/reports/no-such-report' })
      const body = JSON.parse(res.body)
      assert.equal(body.error, 'report_not_found', 'error field must be "report_not_found"')
    })

    test('404 message is the Portuguese expiry message from spec', async () => {
      const EXPECTED = 'Este relatório expirou ou não existe. Gera um novo relatório para obteres dados actualizados.'
      const res = await app.inject({ method: 'GET', url: '/api/reports/no-such-report' })
      const body = JSON.parse(res.body)
      assert.equal(body.message, EXPECTED, '404 message must match spec exactly')
    })
  })
})
