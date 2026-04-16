---
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8]
inputDocuments:
  - "_bmad-output/planning-artifacts/prd.md"
  - "RESEARCH.md"
  - "scripts/scale_test.js"
  - "scripts/opportunity_report.js"
workflowType: 'architecture'
project_name: 'MarketPilot Free Report'
user_name: 'Pedro'
date: '2026-04-15'
status: 'complete'
completedAt: '2026-04-15'
---

# Architecture Decision Document — MarketPilot Free Report

**Author:** Pedro
**Date:** 2026-04-15
**Status:** Complete — ready for implementation

---

## Project Context Analysis

### Requirements Overview

**Functional Requirements Summary**

29 FRs across 5 categories:

| Category | FRs | Architectural Implication |
|---|---|---|
| Report Generation | FR1–FR8 | Async job pipeline: OF21 → P11 → scoring → persist |
| Report Presentation | FR9–FR13 | Static HTML + client-side JSON rendering; 3-section layout |
| Report Access & Delivery | FR14–FR17 | UUID-based persistent URLs; 48h TTL; email via transactional provider |
| Trust & Credential Security | FR18–FR21 | In-memory key store only; log redaction; never in DB or queue |
| Error Handling & Recovery | FR22–FR25 | Graceful error surfaces; cleanup on all code paths |
| Data Governance | FR26–FR29 | TTL deletion; no report index/listing; per-report isolation |

**Non-Functional Requirements — Architectural Drivers**

| NFR | Requirement | Design Response |
|---|---|---|
| NFR-P1 | Form → job enqueued + report_id returned: < 2s | Async enqueue only; no blocking API calls at submission |
| NFR-P2/P3 | 5k SKUs < 3 min; 31k SKUs < 10 min | 10 concurrent P11 batches (validated in scale_test.js: 31k in ~5 min) |
| NFR-S1 | HTTPS only; reject plaintext | TLS via Coolify/Traefik; Fastify trust proxy on |
| NFR-S2 | API key never in log, DB, queue, background context | In-memory Map (never serialised); BullMQ job data excludes key |
| NFR-S4 | Redact `Authorization` header and `api_key` field in logs | Pino redact config on Fastify logger |
| NFR-R1 | ≥ 98% success for valid keys | Retry with exponential backoff on Mirakl 429/5xx |
| NFR-R2 | No silent truncation | Assert fetched count vs `total_count`; fail loudly on mismatch |
| NFR-R3 | Email failure ≠ job failure | Email sent after job marked complete; non-blocking |

**Scale & Complexity**

- Complexity: **Medium** — no auth system, no multi-tenancy, no real-time collaboration; core complexity is the Mirakl API pipeline and the API key security constraint
- Expected load: 1–5 concurrent report generations (M$P phase)
- Largest catalog validated: 31,179 products in 173s (OF21) + ~300s (P11 at 10 concurrency) ≈ 8 min total
- Report storage per job: ~1–5 MB (JSON + CSV) — negligible at this scale

**Technical Constraints**

1. Mirakl MMP API only — no MiraklConnect, ever
2. Shop API Key has no read-only scope — full-access key; treat accordingly
3. API key must not survive job completion in any store — in-memory only
4. Both `WRT_PT_ONLINE` and `WRT_ES_ONLINE` from a single OF21 + P11 call
5. P11: 100 EANs per call, `total_price` (not `price`), filter `active: true` only
6. OF21: must assert `total_count` vs fetched count (NFR-R2)

**Cross-Cutting Concerns**

- API key security spans: HTTP layer, job queue, worker, logging
- Error handling spans: all 6 job phases + HTTP routes
- TTL cleanup spans: job completion + cron cleanup
- Progress updates span: worker (emits) + HTTP route (reads) + frontend (polls)

---

## Tech Stack Decision

### Chosen Stack

| Layer | Choice | Version | Justification |
|---|---|---|---|
| Runtime | Node.js | 22 LTS | Pedro's existing expertise; validated in scale_test.js |
| HTTP Server | Fastify | v5 | Pino logger with redact (NFR-S4); JSON schema validation; faster than Express |
| Job Queue | BullMQ | v5 | Redis-backed job persistence (status only — never the API key); concurrency control; retry support |
| Key Store | Node.js `Map` (in-process) | — | API key ephemeral storage; never serialised; cleared after job |
| Database | SQLite via better-sqlite3 | latest | Zero-config; volume-mounted in Docker; correct for 1–5 concurrent reports |
| ORM | Drizzle ORM | v0.30+ | Type-safe queries; works natively with SQLite; minimal abstraction |
| Redis | Redis | 7 Alpine | BullMQ backend; Coolify service; ~50 MB RAM |
| Email | Resend | v4 | Best DX; free tier (3k emails/month); single API call |
| Frontend | Static HTML + Vanilla JS | — | No build step; no bundler; directly editable; M$P simplicity |
| TLS / Reverse Proxy | Traefik via Coolify | — | Already in use; handles HTTPS termination; zero config needed |
| Hosting | Hetzner VPS + Coolify | — | Already running another project there |

### Why NOT alternatives

| Alternative | Rejected Because |
|---|---|
| Express | No built-in log redact; slower; no schema validation |
| Next.js | Overkill for a form + report page; build step; more moving parts |
| BullMQ in-memory only | Job status lost on process restart; harder retry logic |
| PostgreSQL | Adds a DB server to manage; SQLite is sufficient at this scale |
| SendGrid / Postmark | Resend has better DX and free tier; any would work |
| WebSocket for progress | SSE or polling is simpler; no bidirectional comms needed |

---

## System Component Diagram

