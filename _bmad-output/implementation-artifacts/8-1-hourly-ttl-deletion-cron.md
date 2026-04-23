# Story 8.1: Hourly TTL Deletion Cron

**Epic:** 8 — Data Governance & Cleanup
**Story:** 8.1
**Story Key:** 8-1-hourly-ttl-deletion-cron
**Status:** review
**Date Created:** 2026-04-23

---

## User Story

As the system operator,
I want an hourly cron job that deletes expired report rows from SQLite using `DELETE FROM reports WHERE expires_at < unixepoch()`,
So that the database does not accumulate stale report data past the 48-hour TTL, and expired report IDs always return 404.

**Satisfies:** Epic 8.1 AC (epics-distillate.md:286) — cron every hour; `DELETE FROM reports WHERE expires_at < unixepoch()`; log `[cleanup] Deleted N expired report(s)` only if `changes > 0`; started at server init (not separate process); cron failure caught+logged without crashing server; after deletion: expired id → 404.

---

## Acceptance Criteria

**AC-1: Cron runs every hour using `node-cron`**
- File: `src/cleanup/reportCleanup.js`
- Import `node-cron` (`import cron from 'node-cron'`)
- Schedule: `'0 * * * *'` (5-field hourly) or `'0 0 * * * *'` (6-field with seconds) — both valid
- Do NOT use `setInterval` — architecture spec mandates `node-cron`
- Export a `startCleanupCron()` function; server calls it at init

**AC-2: Deletion uses exact SQL expression `DELETE FROM reports WHERE expires_at < unixepoch()`**
- Delete only rows where `expires_at < unixepoch()` (strict less-than — boundary rows with `expires_at === current second` are NOT deleted)
- Do NOT delete from `generation_jobs` — TTL applies to `reports` only (BullMQ manages jobs)
- Do NOT use `<=` — off-by-one would prematurely delete boundary-second reports
- Prefer raw SQL via `db.run(sql\`DELETE FROM reports WHERE expires_at < unixepoch()\`)` over Drizzle ORM `lt()` — SQLite's `unixepoch()` is not a Drizzle constant
- Export `deleteExpiredReports()` as a standalone async-friendly function (needed by ATDD functional tests)

**AC-3: Log `[cleanup] Deleted N expired report(s)` only when `changes > 0`**
- Use `better-sqlite3`'s `.run()` return value — it returns `{ changes: N, lastInsertRowid }` for DELETE/INSERT/UPDATE
- Log ONLY when `changes > 0`: `log.info(\`[cleanup] Deleted \${result.changes} expired report(s)\`)`
- Zero-change runs must be completely silent (no log at all)
- Use `fastify.log` or Pino logger passed into the module — do NOT use `console.log`

**AC-4: Cron started at server init — same process, not standalone**
- `src/server.js` imports `startCleanupCron` from `src/cleanup/reportCleanup.js`
- Call `startCleanupCron(fastify.log)` after `runMigrations()` and before `fastify.listen()`
- `reportCleanup.js` must NOT contain `process.argv[1]` or `process.on('message')` — it is a library module, not a process entrypoint

**AC-5: Cron failure caught and logged — server does not crash**
- The cron callback body is wrapped in `try/catch`
- `catch` block logs the error (error type only — not full `err` object): `log.error({ error_type: err.constructor.name }, '[cleanup] Cron error')`
- `catch` block does NOT `throw` or call `process.exit`
- Server continues operating normally if the DB call inside the cron fails

**AC-6: After deletion, expired report_id returns 404 from `GET /api/reports/:id`**
- `getReport(reportId, now)` in `src/db/queries.js` already uses `WHERE expires_at > now` — once the row is physically deleted, it always returns `null`
- Route `GET /api/reports/:id` in `src/routes/reports.js` already returns 404 on `null`
- No changes to `queries.js` or `reports.js` needed for this AC — verify the chain works, do not modify

**AC-7: Non-expired reports are NOT deleted**
- Deletion boundary: `expires_at < unixepoch()` — strict less-than
- A report with `expires_at = Math.floor(Date.now()/1000) + 172800` (48h from now) must survive a cron run
- A report with `expires_at = Math.floor(Date.now()/1000) - 1` (just expired) must be deleted

