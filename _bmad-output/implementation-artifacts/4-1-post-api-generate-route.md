# Story 4.1: POST /api/generate Route

**Epic:** 4 — HTTP API Layer
**Story:** 4.1
**Story Key:** 4-1-post-api-generate-route
**Status:** ready-for-dev
**Date Created:** 2026-04-19

Endpoints verified against MCP-Verified Endpoint Reference (epics-distillate.md, 2026-04-18). This story does NOT call any Mirakl endpoints directly — it hands off to the existing worker via BullMQ.

---

## User Story

As a user submitting the MarketPilot form,
I want `POST /api/generate` to validate my credentials, create a job, and immediately return a `job_id` and `report_id`,
So that my browser can poll for progress and the worker can begin the report generation pipeline in the background.

**Satisfies:** Epic 4.1 AC — validates api_key non-empty + valid email → 400 if invalid; crypto.randomUUID() for job_id+report_id; keyStore.set(job_id, api_key) — ONLY place; queue.add payload has NO api_key; db.createJob; returns 202 {data:{job_id,report_id}} < 2s.

---

## Acceptance Criteria

**AC-1: Validates api_key — 400 when missing or blank**
- Body with missing `api_key` field → 400
- Body with `api_key: ""` (empty string) → 400
- Body with whitespace-only `api_key` (e.g. `"   "`) → 400 (trim before length check)
- 400 response shape: `{ error: "validation_error", message: <string> }`
- `api_key` must be a non-empty string before `keyStore.set()` is ever called — this fulfils the long-deferred guard from Story 2.1 code review

**AC-2: Validates email — 400 when missing or invalid format**
- Body with missing `email` field → 400
- Body with `email: "not-an-email"` → 400
- Body with `email: "user@"` → 400 (no domain)
- Valid email format passes validation
- 400 response shape: `{ error: "validation_error", message: <string> }`

**AC-3: crypto.randomUUID() generates job_id and report_id**
- Both `job_id` and `report_id` are valid UUIDs (v4 format: `[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}`)
- Successive requests generate different UUIDs
- Use `import { randomUUID } from 'node:crypto'` — NOT the `uuid` package

**AC-4: keyStore.set(job_id, api_key) called — the ONLY place it is called in the codebase**
- `keyStore.set(job_id, api_key)` is called exactly once per valid request, before `queue.add`
- `keyStore.js` itself does NOT call `keyStore.set()` internally (no self-call)
- The route is the sole entry point for `keyStore.set()` (enforced by ATDD static check)

**AC-5: BullMQ queue.add payload has NO api_key field**
- `queue.add('generate', { job_id, report_id, email, marketplace_url })` — exactly these four fields
- `api_key` must NOT appear in the job data object at any level
- The string `'api_key'` must not appear in the queue payload

**AC-6: db.createJob called with correct parameters**
- `db.createJob(job_id, report_id, email, marketplace_url)` called once per valid request
- Arguments match the signature in `src/db/queries.js`: `createJob(jobId, reportId, email, marketplaceUrl)`

**AC-7: Returns HTTP 202 with body { data: { job_id, report_id } }**
- Status code: `202 Accepted`
- Body: `{ "data": { "job_id": "<uuid>", "report_id": "<uuid>" } }`
- No extra top-level keys — response must contain ONLY `"data"`
- `data` must contain ONLY `"job_id"` and `"report_id"` (no extra fields)
- Content-Type: `application/json`

**AC-8: Response time target < 2s (NFR-P1)**
- Route returns within 2000ms under normal conditions
- All work is async non-blocking: keyStore.set (sync, instant), queue.add (async BullMQ), db.createJob (sync SQLite)

**AC-9: api_key never appears in the HTTP response body**
- Neither 202 nor 400 responses contain the api_key value
- Error messages from validation failure do not echo back the submitted api_key value

**AC-10 (static): keyStore.set called only from route handler**
- `src/queue/keyStore.js` does not call `keyStore.set()` on itself
- `src/queue/keyStore.js` does not import any route module
- The route file is the canonical and sole caller

**Verified by:** `tests/epic4-4.1-post-api-generate.atdd.test.js` (pre-existing — DO NOT MODIFY)

---

## Tasks / Subtasks