```
┌──────────────────────────────────────────────────────────────────────┐
│  BROWSER (Seller)                                                    │
│                                                                      │
│  [index.html]          [progress.html]         [report.html]        │
│  Form: api_key + email  Polls /api/jobs/:id    Fetches /api/reports  │
│        │                      │                        │             │
└────────┼──────────────────────┼────────────────────────┼─────────────┘
         │ HTTPS POST           │ HTTPS GET (poll 2s)    │ HTTPS GET
         ▼                      ▼                        ▼
┌──────────────────────────────────────────────────────────────────────┐
│  FASTIFY WEB SERVER                                                  │
│                                                                      │
│  POST /api/generate          GET /api/jobs/:job_id                  │
│    1. Validate inputs           Returns: { status, phase, message }  │
│    2. Generate job_id+report_id                                      │
│    3. apiKeyStore.set(job_id, api_key)   ← ONLY memory store        │
│    4. Enqueue BullMQ job (no api_key)    GET /api/reports/:report_id │
│    5. Insert SQLite job record           Returns: report JSON         │
│    6. Return { job_id, report_id }                                   │
│                                          GET /api/reports/:id/csv    │
│  Pino logger: redact api_key + Authorization header                  │
│                                                                      │
│  Static file handler → /public/** (HTML, CSS, JS)                   │
│  Route: GET /report/:report_id → serves /public/report.html         │
└────────────────────────┬─────────────────────────────────────────────┘
                         │ BullMQ enqueue (job_id, report_id, email,
                         │                marketplace_url) — NO api_key
                         ▼
┌──────────────────────────────────────────────────────────────────────┐
│  REDIS (BullMQ backend — Coolify service)                            │
│                                                                      │
│  Stores: job metadata (job_id, status, retries)                     │
│  NEVER stores: api_key (not in job data, not in logs)               │
└────────────────────────┬─────────────────────────────────────────────┘
                         │ Worker picks up job
                         ▼
┌──────────────────────────────────────────────────────────────────────┐
│  BULLMQ WORKER (same Node.js process — separate worker thread)      │
│                                                                      │
│  1. Pull api_key = apiKeyStore.get(job_id)   ← from memory Map      │
│  2. If !apiKey → fail job ("key expired, please resubmit")          │
│  3. Update SQLite: status = 'fetching_catalog'                       │
│  4. OF21: paginate all offers; assert total_count                    │
│  5. Update SQLite: status = 'scanning_competitors'                   │
│  6. P11: batch 100 EANs, 10 concurrent; filter active; total_price  │
│  7. Update SQLite: status = 'building_report'                        │
│  8. Score: WOW score + Quick Wins per channel (PT + ES)             │
│  9. Persist: INSERT report row in SQLite (JSON + CSV)               │
│  10. Send email via Resend (non-blocking)                            │
│  11. Update SQLite: status = 'complete'                              │
│  12. apiKeyStore.delete(job_id)   ← KEY WIPED                        │
│                                                                      │
│  On ANY error:                                                       │
│    - apiKeyStore.delete(job_id)   ← KEY WIPED ON FAILURE TOO        │
│    - Update SQLite: status = 'error', error_message = <safe message>│
└────────────────────────┬─────────────────────────────────────────────┘
                         │ Reads/writes
                         ▼
┌──────────────────────────────────────────────────────────────────────┐
│  SQLITE DATABASE (Docker volume)                                     │
│                                                                      │
│  generation_jobs table:                                              │
│    job_id, report_id, status, phase_message, email,                 │
│    marketplace_url, created_at, completed_at, error_message         │
│    — NO api_key column, ever                                         │
│                                                                      │
│  reports table:                                                      │
│    report_id, generated_at, expires_at (now+48h), email,           │
│    summary_json, opportunities_pt_json, opportunities_es_json,      │
│    quickwins_pt_json, quickwins_es_json, csv_data                   │
│                                                                      │
│  CRON (node-cron, every hour):                                       │
│    DELETE FROM reports WHERE expires_at < unixepoch()               │
└──────────────────────────────────────────────────────────────────────┘
                                       │ On job complete
                                       ▼
                              ┌────────────────┐
                              │  RESEND EMAIL  │
                              │  (non-blocking)│
                              │  Report link   │
                              │  + summary     │
                              └────────────────┘
```

---

## Data Flow: Form Submission → Report Rendered

### Happy Path (complete flow)

```
STEP 1 — Form Submission
  Browser: POST /api/generate
    body: { api_key: "xxxxx", email: "seller@example.com" }

STEP 2 — Immediate Response (< 2s, NFR-P1)
  Server:
    - Validate: api_key non-empty, email valid format
    - job_id = randomUUID()
    - report_id = randomUUID()
    - apiKeyStore.set(job_id, api_key)  ← memory only
    - BullMQ.add('report', { job_id, report_id, email, marketplace_url: 'https://marketplace.worten.pt' })
    - db.insert(generation_jobs, { job_id, report_id, status: 'queued', email, ... })
    - Response: 202 { job_id, report_id }

STEP 3 — Progress Screen
  Browser redirects to: /progress?job_id={job_id}&report_id={report_id}
  Page immediately shows: "Report URL (save this): https://app.domain.com/report/{report_id}"
  Every 2 seconds: GET /api/jobs/{job_id}
    → Returns: { status: 'fetching_catalog', phase_message: 'A obter catálogo... (2,400 / 31,179)' }

STEP 4 — Worker Execution (background)
  Phase A — fetching_catalog:
    - apiKeyStore.get(job_id) → api_key
    - OF21 pagination loop (100 per page, ~312 pages for 31k catalog)
    - Every 1,000 offers: update SQLite phase_message with progress count
    - Assert: fetched.length === total_count (fail loudly if mismatch)
    - Collect: [{ ean, shop_sku, price, product_title }]

  Phase B — scanning_competitors:
    - Batch EANs into groups of 100
    - 10 concurrent P11 calls per batch window
    - Filter: active: true only
    - Extract: total_price per channel (WRT_PT_ONLINE, WRT_ES_ONLINE)
    - Every 500 EANs: update SQLite phase_message with progress
    - Collect: { [ean]: { pt: { first, second }, es: { first, second } } }

  Phase C — building_report:
    - For each product × channel where my_price > competitor_total_price[0]:
        gap = my_price - competitor_total_price[0]
        gap_pct = gap / competitor_total_price[0]
        wow_score = my_price / gap_pct
        is_quick_win = gap_pct <= 0.02
    - Sort Biggest Opportunities by wow_score DESC
    - Filter Quick Wins (gap_pct <= 0.02)
    - Compute Your Position counts (winning / losing / uncontested) per channel

  Phase D — persisting:
    - INSERT reports row:
        report_id, expires_at = now + 172800 (48h in seconds)
        summary_json, opportunities_pt_json, opportunities_es_json
        quickwins_pt_json, quickwins_es_json, csv_data
    - UPDATE generation_jobs: status = 'complete', completed_at = now

  Phase E — email:
    - resend.emails.send({ to: email, subject: '...', html: ... })
    - Non-blocking: job completion does NOT wait for email confirm

  Phase F — cleanup:
    - apiKeyStore.delete(job_id)   ← KEY IS GONE

STEP 5 — Frontend Detects Completion
  Polling returns: { status: 'complete' }
  Browser: window.location.href = '/report/{report_id}'

STEP 6 — Report Page
  GET /report/{report_id} → serves static report.html
  report.html script: fetch('/api/reports/{report_id}')
  Renders:
    - Your Position (PT + ES headline stats)
    - Biggest Opportunities table (WOW score sorted, both channels)
    - Quick Wins table (both channels)
    - "Download Full CSV" button
    - "Start automating this" CTA
```

