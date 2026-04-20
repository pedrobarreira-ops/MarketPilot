---
type: bmad-distillate
sources:
  - "architecture.md"
downstream_consumer: "BMAD create-story and dev-story skills running in Claude Code VSCode extension for a solo developer building a Mirakl marketplace repricing tool MVP"
created: "2026-04-16"
token_estimate: 3950
parts: 1
---

## Project Identity
- Project: MarketPilot Free Report; author: Pedro; date: 2026-04-15; status: ready for implementation
- Source scripts validated: scale_test.js (31,179 products in ~173s OF21 + ~300s P11 at 10 concurrency ≈ 8 min total), opportunity_report.js
- Expected load: 1–5 concurrent report generations (M$P phase); report storage per job: ~1–5 MB

## Hard Constraints (non-negotiable)
- Mirakl MMP API only — no MiraklConnect, ever
- Shop API Key: no read-only scope; full-access key; never in DB, queue, log, background context — in-memory Map only, cleared on completion or error
- P11: use `total_price` (not `price`); filter `active: true` only; 100 EANs per call
- OF21: assert `total_count` vs fetched count after pagination — fail loudly on mismatch (NFR-R2)
- Both channels WRT_PT_ONLINE and WRT_ES_ONLINE from single OF21 + P11 call
- `keyStore.delete(job_id)` always in `finally` block — never in try or catch only
- Never pass `api_key` in BullMQ job data; never `console.log()` any variable containing API key
- Always use `mirAklGet()` wrapper for Mirakl calls — never raw `fetch()` to Mirakl
- Return 404 (not 500) for expired/non-existent reports; never create listing endpoint for reports or jobs

## Tech Stack
- Runtime: Node.js 22 LTS, ESM (`"type": "module"`)
- HTTP: Fastify v5; Pino logger with `redact` config (NFR-S4); JSON schema validation; `trustProxy: true` (behind Traefik)
- Job queue: BullMQ v5; Redis 7 Alpine (~50 MB RAM); stores job metadata only — never api_key
- Key store: Node.js `Map` (in-process); never serialised; GC-safe; wiped on job end
- Database: SQLite via better-sqlite3 (latest); Docker volume; zero-config; sufficient at 1–5 concurrent
- ORM: Drizzle ORM v0.30+; type-safe; native SQLite; minimal abstraction
- Email: Resend v4; free tier 3k/month; non-blocking; sent after job marked complete
- Frontend: Static HTML + Vanilla JS — no build step, no bundler, no framework; 3 pages
- TLS/Proxy: Traefik via Coolify; Let's Encrypt auto-cert; HTTP→HTTPS redirect; Fastify on port 3000 internal only
- Hosting: Hetzner VPS + Coolify; already in use for another project
- Cron: node-cron (hourly TTL cleanup)
- Mirakl HTTP client: native `fetch()` with custom retry wrapper

## Rejected Alternatives
- Express: no built-in log redact; slower; no schema validation
- Next.js: overkill; build step; more moving parts
- BullMQ in-memory only: job status lost on process restart; harder retry logic
- PostgreSQL: adds DB server to manage; SQLite sufficient at this scale
- SendGrid/Postmark: Resend has better DX and free tier
- WebSocket for progress: SSE or polling simpler; no bidirectional comms needed

## API Routes
- `POST /api/generate` — validate inputs, generate job_id+report_id (randomUUID), keyStore.set, BullMQ.add (no api_key), db.insert; return 202 `{job_id, report_id}`; must complete < 2s (NFR-P1)
- `GET /api/jobs/:job_id` — returns `{status, phase_message, report_id}`; client polls every 2s
- `GET /api/reports/:report_id` — returns report JSON; 404 if expired or not found
- `GET /api/reports/:report_id/csv` — returns CSV string; stored in SQLite TEXT column
- `GET /report/:report_id` — serves static `public/report.html`
- No `GET /api/reports` listing endpoint — not registered

## Job Worker: 6 Phases (A–F)
- A fetching_catalog: pull api_key from keyStore; OF21 pagination (100/page, ~312 pages at 31k); assert total_count; update phase_message every 1,000 offers; collect `[{ean, shop_sku, price, product_title}]`
- B scanning_competitors: batch 100 EANs; 10 concurrent P11 calls (`Promise.allSettled`); filter `active: true`; extract `total_price` per channel; update phase_message every 500 EANs; collect `{[ean]: {pt: {first, second}, es: {first, second}}}`
- C building_report: for each product × channel where `my_price > competitor_total_price[0]`: `gap = my_price - competitor_total_price[0]`; `gap_pct = gap / competitor_total_price[0]`; `wow_score = my_price / gap_pct`; `is_quick_win = gap_pct <= 0.02`; sort Biggest Opportunities by wow_score DESC; compute Your Position counts (winning/losing/uncontested) per channel
- D persisting: INSERT reports row; expires_at = now + 172800; UPDATE generation_jobs status = 'complete'
- E email: `resend.emails.send(...)` non-blocking — job completion does NOT wait for email confirm
- F cleanup: `keyStore.delete(job_id)` — always runs (finally block)
- On any error: `keyStore.delete(job_id)` + UPDATE status = 'error' + `getSafeErrorMessage(err)` mapped to Portuguese
- Process crash: BullMQ retries job (3 retries configured); worker finds no key → fails gracefully with "A sessão expirou. Por favor, submete o formulário novamente."