**AC-8: ATDD pre-scaffolded tests pass**
- Test file: `tests/epic8-8.1-hourly-ttl-deletion-cron.atdd.test.js` — **DO NOT MODIFY**
- Run: `node --test tests/epic8-8.1-hourly-ttl-deletion-cron.atdd.test.js`
- All tests must pass
- The scaffold expects `src/cleanup/reportCleanup.js` (not `expiredReports.js` — see Dev Notes)

---

## Tasks / Subtasks

- [x] **Task 1: Run ATDD tests first — diagnose current state** (AC: 8)
  - [x] Run: `node --test tests/epic8-8.1-hourly-ttl-deletion-cron.atdd.test.js`
  - [x] Note which tests pass vs fail — confirms what needs to be built
  - [x] Expected result: most/all tests fail because `src/cleanup/reportCleanup.js` does not exist yet

- [x] **Task 2: Create `src/cleanup/reportCleanup.js`** (AC: 1, 2, 3, 4, 5)
  - [x] Import `node-cron` and `db` (from `../db/database.js`)
  - [x] Export `deleteExpiredReports(log?)` — runs the DELETE, returns `changes` count
  - [x] Export `startCleanupCron(log)` — schedules cron with `'0 * * * *'`, wraps callback in try/catch
  - [x] Inside cron callback: call `deleteExpiredReports(log)`, log if `changes > 0`
  - [x] Verify: no `mirAklGet`, no `apiClient`, no `mirakl` references (epic 8 is backend-only)
  - [x] Verify: no `api_key` appears in any log call (NFR-S2)
  - [x] Verify: no `setInterval`, no `process.argv[1]`, no `process.on('message')`

- [x] **Task 3: Wire `startCleanupCron` into `src/server.js`** (AC: 4)
  - [x] Add import: `import { startCleanupCron } from './cleanup/reportCleanup.js'`
  - [x] Call `startCleanupCron(fastify.log)` after `await runMigrations()` and before `await fastify.listen(...)`
  - [x] Confirm server still starts cleanly: `npm run dev` (or `node src/server.js`)

- [x] **Task 4: Verify AC-6 chain — no code changes expected** (AC: 6)
  - [x] Confirm `getReport` in `src/db/queries.js` uses `gt(reports.expiresAt, now)` — already present
  - [x] Confirm `GET /api/reports/:id` route returns 404 when `getReport` returns null — already present
  - [x] No changes to these files unless ATDD tests explicitly fail on this chain

- [x] **Task 5: Re-run ATDD tests — all must pass** (AC: 8)
  - [x] Run: `node --test tests/epic8-8.1-hourly-ttl-deletion-cron.atdd.test.js`
  - [x] All tests green

- [x] **Task 6: Full regression check** (AC: all)
  - [x] Run: `npm test`
  - [x] All previously passing tests remain passing

---

## Dev Notes

### CRITICAL: File Name Is `reportCleanup.js` — NOT `expiredReports.js`

The epics-distillate.md Cleanup section (line 177) references `src/cleanup/expiredReports.js` as the canonical name. However, the **ATDD test scaffold** (committed in `90f77cd`) hardcodes:

```js
const CLEANUP_PATH = join(__dirname, '../src/cleanup/reportCleanup.js')
```

The test file is the source of truth for implementation. **Create `src/cleanup/reportCleanup.js`**, not `expiredReports.js`. The ATDD scaffold is read-only and cannot be changed.

### `src/cleanup/` Directory Already Exists

`src/cleanup/` was created in the project structure during Epic 1 setup. It is currently empty. Just add `reportCleanup.js` there.

### Using `db.run()` with Raw SQL for the DELETE

`queries.js` uses Drizzle ORM for all reads/writes. For this cron, the cleanest approach is raw SQL via `better-sqlite3` directly, because SQLite's `unixepoch()` function is not a Drizzle constant and would require `sql` template literal escaping with `import { sql } from 'drizzle-orm'`. Either approach works:

**`src/db/database.js` exports (verified):**
```js
export const db = drizzle(sqlite)   // Drizzle ORM wrapper
export { sqlite }                   // raw better-sqlite3 instance
```

