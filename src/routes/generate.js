// src/routes/generate.js
// POST /api/generate — validates credentials, creates BullMQ job, returns job_id + report_id.
//
// Security invariants (non-negotiable):
// 1. api_key is stored in keyStore ONLY — never passed to queue.add() or logged.
// 2. keyStore.set(job_id, api_key) is called ONLY here (AC-4, AC-10).
// 3. Response body never contains the api_key value (AC-9).
// 4. Validation (including whitespace guard) runs BEFORE keyStore.set() (AC-1).
//
// Side-effect ordering (crash safety — see code-review findings 2026-04-19):
//   (a) db.createJob   — creates the job row so clients polling status see it immediately.
//   (b) keyStore.set   — stores the api_key for the worker to retrieve.
//   (c) queue.add      — enqueues for the worker.
// If (c) throws, we roll back (b) and mark the job row as errored so:
//   - The api_key does not linger in memory (security).
//   - The user sees a sensible error state rather than a phantom 'queued' job.
// If (a) throws, nothing has been enqueued and no key has been stored — safe to let
// the error handler return 500.

import { randomUUID } from 'node:crypto'
import * as keyStore from '../queue/keyStore.js'
import { reportQueue } from '../queue/reportQueue.js'
import * as db from '../db/queries.js'
import { config } from '../config.js'

export default async function generateRoute(fastify) {
  fastify.post('/api/generate', {
    schema: {
      body: {
        type: 'object',
        required: ['api_key', 'email'],
        properties: {
          api_key: { type: 'string', minLength: 1 },
          email:   { type: 'string', format: 'email' },
        },
      },
    },
  }, async (request, reply) => {
    const { api_key: rawApiKey, email } = request.body
    const marketplace_url = config.WORTEN_BASE_URL

    // Guard: whitespace-only api_key is semantically invalid even when minLength: 1 passes.
    // Also defensive against null/undefined (belt-and-suspenders beyond schema).
    if (!rawApiKey || typeof rawApiKey !== 'string' || !rawApiKey.trim()) {
      return reply.status(400).send({
        error: 'validation_error',
        message: 'body/api_key must be a non-empty string',
      })
    }

    // Trim leading/trailing whitespace before storing. Mirakl rejects Authorization
    // headers with stray whitespace; storing the raw value would surface as an
    // opaque 401 from Mirakl later in the pipeline rather than clean validation here.
    const api_key = rawApiKey.trim()

    // All validation passed — proceed to create job.
    const job_id    = randomUUID()
    const report_id = randomUUID()

    // (a) Persist the job row first. If this throws, nothing else has happened yet —
    // no keyStore entry, no queued job. The errorHandler returns a safe 500.
    db.createJob(job_id, report_id, email, marketplace_url)

    // (b) Store the api_key. keyStore.set() is the ONLY call site in the entire
    // codebase (AC-4, AC-10). Map.set is synchronous and does not throw in practice,
    // but we proceed under the assumption that (c) may fail.
    keyStore.set(job_id, api_key)

    // (c) Enqueue the job. api_key must NOT appear in queue payload at any level (AC-5).
    try {
      await reportQueue.add('generate', { job_id, report_id, email, marketplace_url })
    } catch (enqueueErr) {
      // Roll back side effects so we do not leave:
      //   - an orphan api_key in keyStore (security / memory)
      //   - a DB row stuck in 'queued' state with no worker to ever pick it up
      keyStore.delete(job_id)
      try {
        db.updateJobError(job_id, 'Falha ao enfileirar o trabalho. Tenta novamente.')
      } catch (cleanupErr) {
        // Cleanup best-effort: log the cleanup failure with error_type only (no message,
        // which could carry sensitive context) and let the original enqueue error propagate.
        request.log.error({
          error_type: cleanupErr.constructor.name,
          original_error_type: enqueueErr.constructor.name,
        }, 'Failed to mark orphan job as errored after enqueue failure')
      }
      throw enqueueErr // errorHandler maps to safe 500 { error, message }
    }

    return reply.status(202).send({ data: { job_id, report_id } })
  })
}
