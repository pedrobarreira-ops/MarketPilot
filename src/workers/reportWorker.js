// src/workers/reportWorker.js
// BullMQ Worker: orchestrates the report generation pipeline (Phases A–F).
// Security boundary: retrieves api_key from keyStore; NEVER from job.data.
// RULE: keyStore.delete(job_id) MUST run in finally — unconditionally.

import { Worker } from 'bullmq'
import * as keyStore from '../queue/keyStore.js'
import { redisConnection } from '../queue/reportQueue.js'
import { config } from '../config.js'
import pino from 'pino'

const log = pino({ level: config.LOG_LEVEL })

export async function processJob(job) {
  const { job_id, report_id, email, marketplace_url } = job.data

  try {
    const apiKey = keyStore.get(job_id)
    if (apiKey === undefined) {
      throw new Error('A sessão expirou. Por favor, submete o formulário novamente.')
    }

    // Phase A — fetch catalog (Story 3.2)
    // Phase B — scan competitors (Story 3.3)
    // Phase C — compute report + scoring (Story 3.4)
    // Phase D — persist report to SQLite (Story 3.5)
    // Phase E — send email via Resend (Story 3.6)
  } catch (err) {
    log.error({ job_id, error_code: err.code, error_type: err.constructor.name })
    throw err
  } finally {
    keyStore.delete(job_id)
  }
}

new Worker('report', processJob, { connection: redisConnection })
