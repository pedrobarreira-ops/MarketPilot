// src/db/queries.js
// Central data-access layer — the ONLY file that executes DB reads/writes.
// All other modules interact with the DB exclusively through these named exports.

import { eq, gt, and } from 'drizzle-orm'
import { db } from './database.js'
import { generationJobs, reports } from './schema.js'

// Returns current Unix epoch in seconds (integers, not milliseconds).
const unixNow = () => Math.floor(Date.now() / 1000)

// Report TTL: 48 hours in seconds.
const TTL_SECONDS = 172800

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
 * Update job status and phase message.
 * Sets completed_at only when status transitions to 'complete'.
 *
 * If phaseMessage is undefined, Drizzle omits that column from the SET clause,
 * preserving the previous phase_message value rather than clearing it to NULL.
 * Pass null explicitly to clear the phase message.
 */
export function updateJobStatus(jobId, status, phaseMessage) {
  const updates = { status }
  if (phaseMessage !== undefined) updates.phaseMessage = phaseMessage
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
 * expires_at is always generated_at + TTL_SECONDS (48 hours), computed at insert time.
 */
export function insertReport(
  reportId, email, summaryJson,
  opportunitiesPtJson, opportunitiesEsJson,
  quickwinsPtJson, quickwinsEsJson,
  csvData,
) {
  const now = unixNow()
  db.insert(reports).values({
    reportId,
    email,
    summaryJson,
    opportunitiesPtJson,
    opportunitiesEsJson,
    quickwinsPtJson,
    quickwinsEsJson,
    csvData,
    generatedAt: now,
    expiresAt: now + TTL_SECONDS,
  }).run()
}

/**
 * Return a report row only if it exists and has not expired.
 * Returns null — never throws — so callers can safely return 404 on null.
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
  return row ?? null
}

/**
 * Return { status, phase_message, report_id } for a job, or null if not found.
 * Snake-case keys are the HTTP API contract consumed by Epic 4 routes.
 */
export function getJobStatus(jobId) {
  const row = db
    .select({
      status:       generationJobs.status,
      phaseMessage: generationJobs.phaseMessage,
      reportId:     generationJobs.reportId,
    })
    .from(generationJobs)
    .where(eq(generationJobs.jobId, jobId))
    .limit(1)
    .get()
  if (!row) return null
  return {
    status:        row.status,
    phase_message: row.phaseMessage,
    report_id:     row.reportId,
  }
}