### Error Paths

```
Invalid/suspended key (empty OF21 response):
  Worker: fetched 0 offers AND total_count = 0 OR 401/403 response
  → apiKeyStore.delete(job_id)
  → UPDATE generation_jobs: status = 'error',
      error_message = 'Não foi possível obter o teu catálogo. Verifica se a chave está correcta e se a tua conta está activa no Worten.'
  → Browser polling: status = 'error' → shows error message + "contacta-nos"

total_count mismatch (OF21 truncation):
  Worker: fetched 5,200 but total_count = 31,179
  → apiKeyStore.delete(job_id)
  → Fail job with explicit error: "Catálogo obtido parcialmente. Tenta novamente."
  → (This is the NFR-R2 loud failure — no silent partial report)

P11 rate limit (HTTP 429):
  Worker: exponential backoff (1s, 2s, 4s, max 30s), up to 5 retries per batch
  → If batch recovers: continue
  → If batch exhausted: mark that batch as failed, continue with rest (partial competitor data is better than no report)
  → Update phase_message to reassure user: 'A verificar concorrentes — a aguardar rate limit...'

Process crash mid-job:
  - API key lost from memory (acceptable — seller re-submits)
  - BullMQ re-queues job (retries: 3 configured)
  - Worker pulls api_key from store → not found → fail job gracefully
  - User sees error: "A sessão expirou. Por favor, submete o formulário novamente."
```

---

## API Key Security Architecture

### The Constraint

The Shop API Key must **never** be written to any persistent store, log entry, database record, job queue payload, or background processing context. It lives only in process memory, keyed to the job ID, and is deleted on completion or error.

### Implementation Pattern

```javascript
// src/queue/keyStore.js
// In-memory Map — never serialised, never logged
const _store = new Map()

export const keyStore = {
  set: (jobId, apiKey) => _store.set(jobId, apiKey),
  get: (jobId) => _store.get(jobId),
  delete: (jobId) => _store.delete(jobId),
  has: (jobId) => _store.has(jobId),
}
```

```javascript
// src/routes/generate.js — POST /api/generate
// api_key is read from body, stored in keyStore, NEVER forwarded elsewhere
const { api_key, email } = req.body
const jobId = randomUUID()
const reportId = randomUUID()

keyStore.set(jobId, api_key)         // ← only storage location

await reportQueue.add('generate', {   // ← BullMQ job data: NO api_key
  job_id: jobId,
  report_id: reportId,
  email,
  marketplace_url: 'https://marketplace.worten.pt',
})

// req.body.api_key is not logged (Pino redact strips it)
// api_key goes out of scope here — GC eligible
```

```javascript
// src/workers/reportWorker.js — BullMQ Worker
worker.process(async (job) => {
  const { job_id, report_id, email, marketplace_url } = job.data

  const apiKey = keyStore.get(job_id)   // ← pull from memory
  if (!apiKey) {
    throw new Error('API key expired — user must resubmit')
  }

  try {
    // ... all Mirakl calls use apiKey in Authorization header ...
    await runReportPipeline({ job_id, report_id, email, marketplace_url, apiKey })
  } finally {
    keyStore.delete(job_id)  // ← ALWAYS cleared — success OR failure
  }
})
```

### Log Redaction (NFR-S4)

```javascript
// src/server.js — Fastify setup
const fastify = Fastify({
  logger: {
    level: 'info',
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
  trustProxy: true,  // Needed behind Traefik for correct client IP
})
```

### HTTPS Enforcement (NFR-S1)

