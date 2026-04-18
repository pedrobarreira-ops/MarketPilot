# Story 3.1: Mirakl API Client with Retry

<!-- Endpoints verified against MCP-Verified Endpoint Reference (epics-distillate.md, 2026-04-18). -->

**Epic:** 3 — Report Generation Pipeline
**Story:** 3.1
**Story Key:** 3-1-mirakl-api-client-with-retry
**Status:** in-progress
**Date Created:** 2026-04-18

---

## User Story

As a developer,
I want a centralized Mirakl API client (`src/workers/mirakl/apiClient.js`) that wraps all GET requests with exponential backoff retry logic for 429/5xx responses,
So that all downstream pipeline modules (OF21 catalog fetch, P11 competitor scan) go through a single hardened HTTP wrapper and never implement ad-hoc fetch logic.

**Satisfies:** Epic 3.1 AC — mirAklGet(baseUrl, endpoint, params, apiKey); retry 429/5xx up to 5 times with delays 1s/2s/4s/8s/16s (capped 30s); throws MiraklApiError after exhaustion; apiKey as parameter never module-level; no direct fetch() to Mirakl elsewhere.

---

## Acceptance Criteria

**AC-1: Correct function signature**
- Export `mirAklGet(baseUrl, endpoint, params, apiKey)` — exactly 4 named parameters in that order
- Export `MiraklApiError` class from the same file
- `mirAklGet` is async (returns a Promise)

**AC-2: Exponential backoff retry on 429/5xx**
- Retry on HTTP status 429 and any 5xx (500, 502, 503, 504, etc.)
- Retry delays: attempt 1→1s, 2→2s, 3→4s, 4→8s, 5→16s (never exceed 30s cap)
- Maximum 5 retry attempts (6 total calls: 1 initial + 5 retries)
- Do NOT retry on 4xx (400, 401, 403, 404) — these are thrown immediately
- On success (2xx), return the parsed JSON response body

**AC-3: Throws MiraklApiError after retry exhaustion**
- After all 5 retries are exhausted on 429/5xx, throw `MiraklApiError`
- `MiraklApiError` must have: `.message` (string), and `.status` or `.statusCode` or `.code` (HTTP status)
- Also throw `MiraklApiError` immediately (no retry) for non-retryable 4xx errors

**AC-4: apiKey is a function parameter — never stored at module level**
- `apiKey` must NOT be assigned to any `const/let/var` at module scope
- `apiKey` must NOT be stored as `this.apiKey` or any class property
- `apiClient.js` must NOT import `keyStore` — it receives apiKey as a parameter
- The module is a pure HTTP wrapper; the caller is responsible for key retrieval

**AC-5: No direct fetch() to Mirakl in worker files**
- `src/workers/mirakl/fetchCatalog.js` (Story 3.2) — must not call `fetch()` directly
- `src/workers/mirakl/scanCompetitors.js` (Story 3.3) — must not call `fetch()` directly
- `src/workers/reportWorker.js` — must not call `fetch()` directly
- All Mirakl HTTP calls must go through `mirAklGet()` exclusively

**AC-6: apiKey never logged**
- No log statement in `apiClient.js` may reference `apiKey` or `api_key`
- API key must never be hardcoded in header assignments
- `X-Mirakl-Front-Api-Key` header set dynamically from the `apiKey` parameter

**AC-FUNCTIONAL: HTTP behavior**
- Build the full URL as `baseUrl + endpoint` with `params` serialized as query string
- Pass `X-Mirakl-Front-Api-Key: {apiKey}` as request header
- Return parsed JSON body (via `response.json()`) on success

**Verified by:** `tests/epic3-3.1-api-client.atdd.test.js` (already written — DO NOT MODIFY)

---

## Tasks / Subtasks

