# Deferred Work

Items deferred during code review. Each entry includes the review date and source story.

---

## Deferred from: code review of 1-1-project-scaffold (2026-04-16)

- **Add `test` script and test runner setup** — scaffold only per spec; runner decision belongs to first testing story in Epic 1.
- **Add lint/format scripts (ESLint + Prettier)** — project-level tooling decision, not scaffold-scope.
- **SQLITE_PATH directory writability pre-check** [src/config.js:24] — better-sqlite3 errors with clear SQLITE_CANTOPEN at runtime; fail-fast is nice-to-have.
- **NODE_ENV unknown-value warning** [src/config.js:20] — defensive check; not spec-required.
- **CTA_URL placeholder guard at deploy time** [public/js/report.js:4] — launch-checklist concern per UX-DR15.
- **Add `license` field to package.json** — add before any public release.
- **Strict Node version enforcement** (preinstall hook or `engine-strict=true` in .npmrc) [package.json] — `engines` is advisory but acceptable for internal scaffold.
- **Run `npm audit` on committed package-lock.json** — ops housekeeping; verify no transitive vulnerabilities before deploy.

## Deferred from: code review of 1-2-fastify-server-with-log-redaction (2026-04-17)

- **No SIGTERM/SIGINT handler for graceful shutdown** [src/server.js] — on Coolify/Docker `docker stop` sends SIGTERM; without a handler in-flight requests may be dropped. Out of scope for Story 1.2; address in Story 1.5 (Docker/Coolify deployment config).
- **No test for missing static file returning 404** [tests/server.atdd.test.js] — `@fastify/static` default 404 for missing files is not explicitly tested. Low priority; add to integration test suite in a later story.
- **`fastify.log.error(err)` on listen failure passes full error object** [src/server.js:61] — low-probability leak if startup error carries sensitive content; consider logging only `err.code`/`err.constructor.name`/`err.message` explicitly once startup error classes are known.
- **Exported `fastify` from `server.js` is side-effectful** [src/server.js:66] — top-level `await fastify.listen()` means importing the exported instance binds a port; current tests avoid via `buildApp()`. Pattern matches spec; revisit when a future story needs to import the instance without starting the server.
- **`errorApp` before() block duplicates `buildApp()` boilerplate** [tests/server.atdd.test.js:195-238] — DRY violation; `buildApp()` could accept a routes-setup callback. No correctness impact; refactor in a future test maintenance pass.
- **Missing `public/` dir causes unhandled rejection at container start** [src/server.js:37-40] — `@fastify/static` plugin registration runs at module-eval time via top-level ESM await, bypassing the `try/catch` around `listen()`. Add a `fs.existsSync(PUBLIC_DIR)` pre-check or handle in Docker build to ensure `public/` is always present.

## Deferred from: code review of 2-1-keystore-module (2026-04-17)

- **`set()` accepts `undefined`/`null` jobId silently** [src/queue/keyStore.js:16] — pre-existing design choice; spec reference implementation omits guards. Caller responsibility; guard belongs in Story 4.1 route handler before calling `keyStore.set()`.
- **`set()` accepts falsy/null apiKey silently** [src/queue/keyStore.js:16] — pre-existing design choice; no AC requires validation. Guard belongs in Story 4.1 route handler (validate api_key is a non-empty string before `keyStore.set()`).

## Deferred from: code review of 3-1-mirakl-api-client-with-retry (2026-04-18)

- **No request timeout / AbortController on fetch** [src/workers/mirakl/apiClient.js:36] — a hung Mirakl response will block the worker indefinitely; story AC does not require it. Add a configurable timeout (e.g. 30s) via `AbortController` once report-worker SLOs are defined (Epic 3 follow-up).
- **`apiKey = undefined/null` silently sent as header value** [src/workers/mirakl/apiClient.js:29] — no input validation. `keyStore` contract currently guarantees non-null via Story 2.1, so deferred. Worth a 1-line invariant check if apiClient is ever reused outside the report pipeline.
- **`res.json()` SyntaxError on malformed body escapes unwrapped** [src/workers/mirakl/apiClient.js:52] — a 2xx response with invalid JSON currently throws a raw `SyntaxError` instead of `MiraklApiError`, and is not retried. Mirakl production always returns JSON, so low priority. Consider wrapping `res.json()` in try/catch and throwing `MiraklApiError(503)` to give callers a uniform error type.

## Deferred from: code review of 3-2-of21-catalog-fetch-with-pagination (2026-04-18)

