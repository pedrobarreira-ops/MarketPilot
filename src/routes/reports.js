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

export default async function reportsRoute(fastify) {
  // GET /api/reports/:report_id — returns full report JSON
  fastify.get('/api/reports/:report_id', async (request, reply) => {
    const { report_id } = request.params
    const now = Math.floor(Date.now() / 1000)
    const row = getReport(report_id, now)

    if (!row) {
      return reply.status(404).send({
        error:   'report_not_found',
        message: PT_404_MESSAGE,
      })
    }

    return reply.send({
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
  fastify.get('/api/reports/:report_id/csv', async (request, reply) => {
    const { report_id } = request.params
    const now = Math.floor(Date.now() / 1000)
    const row = getReport(report_id, now)

    if (!row) {
      return reply.status(404).send({
        error:   'report_not_found',
        message: PT_404_MESSAGE,
      })
    }

    return reply
      .status(200)
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header('Content-Disposition', 'attachment; filename="marketpilot-report.csv"')
      .send(row.csv_data)
  })
}
