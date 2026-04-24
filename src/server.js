// src/server.js
// Fastify v5 server entry point.
// Importing config.js first ensures the server refuses to start if any required
// env var is missing — fail fast rather than failing at the first API call.

import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'node:fs'
import Fastify from 'fastify'
import staticPlugin from '@fastify/static'
import rateLimit from '@fastify/rate-limit'
import { config } from './config.js'
import { reportQueue } from './queue/reportQueue.js'  // establishes Redis connection at startup (fail-fast)
import { worker as reportWorker } from './workers/reportWorker.js'
import { errorHandler } from './middleware/errorHandler.js'
import { runMigrations } from './db/migrate.js'
import { startCleanupCron } from './cleanup/reportCleanup.js'
import generateRoute from './routes/generate.js'
import jobsRoute from './routes/jobs.js'
import reportsRoute from './routes/reports.js'

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

// Guard: fail fast if public/ directory is missing (misconfigured Docker build or local dev issue).
// Deferred from Story 1.2 code review (per deferred-work.md).
// Without this check, @fastify/static throws an unhandled rejection at module-eval time.
// NOTE: fastify.log IS available here — the Fastify instance is constructed before register() is called.
if (!fs.existsSync(PUBLIC_DIR)) {
  fastify.log.error({ public_dir: PUBLIC_DIR }, 'public/ directory not found — cannot start server')
  process.exit(1)
}

// Serve all static files from /public/** — handles index.html, progress.html, etc.
// await is needed here so the plugin is fully registered before route declarations
await fastify.register(staticPlugin, {
  root: PUBLIC_DIR,
  prefix: '/',
})

// Global error handler — maps all unhandled errors to safe { error, message } (NFR-S4)
// Must be registered before rateLimit so the 429 dispatch branch in errorHandler is active.
fastify.setErrorHandler(errorHandler)

// Register rate-limit plugin — BEFORE any route declarations so the global default applies to ALL routes.
// Registration order matters in Fastify: plugins registered after a route declaration do not apply to it.
// Registering here (before /health and /report/:report_id) ensures every route is covered.
// errorResponseBuilder overrides the plugin's default 429 shape to match our { error, message } contract (AC-6)
// allowList excludes /health from rate limiting — Coolify liveness probes must not be limited (AC-1)
// We match on the route template (routeOptions.url) rather than request.url so a probe that arrives
// as `/health?foo=1` still bypasses the rate limiter instead of falling into the global bucket.
await fastify.register(rateLimit, {
  global: true,
  max: 60,
  timeWindow: '1 minute',
  errorResponseBuilder: (_request, _context) => {
    return {
      error: 'too_many_requests',
      message: 'Demasiados pedidos. Tenta novamente em breve.',
    }
  },
  allowList: (request) => request.routeOptions?.url === '/health',
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

// Initialise SQLite schema (idempotent — runs on every startup)
try {
  runMigrations()
  fastify.log.info('Database migrations complete')
} catch (err) {
  fastify.log.error({ error_type: err.constructor.name }, 'Migration failed — aborting startup')
  process.exit(1)
}

// Start hourly TTL cleanup cron — after migrations so the reports table exists (AC-4)
startCleanupCron(fastify.log)

// Register routes — AFTER setErrorHandler, rateLimit plugin, and runMigrations (Story 4.1)
await fastify.register(generateRoute)
await fastify.register(jobsRoute)   // Story 4.2: GET /api/jobs/:job_id polling
// Report retrieval routes — GET /api/reports/:id and GET /api/reports/:id/csv (Story 4.3)
await fastify.register(reportsRoute)

// Start listening — v5 requires object syntax; positional args from v4 are not supported
try {
  await fastify.listen({ port: config.PORT, host: '0.0.0.0' })
  fastify.log.info(`Server listening on port ${config.PORT}`)
} catch (err) {
  fastify.log.error({ error_type: err.constructor.name, error_code: err.code }, 'Server failed to start')
  process.exit(1)
}

// Graceful shutdown — Docker sends SIGTERM on container stop
// Without this handler, in-flight requests are dropped abruptly.
// Deferred from Story 1.2 code review (per deferred-work.md).
let shuttingDown = false
const shutdown = async (signal) => {
  // Re-entrancy guard: a second SIGTERM/SIGINT (or docker stop + docker kill)
  // would otherwise spin up a second timer and call fastify.close() twice.
  if (shuttingDown) {
    fastify.log.warn({ signal }, 'Shutdown already in progress — ignoring additional signal')
    return
  }
  shuttingDown = true

  fastify.log.info({ signal }, 'Shutdown signal received — closing server')
  const forceExitTimer = setTimeout(() => {
    fastify.log.error('Graceful shutdown timed out — forcing exit')
    process.exit(1)
  }, 10_000)
  forceExitTimer.unref() // don't prevent Node from exiting naturally if close resolves

  try {
    // Close the BullMQ worker before Fastify so in-flight jobs can drain.
    // reportWorker is null in test env — guard to avoid a runtime error.
    if (reportWorker) {
      try { await reportWorker.close() } catch (workerErr) {
        fastify.log.error({ error_type: workerErr.constructor.name }, 'Error closing BullMQ worker')
      }
    }
    await fastify.close()
    clearTimeout(forceExitTimer)
    fastify.log.info('Server closed cleanly')
    process.exit(0)
  } catch (err) {
    clearTimeout(forceExitTimer)
    fastify.log.error({ error_type: err.constructor.name }, 'Error during shutdown')
    process.exit(1)
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))

// Exported for future test stories that need to inject requests without binding a port
export { fastify }
