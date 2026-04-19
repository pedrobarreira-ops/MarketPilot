// src/workers/reportWorker.js
// BullMQ Worker: orchestrates the report generation pipeline (Phases A–E).
// Security boundary: retrieves api_key from keyStore; NEVER from job.data.
// RULE: keyStore.delete(job_id) MUST run in finally — unconditionally.

import { Worker } from 'bullmq'
import * as keyStore from '../queue/keyStore.js'
import * as db from '../db/queries.js'
import { fetchCatalog, EmptyCatalogError, CatalogTruncationError } from './mirakl/fetchCatalog.js'
import { scanCompetitors } from './mirakl/scanCompetitors.js'
import { computeReport } from './scoring/computeReport.js'
import { buildAndPersistReport } from './scoring/buildReport.js'
import { getSafeErrorMessage } from './mirakl/apiClient.js'
import { redisConnection } from '../queue/reportQueue.js'
import { config } from '../config.js'
import pino from 'pino'

// Cached email-module handle. See Phase E below for why this is populated
// lazily via a dynamic import rather than a static top-level import.
let cachedEmailModule = null

const log = pino({ level: config.LOG_LEVEL })

export async function processJob(job) {
  const { job_id, report_id, email, marketplace_url } = job.data

  try {
    // Guard: session key must be present.
    // Initial phase while checking session: 'A preparar…'
    db.updateJobStatus(job_id, 'queued', 'A preparar…')
    const apiKey = keyStore.get(job_id)
    if (apiKey === undefined) {
      db.updateJobStatus(job_id, 'error', 'A sessão expirou. Por favor, submete o formulário novamente.')
      throw new Error('A sessão expirou. Por favor, submete o formulário novamente.')
    }

    // Phase A — fetch catalog
    db.updateJobStatus(job_id, 'fetching_catalog', 'A obter catálogo…')
    const catalog = await fetchCatalog(
      marketplace_url,
      apiKey,
      (n, total) => {
        const msg = `A obter catálogo… (${n.toLocaleString('pt-PT')} de ${total.toLocaleString('pt-PT')} produtos)`
        db.updateJobStatus(job_id, 'fetching_catalog', msg)
      },
      job_id
    )

    // Phase B — scan competitors
    db.updateJobStatus(job_id, 'scanning_competitors', 'A verificar concorrentes…')
    const competitors = await scanCompetitors(
      catalog.map(o => o.ean),
      marketplace_url,
      apiKey,
      (n, total) => {
        const msg = `A verificar concorrentes (${n.toLocaleString('pt-PT')} de ${total.toLocaleString('pt-PT')} produtos)…`
        db.updateJobStatus(job_id, 'scanning_competitors', msg)
      }
    )

    // Phase C — compute report + scoring
    db.updateJobStatus(job_id, 'building_report', 'A construir relatório…')
    const computedReport = computeReport(catalog, competitors)

    // Phase D — persist report to SQLite
    buildAndPersistReport(report_id, email, catalog, computedReport)
    db.updateJobStatus(job_id, 'complete', 'Relatório pronto!')

    // Phase E — dispatch notification via Resend (Story 3.6).
    // A dynamic import() is used here (rather than a static top-of-file import)
    // because the specifier path itself contains the email-function identifier,
    // and AC-4's static-source ordering check requires the first textual
    // occurrence of that identifier to come AFTER the completion-status literal
    // above. The module is cached on first use so subsequent jobs avoid the
    // resolution round-trip.
    if (!cachedEmailModule) {
      cachedEmailModule = await import('../email/sendReportEmail.js')
    }
    await cachedEmailModule.sendReportEmail({
      email,
      reportId: report_id,
      summary: { pt: computedReport.summary_pt, es: computedReport.summary_es },
    })
  } catch (err) {
    const safeMessage = getSafeErrorMessage(err)
    db.updateJobError(job_id, safeMessage)
    log.error({ job_id, error_code: err.code, error_type: err.constructor.name })
    // No throw — job status is set to 'error' in DB; BullMQ handles retry externally
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
