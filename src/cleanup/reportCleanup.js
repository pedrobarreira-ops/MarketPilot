// src/cleanup/reportCleanup.js
// Hourly TTL deletion cron — deletes expired report rows from SQLite.
// Library module only — NOT a standalone process entry point.
// Scheduled at server init via startCleanupCron(fastify.log).

import cron from 'node-cron'
import { sqlite } from '../db/database.js'

// Memoised prepared statement — populated lazily on first call to deleteExpiredReports()
// so migrations can run before the statement is compiled (the reports table must exist
// when sqlite.prepare() parses the SQL). Reusing the prepared statement across cron
// fires avoids re-parsing on every hourly invocation.
let deleteStmt = null

/**
 * Delete all expired report rows synchronously.
 * Returns the number of deleted rows (0 if none expired).
 * Exported for ATDD functional tests and for direct use in the cron callback.
 *
 * Uses strict less-than (<) per spec — boundary rows (expires_at === current second)
 * are NOT deleted; they survive until the next cron run.
 *
 * The statement is prepared lazily on first call and memoised thereafter so
 * migrations can run before this module executes SQL (important in test environments
 * where the reports table may not exist at module-load time).
 *
 * @returns {number} count of deleted rows
 */
export function deleteExpiredReports() {
  if (deleteStmt === null) {
    deleteStmt = sqlite.prepare('DELETE FROM reports WHERE expires_at < unixepoch()')
  }
  const result = deleteStmt.run()
  return result.changes
}

/**
 * Schedule the hourly TTL cleanup cron.
 * Must be called at server init after runMigrations() so the reports table exists.
 *
 * The cron callback is intentionally synchronous — deleteExpiredReports() is a
 * blocking better-sqlite3 call with no awaitable work. Keeping the callback sync
 * means any thrown error unwinds directly into the try/catch rather than becoming
 * a rejected promise that node-cron might swallow silently (AC-5 hardening).
 *
 * @param {import('pino').Logger} log - Fastify/Pino logger instance
 */
export function startCleanupCron(log) {
  cron.schedule('0 * * * *', () => {
    try {
      const changes = deleteExpiredReports()
      if (changes > 0) {
        log.info(`[cleanup] Deleted ${changes} expired report(s)`)
      }
    } catch (err) {
      log.error({ error_type: err.constructor.name }, '[cleanup] Cron error')
    }
  })
}
