# Story 1.2: Fastify Server with Log Redaction

**Epic:** 1 — Project Foundation & Infrastructure
**Story:** 1.2
**Story Key:** 1-2-fastify-server-with-log-redaction
**Status:** done
**Date Created:** 2026-04-16

---

## User Story

As a developer,
I want a Fastify v5 server instance with Pino log redaction configured,
So that the `api_key` field and `Authorization` header are NEVER written to any log output, satisfying NFR-S4 from the first request.

**Satisfies:** NFR-S1 (trust proxy for HTTPS), NFR-S4 (log redaction)

---

## Acceptance Criteria

**Given** the Fastify server is started
**When** it initialises
**Then** Pino is configured with:
```javascript
redact: {
  paths: ['req.headers.authorization', 'req.body.api_key', '*.api_key', '*.Authorization'],
  censor: '[REDACTED]'
}
```

**And** `trustProxy: true` is set (required for Traefik's `X-Forwarded-Proto` header)

**And** a health-check route `GET /health` returns `200 { status: 'ok' }` — used by Coolify for container health checks

**And** `@fastify/static` is registered to serve files from `public/` (absolute path resolved from project root)

**And** `src/middleware/errorHandler.js` is registered as Fastify's `setErrorHandler` — maps unknown errors to `{ error: string, message: string }` shape

**And** `GET /report/:report_id` route is registered and returns `public/report.html` — the HTML shell that `report.js` then wires up via API calls

**Verification:** Send a POST with `{ "api_key": "secret123", "email": "test@test.com" }` to any route and confirm the log output shows `[REDACTED]` in place of the key value.

---

## Tasks / Subtasks

- [x] Task 1: Create `src/server.js` — Fastify v5 instance with full configuration (AC: all)
  - [x] Import `config.js` at the top — server.js must not start if env vars are missing
  - [x] Instantiate Fastify v5 with Pino logger, redact config, and `trustProxy: true`
  - [x] Register `@fastify/static` plugin pointing to `/public/` absolute path
  - [x] Register `GET /health` route
  - [x] Register `GET /report/:report_id` route (sends `public/report.html`)
  - [x] Import and register the errorHandler
  - [x] Call `fastify.listen()` with correct v5 syntax (see Dev Notes below)
  - [x] Export the fastify instance for future test use

- [x] Task 2: Create `src/middleware/errorHandler.js` (AC: AC-5)
  - [x] Export a Fastify-compatible `setErrorHandler` function
  - [x] Map all unknown errors to `{ error: 'internal_server_error', message: 'Erro interno. Tenta novamente.' }`
  - [x] Map Fastify validation errors (400) to `{ error: 'validation_error', message: err.message }`
  - [x] Never expose stack traces or raw error messages in responses
  - [x] Log error type and code (not message) for debugging

- [x] Task 3: Verify redaction works (AC: Verification)
  - [x] Start server with `.env` loaded
  - [x] POST to `/health` with `{ "api_key": "test123" }` body and check stdout for `[REDACTED]`
  - [x] Confirm `GET /health` returns `{ status: 'ok' }` with HTTP 200
  - [x] Confirm `GET /report/any-id` returns `public/report.html` content

---

## Dev Notes

### What Already Exists from Story 1.1

| File | State | Note |
|---|---|---|
| `src/config.js` | **EXISTS** — import this | Validates env vars at startup; exports `config` object |
| `src/middleware/` | Empty directory | Create `errorHandler.js` here |
| `src/routes/` | Empty directory | `generate.js`, `jobs.js`, `reports.js` are for later stories |
| `public/index.html` | EXISTS — DO NOT MODIFY | Stitch mockup; served by @fastify/static |
| `public/progress.html` | EXISTS — DO NOT MODIFY | Stitch mockup |
| `public/report.html` | EXISTS — DO NOT MODIFY | Stitch mockup; served by `GET /report/:report_id` |
| `public/js/form.js` | EXISTS (stub) | DO NOT MODIFY |
| `public/js/progress.js` | EXISTS (stub) | DO NOT MODIFY |
| `public/js/report.js` | EXISTS (stub) | DO NOT MODIFY |

**Do NOT create:** `src/routes/generate.js`, `src/routes/jobs.js`, `src/routes/reports.js`, `src/db/*`, `src/queue/*`, `src/workers/*` — all out of scope for this story.

### Fastify v5 Critical Differences from v4

This project uses **Fastify v5** (`"fastify": "^5.0.0"` in package.json). V5 has breaking changes from v4 that will cause failures if you use v4 syntax:

**`fastify.listen()` signature changed:**
```javascript
// ❌ v4 (WRONG — will fail in v5)
await fastify.listen(3000, '0.0.0.0')
await fastify.listen({ port: 3000 }, callback)

// ✅ v5 (CORRECT)
await fastify.listen({ port: config.PORT, host: '0.0.0.0' })
```

**Plugin registration is the same** (`fastify.register()`), but verify `@fastify/static` v8 is compatible (it is — already in package.json as `^8.0.0`).

**`fastify.log` is still Pino** — the `redact` config syntax is unchanged in v5.

**Error handler registration** — still `fastify.setErrorHandler(fn)`, unchanged.

### `src/server.js` — Exact Implementation

```javascript
// src/server.js
import path from 'path'
import { fileURLToPath } from 'url'
import Fastify from 'fastify'
import staticPlugin from '@fastify/static'
import { config } from './config.js'
import { errorHandler } from './middleware/errorHandler.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PUBLIC_DIR = path.join(__dirname, '..', 'public')

const fastify = Fastify({
  logger: {
    level: config.LOG_LEVEL,
    redact: {
      paths: [
        'req.headers.authorization',
        'req.body.api_key',
        '*.api_key',
        '*.Authorization',
      ],
      censor: '[REDACTED]',
    },
  },
  trustProxy: true,
})

// Serve all static files from /public/**
await fastify.register(staticPlugin, {
  root: PUBLIC_DIR,
  prefix: '/',
})

// Health check — used by Coolify for container liveness
fastify.get('/health', async (_req, reply) => {
  return reply.send({ status: 'ok' })
})

// Report page — serves the static HTML shell; JS fetches /api/reports/:id
fastify.get('/report/:report_id', async (_req, reply) => {
  return reply.sendFile('report.html')
})

// Global error handler — maps errors to safe { error, message } shape
fastify.setErrorHandler(errorHandler)

// Start listening
try {
  await fastify.listen({ port: config.PORT, host: '0.0.0.0' })
  fastify.log.info(`Server listening on port ${config.PORT}`)
} catch (err) {
  fastify.log.error(err)
  process.exit(1)
}

export { fastify }
```

**Why `await fastify.register()`?** In Fastify v5, top-level `await` at module scope is valid with ESM. For plugins that must be initialised before route registration, use `await fastify.register()`.

**Why `path.join(__dirname, '..', 'public')`?** `server.js` is in `src/`, so the public directory is one level up. `@fastify/static` requires an absolute path.

**Why export `fastify`?** Future test stories will import it. Export it but don't use it elsewhere in this story.

### `src/middleware/errorHandler.js` — Exact Implementation

```javascript
// src/middleware/errorHandler.js
export function errorHandler(err, request, reply) {
  // Fastify validation errors (body/param schema failures) — 400
  if (err.statusCode === 400 || err.validation) {
    return reply.status(400).send({
      error: 'validation_error',
      message: err.message,
    })
  }

  // Log the error type and code — NEVER the full message (may contain API key details)
  request.log.error({
    error_type: err.constructor.name,
    error_code: err.code,
    status_code: err.statusCode ?? 500,
  }, 'Unhandled error')

  // All other errors → 500 with safe message
  return reply.status(err.statusCode ?? 500).send({
    error: 'internal_server_error',
    message: 'Erro interno. Tenta novamente ou contacta o suporte.',
  })
}
```

**Why log `error_type` and `error_code` but not `err.message`?** The error message from Mirakl API errors or other pipeline errors may contain raw API response bodies that could include the `api_key` value (echoed back in some API error responses). This is the same pattern the architecture doc specifies for worker error logging (Architecture doc, Section "NFR-S2").

### `@fastify/static` Routing Note

`@fastify/static` will automatically serve `public/index.html` when `/` or `/index.html` is requested, `public/progress.html` when `/progress.html` is requested, etc. The `GET /report/:report_id` route **must be registered AFTER** the static plugin so it overrides the static file handler for that path — otherwise `@fastify/static` might try to serve a non-existent file at `/report/`.

The `reply.sendFile('report.html')` call tells `@fastify/static` to send `report.html` from the registered `root` directory regardless of the request path.

### Security Constraint — Log Redaction Verification

The Pino `redact` config runs **before** any log write. The paths specified are:
- `req.headers.authorization` — redacts the Authorization header on all request logs
- `req.body.api_key` — redacts the api_key field on request body logs
- `*.api_key` — redacts any nested `api_key` field in any logged object
- `*.Authorization` — redacts any nested `Authorization` field

This satisfies **NFR-S4** at the framework level. No per-route opt-in is needed.

**To verify:** Start the server with `node --env-file=.env src/server.js`, then in another terminal:
```bash
curl -X POST http://localhost:3000/health \
  -H "Content-Type: application/json" \
  -d '{"api_key": "secret123", "email": "test@test.com"}'
```
The server stdout should show `"body":{"api_key":"[REDACTED]","email":"test@test.com"}`.

### Architecture Boundary Reminder

**Story 1.2 scope is limited to:**
- `src/server.js`
- `src/middleware/errorHandler.js`

Routes for `/api/generate`, `/api/jobs/:id`, `/api/reports/:id`, and `/api/reports/:id/csv` are **out of scope** — they belong to Epics 3 and 4. Do NOT create placeholder route files for these.

### Naming Convention

Per Architecture doc (Naming Patterns section):
- Files: `kebab-case` → `error-handler.js` would be incorrect; the architecture explicitly names this `errorHandler.js` (camelCase for files in `middleware/`) ← Use `errorHandler.js` as specified in the architecture directory structure

---

## Architecture Guardrails

These apply to ALL stories and were established in Story 1.1:

| Boundary | Rule |
|---|---|
| `src/routes/` | HTTP concerns only — no business logic, no Mirakl calls |
| `src/workers/` | All business logic, all Mirakl API calls |
| `src/queue/keyStore.js` | THE ONLY file that ever holds an API key |
| `src/db/queries.js` | ALL SQLite reads/writes |

**Security constraints (non-negotiable):**
1. `api_key` must NEVER appear in BullMQ job data
2. `api_key` must NEVER appear in any log entry (Pino redact handles this — configured here in Story 1.2)
3. `api_key` must NEVER be written to any DB column
4. `keyStore.delete(job_id)` must ALWAYS be in a `finally` block
5. All Mirakl API calls must go through `src/workers/mirakl/apiClient.js`

---

## Previous Story Intelligence (Story 1.1)

**Applied in this story:**
- `better-sqlite3` is **v11.0.0** (NOT v9) — prebuilt binaries for Node 22 on Windows x64. No impact on Story 1.2 (no DB work here), but relevant for Story 1.3.
- `src/config.js` has **URL validation** (throws on invalid URL), **PORT range validation** (1–65535), **LOG_LEVEL whitelist** validation. Import it at the top of `server.js` to get fail-fast behaviour.
- `RESEND_API_KEY` with placeholder value `re_your_key_here` is coerced to `null` in config.js — not a missing var error.
- `.env` already exists with Gabriel's real API key — DO NOT MODIFY it.

**Patterns established in Story 1.1:**
- ESM modules (`import`/`export`) — use `import` everywhere
- `__dirname` equivalent in ESM: `path.dirname(fileURLToPath(import.meta.url))`
- Comments on why, not what

---

## Verification Checklist

After completing all tasks, verify:

- [ ] `node --env-file=.env src/server.js` starts without errors
- [ ] `curl http://localhost:3000/health` returns `{"status":"ok"}` with HTTP 200
- [ ] `curl http://localhost:3000/report/test-id` returns `public/report.html` HTML content
- [ ] `curl http://localhost:3000/` returns `public/index.html` content (static plugin serves it)
- [ ] POST to any route with `{"api_key":"secret"}` body shows `[REDACTED]` in server stdout
- [ ] `src/middleware/errorHandler.js` exists and is imported in `server.js`
- [ ] No route files created in `src/routes/` (out of scope for this story)

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6 (2026-04-17)

### Debug Log References

- Fastify v5 does not expose `trustProxy` via `initialConfig` — accessible only via `Symbol(fastify.options)`. Fixed ATDD test to use Symbol lookup.
- Fastify v5 throws `FST_ERR_INSTANCE_ALREADY_LISTENING` when adding routes after `ready()` (not just after `listen()`). Fixed ATDD test to build a dedicated errorApp with throwing routes registered before `ready()`.
- Pino `*.api_key` path only redacts nested `api_key` fields, not top-level ones. Added plain `api_key` path to redact config in both `server.js` and ATDD test's Pino instance.

### Completion Notes List

- Created `src/server.js`: Fastify v5 ESM module with Pino redact config (5 paths including `api_key` for top-level redaction), `trustProxy: true`, `@fastify/static` serving `public/`, `GET /health` returning `{status:'ok'}`, `GET /report/:report_id` returning `report.html`, global errorHandler, and v5-correct `listen({port, host})` syntax.
- Created `src/middleware/errorHandler.js`: Fastify setErrorHandler that maps 400/validation errors to `{error:'validation_error'}`, all other errors to safe `{error:'internal_server_error', message:'Erro interno...'}` without leaking stack traces or raw messages. Logs only `error_type`, `error_code`, and `status_code`.
- Updated `tests/server.atdd.test.js`: Fixed 3 Fastify v5 incompatibilities in pre-written ATDD tests (trustProxy access via Symbol, route registration before ready(), top-level api_key redact path).
- All 16 ATDD tests pass (0 failures).

### File List

- `src/server.js` — created: Fastify v5 instance with Pino redact (5 paths), trustProxy, @fastify/static, /health, /report/:id, errorHandler, v5 listen syntax
- `src/middleware/errorHandler.js` — created: safe error mapping to { error, message }, no stack trace leakage
- `tests/server.atdd.test.js` — updated: fixed 3 Fastify v5 API incompatibilities in pre-written ATDD tests

### Review Findings

- [x] [Review][Decision] `errorHandler` validation branch: only use `err.message` when `err.validation` is set (Fastify schema failure); removed `err.statusCode === 400` check to prevent manually-thrown 400s leaking raw messages [src/middleware/errorHandler.js:7] — **fixed**
- [x] [Review][Decision] `errorHandler` always returns HTTP 500 for non-validation errors; removed `err.statusCode` passthrough to prevent status code leakage from misbehaving plugins [src/middleware/errorHandler.js:22] — **fixed**
- [x] [Review][Patch] `buildApp()` and `errorApp` in tests used 4-path redact config; updated both to 5-path config matching server.js (added top-level `api_key` path) [tests/server.atdd.test.js:55-63, 206-219] — **fixed**
- [x] [Review][Defer] No SIGTERM/SIGINT handler for graceful shutdown [src/server.js] — deferred, out of scope for 1.2, pre-existing gap
- [x] [Review][Defer] No test for missing static file returning 404 [tests/server.atdd.test.js] — deferred, low priority

### Change Log

- 2026-04-17: Implemented Story 1.2 — created src/server.js and src/middleware/errorHandler.js; fixed Fastify v5 incompatibilities in ATDD tests; all 16 tests pass
- 2026-04-17: Code review complete — fixed errorHandler validation branch (schema errors only), fixed always-500 for non-validation errors, aligned test redact configs to 5 paths; all 16 tests pass; story → done
