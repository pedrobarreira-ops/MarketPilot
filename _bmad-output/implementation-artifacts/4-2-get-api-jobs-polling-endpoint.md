# Story 4.2: GET /api/jobs/:job_id Polling Endpoint

**Epic:** 4 — HTTP API Layer
**Story:** 4.2
**Story Key:** 4-2-get-api-jobs-polling-endpoint
**Status:** done
**Date Created:** 2026-04-19

No Mirakl API calls in this story. This route reads only from local SQLite via `db.getJobStatus()` — no MCP verification required.

---

## User Story

As the progress page polling the job status,
I want `GET /api/jobs/:job_id` to return the current status, phase message, and report_id for a job,
So that the browser can drive the progress bar and navigate to the report when complete.

**Satisfies:** Epic 4.2 AC — returns `{ data: { status, phase_message, report_id } }` for known job; 404 `{ error, message }` for unknown job_id; response < 100ms (single SQLite read); no api_key in response; listing path GET /api/jobs returns 404.

---

## Acceptance Criteria

**AC-1: Returns `{ data: { status, phase_message, report_id } }` for known job_id**
- HTTP 200 for any job_id that exists in the DB
- Response body has `data` wrapper at top level
- `data` contains EXACTLY `{ status, phase_message, report_id }` — no extra fields (enforced by ATDD line 169)
- `status` is a non-empty string
- `phase_message` is present in `data` (may be `null` for newly created jobs)
- `report_id` in response matches the report_id stored for that job
- Freshly created job has `status: "queued"`

**AC-2: Returns HTTP 404 for unknown job_id**
- Status code 404 (not 400 — no format validation on job_id)
- Response shape: `{ error: "job_not_found", message: "Job não encontrado." }` (exact values per ATDD lines 66-69)
- UUID-shaped but non-existent job_id must return 404, not 400

**AC-3: api_key never appears in the response body**
- `api_key` must not appear anywhere in the 200 response (checked via `JSON.stringify(body).includes('api_key')`)
- `email` must NOT appear in the response data (only `status`, `phase_message`, `report_id`)

**AC-4: Response time target < 100ms (NFR)**
- Single SQLite read via `getJobStatus()` — must complete in < 100ms
- No external calls, no async work beyond DB read

**AC-5: GET /api/jobs (no id segment) returns 404**
- `GET /api/jobs` returns 404 — listing endpoint is NOT registered
- `GET /api/jobs/` (trailing slash only) returns 404

**AC-6: All valid job status values are representable in the polling response**
- Valid statuses: `queued`, `fetching_catalog`, `scanning_competitors`, `building_report`, `complete`, `error`
- Freshly created job has status within this set
- Route returns statuses as-is (no transformation)

**Verified by:** `tests/epic4-4.2-get-api-jobs-polling.atdd.test.js` (pre-existing — DO NOT MODIFY)

---

## Tasks / Subtasks

- [x] Task 1: Create `src/routes/jobs.js` route module (AC: 1, 2, 3, 4, 5, 6)
  - [x] Import `* as db` from `../db/queries.js`
  - [x] Export default async function that registers the route on the Fastify instance
  - [x] Register `GET /api/jobs/:job_id` with Fastify
  - [x] In handler: call `db.getJobStatus(request.params.job_id)`
  - [x] If result is null → `reply.status(404).send({ error: 'job_not_found', message: 'Job não encontrado.' })`
  - [x] If result found → `reply.send({ data: { status: row.status, phase_message: row.phase_message ?? null, report_id: row.report_id } })`
  - [x] Do NOT register `GET /api/jobs` (listing path) — route is `:job_id` only

- [x] Task 2: Register the route in `src/server.js` (AC: 1, 2, 5)
  - [x] Add `import jobsRoute from './routes/jobs.js'`
  - [x] Call `await fastify.register(jobsRoute)` AFTER the existing `await fastify.register(generateRoute)` line (line 80)
  - [x] Confirm `GET /api/jobs` (no id) returns 404 — Fastify only registers the parameterised path

- [x] Task 3: Validate against pre-existing ATDD tests (AC: all)
  - [x] Run: `node --test tests/epic4-4.2-get-api-jobs-polling.atdd.test.js`
  - [x] All tests pass (22 tests across AC-1 through AC-6)
  - [x] Run: `npm test` — all existing tests remain green (no regressions, 440/440 pass)

---

## Dev Notes

### No Mirakl Endpoints

This route makes zero Mirakl API calls. It is a pure read from local SQLite via `db.getJobStatus()`. No MCP check required.

