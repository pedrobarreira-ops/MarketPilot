# Story 3.6: Email Dispatch via Resend

**Epic:** 3 — Report Generation Pipeline
**Story:** 3.6
**Story Key:** 3-6-email-dispatch-via-resend
**Status:** ready-for-dev
**Date Created:** 2026-04-18

---

## User Story

As a developer,
I want a `sendReportEmail({ email, reportId, summary })` function in `src/email/sendReportEmail.js` that sends an HTML email via the Resend v4 SDK,
So that the worker orchestration (Story 3.7) can call it after marking the job `complete` to notify the user their report is ready — without email failure affecting job status or report accessibility.

**Satisfies:** Epic 3.6 AC — Resend SDK; correct subject; HTML body with report URL + summary; try/catch (no re-throw); worker marks complete BEFORE email; email failure keeps status `complete`; `RESEND_API_KEY` unset → log warning and return.

---

## Acceptance Criteria

**AC-1: Email subject is exactly `"O teu relatório MarketPilot está pronto"`**
- The string must appear verbatim in the `subject` field passed to `resend.emails.send()`

**AC-2: Email body is HTML and includes report URL and summary**
- The `html` field is set (not `text` only)
- Body includes `${APP_BASE_URL}/report/${reportId}` link
- Body includes summary data (e.g. winning/losing counts per channel)

**AC-3: Wrapped in try/catch — exceptions caught and logged (type only), NOT re-thrown**
- `resend.emails.send()` call is inside `try { ... } catch (err) { ... }`
- Catch block logs `{ error_type: err.constructor.name }` — NOT `err.message`
- Catch block does NOT contain a `throw` statement
- Logging uses the Pino logger (same pattern as rest of codebase)

**AC-4: Worker marks job `complete` BEFORE calling `sendReportEmail`**
- In `src/workers/reportWorker.js`, the call to `updateJobStatus(job_id, 'complete', ...)` appears before the call to `sendReportEmail(...)`
- Verified statically in the ATDD test (index of `'complete'` < index of `sendReportEmail`)

**AC-5: Email failure does not change job status**
- Because `sendReportEmail` does not re-throw and the worker marks complete first, a Resend API error leaves the job at `complete` status
- No additional status update call after `sendReportEmail`

**AC-6: `RESEND_API_KEY` unset → log warning and return (graceful degradation)**
- At module load or function entry, check `process.env.RESEND_API_KEY`
- If not set: `log.warn(...)` and `return` immediately — no Resend SDK call
- `sendReportEmail` must NOT throw in this case
- The function should still accept and tolerate being called with no key set

**AC-7: Uses Resend v4 SDK — no nodemailer, no raw SMTP**
- Imports from `'resend'` package
- Uses `resend.emails.send()` method
- No `nodemailer`, `smtp`, `SMTP` imports

**Verified by:** `tests/epic3-3.6-email-dispatch.atdd.test.js` (pre-existing — DO NOT MODIFY)

---

## Tasks / Subtasks

- [ ] Task 1: Create `src/email/sendReportEmail.js` (AC: 1, 2, 3, 6, 7)
  - [ ] Import `Resend` from `'resend'` and Pino logger from `'pino'`; import `config` from `'../config.js'`
  - [ ] Instantiate `const resend = new Resend(process.env.RESEND_API_KEY)` inside the function (or conditionally at module scope — see note below)
  - [ ] Check `RESEND_API_KEY` early in function: if falsy → `log.warn({ msg: 'RESEND_API_KEY not set — email skipped' })` and `return`
  - [ ] Export `async function sendReportEmail({ email, reportId, summary })` — named export
  - [ ] Build HTML body string with: report URL `${config.APP_BASE_URL}/report/${reportId}` as a clickable link; summary counts (PT winning/losing/uncontested, ES winning/losing/uncontested); keep template simple — no external template engine
  - [ ] Call `await resend.emails.send({ from: 'MarketPilot <no-reply@...>', to: email, subject: 'O teu relatório MarketPilot está pronto', html: htmlBody })`
  - [ ] Wrap the Resend call in `try { ... } catch (err) { log.error({ error_type: err.constructor.name }) }` — do NOT include `err.message`

