# Story 1.5: Docker and Coolify Deployment Config

**Epic:** 1 — Project Foundation & Infrastructure
**Story:** 1.5
**Story Key:** 1-5-docker-and-coolify-deployment-config
**Status:** ready-for-dev
**Date Created:** 2026-04-17

---

## User Story

As a developer (Pedro),
I want a production-ready Docker image and Coolify-compatible deployment configuration,
So that I can deploy the MarketPilot app to Hetzner VPS via Coolify with HTTPS (Traefik), a persistent SQLite volume, and a managed Redis container — all from a single `git push`.

---

## Acceptance Criteria

**AC-1: Single-container Docker image**

**Given** the project source code
**When** `docker build -t marketpilot .` is run
**Then** the image builds successfully using Node.js 22 Alpine
**And** the image contains both the Fastify HTTP server and the BullMQ worker in the same Node.js process
**And** the image exposes port 3000
**And** the image runs as a non-root user

**AC-2: SQLite on Docker volume**

**Given** the container is started with `SQLITE_PATH=/data/marketpilot.db`
**When** the server starts
**Then** SQLite creates/opens the DB at the path specified by `SQLITE_PATH` env var
**And** the `/data` directory is declared as a Docker volume so the DB persists across container restarts
**And** if `/data` is not writable, startup fails with a clear error (not a silent crash)

**AC-3: docker-compose for local development**

**Given** a `docker-compose.yml` file in the project root
**When** `docker compose up` is run
**Then** two services start: `app` (this image on port 3000) and `redis` (Redis 7 Alpine)
**And** `app` depends_on `redis`
**And** `redis` is reachable at `redis://redis:6379` from within the `app` container
**And** a named volume `sqlite_data` is mounted at `/data` in the `app` container
**And** env vars are loaded from a `.env` file (not committed)

**AC-4: Coolify deployment**

**Given** Coolify is configured to deploy this repo from Git
**When** a `git push` to `main` is made
**Then** Coolify builds the Docker image and starts the container
**And** Coolify's Traefik proxy terminates TLS (Let's Encrypt) and forwards HTTPS traffic to port 3000
**And** HTTP traffic is redirected to HTTPS by Traefik (not the app)
**And** Fastify's `trustProxy: true` (already set in Story 1.2) correctly reads `X-Forwarded-Proto`

**AC-5: GET /health is usable as Coolify health check**

**Given** the container is running
**When** Coolify polls `GET /health`
**Then** it returns `200 { status: 'ok' }` (already implemented in Story 1.2 — no changes needed)
**And** the `HEALTHCHECK` instruction in the Dockerfile uses this endpoint with appropriate intervals

**AC-6: Graceful shutdown (deferred from Story 1.2)**

**Given** the container receives `SIGTERM` (from `docker stop`)
**When** the signal is received
**Then** Fastify closes the server gracefully (no new connections accepted, in-flight requests complete up to 10 seconds)
**And** `process.exit(0)` is called after graceful close
**And** if graceful close takes more than 10 seconds, `process.exit(1)` is called (force-exit guard)

**AC-7: .dockerignore to keep image lean**

**Given** the Docker build context
**When** the image is built
**Then** the following are excluded from the build context: `node_modules/`, `.env`, `.git/`, `_bmad/`, `_bmad-output/`, `tests/`, `scripts/`, `*.db`, `*.db-shm`, `*.db-wal`, `*.md` (root docs), `.claude/`

---

## Tasks / Subtasks