### Route Contract (from ATDD lines 62–78)

The ATDD defines the exact contract the real route must satisfy:

```js
fastify.get('/api/jobs/:job_id', async (request, reply) => {
  const { job_id } = request.params
  const row = getJobStatus(job_id)
  if (!row) {
    return reply.status(404).send({
      error:   'job_not_found',
      message: 'Job não encontrado.',
    })
  }
  return reply.send({
    data: {
      status:        row.status,
      phase_message: row.phase_message ?? null,
      report_id:     row.report_id,
    },
  })
})
```

This is the exact implementation pattern. Follow it precisely — the ATDD asserts exact field names, exact 404 error/message values, and exact data shape.

### Route File Structure

Create `src/routes/jobs.js`. Follow the pattern from `src/routes/generate.js`:

```js
// src/routes/jobs.js
import * as db from '../db/queries.js'

export default async function jobsRoute(fastify) {
  fastify.get('/api/jobs/:job_id', async (request, reply) => {
    const { job_id } = request.params
    const row = db.getJobStatus(job_id)
    if (!row) {
      return reply.status(404).send({
        error:   'job_not_found',
        message: 'Job não encontrado.',
      })
    }
    return reply.send({
      data: {
        status:        row.status,
        phase_message: row.phase_message ?? null,
        report_id:     row.report_id,
      },
    })
  })
}
```

### db.getJobStatus Signature (from src/db/queries.js lines 128–145)

```js
export function getJobStatus(jobId) {
  // returns { status, phase_message, report_id } or null if not found
}
```

- Returns snake_case keys already (`phase_message`, `report_id`) — no mapping needed
- Returns `null` (never throws) if `jobId` is not found
- `phase_message` may be `null` for newly created jobs (no phase message set yet)

### Registering the Route in server.js

Add after the existing `generateRoute` registration (line 80 of `src/server.js`):

```js
import jobsRoute from './routes/jobs.js'

// ...after existing registrations:
await fastify.register(generateRoute)
await fastify.register(jobsRoute)   // ADD THIS
```

The route must be registered AFTER `setErrorHandler` and `runMigrations()` — the same constraint that applied to generateRoute (line 79-80 comment in server.js). The existing structure already satisfies this.

### Why GET /api/jobs returns 404 automatically

Fastify only registers `GET /api/jobs/:job_id`. The path `GET /api/jobs` (no param segment) does not match and Fastify returns 404 by default. Do NOT add a separate handler for `GET /api/jobs`. The ATDD verifies this behavior (AC-5).

### phase_message Null Coalescing

Use `row.phase_message ?? null` — not `row.phase_message || null`. A non-null empty string `""` is a valid phase_message value. The `??` operator only substitutes for `undefined` or `null`, which is what the DB returns for a fresh job.

### No Fastify Schema on This Route

Unlike `POST /api/generate`, this GET route has no request body to validate. Fastify does not need a JSON schema for the route options. The `:job_id` param is passed as-is to `getJobStatus()` — any string is valid (unknown strings return null → 404).

### Security Invariants

- This route reads ONLY `{ status, phase_message, report_id }` from the DB (via `getJobStatus()` which selects only those three columns — see queries.js lines 130-135)
- `email`, `marketplace_url`, `created_at`, `completed_at`, `error_message` are NOT selected and cannot leak
- No `api_key` exists in the DB schema at all (architecture invariant)
- Response data object must contain EXACTLY `{ status, phase_message, report_id }` — ATDD enforces this with `Object.keys(data).sort()` assertion

### Valid Status Values (AC-6)

The DB `status` column contains string values written by the worker:
- `queued` — initial state set by `createJob()`
- `fetching_catalog` — set by `updateJobStatus()` in worker phase A
- `scanning_competitors` — set by worker phase B
- `building_report` — set by worker phase C
- `complete` — set when pipeline finishes
- `error` — set by `updateJobError()` on failure

The route returns these as-is. No transformation or validation of the status value in the route.

### What NOT to Do

- Do NOT add `GET /api/jobs` listing route (spec: "NOT REGISTERED — GET /api/jobs (no listing)")
- Do NOT transform or validate the status string — return it as stored
- Do NOT include `email`, `marketplace_url`, `created_at`, `completed_at`, or `error_message` in the response
- Do NOT add Fastify JSON schema for the route (no body to validate)
- Do NOT modify `src/db/queries.js` — `getJobStatus()` is already implemented and correct
- Do NOT modify `src/middleware/errorHandler.js`
- Do NOT modify the pre-existing ATDD test file

