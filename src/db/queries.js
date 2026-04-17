// src/db/queries.js
// Central data-access layer — the ONLY file that executes DB reads/writes.
// All other modules interact with the DB exclusively through these named exports.

import { eq, gt, and } from 'drizzle-orm'
import { db } from './database.js'
import { generationJobs, reports } from './schema.js'

// Returns current Unix epoch in seconds (integers, not milliseconds).
const unixNow = () => Math.floor(Date.now() / 1000)

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
 */
export function updateJobStatus(jobId, status, phaseMessage) {
  const updates = { status, phaseMessage }
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
 * expires_at is always generated_at + 172800 (48 hours), computed at insert time.
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
    expiresAt: now + 172800,
  }).run()
}

/**
 * Return a report row only if it exists and has not expired.
 * Returns null — never throws — so callers can safely return 404 on null.
 */
export function getReport(reportId, now) {
  const rows = db
    .select()
    .from(reports)
    .where(and(eq(reports.reportId, reportId), gt(reports.expiresAt, now)))
    .all()
  return rows[0] ?? null
}

/**
 * Return { status, phase_message, report_id } for a job, or null if not found.
 * Snake-case keys are the HTTP API contract consumed by Epic 4 routes.
 */
export function getJobStatus(jobId) {
  const rows = db
    .select({
      status:       generationJobs.status,
      phaseMessage: generationJobs.phaseMessage,
      reportId:     generationJobs.reportId,
    })
    .from(generationJobs)
    .where(eq(generationJobs.jobId, jobId))
    .all()
  if (!rows[0]) return null
  return {
    status:        rows[0].status,
    phase_message: rows[0].phaseMessage,
    report_id:     rows[0].reportId,
  }
}