## Scoring Formula (FR5 — exact)
- `gap_pct = (my_price - competitor_total_price[0]) / competitor_total_price[0]` — positive = seller is losing
- `wow_score = my_price / gap_pct`
- `is_quick_win = gap_pct <= 0.02`
- Use OF21 price as `my_price` — not P11 (P11 all_offers includes seller's own offer; OF21 price is authoritative)
- Channel isolation: OF21 price is seller's single price across channels; per-channel scoring uses P11 competitor data per channel vs this same price

## SQLite Schema
- `generation_jobs`: `job_id TEXT PK`, `report_id TEXT NOT NULL`, `status TEXT DEFAULT 'queued'` (values: queued|fetching_catalog|scanning_competitors|building_report|complete|error), `phase_message TEXT`, `progress_current INTEGER` (nullable — set during fetching_catalog and scanning_competitors phases), `progress_total INTEGER` (nullable — set alongside progress_current), `email TEXT NOT NULL`, `marketplace_url TEXT NOT NULL`, `created_at INTEGER`, `completed_at INTEGER`, `error_message TEXT` — NO api_key column ever
- `reports`: `report_id TEXT PK`, `generated_at INTEGER NOT NULL`, `expires_at INTEGER NOT NULL` (generated_at + 172800), `email TEXT NOT NULL`, `summary_json TEXT NOT NULL` ({pt:{total,winning,losing,uncontested}, es:{...}}), `opportunities_pt_json TEXT`, `opportunities_es_json TEXT`, `quickwins_pt_json TEXT`, `quickwins_es_json TEXT`, `csv_data TEXT`
- Index: `CREATE INDEX idx_reports_expires_at ON reports(expires_at)`
- CSV includes all products (including 1st place and no-competitor ones) — not just opportunities (FR17)

## API Key Security Pattern
- `src/queue/keyStore.js`: `const _store = new Map()` — `set(jobId, apiKey)`, `get(jobId)`, `delete(jobId)`, `has(jobId)` — never serialised, never logged
- BullMQ job data: `{job_id, report_id, email, marketplace_url}` — api_key excluded
- Fastify Pino redact paths: `req.headers.authorization`, `req.body.api_key`, `*.api_key`, `*.Authorization`; censor: `[REDACTED]`
- Worker error logging: log `{error_code, error_type}` only — never full error message (may contain API response details)
- HTTPS: Traefik terminates TLS; Fastify internal only; `trustProxy: true` for `X-Forwarded-Proto`
- Report access: UUID v4 (122-bit entropy); 48h TTL; no auth system; report_id IS the access token
- Accepted trade-off: key lost on process crash → seller re-submits (stated acceptable in PRD)

## NFRs Summary
- NFR-P1: form→enqueue < 2s — no Mirakl calls at submission
- NFR-P2/P3: 5k SKUs < 3 min; 31k SKUs < 10 min — validated at 10 concurrent P11 batches
- NFR-P4: report page < 2s — static HTML + single indexed SQLite lookup
- NFR-P5: CSV < 3s — stored in SQLite TEXT, single row lookup
- NFR-R1: ≥ 98% success for valid keys — exponential backoff on 429/5xx (1s, 2s, 4s … max 30s, 5 retries)
- NFR-R2: no silent truncation — assert fetched.length === total_count in fetchCatalog.js
- NFR-R3: email failure ≠ job failure — email non-blocking after complete
- NFR-I1: Mirakl retry on 429/5xx; NFR-I2: getSafeErrorMessage() all errors → Portuguese; NFR-I3: report URL shown on progress screen before email sent

## Error Handling
- Invalid/suspended key: 0 offers AND total_count=0 or 401/403 → error status + Portuguese safe message
- total_count mismatch: fail job with "Catálogo obtido parcialmente. Tenta novamente." (no silent partial report)
- P11 rate limit 429: backoff up to 5 retries; if batch exhausted → mark batch failed, continue (partial competitor data > no report); update phase_message to reassure user
- `getSafeErrorMessage(err)`: 401/403 → key invalid message; 429 → rate limit message; empty catalog → catalog message; default → generic retry message — all in Portuguese
- Raw Mirakl API responses never forwarded to client or logged verbatim

## Progress Phase Messages (Portuguese)
- queued: "A preparar…"; OF21 start: "A obter catálogo…"; OF21 progress: "A obter catálogo… ({n} de {total} produtos)"; P11 start: "A verificar concorrentes…"; P11 progress: "A verificar concorrentes ({n} de {total} produtos)…"; building: "A construir relatório…"; complete: "Relatório pronto!"; error: getSafeErrorMessage(err)

## Directory Structure
- `src/server.js` — Fastify setup, plugins, routes, Pino redact config
- `src/config.js` — env var loading + validation (fail fast)
- `src/routes/generate.js` — POST /api/generate
- `src/routes/jobs.js` — GET /api/jobs/:job_id
- `src/routes/reports.js` — GET /api/reports/:id and /csv
- `src/routes/static.js` — GET /report/:id → report.html; registers @fastify/static
- `src/queue/keyStore.js` — THE security boundary (in-memory Map)
- `src/queue/reportQueue.js` — BullMQ Queue + Redis connection
- `src/workers/reportWorker.js` — orchestrates phases A–F
- `src/workers/mirakl/apiClient.js` — fetch wrapper with retry/backoff; log-safe
- `src/workers/mirakl/fetchCatalog.js` — OF21 pagination; asserts total_count
- `src/workers/mirakl/scanCompetitors.js` — P11 batch + concurrent; per-channel extraction; copy EAN resolver from scale_test.js (`resolveEanForProduct`)
- `src/workers/scoring/computeReport.js` — WOW score + Quick Wins + Your Position per channel; port from opportunity_report.js
- `src/db/database.js` — Drizzle + better-sqlite3 setup
- `src/db/schema.js` — table definitions
- `src/db/queries.js` — named query functions: createJob, updateJobStatus, insertReport, getReport; all raw SQL here only
- `src/email/sendReportEmail.js` — Resend; non-blocking; HTML template inline
- `src/cleanup/expiredReports.js` — node-cron hourly: DELETE FROM reports WHERE expires_at < now()
- `src/middleware/errorHandler.js` — Fastify setErrorHandler; maps to safe HTTP responses
- `public/index.html`, `public/progress.html`, `public/report.html`
- `public/js/form.js`, `public/js/progress.js`, `public/js/report.js`
- `public/css/main.css` — responsive; mobile-first; screen-share-friendly tables

## Environment Variables
- `PORT=3000`; `NODE_ENV=production`; `REDIS_URL=redis://redis:6379`; `SQLITE_PATH=/data/marketpilot.db`; `RESEND_API_KEY=re_xxx`; `APP_BASE_URL=https://reports.yourdomain.com`; `WORTEN_BASE_URL=https://marketplace.worten.pt`; `LOG_LEVEL=info` (never 'debug' in production)

## Architectural Boundaries
- `src/routes/`: HTTP only — request parsing, validation, response serialisation; no business logic; no Mirakl calls; no direct DB (call queries.js)
- `src/workers/`: all business logic, all Mirakl calls, all scoring; reads/clears keyStore
- `src/queue/keyStore.js`: only place API key is stored; no other file holds api_key beyond single function scope
- `src/db/queries.js`: all SQLite reads/writes; no raw SQL outside this file (except schema.js)

## Recommended Build Order
1. Bootstrap: package.json, server.js, config.js, Dockerfile, .env.example
2. SQLite schema + queries
3. keyStore + Queue setup
4. POST /api/generate route — test with Postman
5. BullMQ Worker skeleton — stubs phases A–F
6. Mirakl apiClient — copy retry from scale_test.js; fetchCatalog + scanCompetitors
7. Scoring — port from opportunity_report.js
8. Job persistence + GET /api/jobs polling
9. Report persistence + retrieval + CSV
10. Email (Resend)
11. Cleanup cron
12. Static frontend HTML
13. Frontend JS
14. Integration test with real API key
15. Coolify deployment (Docker + Redis service + volume + env vars + HTTPS)

## Implementation Notes
- EAN resolver: copy `resolveEanForProduct` multi-strategy logic from scale_test.js into scanCompetitors.js
- Seller price source: use OF21 `price` as `my_price` — not P11 (OF21 is authoritative; P11 all_offers includes seller's own offer)
- CSV scope: all products including 1st-place and uncontested (FR17: "full catalog analysis covering all products and both channels")
- API response format: success → `{"data": {...}}`; error → `{"error": "code", "message": "Portuguese message"}`; polling → `{"status": "...", "phase_message": "...", "progress_current": number|null, "progress_total": number|null, "report_id": "uuid"}`
- TTL double-check: cron hourly delete + read-time `WHERE expires_at > now` check — no expired report ever served
- keyStore.js is highest-security file — treat any change with extreme care