### Error Handler Note

The `errorHandler` in `src/middleware/errorHandler.js` maps unhandled errors to 500. The 404 for unknown job_id is sent directly by the route handler via `reply.status(404).send(...)` — not via error handler. This is intentional and matches how the ATDD test verifies the shape.

### Project Structure Notes

- Create: `src/routes/jobs.js` (new file)
- Modify: `src/server.js` (add `import jobsRoute` and `await fastify.register(jobsRoute)`)
- Do NOT modify: `src/db/queries.js`, `src/middleware/errorHandler.js`, `src/routes/generate.js`
- `src/routes/` directory already exists and contains `generate.js`

### Test Commands

```bash
# Story ATDD only:
node --test tests/epic4-4.2-get-api-jobs-polling.atdd.test.js

# Full suite (all existing tests must remain green):
npm test
```

### npm test Configuration

`package.json` `test` script now uses the glob `tests/**/*.test.js` — all test files are included. The ATDD test for 4.2 (`tests/epic4-4.2-get-api-jobs-polling.atdd.test.js`) is pre-existing and will run in the full suite once the route is implemented. It uses a real in-memory SQLite database and does not require Redis.

### Previous Story Context (4.1 — POST /api/generate)

Story 4.1 established the route registration pattern: export default async function + `fastify.register()`. Follow the same pattern for Story 4.2. Key facts from 4.1:
- `src/routes/generate.js` is the canonical example
- Routes registered AFTER `setErrorHandler` and `runMigrations()` in `src/server.js`
- errorHandler maps validation errors to `{ error, message }` — consistent with 404 shape used here
- The 4.1 review found the safest ordering for side effects; no such concern in 4.2 (read-only route)

### Git Context (Recent Commits)

- `3528f4e` — Phase 0: update dependency graph — PR #44 merged, 4.2/4.3/5.1 unblocked
- `5cc83ab` — Set story 4-1-post-api-generate-route to done in sprint-status
- `a8e9c62` — story-4.1-post-api-generate-route (merged PR #44)

### ATDD Test File Location

`tests/epic4-4.2-get-api-jobs-polling.atdd.test.js` — pre-existing, locked. The test uses Fastify `inject()` with a real in-memory SQLite database. No live Redis needed. The test builds its own minimal Fastify app with the exact route implementation as the expected contract.

### NFR Compliance

- **NFR (Polling < 100ms):** `getJobStatus()` is a single `SELECT ... WHERE job_id = ? LIMIT 1` on an in-memory-or-file SQLite. No network calls. 100ms is easily achievable.

### References

- [Source: epics-distillate.md §HTTP API Routes] — `GET /api/jobs/:job_id` spec
- [Source: epics-distillate.md §Epic-Story Map] — 4.2 GET /api/jobs/:id polling
- [Source: epics-distillate.md §Story Acceptance Criteria] — Epic 4 compressed AC
- [Source: tests/epic4-4.2-get-api-jobs-polling.atdd.test.js] — pre-existing locked ATDD contract (AC-1 through AC-6)
- [Source: src/db/queries.js lines 128–145] — getJobStatus() implementation and return shape
- [Source: src/routes/generate.js] — route registration pattern to follow
- [Source: src/server.js lines 79-80] — route registration location and constraints
- [Source: src/middleware/errorHandler.js] — error shape context

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

None — implementation was straightforward, no debug iterations required.

### Completion Notes List

- Created `src/routes/jobs.js` following the exact pattern from `src/routes/generate.js`.
- Registered `jobsRoute` in `src/server.js` after `generateRoute` (Story 4.1 constraint respected).
- Used `row.phase_message ?? null` (not `||`) to preserve valid empty strings.
- GET /api/jobs (listing path) is NOT registered — Fastify returns 404 naturally.
- Pino redact config in `src/server.js` left unchanged.
- All 22 ATDD tests pass; full suite 440/440 pass with 0 regressions.

### File List

- src/routes/jobs.js (created)
- src/server.js (modified — added import and registration of jobsRoute)
- _bmad-output/implementation-artifacts/4-2-get-api-jobs-polling-endpoint.md (story status/tasks updated)

### Change Log

- 2026-04-19: Story 4.2 spec created — create-story workflow, comprehensive developer guide.
- 2026-04-19: Story 4.2 implemented — GET /api/jobs/:job_id route created and registered; all 22 ATDD tests + 440 full suite tests pass.