**Recommended — use `sqlite` (raw better-sqlite3) for the DELETE:**
```js
import { sqlite } from '../db/database.js'

export function deleteExpiredReports() {
  const result = sqlite.prepare('DELETE FROM reports WHERE expires_at < unixepoch()').run()
  return result.changes   // number of deleted rows
}
```

This is the cleanest path: `sqlite.prepare(...).run()` returns `{ changes: N, lastInsertRowid }` directly from better-sqlite3, and `unixepoch()` is a native SQLite function that evaluates to current Unix epoch seconds.

**Alternative — Drizzle with sql template tag (also acceptable):**
```js
import { db } from '../db/database.js'
import { sql } from 'drizzle-orm'

export function deleteExpiredReports() {
  const result = db.run(sql`DELETE FROM reports WHERE expires_at < unixepoch()`)
  return result.changes
}
```

Both work. The raw `sqlite` approach is simpler and avoids importing the `sql` tag.

### `startCleanupCron` Logger Pattern

The function signature should accept the logger:

```js
export function startCleanupCron(log) {
  cron.schedule('0 * * * *', async () => {
    try {
      const changes = deleteExpiredReports()
      if (changes > 0) {
        log.info(`[cleanup] Deleted ${changes} expired report(s)`)
      }
    } catch (err) {
      log.error({ error_type: err.constructor.name }, '[cleanup] Cron error')
    }
  })
}
```

### `server.js` Wiring — Placement Matters

Insert the cleanup cron start AFTER `runMigrations()` (tables must exist) and BEFORE `fastify.listen()`. Current server.js structure (relevant excerpt):

```js
import { runMigrations } from './db/migrate.js'
// ... existing imports ...

// ADD:
import { startCleanupCron } from './cleanup/reportCleanup.js'

// ... existing code ...
await runMigrations()
// ADD AFTER runMigrations:
startCleanupCron(fastify.log)

// ... existing route registrations ...
await fastify.listen({ port: config.PORT, host: '0.0.0.0' })
```

### What the ATDD Tests Check

The scaffold at `tests/epic8-8.1-hourly-ttl-deletion-cron.atdd.test.js` verifies:

1. **Static scans** of `src/cleanup/reportCleanup.js`:
   - `expires_at` and `unixepoch()` present
   - Deletes from `reports` (NOT `generation_jobs`)
   - Cron schedule (`'0 * * * *'` or `'0 0 * * * *'` or keyword `cron`)
   - Uses `node-cron` (not `setInterval`)
   - `try/catch` present
   - `[cleanup]` prefix or `Deleted` keyword in log statement
   - `> 0` or `changes`/`count` gating the log
   - No `mirAklGet`, `apiClient`, `mirakl` references
   - No `api_key` in log calls

2. **Functional tests** (in-memory SQLite via `SQLITE_PATH=:memory:`):
   - `deleteExpiredReports` is exported as a function
   - Deletes an expired row (expires_at in past)
   - Does NOT delete a live row (expires_at in future, +48h)
   - Returns the count of deleted rows (numeric or numeric-object return)
   - Handles empty table without throwing

3. **Static scan of `src/server.js`**:
   - `server.js` imports `cleanup` or `Cleanup` or references `cron`

4. **Static scan of `src/db/queries.js`**:
   - `getReport` uses `expiresAt`/`expires_at` and returns `null`

### Architecture Boundaries

- `src/cleanup/reportCleanup.js` — NEW FILE; library only, not a process entrypoint
- `src/db/queries.js` — No changes needed (getReport already correct)
- `src/routes/reports.js` — No changes needed (404 on null already correct)
- `src/server.js` — Add 2 lines: import + call `startCleanupCron(fastify.log)`
- Do NOT add `deleteExpiredReports` to `queries.js` — the cleanup module owns its own SQL

### Files to Create

- `src/cleanup/reportCleanup.js` — new file (main deliverable)

### Files to Modify

- `src/server.js` — add import + 1 function call

### Files That Must NOT Be Modified

