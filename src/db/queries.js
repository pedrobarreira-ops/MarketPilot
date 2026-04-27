// src/db/queries.js
// Central data-access layer — the ONLY file that executes DB reads/writes.
// All other modules interact with the DB exclusively through these named exports.

import { eq, gt, and } from 'drizzle-orm'
import { db } from './database.js'
import { generationJobs, reports } from './schema.js'
import { runMigrations } from './migrate.js'

// Ensure tables exist whenever queries.js is first imported (covers test and worker contexts
// where server.js is not loaded).  runMigrations() uses CREATE TABLE IF NOT EXISTS, so it is
// idempotent — safe to call multiple times.
runMigrations()

// Returns current Unix epoch in seconds (integers, not milliseconds).
const unixNow = () => Math.floor(Date.now() / 1000)

// Note: TTL (now + 172800) is owned by the caller of insertReport — see
// src/workers/scoring/buildReport.js. queries.js does not compute expires_at.

// CSV column header used in csv_data — Portuguese client-readable, 10 columns.
// wow_score columns intentionally omitted (internal scoring metric).
// Must remain byte-equal to CSV_HEADER in src/workers/scoring/buildReport.js
// — see drift test in epic3-3.5-report-persistence.additional.test.js.
export const CSV_COLUMNS = 'EAN,Produto,SKU,O meu preço,Preço 1.º lugar PT,Diferença € PT,Diferença % PT,Preço 1.º lugar ES,Diferença € ES,Diferença % ES'

/**
 * Insert a new job into generation_jobs with status='queued'.
 */
export function createJob(jobId, reportId, email, marketplaceUrl) {
  db.insert(generationJobs).values({
    jobId,
    reportId,
    email,
    marketplaceUrl,
    status: 'queued',
    createdAt: unixNow(),
  }).run()
}

/**
 * Update job status, phase message, and progress counts.
 * Sets completed_at only when status transitions to 'complete'.
 *
 * Three-state semantic for phaseMessage, progressCurrent, progressTotal:
 *   undefined → column omitted from SET (preserves previous DB value)
 *   null      → column cleared (written as NULL)
 *   value     → column set to that value
 *
 * Existing callers passing only 3 args continue to work unchanged —
 * progressCurrent and progressTotal default to undefined → omitted from SET.
 *
 * @param {string} jobId
 * @param {string} status
 * @param {string|null|undefined} phaseMessage
 * @param {number|null|undefined} progressCurrent
 * @param {number|null|undefined} progressTotal
 */
export function updateJobStatus(jobId, status, phaseMessage, progressCurrent, progressTotal) {
  const updates = { status }
  if (phaseMessage     !== undefined) updates.phaseMessage     = phaseMessage
  if (progressCurrent  !== undefined) updates.progressCurrent  = progressCurrent
  if (progressTotal    !== undefined) updates.progressTotal    = progressTotal
  if (status === 'complete') updates.completedAt = unixNow()
  db.update(generationJobs)
    .set(updates)
    .where(eq(generationJobs.jobId, jobId))
    .run()
}

/**
 * Mark a job as failed, recording the error message and completion timestamp.
 */
export function updateJobError(jobId, errorMessage) {
  db.update(generationJobs)
    .set({ status: 'error', errorMessage, completedAt: unixNow() })
    .where(eq(generationJobs.jobId, jobId))
    .run()
}

/**
 * Insert a completed report.
 * Accepts a single report object with snake_case keys.
 * expires_at must be provided by the caller (worker sets it to now + 172800).
 *
 * Expected keys: report_id, generated_at, expires_at, email, summary_json,
 *   opportunities_pt_json, opportunities_es_json, quickwins_pt_json,
 *   quickwins_es_json, csv_data
 *
 */
export function insertReport(reportObj) {
  db.insert(reports).values({
    reportId:            reportObj.report_id,
    generatedAt:         reportObj.generated_at,
    expiresAt:           reportObj.expires_at,
    email:               reportObj.email,
    summaryJson:         reportObj.summary_json,
    opportunitiesPtJson: reportObj.opportunities_pt_json,
    opportunitiesEsJson: reportObj.opportunities_es_json,
    quickwinsPtJson:     reportObj.quickwins_pt_json,
    quickwinsEsJson:     reportObj.quickwins_es_json,
    csvData:             reportObj.csv_data,
  }).run()
}

/**
 * Return a report row only if it exists and has not expired.
 * Returns null — never throws — so callers can safely return 404 on null.
 * Keys are returned in snake_case to match the HTTP API contract.
 *
 * @param {string} reportId
 * @param {number} now - Current time as Unix epoch SECONDS (not milliseconds).
 *   Use Math.floor(Date.now() / 1000). Passing milliseconds will make every
 *   report appear expired because expires_at (~1.7 billion) < now (~1.7 trillion).
 */
export function getReport(reportId, now) {
  const row = db
    .select()
    .from(reports)
    .where(and(eq(reports.reportId, reportId), gt(reports.expiresAt, now)))
    .limit(1)
    .get()
  if (!row) return null
  return {
    report_id:             row.reportId,
    generated_at:          row.generatedAt,
    expires_at:            row.expiresAt,
    email:                 row.email,
    summary_json:          row.summaryJson,
    opportunities_pt_json: row.opportunitiesPtJson,
    opportunities_es_json: row.opportunitiesEsJson,
    quickwins_pt_json:     row.quickwinsPtJson,
    quickwins_es_json:     row.quickwinsEsJson,
    csv_data:              row.csvData,
  }
}

/**
 * Return { status, phase_message, report_id, progress_current, progress_total }
 * for a job, or null if not found.
 * Snake-case keys are the HTTP API contract consumed by Epic 4 routes.
 * NULL DB values are returned as JavaScript null (not undefined, not 0).
 */
export function getJobStatus(jobId) {
  const row = db
    .select({
      status:          generationJobs.status,
      phaseMessage:    generationJobs.phaseMessage,
      reportId:        generationJobs.reportId,
      progressCurrent: generationJobs.progressCurrent,
      progressTotal:   generationJobs.progressTotal,
    })
    .from(generationJobs)
    .where(eq(generationJobs.jobId, jobId))
    .limit(1)
    .get()
  if (!row) return null
  return {
    status:           row.status,
    phase_message:    row.phaseMessage,
    report_id:        row.reportId,
    progress_current: row.progressCurrent ?? null,
    progress_total:   row.progressTotal   ?? null,
  }
}
