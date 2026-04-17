// src/db/migrate.js
// Schema bootstrap — creates tables and indexes on first run, idempotent on restarts.
// Called once from server.js before fastify.listen(); never called at query time.

import { sqlite } from './database.js'

// DDL is written explicitly (not via drizzle-kit push) so schema control is
// deterministic: the exact column list is locked here, not inferred from JS objects.
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
      error_message TEXT
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
}