- [ ] Task 1: Create `src/routes/generate.js` route module (AC: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10)
  - [ ] Import `randomUUID` from `node:crypto`
  - [ ] Import `keyStore` from `../queue/keyStore.js`
  - [ ] Import `reportQueue` from `../queue/reportQueue.js`
  - [ ] Import `db` (createJob) from `../db/queries.js`
  - [ ] Import `config` from `../config.js` for `WORTEN_BASE_URL`
  - [ ] Define and export default function that registers the route on the Fastify instance
  - [ ] Register `POST /api/generate` with Fastify JSON schema validation (see schema below)
  - [ ] In the handler: trim api_key, then validate non-empty (400 if blank after trim)
  - [ ] Generate `job_id = randomUUID()` and `report_id = randomUUID()`
  - [ ] Call `keyStore.set(job_id, api_key)` — before queue.add
  - [ ] Call `await reportQueue.add('generate', { job_id, report_id, email, marketplace_url })`
  - [ ] Call `db.createJob(job_id, report_id, email, marketplace_url)`
  - [ ] Return `reply.status(202).send({ data: { job_id, report_id } })`

- [ ] Task 2: Register the route in `src/server.js` (AC: 7)
  - [ ] Add `import generateRoute from './routes/generate.js'` (or use `fastify.register`)
  - [ ] Call route registration AFTER `setErrorHandler` and AFTER `runMigrations()`
  - [ ] Confirm route is accessible at `POST /api/generate`

- [ ] Task 3: Validate against pre-existing ATDD tests (AC: all)
  - [ ] Run: `node --test tests/epic4-4.1-post-api-generate.atdd.test.js`
  - [ ] All tests pass (22 tests across AC-1 through AC-10)
  - [ ] Run: `npm test` — all existing tests remain green (no regressions)

### Review Findings

Code review performed 2026-04-19 (Step 5). Runtime-invariant focus per pipeline instructions.

- [x] [Review][Patch] queue.add failure leaves orphan keyStore entry + stuck-queued DB row [src/routes/generate.js] — HIGH. Reordered side effects to `db.createJob → keyStore.set → queue.add` and wrapped the enqueue in try/catch that rolls back `keyStore.delete(job_id)` and `db.updateJobError(job_id, ...)` so a Redis outage cannot leave an api_key in memory or a phantom 'queued' row with no worker.
- [x] [Review][Patch] db.createJob after queue.add created an orphan-worker scenario [src/routes/generate.js] — HIGH. With the old order, a DB insert failure AFTER enqueue succeeded meant the worker would start the Mirakl pipeline, burn quota, and email the user while the client saw 500 and the job row never existed. Reorder above fixes this (DB first — if it fails, nothing is enqueued).
- [x] [Review][Patch] api_key stored un-trimmed [src/routes/generate.js:47] — LOW. A padded key (`"   abc  "`) would reach Mirakl's Authorization header unchanged and fail as an opaque 401. Now `.trim()` before `keyStore.set()`.
- [x] [Review][Patch] ATDD mocks log output so pino redact drift is not test-enforced [tests/] — the pre-Phase-2 deferred gap. Added `tests/epic4-4.1-post-api-generate.additional.test.js` with: (a) three pino-redact assertions using the EXACT paths from `src/server.js`, (b) a source-text invariant that fails if someone drops a redact path from `src/server.js`, (c) the queue.add failure rollback test, (d) the trim-before-store test. 6 new tests, all green.
- [x] [Review][Dismiss] Race between keyStore.set and queue.add — N/A. keyStore.set is synchronous and the worker runs in the same Node.js process (server.js imports reportWorker). There is no event-loop window where the worker can observe a missing key.

Test counts after fixes: story ATDD 27/27 pass (unchanged), additional invariant suite 6/6 pass (new), full suite 439/439 pass (was 433, +6 new, 0 regressions).

---

## Dev Notes

### Critical: Do NOT Modify the ATDD Test File

`tests/epic4-4.1-post-api-generate.atdd.test.js` is pre-existing and locked. It uses Fastify's `inject()` to test against a stub app — the real route implementation in `src/routes/generate.js` is tested indirectly by mirroring the contract the test defines.

The ATDD test builds its own minimal Fastify app with stub queue/keyStore/db. It verifies the CONTRACT the route must fulfil. The real implementation in `src/routes/generate.js` must satisfy the same contract when integrated in `src/server.js`.

### Fastify Schema Validation (Route Schema)

Use Fastify's built-in JSON schema validation. This handles AC-1 and AC-2 automatically and produces the `{ error, message }` shape via `errorHandler`:

```js
{
  schema: {
    body: {
      type: 'object',
      required: ['api_key', 'email'],
      properties: {
        api_key: { type: 'string', minLength: 1 },
        email:   { type: 'string', format: 'email' },
      },
    },
  },
}
```

