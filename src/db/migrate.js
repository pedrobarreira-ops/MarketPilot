// src/db/migrate.js
// Schema bootstrap — creates tables and indexes on first run, idempotent on restarts.
// Called once from server.js before fastify.listen(); never called at query time.

import { sqlite } from './database.js'

// DDL is written explicitly (not via drizzle-kit push) so schema control is
// deterministic: the exact column list is locked here, not inferred from JS objects.

/**
 * Idempotent column-existence check for ALTER TABLE ADD COLUMN.
 * SQLite < 3.35 does not support ADD COLUMN IF NOT EXISTS, so we detect via PRAGMA.
 *
 * SECURITY: tableName, columnName, and columnType are interpolated directly into
 * SQL without parameterization (SQLite does not support bind parameters for DDL
 * identifiers). Callers MUST pass trusted literal identifiers only — never user
 * input. All current call sites pass hardcoded string literals.
 */
function ensureColumn(tableName, columnName, columnType) {
  const cols = sqlite.prepare(`PRAGMA table_info(${tableName})`).all().map(r => r.name)
  if (!cols.includes(columnName)) {
    sqlite.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnType}`)
  }
}

export function runMigrations() {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS generation_jobs (
      job_id TEXT PRIMARY KEY,
      report_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      phase_message TEXT,
      email TEXT NOT NULL,
      marketplace_url TEXT NOT NULL,
      created_at INTEGER,
      completed_at INTEGER,
      error_message TEXT,
      progress_current INTEGER,
      progress_total INTEGER
    );

    CREATE TABLE IF NOT EXISTS reports (
      report_id TEXT PRIMARY KEY,
      generated_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      email TEXT NOT NULL,
      summary_json TEXT NOT NULL,
      opportunities_pt_json TEXT,
      opportunities_es_json TEXT,
      quickwins_pt_json TEXT,
      quickwins_es_json TEXT,
      csv_data TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_reports_expires_at ON reports(expires_at);
  `)

  // For existing DBs created before this story (9-column shape), add the two new
  // progress columns if absent. ensureColumn uses PRAGMA table_info so it is safe
  // to run against both fresh and pre-existing databases without error.
  ensureColumn('generation_jobs', 'progress_current', 'INTEGER')
  ensureColumn('generation_jobs', 'progress_total', 'INTEGER')
}
