// src/workers/reportWorker.js
// BullMQ Worker: orchestrates the report generation pipeline (Phases A–E).
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

// Instantiate the BullMQ Worker only when NOT running under the test runner.
// In test env, the processJob function is called directly — no live Worker needed.
// This prevents orphaned ioredis retry connections from outliving test hooks.
//
// Fail-loud guard: if NODE_ENV=test is ever set in a non-test process the Worker
// would silently never run and jobs would queue forever. Log a warning at module
// load time so any misconfigured environment surfaces immediately in stderr.
const isTestEnv = process.env.NODE_ENV === 'test'
if (isTestEnv) {
  log.warn({ NODE_ENV: process.env.NODE_ENV }, 'reportWorker: BullMQ Worker skipped (test env) — processJob is callable directly')
}
export const worker = isTestEnv
  ? null
  : new Worker('report', processJob, { connection: redisConnection })
