// src/db/schema.js
// Drizzle ORM table definitions — column declarations only, no queries.
// Camel-case JS names map to snake_case SQL column names (Drizzle convention).

import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'

export const generationJobs = sqliteTable('generation_jobs', {
  jobId:          text('job_id').primaryKey(),
  reportId:       text('report_id').notNull(),
  status:         text('status').notNull().default('queued'),
  phaseMessage:   text('phase_message'),
  email:          text('email').notNull(),
  marketplaceUrl: text('marketplace_url').notNull(),
  createdAt:       integer('created_at'),
  completedAt:     integer('completed_at'),
  errorMessage:    text('error_message'),
  progressCurrent: integer('progress_current'),
  progressTotal:   integer('progress_total'),
})

export const reports = sqliteTable('reports', {
  reportId:            text('report_id').primaryKey(),
  generatedAt:         integer('generated_at').notNull(),
  expiresAt:           integer('expires_at').notNull(),
  email:               text('email').notNull(),
  summaryJson:         text('summary_json').notNull(),
  opportunitiesPtJson: text('opportunities_pt_json'),
  opportunitiesEsJson: text('opportunities_es_json'),
  quickwinsPtJson:     text('quickwins_pt_json'),
  quickwinsEsJson:     text('quickwins_es_json'),
  priceHeadroomPtJson: text('price_headroom_pt_json'),
  priceHeadroomEsJson: text('price_headroom_es_json'),
  csvData:             text('csv_data'),
})
