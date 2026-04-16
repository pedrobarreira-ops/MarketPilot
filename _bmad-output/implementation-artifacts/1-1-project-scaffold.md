# Story 1.1: Project Scaffold

**Epic:** 1 — Project Foundation & Infrastructure  
**Story:** 1.1  
**Story Key:** 1-1-project-scaffold  
**Status:** done  
**Date Created:** 2026-04-16

---

## User Story

As a developer (Pedro),  
I want a fully configured Node.js 22 ESM project with the correct directory structure and dependencies installed,  
So that I have a solid foundation to build on without configuration drift later.

---

## Acceptance Criteria

**Given** an empty project directory  
**When** I run `npm install`  
**Then** the project installs without errors and all required dependencies are present: `fastify`, `@fastify/static`, `bullmq`, `ioredis`, `better-sqlite3`, `drizzle-orm`, `drizzle-kit`, `resend`, `node-cron`, `uuid`

**And** `package.json` has `"type": "module"` (ESM) and `"engines": { "node": ">=22.0.0" }`

**And** the directory structure matches the architecture spec exactly:
```
src/routes/
src/workers/mirakl/
src/workers/scoring/
src/queue/
src/db/
src/email/
src/cleanup/
src/middleware/
public/css/
public/js/
tests/
```

**And** `.env.example` documents all required variables: `PORT`, `NODE_ENV`, `REDIS_URL`, `SQLITE_PATH`, `RESEND_API_KEY`, `APP_BASE_URL`, `WORTEN_BASE_URL`, `LOG_LEVEL`

**And** `.gitignore` excludes `.env`, `node_modules/`, `*.db`, `*.db-shm`, `*.db-wal` — and does NOT exclude `.env.example`

**And** `src/config.js` reads all env vars, validates they are non-empty, and throws a descriptive error on startup if any required var is missing

**And** `public/index.html`, `public/progress.html`, and `public/report.html` already exist (built from Stitch); this story only confirms they are present — no CSS authoring needed

**And** `public/js/form.js`, `public/js/progress.js`, `public/js/report.js` are created as empty stubs (implemented in Epics 5–6)

---

## Current Project State (CRITICAL — Read Before Starting)

The project directory already has several files. **Do not overwrite or delete existing content unless specified below.**

### What Already Exists

| File/Dir | State | Action |
|---|---|---|
| `package.json` | Exists — `"type": "module"`, `engines.node >= 18`, **no dependencies** | UPDATE — add deps, bump engine to `>=22.0.0` |
| `.gitignore` | Exists — covers `.env`, `node_modules/`, `*.db*` BUT `.env.*` incorrectly excludes `.env.example` | UPDATE — fix `.env.*` line (see below) |
| `.env` | Exists — Gabriel's Worten API key + `WORTEN_BASE_URL` | DO NOT TOUCH — gitignored already |
| `public/index.html` | Exists — full Stitch mockup, Tailwind CDN, Manrope+Inter fonts | DO NOT MODIFY |
| `public/progress.html` | Exists — full Stitch mockup | DO NOT MODIFY |
| `public/report.html` | Exists — full Stitch mockup | DO NOT MODIFY |
| `scripts/scale_test.js` | Exists — validated OF21 pagination logic (31,179 products) | DO NOT MODIFY |
| `scripts/opportunity_report.js` | Exists — validated P11 batch+concurrent logic | DO NOT MODIFY |

### What Does NOT Exist (must create)

- `src/` directory and all subdirectories
- `.env.example`
- `public/css/` directory
- `public/js/` directory and stub files
- `tests/.gitkeep`

---

## Implementation Tasks

### Task 1: Fix `.gitignore`

The current `.gitignore` has `.env.*` on line 2 which would exclude `.env.example` from version control — this is a bug. `.env.example` MUST be committed.

**Fix:** Replace `.env.*` with specific patterns:

```gitignore
.env
.env.local
.env.production
.env.*.local
node_modules/
__pycache__/
*.pyc
.DS_Store
.mcp.json
*.db
*.db-shm
*.db-wal
```

### Task 2: Update `package.json`

Add all required dependencies and update the Node engine version. Keep the existing `"type": "module"` — it is already correct.