The Fastify schema with `minLength: 1` handles empty-string `api_key`. For whitespace-only `api_key`, add a manual `.trim()` check in the handler body AFTER schema passes, because Fastify schema validates the raw string before the handler runs.

**Whitespace-only guard in handler:**
```js
const { api_key, email } = request.body
if (!api_key.trim()) {
  return reply.status(400).send({
    error: 'validation_error',
    message: 'body/api_key must be a non-empty string',
  })
}
```

### Route File Structure

Create `src/routes/generate.js`. Per the architecture spec (`src/routes/` — HTTP only, no business logic):

```js
// src/routes/generate.js
import { randomUUID } from 'node:crypto'
import * as keyStore from '../queue/keyStore.js'
import { reportQueue } from '../queue/reportQueue.js'
import * as db from '../db/queries.js'
import { config } from '../config.js'

export default async function generateRoute(fastify) {
  fastify.post('/api/generate', {
    schema: {
      body: {
        type: 'object',
        required: ['api_key', 'email'],
        properties: {
          api_key: { type: 'string', minLength: 1 },
          email:   { type: 'string', format: 'email' },
        },
      },
    },
  }, async (request, reply) => {
    const { api_key, email } = request.body
    const marketplace_url = config.WORTEN_BASE_URL

    // Guard: whitespace-only api_key is invalid even if schema passes minLength: 1
    if (!api_key.trim()) {
      return reply.status(400).send({
        error: 'validation_error',
        message: 'body/api_key must be a non-empty string',
      })
    }

    const job_id    = randomUUID()
    const report_id = randomUUID()

    keyStore.set(job_id, api_key)
    await reportQueue.add('generate', { job_id, report_id, email, marketplace_url })
    db.createJob(job_id, report_id, email, marketplace_url)

    return reply.status(202).send({ data: { job_id, report_id } })
  })
}
```

### Registering the Route in server.js

Add the route registration AFTER `setErrorHandler` and `runMigrations()`:

```js
// In src/server.js — add after the existing health + report-page routes
import generateRoute from './routes/generate.js'

// ... existing registrations ...

await fastify.register(generateRoute)
```

Using `fastify.register()` is the idiomatic Fastify way to add route plugins.

### marketplace_url Source

`marketplace_url` comes from `config.WORTEN_BASE_URL` — NOT from the request body. The client does not provide it; the server injects it from environment config. This matches the spec: `POST /api/generate` body is `{ api_key, email }` only.

### keyStore Import Pattern

`keyStore.js` exports named functions `set`, `get`, `has`, `delete`. Import as namespace:
```js
import * as keyStore from '../queue/keyStore.js'
keyStore.set(job_id, api_key)
```

Or named imports:
```js
import { set as keyStoreSet } from '../queue/keyStore.js'
```

The backing `_store` Map is NOT exported — this is by design and must not be changed.

### db.createJob Signature

From `src/db/queries.js`:
```js
export function createJob(jobId, reportId, email, marketplaceUrl)
```
Call order matches: `db.createJob(job_id, report_id, email, marketplace_url)`.

### reportQueue.add Signature

From `src/queue/reportQueue.js`:
```js
reportQueue.add('generate', { job_id, report_id, email, marketplace_url })
```
Queue name is `'generate'` (the job name within the `'report'` queue). The `reportQueue` already has `defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 5000 } }` — do not re-specify these in the route.

### Error Handler Compatibility

`src/middleware/errorHandler.js` already handles Fastify schema validation errors:
```js
if (err.validation) {
  return reply.status(400).send({
    error: 'validation_error',
    message: typeof err.message === 'string' ? err.message : 'Validation error',
  })
}
```
This means schema-driven 400s automatically match the `{ error, message }` shape that AC-1/AC-2 and AC-9 expect. No additional 400 logic needed for schema failures.

### Security Invariants (Non-Negotiable)

These are HARD requirements verified by ATDD and code review:
1. `api_key` must NEVER appear in `queue.add()` payload at any level
2. `api_key` must NEVER appear in any log call (Pino redact config in server.js covers `req.body.api_key` and `*.api_key` — do not add any explicit logging of the api_key value)
3. `keyStore.set()` is called ONLY from this route — no other file calls it
4. Response body never contains the api_key value

### What NOT to Do

- Do NOT add `api_key` to the `queue.add()` payload under any field name
- Do NOT log `api_key` or pass it to `request.log.*`
- Do NOT call `keyStore.set()` from worker, queue, or DB files
- Do NOT use the `uuid` package — use `node:crypto` `randomUUID()`
- Do NOT add extra fields to the 202 response beyond `{ data: { job_id, report_id } }`
- Do NOT create any other route files in this story — only `src/routes/generate.js`
- Do NOT modify `src/queue/keyStore.js`, `src/queue/reportQueue.js`, or `src/db/queries.js`

