# Story 4.2a: Polling Progress Contract — Structured Counts

**Epic:** 4 — HTTP API Layer
**Story:** 4.2a (retroactive contract extension against Story 4.2)
**Story Key:** 4-2a-polling-progress-contract
**Status:** review
**Date Created:** 2026-04-20
**Origin:** Sprint Change Proposal 2026-04-20 (`_bmad-output/planning-artifacts/sprint-change-proposal-2026-04-20.md`). Design handoff revealed the progress page needs structured per-phase counts; the UX doc already specified them (`ux-design.md:293-298`) but the shipped polling endpoint buries counts inside the prose `phase_message`. This story exposes them as dedicated fields.

---

## User Story

As the frontend developer building `progress.js` (future Story 5.2),
I want `GET /api/jobs/:job_id` to return structured `progress_current` and `progress_total` integer fields alongside `status`, `phase_message`, and `report_id`,
So that the live status line can render `{phase_message} ({current} / {total} produtos)` directly from the API without brittle Portuguese-prose parsing, and so the progress bar can compute a granular percentage fill during the two long phases (`fetching_catalog`, `scanning_competitors`).

**Satisfies:** Sprint Change Proposal 2026-04-20 path "A1" (3 phases + structured counts, no status-value split). Contract update documented in `epics-distillate.md:121`, `epics-distillate.md:260` (Story 4.2 AC), `epics-distillate.md:150-151` (progress.js behaviour), `architecture-distillate.md:75` (schema), `architecture-distillate.md:163` (API response format), and `ux-design.md:290-300` (Live Status Message).

---

## Acceptance Criteria

**AC-1: `generation_jobs` table gains two nullable INTEGER columns**
- `progress_current INTEGER` — nullable; intent: number of items processed in the active counting phase
- `progress_total INTEGER` — nullable; intent: number of items expected in the active counting phase (known from Mirakl `total_count`)
- Both columns added both in the Drizzle schema (`src/db/schema.js`) AND in the raw DDL in `src/db/migrate.js` — the two sources must stay in sync.
- Migration is idempotent: running `runMigrations()` against a fresh DB creates the table with the new columns; running it against an existing DB detects missing columns and runs `ALTER TABLE generation_jobs ADD COLUMN progress_current INTEGER; ALTER TABLE generation_jobs ADD COLUMN progress_total INTEGER;` — but only if the columns are absent (SQLite < 3.35 does not support `ADD COLUMN IF NOT EXISTS`; detection via `PRAGMA table_info(generation_jobs)` is the required pattern).

**AC-2: `updateJobStatus` signature extends additively**
- New signature: `updateJobStatus(jobId, status, phaseMessage, progressCurrent, progressTotal)` — two new trailing params, both optional.
- `phaseMessage` semantic preserved: `undefined` → column omitted from SET (preserves previous value); explicit `null` → column cleared.
- `progressCurrent` and `progressTotal` follow the same three-state semantic:
  - `undefined` (the default when caller omits the args) → column omitted from SET
  - explicit `null` → column cleared (written as NULL)
  - integer → column set to that integer
- Existing callers that pass only 3 args continue to work unchanged — the new params are `undefined` → omitted from SET → existing rows untouched.

**AC-3: `getJobStatus` return shape extends**
- `getJobStatus(jobId)` returns `{ status, phase_message, report_id, progress_current, progress_total }` when a row exists.
- Both new fields are returned with snake_case keys (matching the HTTP contract).
- When the DB value is NULL, the returned value is JavaScript `null` — NOT `undefined` and NOT `0`.

**AC-4: Route `GET /api/jobs/:job_id` exposes the new fields**
- Successful response shape (HTTP 200): `{ data: { status, phase_message, progress_current, progress_total, report_id } }`.
- When the DB has `null`, the JSON response field value is JSON `null` (not missing key, not 0).
- 404 response shape unchanged: `{ error: 'job_not_found', message: 'Job não encontrado.' }`.
- No new fields leak in the error path.

