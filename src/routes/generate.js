// src/routes/generate.js
// POST /api/generate — validates credentials, creates BullMQ job, returns job_id + report_id.
//
// Security invariants (non-negotiable):
// 1. api_key is stored in keyStore ONLY — never passed to queue.add() or logged.
// 2. keyStore.set(job_id, api_key) is called ONLY here (AC-4, AC-10).
// 3. Response body never contains the api_key value (AC-9).
// 4. Validation (including whitespace guard) runs BEFORE keyStore.set() (AC-1).

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
    const { api_key, email } = request.body
    const marketplace_url = config.WORTEN_BASE_URL

    // Guard: whitespace-only api_key is semantically invalid even when minLength: 1 passes.
    // Also defensive against null/undefined (belt-and-suspenders beyond schema).
    if (!api_key || typeof api_key !== 'string' || !api_key.trim()) {
      return reply.status(400).send({
        error: 'validation_error',
        message: 'body/api_key must be a non-empty string',
      })
    }

    // All validation passed — proceed to create job.
    const job_id    = randomUUID()
    const report_id = randomUUID()

    // keyStore.set() is the ONLY call site in the entire codebase (AC-4, AC-10).
    // api_key must NOT appear in queue payload at any level (AC-5).
    keyStore.set(job_id, api_key)
    await reportQueue.add('generate', { job_id, report_id, email, marketplace_url })
    db.createJob(job_id, report_id, email, marketplace_url)

    return reply.status(202).send({ data: { job_id, report_id } })
  })
}