- [ ] Task 2: Wire `sendReportEmail` call into `src/workers/reportWorker.js` (AC: 4, 5)
  - [ ] Import `sendReportEmail` from `'../email/sendReportEmail.js'`
  - [ ] After Phase D (persist report), call `db.updateJobStatus(job_id, 'complete', 'Relatório pronto!')` (Phase D completion)
  - [ ] THEN call `await sendReportEmail({ email, reportId: report_id, summary: computedSummary })` — fire after marking complete
  - [ ] The `sendReportEmail` call goes OUTSIDE the critical path — no status update after it; any failure is swallowed inside `sendReportEmail`

- [ ] Task 3: Verify ATDD tests pass (AC: all)
  - [ ] Run `node --test tests/epic3-3.6-email-dispatch.atdd.test.js`
  - [ ] All 14 tests pass (7 describe blocks)
  - [ ] No regressions: run `npm test` (all 274+ previously passing tests still pass)

---

## Dev Notes

### Pre-Existing ATDD Contract (DO NOT MODIFY)

`tests/epic3-3.6-email-dispatch.atdd.test.js` is already written and locked. Key behaviors it asserts:

1. **Static source analysis** — tests use `readFileSync` to inspect `src/email/sendReportEmail.js` source code. This means:
   - The subject string must be a literal in the source, not dynamically constructed
   - The `try`/`catch` keywords must appear in the non-comment, non-whitespace lines
   - `err.message` must NOT appear anywhere in the file
   - `RESEND_API_KEY` string must appear in the source
   - `warn` must appear in the source (for the graceful degradation log)
   - `from 'resend'` import must be present

2. **AC-6 runtime test** — the test temporarily deletes `process.env.RESEND_API_KEY` and calls `sendReportEmail(...)` expecting no throw. The ESM module is cached so the function itself must do a runtime check (not just a module-load-time check).

3. **AC-4 ordering** — tested via `indexOf("'complete'") < indexOf('sendReportEmail')` in `reportWorker.js` source. The `'complete'` string literal must appear before `sendReportEmail` call in the file.

### File to Create

`src/email/sendReportEmail.js` — this file does NOT exist yet. The `src/email/` directory exists (created as a stub in a previous story setup, directory is present but empty).

### File to Modify

`src/workers/reportWorker.js` — currently has Phase A implemented; Phases B, C, D, E are stubs/comments. Story 3.6 only adds the Phase E wiring (import + call after `'complete'` status). Phases B, C, D are wired in Story 3.7.

**IMPORTANT:** The worker currently has Phase B–E as comments only. For this story, add the Phase E call after the Phase D comment (which includes marking complete). The actual full orchestration (calling scanCompetitors, computeReport, buildAndPersistReport) is Story 3.7's job. For Story 3.6, the worker only needs the import and the call sequence to satisfy the ATDD ordering test.

**Practical approach for AC-4 ATDD test:** The test checks that `'complete'` appears before `sendReportEmail` in the worker source. This can be satisfied by adding the `sendReportEmail` import at top and a call after the existing Phase D comment that mentions `updateJobStatus('complete')`. The test does NOT require the full orchestration to be wired — it only checks source code order.

### Resend SDK Usage (v4)

```js
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)
await resend.emails.send({
  from: 'MarketPilot <no-reply@marketpilot.pt>',
  to: email,
  subject: 'O teu relatório MarketPilot está pronto',
  html: htmlBody,
})
```

- `resend` package is already in `package.json` dependencies (`"resend": "^4.0.0"`)
- No `npm install` needed
- Do NOT use `resend.emails.create()` — use `.send()`

### From Address

The `from` field must be a verified domain in Resend. For MVP, use `'MarketPilot <no-reply@marketpilot.pt>'` or a placeholder. The ATDD tests do not assert the specific `from` value — any syntactically valid string is acceptable. The real domain will be configured when deploying.

### Logger Pattern

Follows the existing codebase pattern — import Pino, instantiate at module level using `config.LOG_LEVEL`:

```js
import pino from 'pino'
import { config } from '../config.js'

const log = pino({ level: config.LOG_LEVEL })
```