- [ ] Task 1: Create `Dockerfile` in project root (AC: 1, 2, 5)
  - [ ] Use `node:22-alpine` as base image
  - [ ] Create non-root user `node` (Alpine's built-in) and run as that user
  - [ ] Set working directory to `/app`
  - [ ] Copy `package.json` + `package-lock.json` first; run `npm ci --omit=dev`
  - [ ] Copy the rest of the source (`src/`, `public/`)
  - [ ] Declare `/data` as a `VOLUME`
  - [ ] Expose port 3000
  - [ ] Add `HEALTHCHECK` instruction calling `GET /health`
  - [ ] Set `CMD ["node", "src/server.js"]`

- [ ] Task 2: Create `.dockerignore` in project root (AC: 7)
  - [ ] Exclude: `node_modules/`, `.env`, `.git/`, `_bmad/`, `_bmad-output/`, `tests/`, `scripts/`, `*.db`, `*.db-shm`, `*.db-wal`, `.claude/`, `OUTREACH.md`, `PRICING.md`, `RESEARCH.md`, `CLAUDE.md`

- [ ] Task 3: Create `docker-compose.yml` in project root (AC: 3)
  - [ ] Define `app` service using `build: .`; ports `"3000:3000"`; `depends_on: redis`; `env_file: .env`; volume `sqlite_data:/data`
  - [ ] Define `redis` service using `redis:7-alpine`; no persistent volume needed (BullMQ data is ephemeral)
  - [ ] Define named volume `sqlite_data` at the bottom
  - [ ] Set `restart: unless-stopped` on both services

- [ ] Task 4: Update `src/server.js` — add graceful shutdown (AC: 6)
  - [ ] Add SIGTERM handler: call `fastify.close()`, then `process.exit(0)` on success or `process.exit(1)` after 10s timeout
  - [ ] Add SIGINT handler (same logic — for local Ctrl+C)
  - [ ] Handler must be added AFTER `fastify.listen()` succeeds — not before

- [ ] Task 5: Verify build and startup locally (AC: 1–6)
  - [ ] `docker build -t marketpilot .` completes without errors
  - [ ] `docker compose up` starts both `app` and `redis`
  - [ ] `curl http://localhost:3000/health` returns `{"status":"ok"}`
  - [ ] `docker compose down` and `docker compose up` again — SQLite volume persists (no DB loss)
  - [ ] `docker stop <container>` triggers graceful shutdown log message before exit

---

## Dev Notes

### What Already Exists

| File | State | Action |
|---|---|---|
| `src/server.js` | EXISTS — Fastify v5 ESM, `trustProxy: true`, `/health` route, Pino redact | UPDATE — add SIGTERM/SIGINT graceful shutdown handlers only |
| `src/config.js` | EXISTS — env var validation, fail-fast on startup | DO NOT MODIFY |
| `public/` | EXISTS — static HTML, JS stubs, CSS | DO NOT MODIFY |
| `package.json` | EXISTS — `"type": "module"`, Node 22, all deps | DO NOT MODIFY |
| `.env.example` | EXISTS — all required env vars documented | DO NOT MODIFY |
| `.env` | EXISTS — Pedro's real keys (gitignored) | DO NOT TOUCH |
| `Dockerfile` | DOES NOT EXIST | CREATE |
| `.dockerignore` | DOES NOT EXIST | CREATE |
| `docker-compose.yml` | DOES NOT EXIST | CREATE |

**Do NOT create or modify:** Any file in `src/` other than `src/server.js`. Do NOT create a Redis config file — use the default Redis 7 Alpine image with no custom config.

### Dockerfile — Exact Implementation

```dockerfile
# Dockerfile
FROM node:22-alpine

# Create /app as root, then hand ownership to the built-in 'node' user (uid 1000)
# Must be done before USER switch — WORKDIR as non-root creates dir owned by root
WORKDIR /app
RUN chown node:node /app

# Switch to non-root for all subsequent instructions
USER node

# Install production deps only — copy package files first for layer caching
COPY --chown=node:node package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy source and static assets
COPY --chown=node:node src/ ./src/
COPY --chown=node:node public/ ./public/

# SQLite DB lives on a Docker volume mounted here at runtime
VOLUME ["/data"]

EXPOSE 3000

# Coolify polls this for container health; 30s start period accommodates BullMQ Redis connect
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "src/server.js"]
```

**Why `wget` not `curl`?** Alpine minimal image has `wget` built in; `curl` is not installed by default in `node:22-alpine`.

**Why `WORKDIR` before `USER node`?** When `WORKDIR /app` runs as root and the directory doesn't exist, Docker creates it owned by root. Switching to `USER node` afterward would leave the `node` user without write access to `/app`. The pattern above creates `/app` as root, hands ownership with `chown`, then switches to non-root — ensuring the `node` user can write to the working directory.

**Why `--chown=node:node`?** `COPY` as root then switching user leaves files owned by root; `node` user cannot write to them. `--chown` ensures all files are owned by the `node` user from the start.

**Why `npm ci --omit=dev`?** `npm ci` uses `package-lock.json` exactly — reproducible, no version drift. `--omit=dev` skips `drizzle-kit` and other dev-only deps, keeping image lean.

**Why is `drizzle-kit` excluded?** `drizzle-kit` is a dev dependency (in `devDependencies` in package.json). Schema migrations are run manually before deployment, not inside the container at startup. The production app only uses `drizzle-orm` (runtime dependency).

**Note on `public/` directory:** Story 1.2 deferred a risk: missing `public/` dir causes unhandled rejection at container start because `@fastify/static` plugin runs at ESM module eval time via top-level `await`. The `COPY public/ ./public/` step in the Dockerfile ensures this directory always exists in the image — this resolves the deferred issue without requiring code changes.

### docker-compose.yml — Exact Implementation

```yaml
# docker-compose.yml
services:
  app:
    build: .
    ports:
      - "3000:3000"
    depends_on:
      - redis
    env_file:
      - .env
    volumes:
      - sqlite_data:/data
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    restart: unless-stopped

volumes:
  sqlite_data:
```

**Why no Redis volume?** BullMQ job data is transient state. If Redis restarts, in-flight jobs retry via BullMQ's retry mechanism (3 retries, exponential backoff as configured in Story 1.4). Persisting Redis is unnecessary overhead for this scale.

**Why `env_file: .env` not individual `environment:` entries?** Keeps secrets out of `docker-compose.yml`. The `.env` file is gitignored; only `.env.example` is committed.

**Why `depends_on: redis`?** Ensures Redis container starts before `app`. Note: `depends_on` only waits for the container to start, not for Redis to be ready. BullMQ's fail-fast behaviour (configured in Story 1.4) handles the case where Redis is still initialising — the app will exit with a clear error and Docker's `restart: unless-stopped` will restart it until Redis is ready.

### Graceful Shutdown — `src/server.js` Addition

Add this block AFTER the `await fastify.listen(...)` call (after the try/catch):

```javascript
// Graceful shutdown — Coolify sends SIGTERM on deploy/restart
// Without this, Docker force-kills after 10s, dropping in-flight requests
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
```

**Why `forceExitTimer.unref()`?** If `fastify.close()` resolves quickly, the `unref()` prevents the timer from keeping the event loop alive unnecessarily.

**Why log only `error_type` (not `err.message`) on shutdown error?** Consistent with the security constraint established in Story 1.2's errorHandler — never log raw error messages.

**CRITICAL:** The SIGTERM/SIGINT handlers must be registered AFTER `fastify.listen()` succeeds (i.e., after the try/catch block). If registered before listen, a listen failure would still invoke the handlers on process exit.

### Coolify Configuration Notes

These are not file changes — they are Coolify dashboard settings Pedro must configure:

1. **Build Pack:** Dockerfile (not Nixpacks)
2. **Port:** 3000
3. **Health Check Path:** `/health`
4. **Redis:** Add a separate Redis 7 service in Coolify; set `REDIS_URL=redis://<coolify-redis-service-name>:6379` in the app's env vars
5. **Persistent Volume:** Mount a Coolify persistent volume at `/data` in the app container; set `SQLITE_PATH=/data/marketpilot.db`
6. **Traefik HTTPS:** Coolify manages this automatically when a domain is assigned; HTTP→HTTPS redirect is configured in Coolify's Traefik settings, not in the app
7. **All env vars from `.env.example`** must be set in Coolify's environment variables panel

### Environment Variables for Production

The container reads all env vars from the environment at startup (via `src/config.js`). For production in Coolify, set:

```
PORT=3000
NODE_ENV=production
REDIS_URL=redis://<coolify-redis-name>:6379
SQLITE_PATH=/data/marketpilot.db
RESEND_API_KEY=re_xxx
APP_BASE_URL=https://reports.yourdomain.com
WORTEN_BASE_URL=https://marketplace.worten.pt
LOG_LEVEL=info
```

**Never set `LOG_LEVEL=debug` in production** (documented in `.env.example` — may include request details).

### Architecture Boundary Reminder

Story 1.5 scope is limited to:
- `Dockerfile` (new)
- `.dockerignore` (new)
- `docker-compose.yml` (new)
- `src/server.js` (add graceful shutdown only — ~15 lines)

**Do NOT implement:** schema migrations, BullMQ worker entrypoint changes, Redis auth configuration, Nginx/Caddy (Traefik handles TLS), multi-stage Docker build (unnecessary at this scale — the single-stage Alpine build is lean enough).

### Security Constraints

All security constraints from previous stories apply unchanged inside the container:
- `api_key` never in logs, DB, BullMQ job data, or env vars
- Pino redact config (Story 1.2) active at all times
- `keyStore.delete(job_id)` always in `finally` block
- Container runs as non-root (`node` user)

### Deferred Issues Resolved by This Story

From `_bmad-output/implementation-artifacts/deferred-work.md`:

1. **No SIGTERM/SIGINT handler** [src/server.js] — resolved in Task 4 (AC-6)
2. **Missing `public/` dir causes unhandled rejection** [src/server.js] — resolved by `COPY public/ ./public/` in Dockerfile (AC-1); no code change needed

---

## Architecture Guardrails

These apply to ALL stories:

| Boundary | Rule |
|---|---|
| `src/routes/` | HTTP concerns only — no business logic, no Mirakl calls |
| `src/workers/` | All business logic, all Mirakl API calls |
| `src/queue/keyStore.js` | THE ONLY file that ever holds an API key |
| `src/db/queries.js` | ALL SQLite reads/writes |

---

## Previous Story Intelligence (Stories 1.1 and 1.2)

**From Story 1.1 (Scaffold):**
- `better-sqlite3` is v11.0.0 (prebuilt binaries for Node 22 on Windows x64). For Docker (Linux Alpine), the npm postinstall script compiles native bindings from source — `npm ci` in the Dockerfile handles this automatically. No special build flag needed.
- ESM modules throughout — `import`/`export` everywhere; no `require()`
- `__dirname` equivalent: `path.dirname(fileURLToPath(import.meta.url))`

**From Story 1.2 (Fastify Server):**
- `src/server.js` already has `trustProxy: true` and `GET /health` — no changes needed for Traefik/Coolify compatibility
- Pino `redact` config is active at 5 paths — unchanged
- The SIGTERM/SIGINT graceful shutdown was explicitly deferred to Story 1.5 (see deferred-work.md)
- `@fastify/static` plugin runs via top-level ESM `await` — `public/` must exist at container start (Dockerfile `COPY` resolves this)

**Code patterns established:**
- ESM `import`/`export` — use in all new files
- Log only `error_type`, `error_code` — never `err.message` for unknown errors
- `src/server.js` exports `fastify` instance — the graceful shutdown handler must use this exported instance

---

## Verification Checklist

After completing all tasks, verify:

- [ ] `docker build -t marketpilot .` completes without errors
- [ ] `docker run --rm -e PORT=3000 -e NODE_ENV=development -e REDIS_URL=redis://localhost:6379 -e SQLITE_PATH=/tmp/test.db -e APP_BASE_URL=http://localhost:3000 -e WORTEN_BASE_URL=https://marketplace.worten.pt -e LOG_LEVEL=info -p 3000:3000 marketpilot` starts (Redis not available → fail-fast expected; confirms image is correct)
- [ ] `docker compose up` starts both services successfully
- [ ] `curl http://localhost:3000/health` returns `{"status":"ok"}` with HTTP 200
- [ ] `docker compose down && docker compose up` — SQLite volume persists (data not lost)
- [ ] `docker stop <app-container-id>` logs `"Shutdown signal received"` before exit
- [ ] Image does NOT contain `.env`, `node_modules/` (from host), `_bmad-output/`, `tests/`
- [ ] Container runs as non-root user (verify with `docker exec <id> whoami` → `node`)
- [ ] `src/server.js` SIGTERM handler is registered after the `fastify.listen()` try/catch block

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6 (2026-04-17)

### Debug Log References

### Completion Notes List

### File List