**AC-5: Worker writes counts during the two counting phases**
- `src/workers/reportWorker.js` is modified so that the `onProgress` callbacks passed to `fetchCatalog` and `scanCompetitors` update the job row with `progressCurrent=n, progressTotal=total`:

  ```js
  (n, total) => {
    const msg = `A obter catálogo… (${n.toLocaleString('pt-PT')} de ${total.toLocaleString('pt-PT')} produtos)`
    db.updateJobStatus(job_id, 'fetching_catalog', msg, n, total)
  }
  ```

  and symmetrically for the `scanning_competitors` phase.
- At each phase transition BEFORE the first `onProgress` fires, explicitly clear the counts so stale values from the previous phase don't bleed across:

  ```js
  // transitioning into fetching_catalog
  db.updateJobStatus(job_id, 'fetching_catalog', 'A obter catálogo…', null, null)
  ```

  Same pattern at the transition to `scanning_competitors`, and at `building_report` (where counts stay null for the whole phase).

**AC-6: Counts are null in non-counting phases**
- `queued` phase: both null (default on `createJob`; no writer touches them).
- `building_report` phase: both null (no `onProgress` emits during this phase — it's a single synchronous compute-and-persist step).
- `complete` phase: both null (transition at Phase E explicitly clears them, per AC-5's pattern).
- `error` phase: count values at the moment of failure are preserved (not cleared) — they may aid debugging. No new writer touches them.

**AC-7: Original Story 4.2 ATDD "exact-fields" assertion updated to match the new contract**
- `tests/epic4-4.2-get-api-jobs-polling.atdd.test.js:148-156` currently asserts `Object.keys(data)` sorted equals `['phase_message', 'report_id', 'status']`. This assertion is updated to the new 5-field shape: `['phase_message', 'progress_current', 'progress_total', 'report_id', 'status']`.
- This is the ONLY modification to the existing 4.2 ATDD file. All other pre-existing 4.2 assertions (status values, 404 shape, no-api_key invariant, response time target) stay untouched.

**AC-8: New `.additional.test.js` covers the contract extension behaviourally**
- `tests/epic4-4.2a-polling-progress-contract.additional.test.js` is created and tests by calling the real Fastify app + real in-memory SQLite (same pattern as the pre-existing 4.2 ATDD — see `buildTestApp()` in that file):
  1. Freshly created job (`status: queued`): `progress_current` and `progress_total` both `null` in response.
  2. Worker-simulated `fetching_catalog` with counts (7200, 31179): response has `progress_current: 7200`, `progress_total: 31179`.
  3. Worker-simulated `scanning_competitors` with counts (15427, 28440): response has the new counts; no leftover counts from a previous phase.
  4. Worker-simulated `building_report` after explicit clearing: both null.
  5. Worker-simulated `complete`: both null.
  6. Round-trip: call `db.updateJobStatus(jobId, 'fetching_catalog', '…', 7200, 31179)` then `db.getJobStatus(jobId)` → assert `progress_current: 7200`, `progress_total: 31179`; then call `db.updateJobStatus(jobId, 'scanning_competitors', '…', 0, 28440)` → assert overwritten values; then `db.updateJobStatus(jobId, 'scanning_competitors', '…', 100)` (omitting the 5th arg) → `progress_total` preserved at 28440 (`undefined` → omitted from SET).
  7. `db.updateJobStatus(jobId, 'complete', '…', null, null)` → both columns NULL.
- Every test in this file is behavioural (calls real implementations via `app.inject()` or direct function invocation with real SQLite). No source-text scans — Epic 4 retro lesson.

**AC-9: Migration is idempotent and safe on existing DBs**
- Running `runMigrations()` against a fresh DB creates `generation_jobs` with all 11 columns (9 existing + 2 new).
- Running `runMigrations()` against a DB that has the 9-column shape (e.g. a dev DB created before this story) adds the two new columns without erroring.
- Running `runMigrations()` twice in a row against any DB does not error (idempotency test).
- Migration must NOT drop data, rename columns, or change any existing column's type.

**AC-10: Story 4.2 original ATDD file remains authoritative for non-count assertions**
- Status set (`queued`, `fetching_catalog`, `scanning_competitors`, `building_report`, `complete`, `error`) unchanged. The retrofit does NOT split any status value.
- 404 response shape unchanged.
- `api_key` never in response — invariant preserved.
- Response time < 100ms target preserved (SQLite read is still one row; two extra columns negligible).

**AC-11: `npm test` green**
- All existing tests pass.
- New `.additional.test.js` file is picked up by the existing glob in `package.json:test` (`tests/**/*.test.js`); no package.json edit required.

**AC-12: Docs already in sync (no further edits by dev)**
- `epics-distillate.md`, `architecture-distillate.md`, `ux-design.md` were updated on 2026-04-20 as part of the Sprint Change Proposal approval. The dev MUST NOT re-edit these.
- Source-level comment in `queries.js` / `migrate.js` / `reportWorker.js` / `routes/jobs.js` updated at dev time to reflect the new 5-field shape.

---

## Tasks / Subtasks

- [x] **Task 1: Update Drizzle schema** (AC: 1)
  - [x] Add two columns to `generationJobs` in `src/db/schema.js`:
    ```js
    progressCurrent: integer('progress_current'),
    progressTotal:   integer('progress_total'),
    ```
    Both nullable (no `.notNull()`).

- [x] **Task 2: Update migration with idempotent ALTER TABLE** (AC: 1, 9)
  - [x] In `src/db/migrate.js`, add the two columns to the `CREATE TABLE IF NOT EXISTS generation_jobs` DDL.
  - [x] Add a PRAGMA-based column-existence check and conditional `ALTER TABLE generation_jobs ADD COLUMN ...` via `ensureColumn()` helper function.
  - [x] Idempotency verified by AC-9 tests in the `.additional.test.js` file (3 tests: twice, thrice, and getJobStatus still works after repeated calls).

- [x] **Task 3: Extend `updateJobStatus` signature and `getJobStatus` return shape** (AC: 2, 3)
  - [x] Changed `updateJobStatus(jobId, status, phaseMessage)` to `updateJobStatus(jobId, status, phaseMessage, progressCurrent, progressTotal)`.
  - [x] Three-state semantic applied for both new params (undefined → omit, null → clear, value → set).
  - [x] `getJobStatus` returns 5-key object with snake_case keys and `?? null` defensive guards.
  - [x] JSDoc updated to the new 5-field shape.

- [x] **Task 4: Update `reportWorker.js` to write counts** (AC: 5, 6)
  - [x] Both `onProgress` callbacks updated to pass `n, total` as 4th and 5th args.
  - [x] Explicit `null, null` clearing at all phase transitions: `fetching_catalog`, `scanning_competitors`, `building_report`, `complete`.

- [x] **Task 5: Expose new fields on `GET /api/jobs/:job_id`** (AC: 4)
  - [x] `src/routes/jobs.js` passes through 5-field response with `?? null` defensive guards.
  - [x] JSDoc header updated to document the 5-field shape.

- [x] **Task 6: Update the one assertion in the existing 4.2 ATDD file** (AC: 7)
  - [x] `tests/epic4-4.2-get-api-jobs-polling.atdd.test.js:156` already updated by ATDD step to 5-field array `['phase_message', 'progress_current', 'progress_total', 'report_id', 'status']`. No further changes needed.

- [x] **Task 7: Create `tests/epic4-4.2a-polling-progress-contract.additional.test.js`** (AC: 8, 9)
  - [x] File created by ATDD step with 20 tests across 7 cases + AC-9 idempotency tests. All pass.

- [x] **Task 8: Regression sweep** (AC: 10, 11)
  - [x] `npm test` — 493 tests pass, 0 failures. Full suite including Stories 4.2, 3.5, 3.7.

- [x] **Task 9: Smoke test — real polling against a seeded DB** (AC: all integration)
  - [x] Inline smoke test run via node --input-type=module. Output recorded in Dev Agent Record.
  - [x] All phases verified correct null/count behavior.

---

## Dev Notes

### Why one retrofit story instead of two (3-7a + 4-2a)

The schema change, the worker write-path, and the route read-path are inseparable — shipping one without the others leaves the system in an inconsistent state (migrated DB with nothing writing the columns, or worker writing columns that the route doesn't expose). Splitting into `3-7a` (worker) and `4-2a` (route) would create an inter-story dependency without review value — the reviewer would need to read both PRs in sequence to validate one contract. One story = one atomic contract change.

The story number `4-2a` reflects the USER-VISIBLE change (the polling endpoint contract). The worker updates inside it are scope, not a separate epic boundary violation.

### SQLite ALTER TABLE idempotency — the PRAGMA pattern

`better-sqlite3` exposes `sqlite.prepare("PRAGMA table_info(table_name)").all()` returning an array of `{ cid, name, type, notnull, dflt_value, pk }` objects. Filter by `name` to detect whether a column exists. Only run `ALTER TABLE ADD COLUMN` when absent — repeated execution on an already-migrated DB would throw `SqliteError: duplicate column name` on SQLite < 3.35 (project currently ships SQLite < 3.35 per `better-sqlite3` defaults; `ADD COLUMN IF NOT EXISTS` is unavailable).

Pattern (full working block):

```js
function ensureColumn(tableName, columnName, columnType) {
  const cols = sqlite.prepare(`PRAGMA table_info(${tableName})`).all().map(r => r.name)
  if (!cols.includes(columnName)) {
    sqlite.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnType}`)
  }
}
```

Use this helper for the two new columns. It keeps the DDL block (the `CREATE TABLE IF NOT EXISTS` part) canonical for fresh installs, and the `ensureColumn` calls handle in-place migration for existing dev DBs.

Run order inside `runMigrations()`:

```js
sqlite.exec(`CREATE TABLE IF NOT EXISTS generation_jobs (...);`)  // includes new columns in the DDL
ensureColumn('generation_jobs', 'progress_current', 'INTEGER')     // for pre-existing DBs
ensureColumn('generation_jobs', 'progress_total', 'INTEGER')
// ... other tables unchanged
```

### `updateJobStatus` three-state param semantic

The existing `updateJobStatus` uses `phaseMessage === undefined ? omit : set` as the semantic for a partial update. That pattern is good — callers pass nothing to mean "don't touch that column" and explicit `null` to mean "clear it". Mirror this for both new params. The most common caller patterns after this retrofit:

| Caller intent | Call |
|---|---|
| Set status only (no counts, keep previous msg) | `updateJobStatus(id, 'queued')` — args 3, 4, 5 all undefined |
| Update during counting phase | `updateJobStatus(id, 'fetching_catalog', msg, n, total)` |
| Clear counts at phase transition | `updateJobStatus(id, 'building_report', msg, null, null)` |
| Update counts only, reuse existing phase_message | `updateJobStatus(id, 'scanning_competitors', undefined, n, total)` — but Drizzle signature needs named args here, so prefer the explicit-arg pattern |

### Why explicit null-clearing at phase transitions matters

A seller polls the job every 2 seconds. Consider this timeline:

1. `fetching_catalog` onProgress fires: writes `progress_current=31179, progress_total=31179` (phase done)
2. Worker transitions: `updateJobStatus(id, 'scanning_competitors', 'A verificar concorrentes…')` — WITHOUT explicit count clearing
3. First `scanning_competitors` onProgress hasn't fired yet (takes a few hundred ms to start P11 calls)
4. Seller polls at this moment: response says `status: scanning_competitors, progress_current: 31179, progress_total: 31179`

The seller sees "A verificar concorrentes… (31 179 / 31 179 produtos)" — stale counts from the previous phase, suggesting scanning is already complete. Confusing.

With explicit null-clearing at step 2, the seller sees `status: scanning_competitors, progress_current: null, progress_total: null` → UI renders just `"A verificar concorrentes…"` (per the UX doc null-handling rule). Clean transition.

### Story 4.2's "exact-fields" assertion — why it must change, not stay

The original 4.2 ATDD assertion `Object.keys(data)` must equal the exact set. This was a good invariant under the old contract — it caught accidental field leaks. Under the new contract, it still catches leaks, but with the extended set. Updating the literal array is NOT weakening the invariant; it's moving it forward. Keep the `Object.keys(data).sort()` + `deepEqual` pattern — just expand the expected array.

### File locations

```
src/db/schema.js                                                 ← MODIFY (Task 1)
src/db/migrate.js                                                ← MODIFY (Task 2)
src/db/queries.js                                                ← MODIFY (Task 3)
src/workers/reportWorker.js                                      ← MODIFY (Task 4)
src/routes/jobs.js                                               ← MODIFY (Task 5)
tests/epic4-4.2-get-api-jobs-polling.atdd.test.js                ← MODIFY (Task 6 — single line-156 edit)
tests/epic4-4.2a-polling-progress-contract.additional.test.js    ← CREATE (Task 7)
```

No package.json change. No server.js change (route is already registered). No new imports at module level beyond what already exists.

### Epic-level effect on sprint-status

When this story's PR merges:
- `sprint-status.yaml` will set `4-2a-polling-progress-contract: done` (via BAD Step 7 or manual reconciliation).
- With that flip and no other open stories in Epic 4, `epic-4` can go back to `done`. However, per the BAD retro action item "Phase 0 epic-row auto-flip" (still pending as of 2026-04-20), that flip is currently manual. The dev agent should NOT flip `epic-4` — that's a post-merge reconciliation step for the merge skill / user.

### No Mirakl API calls, no MCP changes

This retrofit is entirely internal — DB, worker, route, tests. Mirakl endpoints (OF21, P11, PRI01) are not touched. No MCP re-probe required.

### ESM & project conventions (reminder)

- ESM only: `import` / `export`. No `require`.
- Never `console.log`. Use `fastify.log.info/debug/error` via the injected request context where available.
- Currency / numeric values: keep as JS integers in DB columns; the frontend handles pt-PT locale formatting.

---

## Architecture Guardrails

| Boundary | Rule |
|---|---|
| `src/db/queries.js` | STILL the only place that executes raw DB reads/writes (except `migrate.js`). No caller touches Drizzle directly. |
| `updateJobStatus` three-state semantic | PRESERVE for all three mutable params: undefined → omit, null → clear, value → set. |
| `getJobStatus` return keys | snake_case (matches HTTP API contract); NEVER leak Drizzle camelCase. |
| DB schema | ADD ONLY. Do not drop, rename, or retype existing columns. |
| `src/routes/jobs.js` | Route handler stays thin — single `getJobStatus` call + shape the response. No business logic. |
| `src/workers/reportWorker.js` | Existing phase logic is NOT being reorganised. This story only changes the `updateJobStatus` call sites (args) — not the order, not the status names, not the phase_message strings. |
| Story 4.2 original ATDD | MODIFY ONLY line 156 assertion. No other changes. |
| New `.additional.test.js` | Behavioural tests only — no source-text scans. |

---

## Story Dependencies

**This story (4.2a) requires (all done):**
- Story 1.3 (done) — `schema.js`, `migrate.js`, `queries.js`, `database.js` exist with the current 9-column `generation_jobs` and `createJob` / `updateJobStatus` / `getJobStatus` already present.
- Story 3.7 (done) — `reportWorker.js` `processJob` exists with the current `onProgress` callback pattern for `fetchCatalog` and `scanCompetitors`.
- Story 4.2 (done) — `src/routes/jobs.js` exists; registered in `server.js`; `tests/epic4-4.2-get-api-jobs-polling.atdd.test.js` exists.

**Stories that benefit from 4.2a:**
- Story 5.2 (frontend progress.js, not yet authored) — will consume the new structured fields per the updated `epics-distillate.md:150-151`. **Must ship before 5.2 dev begins** (Epic 4 retro critical path).

**No stories block on 4.2a starting.** Can ship in parallel with Story 3.5a (CSV hardening) — they touch disjoint files.

---

## Previous Story Intelligence

**From Story 4.2 (GET /api/jobs/:job_id — done 2026-04-19):**
- Route contract pattern: reads via `db.getJobStatus()`, returns `{ data: { ... } }` wrapper, 404 with `{ error: 'job_not_found', message: 'Job não encontrado.' }` for unknown IDs.
- `db.getJobStatus` returns snake_case keys directly — that contract is preserved here and extended.
- ATDD exact-fields assertion (line 156) is the invariant that catches unexpected field leaks. It must be updated, not weakened.

**From Story 3.7 (full worker orchestration — done 2026-04-19):**
- `onProgress(n, total)` callback signature already structured — no need to change `fetchCatalog` or `scanCompetitors` signatures.
- `updateJobStatus` call sites are isolated inside the `onProgress` closures and the phase-transition calls — 8 call sites total. Localised change.
- Worker does NOT re-throw in the catch block (per spec intentional design) — keep that pattern.

**From Story 3.5 (CSV persistence — done 2026-04-18):**
- `insertReport` signature change taught the project that additive-field schema extensions are cheap but caller-signature changes need coordinated updates across all callers. This retrofit's additive `updateJobStatus` params are safer because they default to undefined (preserving omit semantics).

**From Epic 4 retrospective (2026-04-20):**
- This retrofit is explicitly scoped in the retro's "pre-Epic-5 critical path" list, alongside the CSV hardening (Story 3.5a), the BAD config edit, and the Playwright wire-up.
- Batching this with the CSV hardening is acceptable but separate PRs is cleaner for review.

**From BAD testing conventions:**
- `.additional.test.js` files use the same in-memory SQLite pattern as `.atdd.test.js` — see `tests/epic4-4.1-post-api-generate.additional.test.js` for the established pattern (real Fastify + real DB).
- All new tests must be BEHAVIOURAL — no `src.includes('...')` scans.

---

## Verification Checklist

After completing all tasks, verify:

- [ ] `src/db/schema.js` — `generationJobs` has 11 columns; `progressCurrent` and `progressTotal` are `integer(...)` (no `.notNull()`)
- [ ] `src/db/migrate.js` — `CREATE TABLE IF NOT EXISTS` DDL includes `progress_current INTEGER, progress_total INTEGER`; `ensureColumn` or equivalent PRAGMA-based check runs for both columns
- [ ] Running migrations twice against the same DB does not throw
- [ ] Running migrations against a DB created with the pre-retrofit schema adds both columns without error
- [ ] `src/db/queries.js` — `updateJobStatus` accepts 5 args with three-state semantic on params 3/4/5; `getJobStatus` returns 5-key object with snake_case keys
- [ ] `src/workers/reportWorker.js` — 2 `onProgress` callback calls pass `n, total` as 4th/5th args; phase-transition `updateJobStatus` calls explicitly pass `null, null`
- [ ] `src/routes/jobs.js` — response `data` object has all 5 keys (status, phase_message, progress_current, progress_total, report_id); null DB values serialise as JSON `null`
- [ ] `tests/epic4-4.2-get-api-jobs-polling.atdd.test.js` — line 156 expected array updated to 5 entries; no other changes
- [ ] `tests/epic4-4.2a-polling-progress-contract.additional.test.js` — 7 behavioural test cases per AC-8 + 1 idempotency test; all pass
- [ ] `npm test` — all suites green (441 + new tests)
- [ ] Manual smoke test (Task 9) documented in Dev Agent Record
- [ ] No changes to `package.json`, `server.js`, or any artifact in `_bmad-output/planning-artifacts/`

---

## Out of Scope (intentionally)

- **Status-value split** (the A2 option from the Sprint Change Proposal) — rejected at proposal time. `building_report` remains a single status.
- **Frontend consumption of the new fields** — that's Story 5.2 (not yet authored). This story only guarantees the server contract.
- **Error-message translation for progress** — phase_message is already Portuguese; no change.
- **Rate limiting on `/api/jobs/:job_id`** — separate deferred-work item, platform hardening story post-Epic-6.
- **Historical job backfill** — existing rows get NULL for the new columns; no backfill script required (nulls are semantically correct: those rows never emitted counts).

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

No issues encountered. Implementation was straightforward — all source changes were additive and the ATDD tests were already written by Step 2.

### Completion Notes List

- Task 1 complete: `src/db/schema.js` — `generationJobs` now has 11 columns; `progressCurrent` and `progressTotal` added as `integer(...)` without `.notNull()`.
- Task 2 complete: `src/db/migrate.js` — DDL updated with new columns; `ensureColumn()` helper added for PRAGMA-based idempotent migration on pre-existing DBs.
- Task 3 complete: `src/db/queries.js` — `updateJobStatus` extended to 5 params with three-state semantic; `getJobStatus` returns 5-key snake_case object with `?? null` guards.
- Task 4 complete: `src/workers/reportWorker.js` — both `onProgress` callbacks now pass `n, total`; all 4 phase-transition calls explicitly clear with `null, null`.
- Task 5 complete: `src/routes/jobs.js` — 5-field response shape with `?? null` guards; JSDoc updated.
- Task 6 complete: The 4.2 ATDD file's line-156 assertion was already updated by the ATDD step (Step 2) to the 5-field contract. No further changes needed.
- Task 7 complete: The additional test file was created by the ATDD step with 20 behavioural tests. All pass.
- Task 8 complete: Full regression sweep — 493 tests, 0 failures. Confirmed 4.2, 3.5, 3.7, 3.5a all green.
- Task 9 (Smoke test output):
  ```
  queued: {"status":"queued","progress_current":null,"progress_total":null}
  fetching_catalog (transition, counts cleared): {"status":"fetching_catalog","progress_current":null,"progress_total":null}
  fetching_catalog (7200/31179): {"status":"fetching_catalog","progress_current":7200,"progress_total":31179}
  scanning_competitors (transition, counts cleared): {"status":"scanning_competitors","progress_current":null,"progress_total":null}
  scanning_competitors (15427/28440): {"status":"scanning_competitors","progress_current":15427,"progress_total":28440}
  building_report: {"status":"building_report","progress_current":null,"progress_total":null}
  complete: {"status":"complete","progress_current":null,"progress_total":null}
  Smoke test PASSED — all phases show correct null/count behavior
  ```

### File List

- `src/db/schema.js` — added `progressCurrent` and `progressTotal` integer columns
- `src/db/migrate.js` — added `ensureColumn()` helper; added new columns to DDL and idempotent ALTER TABLE calls
- `src/db/queries.js` — extended `updateJobStatus` to 5-param signature; extended `getJobStatus` to 5-field return shape
- `src/workers/reportWorker.js` — updated `onProgress` callbacks and phase-transition calls to pass/clear counts
- `src/routes/jobs.js` — updated response shape to 5 fields; updated JSDoc
- `tests/epic4-4.2-get-api-jobs-polling.atdd.test.js` — AC-7 exact-fields assertion already updated by ATDD step (no dev change needed)
- `tests/epic4-4.2a-polling-progress-contract.additional.test.js` — created by ATDD step (no dev change needed; all 20 tests pass)

### Change Log

- 2026-04-20: Story 4.2a created — retroactive extension of the polling endpoint contract to expose `progress_current` / `progress_total` fields. Pre-Epic-5 critical path item per Sprint Change Proposal 2026-04-20 and Epic 4 retrospective.
- 2026-04-20: Story 4.2a implemented — all 9 tasks complete; 493 tests pass (20 new in 4.2a file, 1 updated assertion in 4.2 file). Status set to review.