This is the same pattern used in `reportWorker.js`. Do NOT use `console.log`.

### Summary Shape

The `summary` parameter to `sendReportEmail` is the computed summary object from Story 3.4:
```js
{
  pt: { total: N, winning: N, losing: N, uncontested: N },
  es: { total: N, winning: N, losing: N, uncontested: N }
}
```
Access safely with optional chaining (`summary?.pt?.winning ?? 0`) in case it's `undefined` at this pipeline stage.

### Environment Variables and RESEND_API_KEY Guard (Critical)

`src/config.js` already handles `RESEND_API_KEY`:
- `config.RESEND_API_KEY` is `null` when the key is unset OR equals the placeholder `'re_your_key_here'`
- `config.RESEND_API_KEY` is the real key string otherwise

However, `config.js` is an ESM module cached at import time. The ATDD AC-6 runtime test works by:
1. `before()` sets `process.env.RESEND_API_KEY = 'test-resend-key-dummy'` then imports the module
2. AC-6 test deletes `process.env.RESEND_API_KEY` and calls `sendReportEmail(...)`
3. The `config` module is already cached — `config.RESEND_API_KEY` still has `'test-resend-key-dummy'`

**Therefore: the guard MUST check `process.env.RESEND_API_KEY` at runtime (inside the function), NOT `config.RESEND_API_KEY`:**

```js
export async function sendReportEmail({ email, reportId, summary }) {
  if (!process.env.RESEND_API_KEY) {
    log.warn({ msg: 'RESEND_API_KEY not set — email skipped' })
    return
  }
  // ... rest of function
}
```

This satisfies both:
- ATDD static check: `RESEND_API_KEY` string appears in source ✓
- ATDD runtime check: no throw when env var deleted at call time ✓

`APP_BASE_URL` — use `config.APP_BASE_URL` (validated at startup, safe to use from config).

### NFR Compliance

- **NFR-R3:** Email delivery attempted within 5 min of job completion; email failure does not affect job status or report access — satisfied by the try/catch + ordering pattern
- Email is non-blocking after `complete` status is set — the test for AC-5 passes because `sendReportEmail` swallows its own errors

### What NOT to Do

- Do NOT call `updateJobStatus` after `sendReportEmail` — no status changes post-complete
- Do NOT log `err.message` anywhere in `sendReportEmail.js` — log `err.constructor.name` only
- Do NOT use `nodemailer`, `smtp`, `SMTP`, or any library other than `resend`
- Do NOT re-throw inside the catch block
- Do NOT write integration tests that make live Resend API calls — stub only
- Do NOT implement Phases B, C, D in the worker (that is Story 3.7)

### Previous Story Context (3.5)

Story 3.5 created `src/workers/scoring/buildReport.js` with `buildAndPersistReport()` and refactored `insertReport` in `queries.js`. The `src/email/` directory was part of the project structure from the beginning (defined in architecture) but `sendReportEmail.js` was deferred to this story.

### Test Command

```bash
node --test tests/epic3-3.6-email-dispatch.atdd.test.js
```

After wiring into the worker, also run:
```bash
npm test
```
(Currently runs 274+ tests across all story ATDD files; must remain green.)

### Project Structure Notes

- `src/email/sendReportEmail.js` — new file, matches architecture spec exactly
- `src/workers/reportWorker.js` — existing file, add import + Phase E call only
- No new directories needed — `src/email/` exists
- No new dependencies needed — `resend` is already in `package.json`

### References

- [Source: _bmad-output/planning-artifacts/epics-distillate.md §Email] — `sendReportEmail` spec, subject, try/catch, graceful degradation, ordering requirement
- [Source: _bmad-output/planning-artifacts/architecture-distillate.md §Email] — `src/email/sendReportEmail.js` path, Resend v4, non-blocking, HTML template inline
- [Source: _bmad-output/planning-artifacts/architecture-distillate.md §Job Worker: 6 Phases] — Phase E (email) comes after Phase D (persist + mark complete)
- [Source: tests/epic3-3.6-email-dispatch.atdd.test.js] — pre-existing locked ATDD contract, all 7 AC test groups

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

### File List
