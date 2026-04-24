// src/routes/jobs.js
// GET /api/jobs/:job_id — polling endpoint for job status.
//
// Returns { data: { status, phase_message, progress_current, progress_total, report_id } }
// for a known job. Returns 404 { error, message } for unknown job_id.
//
// Security invariants (non-negotiable):
// - Response contains EXACTLY the 5 fields above — no extra fields.
// - api_key does not exist in the DB schema and cannot leak.
// - email, marketplace_url, created_at, completed_at, error_message are NOT selected.
// - progress_current and progress_total are null when DB value is NULL (not missing key, not 0).
//
// GET /api/jobs (no :job_id) is NOT registered here — Fastify returns 404 naturally.

import * as db from '../db/queries.js'

// UUID-format guard: ^[0-9a-f-]{36}$ — fires before any DB call (AC-8)
// Returns 404 (not 400) for malformed IDs — same shape as unknown job prevents enumeration oracle
const UUID_REGEX = /^[0-9a-f-]{36}$/

export default async function jobsRoute(fastify) {
  fastify.get('/api/jobs/:job_id', {
    config: { rateLimit: { max: 120, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const { job_id } = request.params

    // UUID guard must fire BEFORE any DB call (AC-8) — uniform 404 for all invalid job IDs
    if (!UUID_REGEX.test(job_id)) {
      return reply.status(404).send({
        error:   'job_not_found',
        message: 'Job não encontrado.',
      })
    }

    const row = db.getJobStatus(job_id)
    if (!row) {
      return reply.status(404).send({
        error:   'job_not_found',
        message: 'Job não encontrado.',
      })
    }
    return reply.send({
      data: {
        status:           row.status,
        phase_message:    row.phase_message    ?? null,
        progress_current: row.progress_current ?? null,
        progress_total:   row.progress_total   ?? null,
        report_id:        row.report_id,
      },
    })
  })
}