```json
{
  "name": "marketpilot-report",
  "version": "1.0.0",
  "type": "module",
  "engines": {
    "node": ">=22.0.0"
  },
  "scripts": {
    "start": "node src/server.js",
    "dev": "node --watch src/server.js"
  },
  "dependencies": {
    "@fastify/static": "^8.0.0",
    "better-sqlite3": "^9.4.3",
    "bullmq": "^5.0.0",
    "drizzle-orm": "^0.30.0",
    "fastify": "^5.0.0",
    "ioredis": "^5.3.2",
    "node-cron": "^3.0.3",
    "resend": "^4.0.0",
    "uuid": "^11.0.0"
  },
  "devDependencies": {
    "drizzle-kit": "^0.21.0"
  }
}
```

After writing `package.json`, run `npm install` to install all packages.

### Task 3: Create Directory Structure

Create all directories. Use `.gitkeep` files to preserve empty directories in git:

```
src/routes/.gitkeep
src/workers/mirakl/.gitkeep
src/workers/scoring/.gitkeep
src/queue/.gitkeep
src/db/.gitkeep
src/email/.gitkeep
src/cleanup/.gitkeep
src/middleware/.gitkeep
public/css/.gitkeep
public/js/.gitkeep  ← will be replaced by stub JS files
tests/.gitkeep
```

> **Note on `public/css/`:** The architecture directory structure lists `public/css/main.css`, but the UX requirements (UX-DR1) explicitly state: "No separate `main.css` needed — Tailwind handles all styling." Create the `public/css/` directory but do NOT create `main.css`. The existing HTML files use Tailwind CDN and inline config — leave them untouched.

### Task 4: Create `.env.example`

```bash
# Server
PORT=3000
NODE_ENV=development

# Redis (BullMQ backend)
REDIS_URL=redis://localhost:6379

# Database
SQLITE_PATH=./marketpilot.db

# Resend (transactional email)
RESEND_API_KEY=re_your_key_here

# App
APP_BASE_URL=https://reports.yourdomain.com
WORTEN_BASE_URL=https://marketplace.worten.pt

# Logging — NEVER use 'debug' in production (may include request details)
LOG_LEVEL=info
```

**Important:** The actual `.env` file already exists with real credentials and is gitignored. This `.env.example` is documentation only — it must be committed to the repo.

### Task 5: Create `src/config.js`

Reads and validates all required env vars on startup. Throws immediately if any required var is missing (fail-fast).

```javascript
// src/config.js
// Validates all required environment variables at startup.
// Import this module early in server.js — if it throws, the server should not start.

const required = [
  'REDIS_URL',
  'SQLITE_PATH',
  'APP_BASE_URL',
  'WORTEN_BASE_URL',
]

const missing = required.filter(key => !process.env[key])
if (missing.length > 0) {
  throw new Error(
    `Missing required environment variables: ${missing.join(', ')}\n` +
    `Copy .env.example to .env and fill in all values.`
  )
}

export const config = {
  PORT: parseInt(process.env.PORT || '3000', 10),
  NODE_ENV: process.env.NODE_ENV || 'development',
  REDIS_URL: process.env.REDIS_URL,
  SQLITE_PATH: process.env.SQLITE_PATH,
  RESEND_API_KEY: process.env.RESEND_API_KEY || null,  // Optional — email disabled if missing
  APP_BASE_URL: process.env.APP_BASE_URL,
  WORTEN_BASE_URL: process.env.WORTEN_BASE_URL,
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
}
```

> `RESEND_API_KEY` is intentionally optional in config — if absent, `sendReportEmail.js` (Story 3.6) logs a warning and skips sending. All other vars are required.

### Task 6: Create Stub JS Files

Create three empty stubs. They must be valid JavaScript files that can be loaded without errors. A comment header is sufficient:

**`public/js/form.js`:**
```javascript
// form.js — Wired up in Story 5.1
// Handles: client-side validation, loading state, form submit, POST to /api/generate, redirect to /progress
```

**`public/js/progress.js`:**
```javascript
// progress.js — Wired up in Story 5.2
// Handles: progress bar animation, copy button, polling /api/jobs/:job_id, auto-redirect on completion, error state
```

**`public/js/report.js`:**
```javascript
// report.js — Wired up in Story 6.x
// Handles: data fetch, skeleton loading, PT/ES toggle, table rendering, CSV download, CTA, expired/error states

const CTA_URL = 'https://wa.me/351000000000'  // UPDATE THIS before launch — see UX-DR15
```

> `CTA_URL` in `report.js` is a UX requirement (UX-DR15): Pedro updates this one constant to change the CTA destination across the entire page without touching HTML.

