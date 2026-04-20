// scripts/test-static-server.js
// Minimal Fastify instance that serves public/** on port 3001 for Playwright E2E tests.
// No DB, no BullMQ, no migrations — purely static file serving so Playwright tests
// can load real index.html / progress.html / report.html without spinning up
// the full production stack (which needs Redis + SQLite + Resend creds).
//
// Backend calls from the frontend (POST /api/generate, GET /api/jobs/:id, GET
// /api/reports/:id) are mocked per-test via Playwright's `page.route()` intercepts.

import path from 'path'
import { fileURLToPath } from 'url'
import Fastify from 'fastify'
import staticPlugin from '@fastify/static'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PUBLIC_DIR = path.join(__dirname, '..', 'public')

const fastify = Fastify({ logger: false })

await fastify.register(staticPlugin, {
  root: PUBLIC_DIR,
  prefix: '/',
})

// Report page route (mirrors src/server.js behaviour so /report/{id} serves report.html).
fastify.get('/report/:report_id', async (_req, reply) => reply.sendFile('report.html'))

const PORT = process.env.PLAYWRIGHT_STATIC_PORT ? Number(process.env.PLAYWRIGHT_STATIC_PORT) : 3001

try {
  await fastify.listen({ port: PORT, host: '127.0.0.1' })
  // Intentionally no log — Playwright's webServer spinner is the UX here.
} catch (err) {
  process.stderr.write(`[test-static-server] failed to start: ${err.message}\n`)
  process.exit(1)
}