- `tests/epic8-8.1-hourly-ttl-deletion-cron.atdd.test.js` — pre-scaffolded ATDD, read-only
- `src/db/queries.js` — no changes (existing getReport is correct)
- `src/routes/reports.js` — no changes (existing 404 handling is correct)
- `public/index.html`, `public/progress.html`, `public/report.html` — HTML locked
- `src/db/schema.js` — no schema changes in this story

### No Mirakl Endpoints

This story makes no Mirakl API calls. `src/cleanup/reportCleanup.js` is a pure SQLite TTL cleanup module. Do not import `apiClient.js`, `mirAklGet`, or anything from `src/workers/mirakl/`.

### NFR Compliance

- **NFR-R4:** Expired URL must return 404 on 100% of requests after TTL — cron deletion + `getReport` null + route 404 satisfies this
- **NFR-S2:** No `api_key` in logs — cleanup module does not touch `api_key` at all; ATDD verifies this statically

### `node-cron` Version

`node-cron` is already listed in `package.json` (installed in Story 1.1 per epics-distillate.md line 18). Do not re-install; just import it.

### Testing Commands

```bash
# Primary: Story 8.1 ATDD suite
node --test tests/epic8-8.1-hourly-ttl-deletion-cron.atdd.test.js

# Full suite regression check
npm test
```

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- Module-level `sqlite.prepare()` caused "no such table: reports" on import in test env (SQLITE_PATH=:memory:). Fixed by moving prepare() inside `deleteExpiredReports()` (lazy, per-call). queries.js triggers `runMigrations()` on its own import, but reportCleanup.js bypasses queries.js — migration wasn't guaranteed to have run before the cleanup module loaded.

### Completion Notes List

- Created `src/cleanup/reportCleanup.js` with `deleteExpiredReports()` (raw better-sqlite3, lazy prepare) and `startCleanupCron(log)` (node-cron hourly schedule, try/catch, conditional log).
- Wired `startCleanupCron(fastify.log)` into `src/server.js` after `runMigrations()` and before `fastify.listen()`.
- No changes needed to `src/db/queries.js` or `src/routes/reports.js` — AC-6 chain already correct.
- ATDD: 24/24 tests pass. Full regression: 739/739 tests pass (0 failures).

### File List

- src/cleanup/reportCleanup.js (created)
- src/server.js (modified — added import + startCleanupCron call)

### Change Log

- 2026-04-23: Story 8.1 spec created — hourly TTL deletion cron. (claude-sonnet-4-6)
- 2026-04-23: Story 8.1 implemented — reportCleanup.js created, server.js wired. All 24 ATDD tests pass, 739 regression tests pass. (claude-sonnet-4-6)
- 2026-04-23: Step 5 code review (Opus) — 2 patch fixes applied (memoised prepared statement + synchronous cron callback), 3 defer findings recorded, 2 dismissed as noise. ATDD 27/27 pass, regression 742/742 pass. (claude-opus-4-7)

### Review Findings

- [x] [Review][Patch] Memoise prepared DELETE statement + align docstring [src/cleanup/reportCleanup.js:14-31] — `sqlite.prepare(...)` was called inside `deleteExpiredReports()` on every cron fire; docstring claimed lazy-prepared-once. Fixed: module-level `let deleteStmt = null`, populated on first call, reused thereafter. Docstring updated to match actual behaviour.
- [x] [Review][Patch] Drop vestigial `async` keyword on cron callback [src/cleanup/reportCleanup.js:40] — callback body was fully synchronous (better-sqlite3 is blocking). The `async` wrapper turned any thrown error into a rejected promise that node-cron may silently swallow. Removed `async`; comment added explaining the AC-5 hardening rationale.
- [x] [Review][Defer] No `task.stop()` on SIGTERM / no idempotency guard [src/cleanup/reportCleanup.js:40] — deferred, `process.exit(0)` kills the timer in practice; documented in deferred-work.md.
- [x] [Review][Defer] Implicit migration-ordering contract [src/cleanup/reportCleanup.js:24] — deferred, prod + test ordering both guaranteed; documented in deferred-work.md.
- [x] [Review][Defer] Cron can fire during graceful-shutdown window [src/server.js:104-137] — deferred, caught + logged → no crash, cosmetic noise only; documented in deferred-work.md.
