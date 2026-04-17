// src/db/database.js
// Opens the SQLite connection and creates the Drizzle ORM instance.
// WAL mode is set here (before any queries) for concurrent read safety.

import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { config } from '../config.js'

const sqlite = new Database(config.SQLITE_PATH)

// WAL journal mode allows readers and a single writer to operate concurrently
// without exclusive locks — required for the BullMQ worker + Fastify API pattern.
sqlite.pragma('journal_mode = WAL')

export const db = drizzle(sqlite)
export { sqlite }