---

## Verification Checklist

After completing all tasks, verify:

- [ ] `npm install` runs without errors
- [ ] `node -e "import('./src/config.js')"` throws a clear error about missing env vars (when `.env` is not loaded)
- [ ] `node --env-file=.env -e "import('./src/config.js').then(m => console.log(m.config.WORTEN_BASE_URL))"` prints the URL from `.env`
- [ ] `public/index.html` is present and unchanged
- [ ] `public/progress.html` is present and unchanged
- [ ] `public/report.html` is present and unchanged
- [ ] `public/js/form.js`, `public/js/progress.js`, `public/js/report.js` exist (stubs only)
- [ ] `.env.example` is present and not gitignored
- [ ] All `src/` subdirectories exist

---

## Architecture Guardrails

These constraints apply to ALL stories in this project. They are established here in Story 1.1 and must not be violated in any subsequent story.

### File Organization Rules (from Architecture)

| Boundary | Rule |
|---|---|
| `src/routes/` | HTTP concerns only — no business logic, no Mirakl API calls |
| `src/workers/` | All business logic, all Mirakl API calls |
| `src/queue/keyStore.js` | THE ONLY file that ever holds an API key |
| `src/db/queries.js` | ALL SQLite reads/writes — no raw SQL in routes or workers |

### Security Hard Constraints (non-negotiable from day 0)

1. `api_key` must NEVER appear in BullMQ job data
2. `api_key` must NEVER appear in any log entry (Pino redact handles this — configured in Story 1.2)
3. `api_key` must NEVER be written to any DB column — no `api_key` column exists in any table
4. `keyStore.delete(job_id)` must ALWAYS be in a `finally` block — never in `try` or `catch` only
5. All Mirakl API calls must go through `src/workers/mirakl/apiClient.js` — no direct `fetch()` to Mirakl elsewhere

### Stack Constraints

- **Node.js 22 LTS** with ESM (`"type": "module"` — already set)
- **Fastify v5** (not Express) — Pino redact is Fastify's built-in logger
- **BullMQ v5** + **Redis 7** (Coolify-managed)
- **SQLite** via `better-sqlite3` + **Drizzle ORM** — no PostgreSQL
- **Vanilla JS** in `public/js/` — no React, no Vue, no build step
- **Tailwind CSS CDN** — already in the HTML files; no `main.css` needed

### Naming Conventions

| Context | Convention | Example |
|---|---|---|
| Files and directories | `kebab-case` | `api-client.js` ✓, `apiClient.js` ✗ |
| JavaScript functions/vars | `camelCase` | `fetchCatalog()` ✓ |
| Database columns | `snake_case` | `job_id`, `report_id`, `created_at` |
| API responses (success) | `{ "data": {...} }` | |
| API responses (error) | `{ "error": "code", "message": "pt text" }` | |

---

## Dev Notes