### No Mirakl Endpoints in This Story

This route does NOT call any Mirakl endpoints (OF21, P11, PRI01). The route only enqueues a BullMQ job; the worker (story 3.7) handles all Mirakl API calls asynchronously. MCP verification is not required for this story.

### Deferred Work to Land in This Story (from Code Review History)

Per `_bmad-output/implementation-artifacts/deferred-work.md` and Epic 3 retrospective:
- **keyStore `set()` input validation** — deferred from Story 2.1 code review: "Guard belongs in Story 4.1 route handler before calling `keyStore.set()`." This story is the designated landing zone. The whitespace-only check above satisfies this.
- This is the **third** deferral of this item. It must land here — do not defer again.

### Test Commands

```bash
# Story ATDD only:
node --test tests/epic4-4.1-post-api-generate.atdd.test.js

# Full suite (all existing tests must remain green):
npm test
```

### Project Structure Notes

- Create: `src/routes/generate.js` (new file)
- Modify: `src/server.js` (add route registration)
- Do NOT modify: `src/queue/keyStore.js`, `src/queue/reportQueue.js`, `src/db/queries.js`, `src/middleware/errorHandler.js`
- The `src/routes/` directory already exists (empty — `ls src/routes/` returns nothing in current main)

### Previous Story Context (3.7 — Worker Orchestration)

Story 3.7 completed the full pipeline worker (`src/workers/reportWorker.js`). That worker now:
- Exports `processJob(job)` which receives `{ job_id, report_id, email, marketplace_url }` from BullMQ job data
- Calls `keyStore.get(job_id)` to retrieve the api_key — the key that THIS route stores
- Cleans up `keyStore.delete(job_id)` in the `finally` block unconditionally

This route (4.1) is the entry point that starts that entire pipeline. The api_key path is:
`POST body → keyStore.set(job_id, api_key)` (this story) → `BullMQ job → worker → keyStore.get(job_id)` (story 3.7)

### Git Context (Recent Commits)

- `b0a7e9d` — Pre-Phase-2 Epic 4: add CSV header exact-match test, log deferred-work gaps
- `84c2b7f` — Epic 4 test design: add ATDD scaffolding for HTTP API Layer stories (added the locked ATDD test file this story must satisfy)
- `ff68e4c` — Commit Epic 3 retrospective document

The ATDD test at `tests/epic4-4.1-post-api-generate.atdd.test.js` was created in commit `84c2b7f` and defines the contract this story must implement.

### NFR Compliance

- **NFR-P1:** `< 2s` — the route does no Mirakl API calls. keyStore.set is in-memory (nanoseconds). db.createJob is a single SQLite insert (< 5ms). queue.add is a BullMQ Redis enqueue (< 50ms on local Redis). Total well under 2s.
- **NFR-R1:** Not directly tested here; reliability of the full pipeline depends on Epic 3 stories which are complete.

### References

- [Source: epics-distillate.md §HTTP API Routes] — POST /api/generate exact spec
- [Source: epics-distillate.md §API Key Security] — keyStore.set only in generate route, never in queue payload
- [Source: epics-distillate.md §Epic 4 AC 4.1] — compressed acceptance criteria
- [Source: tests/epic4-4.1-post-api-generate.atdd.test.js] — pre-existing locked ATDD contract (AC-1 through AC-10)
- [Source: src/queue/keyStore.js] — keyStore interface (set/get/has/delete)
- [Source: src/queue/reportQueue.js] — reportQueue.add signature
- [Source: src/db/queries.js] — createJob signature
- [Source: src/middleware/errorHandler.js] — 400 shape from schema validation errors
- [Source: src/server.js] — Fastify instance setup, plugin registration pattern
- [Source: _bmad-output/implementation-artifacts/deferred-work.md] — keyStore set() validation deferred from Story 2.1
- [Source: _bmad-output/implementation-artifacts/epic-3-retro-2026-04-19.md] — keyStore validation AC must land in 4.1

---

## Dev Agent Record

### Agent Model Used

_to be filled by dev agent_

### Debug Log References

_to be filled by dev agent_

### Completion Notes List

_to be filled by dev agent_

### File List

_to be filled by dev agent_

### Change Log

- 2026-04-19: Story 4.1 spec created — create-story workflow, comprehensive developer guide.