- **EAN strategy 3 false positive** [src/workers/mirakl/scanCompetitors.js:46] — `resolveEanForProduct` returns `batchEans[0]` for single-EAN batches even if the returned product has no matching reference; accepted trade-off from scale_test.js design; could misattribute competitor prices in pathological cases.
- **Nullable applicable_pricing.price** [src/workers/mirakl/fetchCatalog.js:117] — `offer.applicable_pricing?.price` can be undefined if the field is absent; downstream scoring must handle gracefully; inherent OF21 API risk.
- **Progress counter overshoot** [src/workers/mirakl/scanCompetitors.js:147] — when multiple concurrent batches complete in the same event loop tick, `processed` can jump by CONCURRENCY×BATCH_SIZE, skipping the PROGRESS_INTERVAL threshold; cosmetic impact on job status message frequency only.
- **Memory unbounded for large catalogs** [src/workers/mirakl/fetchCatalog.js:45] — `allOffers` array grows unbounded; no streaming or chunking; acceptable for MVP scale (Worten catalog ~31k products); revisit if catalog exceeds ~500k.
- **Job status race on BullMQ retry** [src/workers/reportWorker.js] — if `db.updateJobStatus()` throws inside `onProgress`, the exception propagates and aborts `fetchCatalog`; BullMQ retry then re-runs from page 1; not caused by this story; pre-existing worker resilience gap.

## Deferred from: CI workflow rollout + Story 3.4 merge (2026-04-18)

