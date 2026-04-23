// src/cleanup/reportCleanup.js
// Hourly TTL deletion cron — deletes expired report rows from SQLite.
// Library module only — NOT a standalone process entry point.
// Scheduled at server init via startCleanupCron(fastify.log).

import cron from 'node-cron'
import { sqlite } from '../db/database.js'

/**
 * Delete all expired report rows synchronously.
 * Returns the number of deleted rows (0 if none expired).
 * Exported for ATDD functional tests and for direct use in the cron callback.
 *
 * Uses strict less-than (<) per spec — boundary rows (expires_at === current second)
 * are NOT deleted; they survive until the next cron run.
 *
 * The statement is prepared lazily on first call so migrations can run before
 * this module is imported (important in test environments where the table may
 * not exist at module-load time).
 *
 * @returns {number} count of deleted rows
 */
export function deleteExpiredReports() {
  const result = sqlite.prepare('DELETE FROM reports WHERE expires_at < unixepoch()').run()
  return result.changes
}

/**
 * Schedule the hourly TTL cleanup cron.
 * Must be called at server init after runMigrations() so the reports table exists.
 *
 * @param {import('pino').Logger} log - Fastify/Pino logger instance
 */
export function startCleanupCron(log) {
  cron.schedule('0 * * * *', async () => {
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