- The `.env` file already exists with real credentials (Gabriel's Worten API key). Do not modify it.
- `scripts/scale_test.js` and `scripts/opportunity_report.js` contain **validated, working Mirakl API logic** that Stories 3.2 and 3.3 will reuse. Do not modify these scripts — they are the reference implementation.
- The existing `public/*.html` files are complete Stitch mockups. All future stories (Epics 5–6) only wire up JS to them — they must not be rebuilt or modified structurally.
- This story does NOT include: Fastify server (`src/server.js` — Story 1.2), SQLite schema (Story 1.3), BullMQ setup (Story 1.4), Dockerfile/docker-compose (Story 1.5).

---

## Dev Agent Record

### Implementation Notes

- **better-sqlite3 version bump:** Story spec listed `^9.4.3` but that version has no prebuilt binaries for Node 22 Windows x64 and requires Python/MSBuild to compile from source (Python not available on this dev machine). Upgraded to `^11.0.0` which ships prebuilt binaries for Node 22 on all platforms. This is forward-compatible — the drizzle-orm/better-sqlite3 API used in Story 1.3 is unchanged between v9 and v11. The `package.json` now reflects `^11.0.0`.
- **config.js verification:** `node -e "import('./src/config.js')"` correctly throws: `Missing required environment variables: REDIS_URL, SQLITE_PATH, APP_BASE_URL, WORTEN_BASE_URL`. When all required vars are set (with `.env` providing `WORTEN_BASE_URL`), `config.WORTEN_BASE_URL` resolves to `https://marketplace.worten.pt`.
- **public/css/:** Directory created with `.gitkeep`. No `main.css` created — Tailwind CDN handles all styling per UX-DR1.
- **Existing files untouched:** `public/index.html`, `public/progress.html`, `public/report.html`, `scripts/scale_test.js`, `scripts/opportunity_report.js`, `.env` — none modified.

### Completion Notes

All 6 tasks completed. All acceptance criteria satisfied. No regressions (no existing tests). Story ready for review.

---

## File List

- `.gitignore` — modified: replaced `.env.*` with explicit patterns; `.env.example` is now tracked
- `package.json` — modified: added all dependencies, bumped engine to `>=22.0.0`, added `start`/`dev` scripts; `better-sqlite3` set to `^11.0.0` (Node 22 prebuilt compatibility)
- `package-lock.json` — generated by `npm install`
- `.env.example` — created: documents all required env vars
- `src/config.js` — created: fail-fast env var validation on startup
- `src/routes/.gitkeep` — created
- `src/workers/mirakl/.gitkeep` — created
- `src/workers/scoring/.gitkeep` — created
- `src/queue/.gitkeep` — created
- `src/db/.gitkeep` — created
- `src/email/.gitkeep` — created
- `src/cleanup/.gitkeep` — created
- `src/middleware/.gitkeep` — created
- `public/css/.gitkeep` — created
- `public/js/form.js` — created: stub
- `public/js/progress.js` — created: stub
- `public/js/report.js` — created: stub with `CTA_URL` constant (UX-DR15)
- `tests/.gitkeep` — created

---

## Change Log

- 2026-04-16: Story 1.1 implemented — project scaffold complete. `.gitignore` fixed, `package.json` updated with all deps (better-sqlite3 bumped to v11 for Node 22 prebuilt support), `npm install` successful, all `src/` directories created, `.env.example` documented, `src/config.js` fail-fast validation added, stub JS files created.
- 2026-04-16: Code review completed. 5 review patches applied to `src/config.js` and `.env.example` (URL validation, PORT numeric/range, LOG_LEVEL whitelist, RESEND placeholder handling). 8 items deferred to backlog. Story → `done`.

---

### Review Findings

**Review Date:** 2026-04-16
**Layers:** Blind Hunter, Edge Case Hunter, Acceptance Auditor

#### Patches (Applied 2026-04-16)

- [x] [Review][Patch] Add URL validation for `REDIS_URL`, `APP_BASE_URL`, `WORTEN_BASE_URL` [src/config.js] — Fixed: `new URL()` check throws with key name and invalid value.
- [x] [Review][Patch] Add PORT numeric and range (1–65535) validation [src/config.js] — Fixed: rejects NaN and out-of-range values.
- [x] [Review][Patch] Add LOG_LEVEL whitelist validation [src/config.js] — Fixed: only accepts Pino-supported levels.
- [x] [Review][Patch] Clarify RESEND_API_KEY is optional in `.env.example` [.env.example] — Fixed: inline comment explains placeholder behavior.
- [x] [Review][Patch] Graceful RESEND_API_KEY placeholder detection [src/config.js] — Fixed: `re_your_key_here` coerced to `null` so app starts with emails disabled.

#### Deferred (Out of Scope for 1.1)

- [x] [Review][Defer] Add `test` script and test runner setup — deferred; tests/ scaffold only per spec; runner decision belongs to first testing story in Epic 1.
- [x] [Review][Defer] Add lint/format scripts (ESLint + Prettier) — deferred; project-level tooling decision, not scaffold-scope.
- [x] [Review][Defer] SQLITE_PATH directory writability pre-check [src/config.js:24] — deferred; better-sqlite3 errors with clear SQLITE_CANTOPEN at runtime.
- [x] [Review][Defer] NODE_ENV unknown-value warning [src/config.js:20] — deferred; defensive only.
- [x] [Review][Defer] CTA_URL placeholder guard at deploy time [public/js/report.js:4] — deferred to launch checklist per UX-DR15.
- [x] [Review][Defer] Add `license` field to package.json — deferred; add before any public release.
- [x] [Review][Defer] Strict Node version enforcement (preinstall hook or `engine-strict=true` in .npmrc) [package.json] — deferred; `engines` is advisory but acceptable for internal scaffold.
- [x] [Review][Defer] Run `npm audit` on committed package-lock.json — deferred; ops housekeeping step.