- **`tests/worker-key-lifecycle.atdd.test.js` regression** — PR #38 added `import * as db from '../db/queries.js'` to `src/workers/reportWorker.js`, which transitively imports `src/db/database.js`. database.js opens the SQLite file at module-load time. Importing `processJob` in this test now triggers a DB open that fails when the test DB directory/path doesn't exist (Windows `/tmp` missing; Linux CI "no such table: reports" because migrations haven't been applied). Proper fix: either (a) lazy-import `db` inside `processJob`, (b) add a test-level `before()` that creates the test DB dir + runs migrations, or (c) make `database.js` tolerant of missing path (create dir / emit clearer error). Temporary mitigation: `npm test` currently excludes this file; `npm run test:all` includes it for diagnostic use. Should be resolved before Story 3.7 (Worker Orchestration) starts since 3.7 will stitch the same worker to a real pipeline.
- **Pre-emptive ATDD tests for unimplemented stories fail `npm test`** — `tests/epic3-3.5-report-persistence.atdd.test.js`, `tests/epic3-3.6-email-dispatch.atdd.test.js`, `tests/epic3-3.7-worker-orchestration.atdd.test.js` were generated by BAD's Phase 1 Epic-Start Test Design (commit 69f0ae5) before their stories were implemented. By design in ATDD-first, they're red until the story lands. To keep CI green: `npm test` currently uses an explicit file list (green tests only); `npm run test:all` runs the full `tests/**/*.test.js` glob including pending red tests. When Story 3.X is merged, add its test file(s) to the `npm test` list in package.json.
- **Proper CI test setup (long-term)** — current `npm test` file list is a manual allowlist and will drift as stories land. When the worker-key-lifecycle issue above is fixed (DB test setup works), revisit the glob to just `tests/**/*.test.js` and let story tests skip themselves when their implementation file is missing (or add a `before()` hook to each pre-emptive file that `test.skip()`s if the impl module can't be imported).

## Deferred from: code review of 3-7-full-worker-orchestration-and-phase-updates (2026-04-19)

- **Email-send failure overwrites completed-report status** [src/workers/reportWorker.js:84-88] — the `await cachedEmailModule.sendReportEmail(...)` call sits inside the main try block, so any unexpected throw (e.g. dynamic-import failure, or a future regression in `sendReportEmail`) would trip the generic catch and overwrite a successful `'complete'` status with `'error'`, even though the report was already persisted and retrievable via `/api/reports/:id`. Low likelihood in practice because `sendReportEmail` is documented as never-throwing (Story 3.6) and internally swallows all Resend / transport errors. Defer: wrap the Phase E email dispatch in its own try/catch that logs-but-does-not-propagate as a hardening task alongside the future CI refresh. No active AC requires it.
- **Catch block intentionally does not re-throw → BullMQ retry policy inactive for pipeline errors** [src/workers/reportWorker.js:89-93] — per spec Dev Notes ("Do NOT re-throw in the catch block — job status is set to error; BullMQ handles retry separately") the worker marks the DB row `status='error'` and returns successfully, so BullMQ treats the job as completed and no automatic retry fires. NFR-R1's "3-retry exponential backoff" is therefore a documented capability rather than an active behavior for application-level failures (transport-level retries still occur inside `mirAklGet`). Revisit when the retry policy is actually needed, e.g. an ops dashboard / re-queue button; at that point either re-throw selected error classes or add an explicit `job.retry()` path.

## Deferred from: Epic 4 Test Design pre-Phase-2 review (2026-04-19)

### Pino redact config drift risk (Story 4.1)
**Gap**: ATDD test for POST /api/generate mocks log output, so a wrong/missing pino redact config does not fail tests but leaks `api_key` at runtime.
**Spec reference**: Story 1.2 Fastify pino config — paths `['req.headers.authorization', 'req.body.api_key', '*.api_key', '*.Authorization']`, censor `'[REDACTED]'`.
**Why deferred**: Not test-enforced; relying on dev briefing + code review to catch drift. Worth a follow-up runtime invariant check (e.g. an integration test that submits a real request and asserts redacted log lines).

### keyStore validation — defensive null/whitespace handling (Story 4.1)
**Gap**: ATDD test covers empty-string api_key. Whitespace-only and null `api_key` values are not test-enforced.
**Why deferred**: Low-risk (existing validation likely handles these via Fastify schema), but defensive handling should be added even where not test-enforced.
**Action**: Story 4.1 dev should `.trim()` before length-checking and reject `null`/`undefined` explicitly.

## Deferred from: PR #44 review (2026-04-19)

### Email trimming not implemented on POST /api/generate (Story 4.1)
**Gap**: PR #44 body claims "leading/trailing whitespace on email/api_key" is trimmed, but only `api_key` is trimmed in [src/routes/generate.js]. Email is passed through untouched to `db.createJob` and the queue payload.
**Why deferred**: No AC mandates email trimming; Fastify's `format: 'email'` schema will reject most whitespace-wrapped emails anyway. Low-risk cosmetic fix.
**Action**: Add `.trim()` on `email` alongside the existing `api_key` trim before calling `keyStore.set` / `db.createJob`.

### No behavioral test for `reportQueue.add()` rejection (Story 4.1)
**Gap**: PR body advertises "enqueue failure → key cleared (orphan/rollback tested)" but no test in `tests/epic4-4.1-post-api-generate.additional.test.js` simulates `queue.add` throwing and asserts that `keyStore.delete(job_id)` ran and `db.updateJobError` was called. Rollback logic at [src/routes/generate.js:70-88] is live code without a failing-path test.
**Why deferred**: Happy-path coverage is strong (96% behavioral); error-path coverage is the known weak spot. Not a correctness regression — the rollback code is present — but a silent-failure risk if someone refactors it later.
**Action**: Add an `additional.test.js` case that mocks `reportQueue.add` to reject, calls the route, asserts `keyStore` entry is gone and job row status is `error`.

### No behavioral test for `db.createJob()` failure path (Story 4.1)
**Gap**: PR body claims "DB insert failure (orphan job cleaned up)" is tested. Route ordering (DB insert before keyStore.set / enqueue) makes orphans impossible by construction — but no test covers what happens when `db.createJob` throws (constraint violation, disk full, locked DB). A future refactor that reorders these calls would silently introduce an orphan without this test catching it.
**Why deferred**: Current ordering is safe; the absent test is insurance against regression, not a present bug.
**Action**: Add an `additional.test.js` case that mocks `db.createJob` to throw and asserts the route returns 5xx without calling `keyStore.set` or `reportQueue.add`.

### No assertion that error paths never leak `api_key` or `err.message` into logs (Story 4.1)
**Gap**: Log redaction tests cover `req.body.api_key`, top-level `api_key`, nested `*.api_key`, and `Authorization` header. They do not assert that error-path log lines (e.g. the rollback catch at [src/routes/generate.js:70-88], or any `fastify.log.error(err)` call) never include `err.message` content that might echo the api_key value back (e.g. from a Mirakl-side validation error surfaced through the queue layer).
**Why deferred**: Relies on pino redact config + caller discipline (logging structured fields, not err.message). No current code path is known to leak, so this is a defense-in-depth test.
**Action**: Add an `additional.test.js` case that triggers an error path with a mock that throws an `Error(<api_key value>)` and asserts no log line contains the api_key.
