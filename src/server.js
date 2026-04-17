// src/server.js
// Fastify v5 server entry point.
// Importing config.js first ensures the server refuses to start if any required
// env var is missing — fail fast rather than failing at the first API call.

import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'node:fs'
import Fastify from 'fastify'
import staticPlugin from '@fastify/static'
import { config } from './config.js'
import { errorHandler } from './middleware/errorHandler.js'

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

// Start listening — v5 requires object syntax; positional args from v4 are not supported
try {
  await fastify.listen({ port: config.PORT, host: '0.0.0.0' })
  fastify.log.info(`Server listening on port ${config.PORT}`)
} catch (err) {
  fastify.log.error(err)
  process.exit(1)
}

// Graceful shutdown — Docker sends SIGTERM on container stop
// Without this handler, in-flight requests are dropped abruptly.
// Deferred from Story 1.2 code review (per deferred-work.md).
const shutdown = async (signal) => {
  fastify.log.info({ signal }, 'Shutdown signal received — closing server')
  const forceExitTimer = setTimeout(() => {
    fastify.log.error('Graceful shutdown timed out — forcing exit')
    process.exit(1)
  }, 10_000)
  forceExitTimer.unref() // don't prevent Node from exiting naturally if close resolves

  try {
    await fastify.close()
    clearTimeout(forceExitTimer)
    fastify.log.info('Server closed cleanly')
    process.exit(0)
  } catch (err) {
    fastify.log.error({ error_type: err.constructor.name }, 'Error during shutdown')
    process.exit(1)
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))

// Exported for future test stories that need to inject requests without binding a port
export { fastify }
