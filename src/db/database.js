// src/db/database.js
// Opens the SQLite connection and creates the Drizzle ORM instance.
// WAL mode is set here (before any queries) for concurrent read safety.

import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { config } from '../config.js'

let sqlite
try {
  sqlite = new Database(config.SQLITE_PATH)
} catch (err) {
  throw new Error(
    `Failed to open SQLite database at "${config.SQLITE_PATH}": ${err.message}. ` +
    'Ensure the directory exists and the process has read/write permissions.',
  )
}

// WAL journal mode allows readers and a single writer to operate concurrently
// without exclusive locks — required for the BullMQ worker + Fastify API pattern.
const walResult = sqlite.pragma('journal_mode = WAL', { simple: true })
if (walResult !== 'wal') {
  // Non-fatal: WAL may be unavailable on network filesystems or read-only mounts.
  // Log a warning so it is visible in startup logs rather than failing silently.
  console.warn(
    `[database] WARNING: WAL mode was not activated (got "${walResult}"). ` +
    'Concurrent read/write performance may be degraded.',
  )
}

export const db = drizzle(sqlite)
export { sqlite }