- [ ] Task 1: Create `src/workers/mirakl/apiClient.js` (AC: 1, 2, 3, 4, 5, 6)
  - [ ] Define and export `class MiraklApiError extends Error` with `status` property
  - [ ] Define and export `async function mirAklGet(baseUrl, endpoint, params, apiKey)` — exactly 4 params
  - [ ] Build URL: `new URL(baseUrl + endpoint)`, set each entry in `params` via `url.searchParams.set(k, v)`
  - [ ] Set request headers: `{ 'X-Mirakl-Front-Api-Key': apiKey }` — NO `Authorization` header (Mirakl MMP uses its own header)
  - [ ] Implement retry loop with exponential backoff delays `[1000, 2000, 4000, 8000, 16000]` (ms), capped at 30000ms
  - [ ] Retry on `res.status === 429` or `res.status >= 500`
  - [ ] On non-retryable error (4xx other than 429, or retry exhaustion): throw `MiraklApiError`
  - [ ] On success: return `await res.json()`
  - [ ] Implement sleep via `await new Promise(r => setTimeout(r, delay))`
  - [ ] Do NOT import `keyStore` anywhere in this file
  - [ ] Do NOT store `apiKey` at module scope

- [ ] Task 2: Verify ATDD tests pass
  - [ ] `node --test tests/epic3-3.1-api-client.atdd.test.js` — all tests must pass
  - [ ] `npm test` — full suite must pass (no regressions)

---

## Dev Notes

### The ATDD Test File — Read It First

`tests/epic3-3.1-api-client.atdd.test.js` is **already committed**. Read it before writing any code. It stubs `globalThis.fetch` before importing the module, so your implementation must use `globalThis.fetch` (or the global `fetch` — same thing in Node 22).

Key test observations:
- **AC-2 retry test:** Patches `globalThis.fetch` to fail 2 times then succeed. Tests call `mirAklGet` and assert call count ≥ expected. The test does NOT mock `setTimeout` — retries will actually wait. For the test to complete reasonably fast, the delay implementation should use actual ms values from the spec (tests are willing to wait for a few seconds). The test for "all 5 retries fail" will wait up to ~31s total with real delays. This is acceptable; the tests are integration-grade by design.
- **AC-4 static check:** Reads `apiClient.js` source, strips comments, checks for module-level `const/let/var apiKey` assignment pattern — your code must not have this.
- **AC-6 static check:** Reads source and checks no log statement references `apiKey` or `api_key` — so do NOT log any request details that include the key.

### MiraklApiError Implementation

```javascript
export class MiraklApiError extends Error {
  constructor(message, status) {
    super(message)
    this.name = 'MiraklApiError'
    this.status = status   // HTTP status code (e.g. 429, 500)
  }
}
```

The ATDD test checks: `err instanceof MiraklApiError || err.constructor.name === 'MiraklApiError'` — the class name matters.
The test also checks: `caughtErr.status !== undefined || caughtErr.statusCode !== undefined || caughtErr.code !== undefined` — use `.status`.

### mirAklGet Reference Skeleton

```javascript
// src/workers/mirakl/apiClient.js
// Central Mirakl HTTP client. ALL Mirakl GET calls go through mirAklGet().
// apiKey is ALWAYS a function parameter — never stored at module level.

export class MiraklApiError extends Error {
  constructor(message, status) {
    super(message)
    this.name = 'MiraklApiError'
    this.status = status
  }
}

const RETRY_DELAYS_MS = [1000, 2000, 4000, 8000, 16000] // max 30s cap applied per-entry
const MAX_RETRIES = 5

function isRetryable(status) {
  return status === 429 || status >= 500
}

export async function mirAklGet(baseUrl, endpoint, params, apiKey) {
  const url = new URL(baseUrl + endpoint)
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, String(v))
  }

  const headers = { 'X-Mirakl-Front-Api-Key': apiKey }

  let lastStatus
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const res = await fetch(url.toString(), { headers })

    if (res.ok) {
      return res.json()
    }

    lastStatus = res.status

    if (!isRetryable(res.status)) {
      // 4xx non-retryable: fail immediately
      throw new MiraklApiError(`Mirakl API error: HTTP ${res.status}`, res.status)
    }

    if (attempt < MAX_RETRIES) {
      const delay = Math.min(RETRY_DELAYS_MS[attempt], 30000)
      await new Promise(r => setTimeout(r, delay))
    }
  }

  throw new MiraklApiError(`Mirakl API error after ${MAX_RETRIES} retries: HTTP ${lastStatus}`, lastStatus)
}
```

### Correct Header Name for Mirakl MMP