TLS is terminated by Traefik (Coolify's reverse proxy). The Fastify application listens on HTTP internally (within Docker network), but all external traffic is HTTPS-only via Traefik configuration. No plaintext HTTP is reachable from the internet.

Fastify is configured with `trustProxy: true` — Traefik sets `X-Forwarded-Proto: https` on all inbound requests. If a non-HTTPS request somehow reaches Fastify directly (only possible from within the VPS), it would lack this header and can be rejected in middleware if needed.

### What Happens If the Process Restarts Mid-Job?

The API key is in process memory. If the Node.js process crashes while a job is in flight:
- The API key is gone from the Map
- BullMQ retries the job (configured: 3 retries)
- The worker pulls `keyStore.get(job_id)` → `undefined`
- The worker fails the job gracefully with: `"A sessão expirou. Por favor, submete o formulário novamente."`
- The job_id and report_id remain in SQLite for debugging
- The seller sees the error message and re-submits

**This is acceptable.** The PRD explicitly states: "if the job process crashes mid-execution, the key is lost — this is acceptable; the seller re-enters it." The guarantee is not that jobs never fail — it is that the key is never stored, and a crash is far safer than persistence.

---

## Report Storage and TTL Deletion

### SQLite Schema

```sql
-- src/db/schema.js (Drizzle definitions)

CREATE TABLE generation_jobs (
  job_id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
    -- values: 'queued' | 'fetching_catalog' | 'scanning_competitors' |
    --         'building_report' | 'complete' | 'error'
  phase_message TEXT,       -- human-readable progress text for frontend polling
  email TEXT NOT NULL,
  marketplace_url TEXT NOT NULL,
  created_at INTEGER NOT NULL,  -- Unix timestamp
  completed_at INTEGER,
  error_message TEXT
  -- NO api_key column
);

CREATE TABLE reports (
  report_id TEXT PRIMARY KEY,
  generated_at INTEGER NOT NULL,   -- Unix timestamp
  expires_at INTEGER NOT NULL,     -- generated_at + 172800 (48h)
  email TEXT NOT NULL,             -- retained for sales follow-up (disclosed on form)
  summary_json TEXT NOT NULL,      -- { pt: { total, winning, losing, uncontested }, es: {...} }
  opportunities_pt_json TEXT,      -- sorted by WOW score DESC (all not-in-1st-place products for PT)
  opportunities_es_json TEXT,      -- same for ES
  quickwins_pt_json TEXT,          -- gap_pct <= 0.02 for PT
  quickwins_es_json TEXT,          -- same for ES
  csv_data TEXT                    -- full catalog analysis CSV string
);

CREATE INDEX idx_reports_expires_at ON reports(expires_at);
```

### TTL Deletion

```javascript
// src/cleanup/expiredReports.js
import cron from 'node-cron'
import { db } from '../db/database.js'

// Run every hour
cron.schedule('0 * * * *', () => {
  const now = Math.floor(Date.now() / 1000)
  const deleted = db
    .prepare('DELETE FROM reports WHERE expires_at < ?')
    .run(now)
  if (deleted.changes > 0) {
    console.log(`[cleanup] Deleted ${deleted.changes} expired report(s)`)
  }
})
```

### Access on Read

```javascript
// src/routes/reports.js — GET /api/reports/:report_id
const now = Math.floor(Date.now() / 1000)
const report = db
  .prepare('SELECT * FROM reports WHERE report_id = ? AND expires_at > ?')
  .get(reportId, now)

if (!report) {
  return reply.status(404).send({
    error: 'Report not found or expired',
    message: 'Este relatório expirou ou não existe. Gera um novo relatório para obteres dados actualizados.'
  })
}
```

The double-check (cron deletion + read-time expiry check) ensures no expired report is ever served, even if the cron ran between cleanup cycles.

---

## Security Architecture: NFR-S1 through NFR-S5

### NFR-S1 — All traffic over HTTPS; HTTP requests redirected

**How satisfied:**
- Coolify deploys the app behind Traefik, which:
  - Obtains a Let's Encrypt TLS certificate automatically
  - Listens on ports 80 and 443 externally
  - Redirects all HTTP (port 80) requests to HTTPS (port 443)
  - Forwards HTTPS traffic to Fastify on port 3000 internally
- Fastify never listens on a public port — only on Docker's internal network
- API key POST body travels only over TLS-encrypted connection

**Verification:** Traefik's `redirections.entryPoint` middleware handles HTTP→HTTPS redirect. This is configured in Coolify's app settings — enable "Force HTTPS".

### NFR-S2 — API key must not appear in any log, DB record, error message, job queue, or background context

**How satisfied:**
- **Database**: No `api_key` column in any table. Enforced by schema — impossible to write it.
- **BullMQ/Redis**: Job data payload is `{ job_id, report_id, email, marketplace_url }` — api_key is never passed to `queue.add()`.
- **Logs**: Pino's `redact` config strips `req.body.api_key` and `req.headers.authorization` before any log write.
- **Error messages**: Worker catches all errors and maps them to safe user-facing messages. Raw Mirakl API responses (which might echo back request headers in error payloads) are never forwarded to the client or logged verbatim.
- **Background context**: Worker receives job data (no api_key) and pulls key from in-memory Map. The Map is never serialised anywhere.

**Code-level enforcement:**
```javascript
// In reportWorker.js — safe error handling
try {
  await runReportPipeline(...)
} catch (err) {
  // Log the error type/code, NOT the full message (which might contain API response details)
  log.error({ job_id, error_code: err.code, error_type: err.constructor.name },
    'Report pipeline failed')
  // Surface safe message to user
  await db.updateJobError(job_id, getSafeErrorMessage(err))
} finally {
  keyStore.delete(job_id)
}
```

### NFR-S3 — Report accessible only via UUID; no index or listing endpoint

**How satisfied:**
- Report IDs are UUID v4 (`crypto.randomUUID()`) — 122 bits of entropy, not guessable
- No `GET /api/reports` listing endpoint exists — the route is not registered
- SQLite has no shared query path between reports — every query filters by `report_id = ?`
- The Fastify route `GET /api/reports/:report_id` returns a single report or 404 — no enumeration possible

### NFR-S4 — `Authorization` header and `api_key` field redacted in logs

**How satisfied:** Pino redact config (shown in the HTTPS section above) handles this at the logger level, before any log is written to stdout/file. This is configured on the Fastify instance, meaning it applies to all routes automatically — there is no per-route opt-in required.

### NFR-S5 — No cross-seller data — reports isolated by report_id

**How satisfied:**
- Every SQLite query that reads report data uses `WHERE report_id = ?` — a single exact match
- There is no JOIN between reports, no shared query path, no aggregation across sellers
- The `generation_jobs` table is only queried by `job_id` (for status polling) — and `job_id` is never shared with the seller (only `report_id` is shown in the URL)
- No caching layer that could cause one seller's response to be served to another

---

## Core Architectural Decisions

### Data Architecture

| Decision | Choice | Rationale |
|---|---|---|
| Database | SQLite (better-sqlite3) | Zero-config; Docker volume; sufficient for 1–5 concurrent; report data is write-once, read-few |
| ORM | Drizzle | Type-safe; native SQLite; minimal magic; easy migrations |
| Report serialisation | JSON columns in SQLite | Avoids schema churn as report shape evolves; simple to query by report_id |
| CSV storage | TEXT column in SQLite | CSV per report is ≤5 MB; avoids filesystem path management |
| TTL deletion | node-cron (hourly) + read-time check | Belt-and-suspenders; no cron library with complex setup needed |

### Authentication & Security

| Decision | Choice | Rationale |
|---|---|---|
| API key storage | In-memory Map (never persisted) | Core trust guarantee; Map is not serialisable; GC-safe |
| Log redaction | Pino built-in redact | Applied at framework level; no per-developer discipline required |
| HTTPS | Traefik TLS termination | Coolify handles it; zero additional code |
| Report access control | UUID v4 in URL (no auth) | 122-bit entropy sufficient for 48h TTL at M$P scale |
| No auth system | Intentional | No user accounts; report_id IS the access token |

### API & Communication

| Decision | Choice | Rationale |
|---|---|---|
| Progress updates | Client polling every 2 seconds | Simpler than SSE/WebSocket; 2s granularity is fine for 2–10 min jobs |
| Job status storage | SQLite `generation_jobs.status` | Worker writes phase transitions; HTTP route reads them; no separate pub/sub needed |
| API response format | `{ data: {...} }` on success; `{ error: string, message: string }` on failure | Consistent shape; easy to handle in vanilla JS |
| Mirakl API calls | Native `fetch()` with retry wrapper | No axios dependency; retry logic is simple and custom |
| P11 concurrency | 10 concurrent calls per batch window | Validated in scale_test.js; matches Mirakl's implied tolerance |

### Frontend Architecture

| Decision | Choice | Rationale |
|---|---|---|
| Rendering | Static HTML + client-side fetch | No build step; no SSR complexity; pages load instantly |
| JS approach | Vanilla JS only | No framework needed for a 3-page app; Pedro can read and modify it directly |
| Form validation | HTML5 required + basic JS | Non-empty API key; valid email format; no server round-trip needed |
| Progress screen | setInterval poll + fetch | Simple; works in all browsers; no SSE required |
| Report rendering | JS DOM manipulation | Tables built from JSON; simpler than a template engine |
| Mobile responsiveness | CSS flexbox + media queries | Report must be readable on phone (Journey 1, Rui) and screen-shared (Journey 4, Pedro) |

### Infrastructure & Deployment

| Decision | Choice | Rationale |
|---|---|---|
| Hosting | Hetzner VPS + Coolify | Already in use for another project; no new vendor |
| Container | Dockerfile (single container) | One container runs Fastify server + BullMQ worker in same process |
| Redis | Coolify-managed Redis service | Lightweight (~50 MB); easy to add; persists BullMQ job metadata |
| SQLite persistence | Docker volume | Survives container restarts; single-file backup |
| Deployment | Coolify app from Git repo | Auto-deploy on push; environment variables managed in Coolify |
| No CI/CD pipeline | Intentional at M$P | Direct Coolify deploy is sufficient for solo dev |

---

## Implementation Patterns & Consistency Rules

### Naming Patterns

**File and directory naming:** `kebab-case` for all files and directories
```
src/routes/generate.js    ✓
src/routes/generateRoute.js   ✗
```

**Function naming:** `camelCase`
```javascript
async function fetchCatalog(apiKey, baseUrl) { ... }    ✓
async function fetch_catalog(api_key, base_url) { ... } ✗
```

**Database column naming:** `snake_case`
```
job_id, report_id, created_at, expires_at    ✓
jobId, reportId, createdAt, expiresAt        ✗
```

**JavaScript variable naming:** `camelCase`; database results may use snake_case directly (don't transform unless necessary)

**API route naming:**
- Resource endpoints: plural nouns (`/api/reports`, `/api/jobs`)
- Report content endpoint: `/api/reports/:report_id`
- CSV download: `/api/reports/:report_id/csv`

### API Response Formats

**Success:**
```json
{ "data": { ... } }
```

**Error:**
```json
{ "error": "technical_error_code", "message": "Human-readable message in Portuguese" }
```

**Job status (polling endpoint):**
```json
{
  "status": "scanning_competitors",
  "phase_message": "A verificar concorrentes (3,200 de 8,400 produtos)…",
  "report_id": "uuid-v4-here"
}
```

### Mirakl API Client Patterns

**All Mirakl calls use this wrapper — no direct `fetch()` calls in worker code:**

```javascript
// src/workers/mirakl/apiClient.js
async function mirAklGet(baseUrl, endpoint, params, apiKey) {
  const url = new URL(baseUrl + endpoint)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)

  const maxRetries = 5
  let delay = 1000

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const res = await fetch(url.toString(), {
      headers: { Authorization: apiKey }  // apiKey NEVER logged — Pino redacts Authorization
    })

    if (res.ok) return res.json()

    if (res.status === 429 || res.status >= 500) {
      if (attempt < maxRetries) {
        await sleep(delay)
        delay = Math.min(delay * 2, 30_000)
        continue
      }
    }

    // Non-retryable error
    throw new MiraklApiError(res.status, await res.text())
  }
}
```

**Concurrency pattern for P11 batches:**
```javascript
// Process batches in windows of 10 concurrent calls
const CONCURRENCY = 10
for (let i = 0; i < batches.length; i += CONCURRENCY) {
  const chunk = batches.slice(i, i + CONCURRENCY)
  const results = await Promise.allSettled(chunk.map(b => fetchP11Batch(b, apiKey, baseUrl)))
  // Handle settled results — log errors, continue with successful ones
}
```

### Error Handling Pattern

**Rule: Never expose raw Mirakl API errors to the user or to logs in their raw form.**

```javascript
// Safe error message mapping
function getSafeErrorMessage(err) {
  if (err instanceof MiraklApiError) {
    if (err.status === 401 || err.status === 403) {
      return 'Chave API inválida ou sem permissão. Verifica se a chave está correcta e se a tua conta está activa.'
    }
    if (err.status === 429) {
      return 'Limite de pedidos atingido. Tenta novamente em alguns minutos.'
    }
  }
  if (err.message?.includes('empty catalog') || err.message?.includes('zero offers')) {
    return 'Não encontrámos ofertas activas no teu catálogo. Verifica se a tua conta está activa no Worten.'
  }
  return 'Erro ao gerar o relatório. Tenta novamente ou contacta-nos se o problema persistir.'
}
```

**Rule: All keyStore.delete() calls go in `finally` blocks — never in try or catch only.**

### Progress Phase Messages

Worker must update `generation_jobs.phase_message` at each of these points (in Portuguese):

| Phase | phase_message |
|---|---|
| Queued | `"A preparar…"` |
| OF21 start | `"A obter catálogo…"` |
| OF21 progress | `"A obter catálogo… ({n} de {total} produtos)"` |
| P11 start | `"A verificar concorrentes…"` |
| P11 progress | `"A verificar concorrentes ({n} de {total} produtos)…"` |
| Building | `"A construir relatório…"` |
| Complete | `"Relatório pronto!"` |
| Error | `getSafeErrorMessage(err)` |

### Enforcement Guidelines

All implementation **MUST**:
1. Never pass `api_key` as a field in BullMQ job data
2. Never `console.log()` or `fastify.log.*()` any variable that might contain an API key
3. Always `keyStore.delete(job_id)` in a `finally` block
4. Always use `mirAklGet()` wrapper for Mirakl calls — never raw `fetch()` to Mirakl
5. Assert `total_count` after OF21 pagination and fail loudly if mismatch
6. Use `total_price` (not `price`) from P11 responses for all gap calculations
7. Filter `active: true` before any P11 offer processing
8. Return 404 (not 500) for expired or non-existent reports
9. Never create a listing endpoint for reports or jobs

---

## Project Structure & Boundaries

### Complete Directory Structure

```
marketpilot-report/
├── package.json              # Node.js 22, ESM ("type": "module")
├── .env.example              # Template for required env vars
├── .env                      # Gitignored — local + production values
├── .gitignore
├── Dockerfile
├── docker-compose.yml        # Local dev: app + redis
│
├── src/
│   ├── server.js             # Fastify instance setup, plugin registration, route loading
│   ├── config.js             # env var loading + validation (fail fast on missing vars)
│   │
│   ├── routes/
│   │   ├── generate.js       # POST /api/generate — validates input, stores key, enqueues job
│   │   ├── jobs.js           # GET /api/jobs/:job_id — status polling endpoint
│   │   ├── reports.js        # GET /api/reports/:report_id — report JSON
│   │   │                     # GET /api/reports/:report_id/csv — CSV download
│   │   └── static.js         # GET /report/:report_id → serves public/report.html
│   │                         # (also registers @fastify/static for /public/**)
│   │
│   ├── queue/
│   │   ├── reportQueue.js    # BullMQ Queue definition + connection
│   │   └── keyStore.js       # In-memory Map<job_id, api_key> — THE security boundary
│   │
│   ├── workers/
│   │   ├── reportWorker.js   # BullMQ Worker — orchestrates phases A–F
│   │   │
│   │   ├── mirakl/
│   │   │   ├── apiClient.js  # fetch wrapper with retry + backoff; log-safe
│   │   │   ├── fetchCatalog.js  # OF21 pagination; asserts total_count
│   │   │   └── scanCompetitors.js  # P11 batch + concurrent; resolves EAN; extracts per-channel
│   │   │
│   │   └── scoring/
│   │       └── computeReport.js  # WOW score + Quick Wins + Your Position per channel
│   │
│   ├── db/
│   │   ├── database.js       # Drizzle + better-sqlite3 setup
│   │   ├── schema.js         # Table definitions (generation_jobs, reports)
│   │   └── queries.js        # Named query functions (createJob, updateJobStatus, insertReport, getReport)
│   │
│   ├── email/
│   │   └── sendReportEmail.js  # Resend integration; non-blocking; HTML template inline
│   │
│   ├── cleanup/
│   │   └── expiredReports.js  # node-cron: DELETE FROM reports WHERE expires_at < now()
│   │
│   └── middleware/
│       └── errorHandler.js   # Fastify setErrorHandler — maps errors to safe HTTP responses
│
├── public/                   # Static files served by @fastify/static
│   ├── index.html            # Form page: api_key input + email + trust message
│   ├── progress.html         # Progress page: polls /api/jobs/:job_id; shows report URL immediately
│   ├── report.html           # Report page: fetches /api/reports/:id; renders 3 sections
│   │
│   ├── css/
│   │   └── main.css          # Responsive layout; mobile-first; screen-share-friendly tables
│   │
│   └── js/
│       ├── form.js           # Form submit → POST → redirect to /progress
│       ├── progress.js       # setInterval poll → show messages → redirect on complete
│       └── report.js         # fetch report JSON → render Your Position + tables + CSV button
│
└── tests/                    # (Phase 2 — post-M$P)
    └── .gitkeep
```

### Environment Variables

```bash
# .env.example

# Server
PORT=3000
NODE_ENV=production

# Redis (BullMQ backend)
REDIS_URL=redis://redis:6379

# Database
SQLITE_PATH=/data/marketpilot.db   # Docker volume mount

# Resend (email)
RESEND_API_KEY=re_xxx

# App
APP_BASE_URL=https://reports.yourdomain.com
WORTEN_BASE_URL=https://marketplace.worten.pt

# Security
LOG_LEVEL=info   # Never 'debug' in production (debug logs may include request details)
```

### Architectural Boundaries

**What lives in `src/routes/`:**
- HTTP concerns only: request parsing, input validation, response serialisation
- No business logic
- No Mirakl API calls
- No database queries (call query functions from `src/db/queries.js`)

**What lives in `src/workers/`:**
- All business logic for report generation
- All Mirakl API calls (via `apiClient.js`)
- All scoring computation
- Reads API key from keyStore, clears it on finish

**What lives in `src/queue/keyStore.js`:**
- The only place the API key is ever stored
- No other file should hold a reference to an API key beyond the scope of a single function call

**What lives in `src/db/queries.js`:**
- All SQLite reads and writes
- Named functions with typed parameters
- No raw SQL outside this file (except schema.js)

**Data flow between boundaries:**
```
HTTP Route → keyStore.set(jobId, apiKey) → BullMQ.add(jobData without apiKey)
                                                    ↓
Worker ← keyStore.get(jobId) [apiKey in local variable only]
Worker → Mirakl API [Authorization header, never logged]
Worker → db.queries.insertReport(reportData) [no apiKey in reportData]
Worker → keyStore.delete(jobId)
```

### FR to File Mapping

| FR | Implementation location |
|---|---|
| FR1 — form submission | `public/index.html`, `src/routes/generate.js` |
| FR2 — both channels | `src/workers/mirakl/scanCompetitors.js` (parses WRT_PT_ONLINE + WRT_ES_ONLINE from `all_prices`) |
| FR3 — OF21 pagination | `src/workers/mirakl/fetchCatalog.js` |
| FR4 — P11 batching + filtering | `src/workers/mirakl/scanCompetitors.js` |
| FR5/FR6 — WOW score + Quick Wins | `src/workers/scoring/computeReport.js` |
| FR7 — report_id returned immediately | `src/routes/generate.js` (UUID generated before enqueue) |
| FR8 — real-time progress | `src/routes/jobs.js` + `src/workers/reportWorker.js` (writes phase_message) + `public/js/progress.js` |
| FR9–FR12 — report sections | `public/report.html` + `public/js/report.js` |
| FR13 — CTA | `public/report.html` (static link to WhatsApp/email) |
| FR14 — 48h persistent URL | `src/db/schema.js` (expires_at) + `src/routes/reports.js` (TTL check on read) |
| FR15 — report URL on progress screen | `public/js/progress.js` (displays report_id URL from step 1 response) |
| FR16 — confirmation email | `src/email/sendReportEmail.js` |
| FR17 — CSV download | `src/routes/reports.js` (GET /api/reports/:id/csv) |
| FR18 — trust message | `public/index.html` (static, at button level) |
| FR19/FR20 — key never persisted, cleanup | `src/queue/keyStore.js` + `finally` block in `reportWorker.js` |
| FR21 — privacy notice link | `public/index.html` (static link) |
| FR22–FR24 — error handling + cleanup | `src/workers/reportWorker.js` + `src/middleware/errorHandler.js` |
| FR25 — descriptive progress messages | `src/workers/reportWorker.js` (writes phase_message) |
| FR26 — 48h TTL deletion | `src/cleanup/expiredReports.js` (cron) + `src/routes/reports.js` (read-time check) |
| FR27 — no report listing | No listing route registered (by omission) |
| FR28 — email disclosure | `public/index.html` (static disclosure text below email field) |
| FR29 — no cross-seller data | All DB queries use `WHERE report_id = ?` only |

---

## Architecture Validation

### Coherence Validation

**Decision Compatibility:** All technology choices are compatible:
- Node.js 22 ESM + Fastify v5 + BullMQ v5 + better-sqlite3 + Drizzle = standard, battle-tested stack with no known conflicts
- Pino (Fastify's built-in logger) natively supports the `redact` config used for NFR-S4
- @fastify/static serves static HTML files directly — no additional build step
- Coolify's Traefik satisfies NFR-S1 without application-level changes

**Pattern Consistency:**
- The keyStore boundary is enforced by convention (single file, no external references) + by the fact that BullMQ job data schema never includes `api_key`
- SQLite schema enforces the security constraint at the data model level — no `api_key` column can be accidentally populated
- Error handling pattern (`finally` block always clears key) is consistent across all code paths

**Structure Alignment:**
- The directory structure maps cleanly to the 6 job phases (A–F) defined in the PRD
- Boundary between `routes/` (HTTP) and `workers/` (business logic) is clear and consistent
- The `keyStore.js` isolation makes the security-critical code easy to audit — one file, one concern

### Requirements Coverage Validation

**All 29 FRs covered:** See FR→File mapping above. Every FR has at least one concrete implementation location.

**All 13 NFRs covered:**

| NFR | Coverage |
|---|---|
| NFR-P1 (< 2s to enqueue) | Fastify route: validate + keyStore.set + queue.add + db.insert — all synchronous, no Mirakl calls |
| NFR-P2/P3 (generation timing) | 10 concurrent P11 batches validated at 31k SKUs in scale_test.js |
| NFR-P4 (report page < 2s) | Static HTML served by @fastify/static; JSON fetched from SQLite (single indexed lookup) |
| NFR-P5 (CSV < 3s) | CSV stored in SQLite TEXT column; single row lookup, no computation at read time |
| NFR-S1 — HTTPS | Traefik TLS + `trustProxy: true` on Fastify |
| NFR-S2 — key never persisted | keyStore.js (memory only) + BullMQ data schema + SQLite schema |
| NFR-S3 — UUID access only | No listing endpoint; UUID v4 report_id; no sequential IDs |
| NFR-S4 — log redaction | Pino redact config on Fastify instance |
| NFR-S5 — no cross-seller data | All queries: `WHERE report_id = ?` |
| NFR-R1 (≥ 98% success) | Retry wrapper with exponential backoff; graceful handling of empty catalogs |
| NFR-R2 (no silent truncation) | `fetchCatalog.js` asserts `fetched.length === total_count` |
| NFR-R3 (email failure ≠ failure) | Email sent in non-blocking call after job marked `complete` |
| NFR-R4 (valid URL always resolves) | SQLite index on `expires_at`; read-time TTL check returns 404 only after expiry |
| NFR-I1 (Mirakl retry) | `apiClient.js` exponential backoff on 429/5xx |
| NFR-I2 (user-actionable errors) | `getSafeErrorMessage()` maps all error types to Portuguese messages |
| NFR-I3 (email not on critical path) | Report URL shown on progress screen (FR15) before email is sent |

### Implementation Readiness Validation

**Decision completeness:** All decisions documented with specific technology choices. No "TBD" fields in the stack.

**Structure completeness:** Full directory tree with all files named. FR-to-file mapping complete.

**Pattern completeness:** Key conflict areas addressed — naming (snake_case DB / camelCase JS), API response shape, error handling format, Mirakl call pattern, concurrency pattern.

### Gap Analysis

**No critical gaps identified.**

**Minor notes for implementation:**
1. **EAN resolution in P11:** `scale_test.js` has a multi-strategy EAN resolver (`resolveEanForProduct`) — copy this logic to `scanCompetitors.js` directly. It handles the case where `product_references` or `product_sku` may need to be matched against the batch.
2. **Seller's own price from P11:** P11 `all_offers` includes the seller's own offer. The `computeReport.js` scoring must identify the seller's own offer (by matching `shop_id` or by excluding it if already identified from OF21). The simplest approach: use the price from OF21 as `my_price` (not from P11), since OF21 already returned it.
3. **Channel isolation in OF21:** OF21 returns the seller's offers but may or may not be channel-specific. Treat the OF21 price as the seller's single price across channels; the per-channel scoring uses P11 competitor data per channel against this same price.
4. **CSV format:** The full catalog CSV should include all products (including those already in 1st place and those with no competitors) — not just opportunities. Per FR17: "full catalog analysis covering all products and both channels."

### Architecture Readiness Assessment

**Overall Status: READY FOR IMPLEMENTATION**

**Confidence Level: High** — the architecture builds directly on a validated working implementation (`scale_test.js` + `opportunity_report.js`) and extends it into a proper production system using well-understood patterns.

**Key Strengths:**
- The API key security model is simple, auditable, and enforced at the data schema level — no accidental persistence is possible
- The async architecture (enqueue → return report_id immediately → poll for progress) is the right model for 2–10 minute jobs
- SQLite eliminates a dependency (no PostgreSQL server) without any capability sacrifice at this scale
- The static HTML + vanilla JS frontend approach means zero build complexity and fast iteration
- The implementation can be bootstrapped from the existing `scale_test.js` — the OF21 and P11 logic is already battle-tested at 31k products

**Trade-offs Accepted:**
- In-memory keyStore is lost on process restart → seller must re-submit (acceptable, stated in PRD)
- No job dashboard for Pedro → check Coolify logs directly (acceptable at M$P)
- SQLite single-file DB → not horizontally scalable → irrelevant until Phase 3 (acceptable)
- Client-side rendered report → slight delay on first table paint → acceptable for a 2–10 min wait context

---

## Implementation Handoff

### Recommended Build Order

1. **Bootstrap project structure** — `package.json`, `src/server.js`, `src/config.js`, `Dockerfile`, `.env.example`
2. **SQLite schema + queries** — `src/db/schema.js`, `src/db/queries.js`, `src/db/database.js`
3. **KeyStore + Queue setup** — `src/queue/keyStore.js`, `src/queue/reportQueue.js`
4. **POST /api/generate route** — validates, enqueues, returns `{job_id, report_id}`; test with Postman
5. **BullMQ Worker skeleton** — connects to queue, reads from keyStore, stubs phases A–F
6. **Mirakl apiClient** — copy retry logic from `scale_test.js`; adapt `fetchCatalog.js` and `scanCompetitors.js`
7. **Scoring** — port `computeReport.js` from `opportunity_report.js` logic
8. **Job persistence** — write phase transitions to SQLite; GET /api/jobs/:job_id polling
9. **Report persistence + retrieval** — INSERT reports; GET /api/reports/:id; GET /api/reports/:id/csv
10. **Email** — Resend integration; non-blocking send
11. **Cleanup cron** — node-cron hourly expiry delete
12. **Static frontend** — `public/index.html`, `public/progress.html`, `public/report.html` with basic CSS
13. **Frontend JS** — `form.js`, `progress.js`, `report.js`
14. **Integration test** — end-to-end with a real API key (Ana's or Pedro's test key)
15. **Coolify deployment** — Docker container + Redis service + volume + env vars + HTTPS

### AI Agent Implementation Notes

- All agents must follow the patterns in the **Implementation Patterns** section exactly
- The `keyStore.js` file is the highest-security file in the codebase — treat any change to it with extreme care
- Never add an `api_key` field to any database table, BullMQ job data, or log statement — this is a hard constraint, not a convention
- The scoring formula from the PRD (FR5): `WOW = my_price / gap_pct` where `gap_pct = (my_price - competitor_total_price[0]) / competitor_total_price[0]` — use exactly this formula, including the direction convention (positive gap_pct = seller is losing)
- Phase messages must be written in Portuguese (as shown in the table above)
