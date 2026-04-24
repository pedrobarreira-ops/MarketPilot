// src/routes/reports.js
// GET /api/reports/:report_id     — JSON report data
// GET /api/reports/:report_id/csv — CSV download
//
// Security invariants (non-negotiable):
// 1. api_key must NEVER appear in any HTTP response body or header.
// 2. No listing endpoint — GET /api/reports (no id) must 404 naturally.
//
// 404 contract:
//   Both routes return the SAME 404 shape when the report is expired or not found:
//     { error: "report_not_found", message: "Este relatório expirou ou não existe. Gera um novo relatório para obteres dados actualizados." }
//
// CSV column contract (SPEC-LOCKED — do NOT reorder, alphabetize, or derive from Object.keys()):
//   EAN,product_title,shop_sku,my_price,pt_first_price,pt_gap_eur,pt_gap_pct,pt_wow_score,es_first_price,es_gap_eur,es_gap_pct,es_wow_score

import { getReport } from '../db/queries.js'

const PT_404_MESSAGE =
  'Este relatório expirou ou não existe. Gera um novo relatório para obteres dados actualizados.'

// UUID-format guard: ^[0-9a-f-]{36}$ — reused across both report route handlers (AC-8)
// Returns 404 (not 400) for malformed IDs — same shape as not-found/expired prevents enumeration oracle
const UUID_REGEX = /^[0-9a-f-]{36}$/

export default async function reportsRoute(fastify) {
  // GET /api/reports/:report_id — returns full report JSON
  // No explicit rateLimit override — global default (60 req/min/IP) applies per AC-5
  fastify.get('/api/reports/:report_id', async (request, reply) => {
    const { report_id } = request.params

    // UUID guard must fire BEFORE any DB call (AC-8) — uniform 404 for all invalid IDs
    if (!UUID_REGEX.test(report_id)) {
      return reply
        .status(404)
        .header('Cache-Control', 'private, no-store')
        .send({
          error:   'report_not_found',
          message: PT_404_MESSAGE,
        })
    }

    const now = Math.floor(Date.now() / 1000)
    const row = getReport(report_id, now)

    if (!row) {
      return reply
        .status(404)
        .header('Cache-Control', 'private, no-store')
        .send({
          error:   'report_not_found',
          message: PT_404_MESSAGE,
        })
    }

    return reply
      .header('Cache-Control', 'private, no-store')
      .send({
        data: {
          generated_at:     row.generated_at,
          summary:          JSON.parse(row.summary_json),
          opportunities_pt: JSON.parse(row.opportunities_pt_json),
          opportunities_es: JSON.parse(row.opportunities_es_json),
          quickwins_pt:     JSON.parse(row.quickwins_pt_json),
          quickwins_es:     JSON.parse(row.quickwins_es_json),
        },
      })
  })

  // GET /api/reports/:report_id/csv — CSV download
  // Per-route rate-limit override: 10 req/min/IP (AC-3)
  fastify.get('/api/reports/:report_id/csv', {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const { report_id } = request.params

    // UUID guard must fire BEFORE any DB call (AC-8) — uniform 404 for all invalid IDs
    if (!UUID_REGEX.test(report_id)) {
      return reply
        .status(404)
        .header('Cache-Control', 'private, no-store')
        .send({
          error:   'report_not_found',
          message: PT_404_MESSAGE,
        })
    }

    const now = Math.floor(Date.now() / 1000)
    const row = getReport(report_id, now)

    if (!row) {
      return reply
        .status(404)
        .header('Cache-Control', 'private, no-store')
        .send({
          error:   'report_not_found',
          message: PT_404_MESSAGE,
        })
    }

    return reply
      .status(200)
      .header('Cache-Control', 'private, no-store')
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header('Content-Disposition', 'attachment; filename="marketpilot-report.csv"')
      .send(row.csv_data)
  })
}
