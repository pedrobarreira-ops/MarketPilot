// src/server.js
// Fastify v5 server entry point.
// Importing config.js first ensures the server refuses to start if any required
// env var is missing — fail fast rather than failing at the first API call.

import path from 'path'
import { fileURLToPath } from 'url'
import Fastify from 'fastify'
import staticPlugin from '@fastify/static'
import { config } from './config.js'
import { errorHandler } from './middleware/errorHandler.js'
import { runMigrations } from './db/migrate.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
// Absolute path required by @fastify/static — server.js lives in src/, public/ is one level up
const PUBLIC_DIR = path.join(__dirname, '..', 'public')

const fastify = Fastify({
  logger: {
    level: config.LOG_LEVEL,
    redact: {
      paths: [
        'req.headers.authorization',
        'req.body.api_key',
        'api_key',       // top-level api_key (e.g. logged request bodies)
        '*.api_key',     // nested api_key in any object
        '*.Authorization',
      ],
      censor: '[REDACTED]',
    },
  },
  // Required so Traefik's X-Forwarded-Proto header is trusted for HTTPS detection (NFR-S1)
  trustProxy: true,
})

// Serve all static files from /public/** — handles index.html, progress.html, etc.
// await is needed here so the plugin is fully registered before route declarations
await fastify.register(staticPlugin, {
  root: PUBLIC_DIR,
  prefix: '/',
})

// Health check — used by Coolify for container liveness probes
fastify.get('/health', async (_req, reply) => {
  return reply.send({ status: 'ok' })
})

// Report page — serves the static HTML shell; report.js fetches /api/reports/:id at runtime.
// Must be registered AFTER staticPlugin so it overrides the static handler for /report/ paths.
fastify.get('/report/:report_id', async (_req, reply) => {
  return reply.sendFile('report.html')
})

// Global error handler — maps all unhandled errors to safe { error, message } (NFR-S4)
fastify.setErrorHandler(errorHandler)

// Initialise SQLite schema (idempotent — runs on every startup)
try {
  runMigrations()
  fastify.log.info('Database migrations complete')
} catch (err) {
  fastify.log.error({ error_type: err.constructor.name }, 'Migration failed — aborting startup')
  // Small delay lets Pino flush its write buffer before the process exits.
  // Pino writes asynchronously; exiting synchronously can silently drop the
  // error log line, making startup failures very hard to diagnose.
  setTimeout(() => process.exit(1), 100)
}

// Start listening — v5 requires object syntax; positional args from v4 are not supported
try {
  await fastify.listen({ port: config.PORT, host: '0.0.0.0' })
  fastify.log.info(`Server listening on port ${config.PORT}`)
} catch (err) {
  fastify.log.error(err)
  process.exit(1)
}

// Exported for future test stories that need to inject requests without binding a port
export { fastify }