The Mirakl MMP platform uses `X-Mirakl-Front-Api-Key` as the authentication header — NOT `Authorization`. The ATDD test verifies this:
```javascript
// test: 'passes apiKey in X-Mirakl-Front-Api-Key header'
const headerKey = Object.keys(capturedHeaders).find(
  k => k.toLowerCase() === 'x-mirakl-front-api-key'
)
assert.ok(headerKey, 'Request must include X-Mirakl-Front-Api-Key header')
```

Do NOT use `Authorization` — the `scale_test.js` script used `Authorization: API_KEY` which was an earlier prototype pattern. The MCP-verified header is `X-Mirakl-Front-Api-Key`.

### File Location

`src/workers/mirakl/` directory **already exists** (created as part of the project scaffold). The directory is currently empty. Create `apiClient.js` directly inside it:

```
src/workers/mirakl/apiClient.js   ← CREATE THIS
src/workers/mirakl/fetchCatalog.js  ← Story 3.2 (does NOT exist yet)
src/workers/mirakl/scanCompetitors.js ← Story 3.3 (does NOT exist yet)
```

Do NOT create `fetchCatalog.js` or `scanCompetitors.js` — those are future stories.

### What Already Exists — Do NOT Touch

| File | State | Note |
|---|---|---|
| `src/workers/reportWorker.js` | EXISTS — do not modify | Phase stubs for Epic 3 already in place |
| `src/queue/keyStore.js` | EXISTS — do not modify | THE SOLE api_key store |
| `src/queue/reportQueue.js` | EXISTS — do not modify | Queue + redis connection |
| `src/config.js` | EXISTS — do not modify | Env var validation |
| `tests/epic3-3.1-api-client.atdd.test.js` | EXISTS — DO NOT MODIFY | Pre-written ATDD tests |

### No New Dependencies Required

All required functionality uses:
- `fetch` — global in Node.js 22 (no import needed)
- `setTimeout` — global in Node.js 22 (no import needed)
- `URL` — global in Node.js 22 (no import needed)

No `npm install` needed for this story.

### ESM Module Pattern

```javascript
// ESM — no require(), no module.exports
export class MiraklApiError extends Error { ... }
export async function mirAklGet(baseUrl, endpoint, params, apiKey) { ... }
```

`"type": "module"` in `package.json` — use `import/export` throughout.

### Retry Behavior — Exact Spec

| Attempt # | Delay before this attempt | Total wait after failure |
|-----------|--------------------------|--------------------------|
| 1 (initial) | none | — |
| 2 (retry 1) | 1s | 1s |
| 3 (retry 2) | 2s | 3s |
| 4 (retry 3) | 4s | 7s |
| 5 (retry 4) | 8s | 15s |
| 6 (retry 5) | 16s | 31s → throw MiraklApiError |

The delay cap is 30s per delay, not total wait time. `Math.min(RETRY_DELAYS_MS[attempt], 30000)` handles this correctly since 16000 < 30000.

### MCP-Verified Endpoint Details (Authoritative)

For context — `mirAklGet` is a generic wrapper, but these are the two endpoints it will serve:

**OF21** `GET /api/offers`:
- Params: `max=100` (page size), `offset=N` (pagination)
- Active filter applied in caller (Story 3.2): `offers.active === true`
- EAN from: `offers.product_references[].reference` where `reference_type='EAN'`
- Price from: `offers.applicable_pricing.price`
- Total count field: `total_count` (in response root)

**P11** `GET /api/products/offers`:
- Params: `product_ids` (comma-separated EANs, max 100), `channel_codes` (e.g. `WRT_PT_ONLINE`)
- Price to use: `products.offers.total_price` (price+shipping) — NOT `products.offers.price`
- Active filter: `products.offers.active === true`

`mirAklGet` itself is parameter-agnostic — it serializes whatever `params` dict is passed. The filtering logic lives in Stories 3.2 and 3.3.

### pino Logger — Do NOT Use in apiClient.js

`apiClient.js` is a pure HTTP wrapper — it should NOT import `pino` or do any logging. Error context is surfaced via `MiraklApiError`. Callers (Stories 3.2, 3.3) will handle logging at their level.

---

## Architecture Guardrails

| Boundary | Rule |
|---|---|
| `src/workers/mirakl/apiClient.js` | Pure HTTP wrapper — no keyStore, no logging, no business logic |
| `src/workers/mirakl/fetchCatalog.js` | Story 3.2 — must call `mirAklGet`, never `fetch()` directly |
| `src/workers/mirakl/scanCompetitors.js` | Story 3.3 — must call `mirAklGet`, never `fetch()` directly |
| `src/workers/reportWorker.js` | Must NOT call `fetch()` directly |
| `src/queue/keyStore.js` | THE ONLY file holding api_key — apiClient.js must NOT import it |

**Security invariants (non-negotiable):**
1. `apiKey` received as function param — never stored at module scope
2. `apiKey` never appears in any log statement
3. `X-Mirakl-Front-Api-Key` is set dynamically from `apiKey` param — never hardcoded
4. `MiraklApiError` must not expose raw Mirakl response body (message can include status code only)

---

## Previous Story Intelligence

**From Story 2.2 (BullMQ Worker scaffold — done 2026-04-18):**
- `src/workers/reportWorker.js` Phase A–E are stubs: `// Phase A — fetch catalog (Story 3.2)` etc. Story 3.1 does NOT modify `reportWorker.js` — it only creates `apiClient.js`. Story 3.2 will replace the Phase A stub.
- ESM pattern confirmed: `export async function`, `export class`, `import * as`, `import { }` — no CommonJS anywhere
- The `import * as keyStore` namespace pattern is important for reserved-word exports — not relevant here since apiClient does not touch keyStore

**From Epic 2 retrospective (2026-04-18):**
- Pre-written ATDD tests are the contract — implement to pass them exactly as written
- Static source checks (reading file content via `readFileSync`) are part of the ATDD suite — code structure matters, not just runtime behavior
- Budget for 2 code-review passes per story

**From Epic 1 retrospective (2026-04-17):**
- Security architecture held perfectly — zero violations
- ATDD tests already written and committed — never modify them; implement to pass them

**From Story 1.4 (BullMQ + Redis) patterns:**
- Logger pattern for worker files: `import pino from 'pino'` + `const log = pino({ level: config.LOG_LEVEL })` — but apiClient.js should NOT have a logger (pure HTTP wrapper)

---

## Story Dependencies

**This story (3.1) requires:**
- Story 2.2 complete (done) — `src/workers/reportWorker.js` exists with phase stubs
- Story 2.1 complete (done) — `src/queue/keyStore.js` exists (not used by apiClient but used by reportWorker)

**Stories that depend on 3.1:**
- Story 3.2 (OF21 catalog fetch) — will `import { mirAklGet } from './apiClient.js'`
- Story 3.3 (P11 competitor scan) — will `import { mirAklGet, MiraklApiError } from './apiClient.js'`
- All further pipeline stories transitively depend on this

---

## Verification Checklist

After completing all tasks, verify:

- [ ] `src/workers/mirakl/apiClient.js` exists
- [ ] `MiraklApiError` is exported as a named export (class, extends Error, has `.status` property)
- [ ] `mirAklGet` is exported as a named export (async function, exactly 4 params)
- [ ] `mirAklGet` builds URL from `baseUrl + endpoint + params as query string`
- [ ] `mirAklGet` sets `X-Mirakl-Front-Api-Key: apiKey` header
- [ ] Retry logic covers HTTP 429 and all 5xx codes
- [ ] No retry on 4xx (except 429)
- [ ] Delays sequence: 1s, 2s, 4s, 8s, 16s (capped at 30s each)
- [ ] Maximum 5 retries (6 total attempts)
- [ ] After exhaustion: throws `MiraklApiError`
- [ ] `apiKey` is NOT assigned to any module-level `const/let/var`
- [ ] `apiKey` is NOT stored as `this.apiKey` or any property
- [ ] `apiClient.js` does NOT import `keyStore`
- [ ] No log calls referencing `apiKey` or `api_key`
- [ ] `node --test tests/epic3-3.1-api-client.atdd.test.js` — all tests pass
- [ ] `npm test` — full suite passes (no regressions)

---

## Dev Agent Record

### Agent Model Used

_to be filled by dev agent_

### Completion Notes List

_to be filled by dev agent_

### File List

- src/workers/mirakl/apiClient.js (new)
- _bmad-output/implementation-artifacts/3-1-mirakl-api-client-with-retry.md (story file)

### Change Log

- 2026-04-18: Story 3.1 created — Mirakl API client with retry.
