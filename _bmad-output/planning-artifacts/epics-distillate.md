---
type: bmad-distillate
sources:
  - "epics.md"
downstream_consumer: "BMAD create-story and dev-story skills running in Claude Code VSCode extension for a solo developer building a Mirakl marketplace repricing tool MVP"
created: "2026-04-16"
token_estimate: 6631
parts: 1
---

## Project Identity
- Project: MarketPilot Free Report; solo dev: Pedro; date: 2026-04-15
- Source docs: prd.md, architecture.md, ux-design.md, scripts/scale_test.js, scripts/opportunity_report.js, public/*.html
- Build order: infrastructure → pipeline → frontend → email & cleanup

## Stack & Tooling (Hard Constraints)
- Node.js 22 LTS; ESM (`"type": "module"` in package.json)
- Fastify v5 + Pino (redact config mandatory); BullMQ v5 + Redis 7; SQLite via better-sqlite3 + Drizzle ORM; Resend v4; node-cron; uuid
- Static HTML + Vanilla JS — no build step, no bundler
- Traefik via Coolify for HTTPS; Fastify `trustProxy: true`
- Single Docker container: Fastify server + BullMQ worker in same Node.js process; SQLite on Docker volume
- Coolify-managed Redis (separate container ~50 MB RAM); Coolify auto-deploy from Git; no CI/CD at MVP phase

## Directory Structure (Must Follow)
- `src/routes/` — HTTP only, no business logic, calls `src/db/queries.js`
- `src/workers/mirakl/` — Mirakl API calls
- `src/workers/scoring/` — scoring logic
- `src/queue/keyStore.js` — SOLE api_key store; no other file holds key reference
- `src/db/queries.js` — ALL SQLite reads/writes; no raw SQL outside this file (except schema.js)
- `src/email/`, `src/cleanup/`, `src/middleware/`
- `public/css/`, `public/js/`
- `public/index.html`, `public/progress.html`, `public/report.html` already exist (Stitch mockups, Tailwind CDN) — do NOT rebuild

## API Key Security (HARD REQUIREMENT — Non-Negotiable)
- `src/queue/keyStore.js`: in-memory `Map<job_id, api_key>`; exports `set/get/delete/has`; backing Map NOT exported; NO serialisation imports; NO `.keys()/.entries()` enumeration; NEVER serialised
- BullMQ job data: `{ job_id, report_id, email, marketplace_url }` — NO `api_key` field ever
- Worker retrieves key via `keyStore.get(job_id)`; clears in `finally` block unconditionally on success AND failure
- If `keyStore.get()` returns undefined (process restart): fail job with `"A sessão expirou. Por favor, submete o formulário novamente."`
- `POST /api/generate` is the ONLY place `keyStore.set()` is called
- Pino redact paths: `['req.headers.authorization', 'req.body.api_key', '*.api_key', '*.Authorization']`, censor: `'[REDACTED]'`
- Error catch logs only: `{ job_id, error_code: err.code, error_type: err.constructor.name }` — NOT `err.message`
- DB schema has NO `api_key` column in any table

## Database Schema (Drizzle + SQLite)
- `generation_jobs`: `job_id TEXT PK`, `report_id TEXT`, `status TEXT DEFAULT 'queued'`, `phase_message TEXT`, `email TEXT`, `marketplace_url TEXT`, `created_at INTEGER`, `completed_at INTEGER`, `error_message TEXT` — NO `api_key`
- `reports`: `report_id TEXT PK`, `generated_at INTEGER`, `expires_at INTEGER` (now + 172800s), `email TEXT`, `summary_json TEXT`, `opportunities_pt_json TEXT`, `opportunities_es_json TEXT`, `quickwins_pt_json TEXT`, `quickwins_es_json TEXT`, `csv_data TEXT`
- Index: `idx_reports_expires_at ON reports(expires_at)`
- `src/db/queries.js` named exports: `createJob()`, `updateJobStatus()`, `updateJobError()`, `insertReport()`, `getReport()`, `getJobStatus()`
- `getReport(reportId, now)` returns report only if `expires_at > now`; non-existent/expired returns `null` (not throws)

## Mirakl API Patterns (high-level — see MCP-Verified Endpoint Reference for field specifics)
- All calls via `src/workers/mirakl/apiClient.js` — `mirAklGet(baseUrl, endpoint, params, apiKey)`; no direct `fetch()` to Mirakl elsewhere
- Exponential backoff: 1s, 2s, 4s, 8s, 16s (capped 30s), up to 5 retries for 429/5xx; throws `MiraklApiError` after exhaustion
- Failed P11 batches after retry: logged (error type only), EANs marked uncontested, job continues
- Raw Mirakl errors NEVER forwarded to user or logged verbatim; all pass through `getSafeErrorMessage(err)`
- Reuse `scripts/scale_test.js` for OF21 pagination logic; reuse `scripts/opportunity_report.js` for P11 batch+concurrent pattern
- **For endpoint specifics (paths, params, field names, pagination, error behavior): the MCP-Verified Endpoint Reference section below is the single authoritative source. No endpoint details should be duplicated elsewhere in this file.**

## MCP-Verified Endpoint Reference _(verified 2026-04-18 against Mirakl MCP AND live Worten instance via `scripts/mcp-probe.js` — authoritative; never assume beyond what is listed)_

**OF21 — Seller catalog fetch** `GET /api/offers`
- Auth: `Authorization: <api_key>` header (raw key, no Bearer prefix)
- Pagination: offset — `max=100` per page, `offset=0,100,…`
- Active filter: `offer.active === true` (boolean, required). ⚠️ `offer.state` does NOT exist on OF21 response (verified MISSING on live Worten). `offer.state_code` exists but is offer CONDITION (e.g. `"11"`), not active/inactive
- EAN: `offer.product_references[].reference` where `reference_type === 'EAN'`
- Seller's own price: `offer.applicable_pricing.price` (number, channel-agnostic default)
- Other fields: `shop_sku`, `product_sku` (UUID — NOT the EAN), `product_title`, `channels[]`, `all_prices[]`, `min_shipping_price`, `total_price`, `quantity`, `inactivity_reasons[]`
- `total_count` at root — assert `allOffers.length === total_count` BEFORE active filter (no server-side active filter exists); on mismatch throw `CatalogTruncationError`

**P11 — Competitor price scan** `GET /api/products/offers`
- **Batch param: `product_references` (NOT `product_ids`).** Format: `EAN|<ean1>,EAN|<ean2>,…` (pipe-delimited type|value, comma-separated, max 100 values/call). ⚠️ `product_ids` expects product SKUs (UUIDs in Worten), not EANs — using EANs with `product_ids` silently returns 0 products (verified live)
- **Two calls per batch to get per-channel total_price** — one call per channel, each passing `pricing_channel_code=WRT_PT_ONLINE` (or `WRT_ES_ONLINE`) so `offer.total_price` reflects that channel's price. Also pass `channel_codes=<that channel>` to filter returned offers to those sellable on that channel
- Active filter: `offer.active === true` (boolean, required)
- ⚠️ Channel bucketing on competitor offers: `offer.channels` is typically EMPTY array on competitor offers (verified). `offer.channel_code` singular does NOT exist. **Bucket by which P11 call (PT or ES) returned the offer — do NOT read channel from the offer object**
- ✅ `offer.total_price` (number) = price + min_shipping_price for the active pricing context — USE THIS for competitor comparison
- ⚠️ `offer.price` = price only (no shipping) — DO NOT USE for competitor comparison
- EAN from: `product.product_references[].reference` where `reference_type === 'EAN'`
- `product.total_count` = number of offers FOR THAT PRODUCT (per-product count, not batch total)

**PRI01 — Price import** `POST /api/offers/pricing/imports` (Epic 4+)
- `multipart/form-data` with `file` field; CSV semicolon-delimited: `"offer-sku";"price";"discount-price";"discount-start-date";"discount-end-date"` (plus optional volume/channel/scheduled/customer columns; max 50 prices per offer)
- Returns `201 { import_id: "<uuid>" }` (poll via PRI02)
- ⚠️ Rate limit: max once/minute (recommended every 5 min)
- ⚠️ **Delete-and-replace** — any price for an offer NOT in submitted CSV is DELETED. Always submit the complete set for each offer

**PRI02 — Import status** `GET /api/offers/pricing/imports?import_id=<id>` (Epic 4+)
- `data[].status` enum: `WAITING | RUNNING | COMPLETE | FAILED`
- `lines_in_success`, `lines_in_error`, `offers_in_error`, `offers_updated`, `reason_status`, `has_error_report`
- Rate limit: max once/minute (recommended every 5 min)

**PRI03 — Import error report** `GET /api/offers/pricing/imports/{import_id}/error_report` (Epic 4+)
- Returns CSV of errored rows (col 1 = line number, col 2 = reason)
- Call only when PRI02 reports `has_error_report: true`; max once/minute

## Scoring Formulas
- WOW score: `gap = my_price - competitor_total_price_first`; `gap_pct = gap / competitor_total_price_first`; `wow_score = my_price / gap_pct`; applies only where `my_price > competitor_total_price_first`
- Quick Win: `gap_pct <= 0.02`
- Winning (1st place): `my_price <= competitor_total_price_first` — no WOW score assigned
- Uncontested: no competitor data for that channel
- `opportunities_pt/es` sorted by `wow_score DESC`
- `summary` per channel: `{ total, winning, losing, uncontested }`

## Progress Phase Messages (Portuguese)
- Queued: `"A preparar…"`; status `queued`
- OF21 start: `"A obter catálogo…"` / progress: `"A obter catálogo… ({n} de {total} produtos)"`; status `fetching_catalog`
- P11 start: `"A verificar concorrentes…"` / progress: `"A verificar concorrentes ({n} de {total} produtos)…"`; status `scanning_competitors`
- P11 rate limit retry: `"A verificar concorrentes — a aguardar limite de pedidos…"`
- Building: `"A construir relatório…"`; status `building_report`
- Complete: `"Relatório pronto!"`; status `complete`
- Error: `getSafeErrorMessage(err)` output; status `error`
- OF21 `onProgress` called every 1,000 offers; P11 `onProgress` called every 500 EANs

## Safe Error Messages
- 401/403 from OF21: `"Chave API inválida ou sem permissão. Verifica se a chave está correcta e se a tua conta está activa no Worten."`
- Empty catalog (0 offers, 200 status): `"Não encontrámos ofertas activas no teu catálogo. Verifica se a tua conta está activa no Worten."`; throws `EmptyCatalogError`
- total_count mismatch: `"Catálogo obtido parcialmente. Tenta novamente."`; throws `CatalogTruncationError`
- Log for truncation: `{ job_id, fetched: N, declared: M, error_type: 'CatalogTruncationError' }` — no api_key

## HTTP API Routes
- `POST /api/generate`: body `{ api_key, email }`; validates both fields; generates `job_id` + `report_id` via `crypto.randomUUID()`; `keyStore.set(job_id, api_key)`; `reportQueue.add('generate', { job_id, report_id, email, marketplace_url })`; `db.createJob(...)`; returns `202 { data: { job_id, report_id } }`; target < 2s
- `GET /api/jobs/:job_id`: returns `{ data: { status, phase_message, progress_current, progress_total, report_id } }`; `progress_current` and `progress_total` are integers or null (null in `queued`, `building_report`, `complete` phases; non-null during `fetching_catalog` and `scanning_competitors`); 404 for unknown; < 100ms target
- `GET /api/reports/:report_id`: `WHERE report_id = ? AND expires_at > now`; returns `{ data: { summary, opportunities_pt, opportunities_es, quickwins_pt, quickwins_es } }`; 404 response: `{ error: "report_not_found", message: "Este relatório expirou ou não existe. Gera um novo relatório para obteres dados actualizados." }`
- `GET /api/reports/:report_id/csv`: returns `csv_data` with `Content-Type: text/csv`; `Content-Disposition: attachment; filename="marketpilot-report.csv"`; < 3s target
- `GET /report/:report_id`: static route returning `public/report.html`
- `GET /health`: returns `200 { status: 'ok' }` (Coolify health check)
- NOT REGISTERED: `GET /api/reports` (no listing); `GET /api/jobs` (no listing)
- `src/middleware/errorHandler.js`: Fastify `setErrorHandler`; maps to `{ error: string, message: string }`

## CSV Schema
- Columns: `EAN`, `product_title`, `shop_sku`, `my_price`, `pt_first_price`, `pt_gap_eur`, `pt_gap_pct`, `pt_wow_score`, `es_first_price`, `es_gap_eur`, `es_gap_pct`, `es_wow_score`
- Contains ALL analyzed products (not just opportunities), both channels
- Filename in frontend: `marketpilot-report-{first-8-chars-of-report-id}.csv`

## Frontend — Existing HTML Pages (Do NOT Modify Structure)
- Design system already in HTML: Tailwind CSS via CDN, Material Symbols Outlined icons, Manrope (headlines) + Inter (body) via Google Fonts
- Color palette: Primary `#002366` (navy), Secondary `#475569`, Green `#16A34A`, Red `#DC2626`, Blue `#2563EB`, Background `#F8FAFC`
- `public/js/form.js`, `public/js/progress.js`, `public/js/report.js` start as empty stubs; JS wires behaviour only

## form.js Behaviour
- Validate before POST: API key empty → red border + `"Introduz a tua chave API do Worten para continuar."`; email empty → `"Introduz o teu email para receber o relatório."`; invalid email → `"Introduz um email válido."`; focus to first invalid field; button does NOT enter loading state on client validation failure
- Valid submit: button spinner + `"A gerar..."`, inputs disabled; POST to `/api/generate`
- 202 response: navigate to `/progress?job_id={job_id}&report_id={report_id}`
- Non-success / network error: loading clears, inline error above button: `"Algo correu mal. Tenta novamente ou contacta o suporte."`
- Server 400 key format error: API key red border + `"O formato da chave não é válido. Verifica se copiaste a chave correcta do portal Worten."`
- Errors linked via `aria-describedby="field-error-id"` set dynamically by form.js

## progress.js Behaviour
- On page load: immediately populate URL field with `{APP_BASE_URL}/report/{report_id}` (from query params) — before any poll
- Poll `GET /api/jobs/:job_id` every 2 seconds
- Progress bar fill by phase: `fetching_catalog` → ~30%; `scanning_competitors` → ~80% (crawl animation); `building_report` → ~95%; `complete` → 100%
- Live status line: compose `{phase_message} ({progress_current} / {progress_total} produtos)` when both count fields non-null, else `{phase_message}` alone; numbers formatted with pt-PT locale (thousand separator is `.`)
- Progress bar ARIA: `role="progressbar"`, `aria-valuemin="0"`, `aria-valuemax="100"`, `aria-valuenow` updated each transition
- Copy button: `navigator.clipboard.writeText()`; icon → checkmark, outline green (`#16A34A`) for 2s then revert; fallback: select text + tooltip `"Link seleccionado — copia com Ctrl+C"`; `aria-label="Copiar link do relatório"`
- `status: "complete"`: bar 100%, `"Relatório pronto!"`, after 1.5s navigate to `/report/{report_id}`; fallback if no redirect in 3s: show `"O teu relatório está pronto — [ver relatório →]"`
- `status: "error"`: polling stops; bar fill → red (`#DC2626`) at current position; `"PROCESSAMENTO EM TEMPO REAL"` label hidden; status → server `phase_message`; link box label → `"Este link não está disponível — a geração falhou."`; show `"Tentar novamente"` (→ `/`) + `"Contacta-nos"` link
- Numbers formatted with Portuguese locale (`.` thousand separator)
- job_id and report_id from URL query params only — never localStorage/sessionStorage

## report.js Behaviour
- Fetch `GET /api/reports/{report_id}` on load; report_id from URL path
- Skeleton while fetch in flight: grey shimmer placeholders for stat cards; 4 shimmer rows for tables; PT/ES toggle disabled (`pointer-events: none`, reduced opacity); CSV link hidden; header date `"—"`; CTA banner renders immediately
- On fetch success: instant swap (no fade); header date in Portuguese long format (e.g. `"14 de Abril de 2026"`); PT default active
- Both channels loaded into memory on first fetch — no re-fetch on toggle
- PT/ES toggle: `role="group"`, `aria-label="Canal"`, `aria-pressed` on each button updated on click; instant, no reload
- No ES data edge case: `"Sem dados para Worten ES — este catálogo não tem ofertas activas neste canal."` per section
- Stat cards: `"Em 1.º lugar"` (green), `"A perder posição"` (red), `"Sem concorrência"` (blue)
- Opportunities table: rows pre-sorted by WOW DESC (no client re-sort); first row `#EFF6FF` tint; price format `"€799,00"` (comma decimal, dot thousands); gap € `"−€6,50"` in red `#DC2626`; gap % red pill badge; WOW score as right-aligned number; empty state: `"Estás em 1.º lugar em todos os produtos neste canal."`
- Quick Wins table: no first-row highlight; score column = short horizontal navy bar (relative width); empty state: `"Não há vitórias rápidas disponíveis neste canal."`
- CSV download: requests `GET /api/reports/{report_id}/csv`; filename `marketpilot-report-{first-8-chars}.csv`; if latency > 1s show `"A preparar..."`; link hidden during skeleton
- CTA: `const CTA_URL` at top of `report.js` (not in HTML); `target="_blank"` + `rel="noopener noreferrer"`
- 404 response: expiry card with clock icon, `"Este relatório já não está disponível"`, body explaining 48h TTL, button `"Gerar um novo relatório →"` → `/`; header + CTA remain visible
- 5xx/network error: warning triangle, `"Não foi possível carregar o relatório"`, `"Recarregar"` button (`window.location.reload()`), `"Contacta-nos"` link; header + CTA remain visible
- Mobile (<640px): stat cards stack vertically (Tailwind `sm:` classes); tables `overflow-x: auto`; `"← desliza para ver mais →"` hint below each table; row font ≥ 14px
- Desktop (>1024px): three-column stat cards, full-width tables; PT/ES toggle always two pills (never collapses)

## Cleanup
- `src/cleanup/expiredReports.js`: cron every hour; `DELETE FROM reports WHERE expires_at < unixepoch()`; logs `[cleanup] Deleted N expired report(s)` only if `changes > 0`; started at server init (not separate process); failure caught + logged without crashing server

## Environment Variables (Required)
- `PORT`, `NODE_ENV`, `REDIS_URL`, `SQLITE_PATH`, `RESEND_API_KEY`, `APP_BASE_URL`, `WORTEN_BASE_URL`, `LOG_LEVEL`
- `src/config.js`: reads all vars, validates non-empty, throws descriptive error on startup if any missing
- `RESEND_API_KEY` not set → `sendReportEmail` logs warning and returns (graceful degradation)

## Email
- `src/email/sendReportEmail.js`: Resend; subject `"O teu relatório MarketPilot está pronto"`; body HTML with `${APP_BASE_URL}/report/${reportId}` + summary; inside try/catch — exceptions caught + logged (error type only), not re-thrown
- Worker marks job `complete` in SQLite BEFORE calling `sendReportEmail`; email failure → job status remains `complete`
- Email delivery attempted within 5 minutes of completion; failure does not affect report accessibility

## Performance Targets (NFRs)
- NFR-P1: form submit → job enqueued + report_id returned < 2s
- NFR-P2: generation ≤ 5,000 SKUs < 3 min
- NFR-P3: generation 5,001–31,000 SKUs < 10 min
- NFR-P4: report page load < 2s
- NFR-P5: CSV download initiation < 3s
- NFR-R1: ≥ 98% success rate for valid active API keys with non-empty catalogs
- NFR-R2: never silent truncation — if OF21 fetched ≠ total_count → fail with explicit error
- NFR-R3: email delivery attempted within 5 min of job completion; email failure does not affect job status or report access
- NFR-R4: expired URL must return 404 on 100% of requests within 48h TTL
- Polling response consistently < 100ms (single SQLite read)

## BullMQ Config
- Queue named `'report'`; `defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 5000 } }`
- Redis unreachable → app fails to start with clear error (fail-fast)

## Epic-Story Map
- Epic 1 (Foundation): 1.1 Project Scaffold; 1.2 Fastify+Pino redaction; 1.3 SQLite+Drizzle schema; 1.4 BullMQ+Redis; 1.5 Docker+Coolify
- Epic 2 (Key Security): 2.1 keyStore module; 2.2 Worker scaffold + key lifecycle
- Epic 3 (Pipeline): 3.1 Mirakl API client+retry; 3.2 OF21 catalog fetch+pagination; 3.3 P11 competitor scan; 3.4 WOW+Quick Wins scoring; 3.5 Report persistence+CSV; 3.6 Email dispatch; 3.7 Full worker orchestration+phase updates
- Epic 4 (HTTP API): 4.1 POST /api/generate; 4.2 GET /api/jobs/:id polling; 4.3 GET /api/reports/:id + CSV
- Epic 5 (Frontend Form+Progress): 5.1 form.js; 5.2 progress.js
- Epic 6 (Frontend Report): 6.1 Data fetch+skeleton+Your Position+PT/ES toggle; 6.2 Opportunities+Quick Wins tables; 6.3 CSV+CTA; 6.4 Mobile layout verification; 6.5 Expired+error states; 6.6 Accessibility baseline
- Epic 7 (Error Handling): 7.1 Empty catalog+auth failure; 7.2 total_count mismatch; 7.3 P11 rate limit+partial data recovery
- Epic 8 (Governance): 8.1 Hourly TTL deletion cron; 8.2 No listing endpoint + cross-seller isolation verification

## Story 1.1 Status
- Implementation complete; code review complete (per sprint-status.yaml)

## Story Dependencies (Build Order)
- 1.3 → 1.4 → 2.1 → 2.2 (security foundation before pipeline)
- 2.2 → 3.1 → 3.2 → 3.3 → 3.4 → 3.5 → 3.6 → 3.7 (pipeline in sequence)
- 1.2 + 3.7 → 4.1 → 4.2 → 4.3 (HTTP layer after pipeline)
- 4.1 → 5.1 → 5.2 (form before progress)
- 4.3 → 6.1 → 6.2 → 6.3 → 6.4 → 6.5 → 6.6 (report page after API)
- 3.2 + 3.3 → 7.1; 3.2 → 7.2; 3.3 → 7.3 (error handling after pipeline stages)
- 3.5 → 8.1; 4.3 → 8.2 (governance after persistence + routes)

## Cross-Seller Isolation Rules
- Every SQL query on `reports` table uses `WHERE report_id = ?` — no multi-report selects or cross-seller aggregates
- No JOIN between `generation_jobs` and `reports` accessible via HTTP route
- `job_id` never exposed in final report URL — only `report_id` appears in URL
- No sequential or predictable ID pattern — UUIDs only

## Story Acceptance Criteria (Compressed)

### Epic 1 — Foundation

- 1.1 deps: fastify, @fastify/static, bullmq, ioredis, better-sqlite3, drizzle-orm, drizzle-kit, resend, node-cron, uuid; `"type":"module"`; dir structure matches spec; .env.example: PORT, NODE_ENV, REDIS_URL, SQLITE_PATH, RESEND_API_KEY, APP_BASE_URL, WORTEN_BASE_URL, LOG_LEVEL; .gitignore: .env, node_modules/, *.db, *.db-shm, *.db-wal; public HTML from Stitch — confirm present, no authoring; form/progress/report.js as empty stubs
- 1.2 Pino redact paths `['req.headers.authorization','req.body.api_key','*.api_key','*.Authorization']` censor `'[REDACTED]'`; `trustProxy:true`; GET /health → 200; @fastify/static for /public/**; errorHandler as setErrorHandler; verify: POST api_key → log shows `[REDACTED]`
- 1.3 generation_jobs columns as spec, NO api_key column; reports columns as spec; idx_reports_expires_at; queries.js exports: createJob, updateJobStatus, updateJobError, insertReport, getReport, getJobStatus; no raw SQL outside queries.js (except schema.js); getReport returns null (not throws) if expired/not found
- 1.4 Queue named `'report'`; Redis at REDIS_URL; fail-fast if unreachable; defaultJobOptions: attempts:3, backoff:{type:'exponential',delay:5000}
- 1.5 Single container: Node.js 22, Fastify+BullMQ worker, port 3000, SQLite at SQLITE_PATH (Docker volume); docker-compose.yml: app + redis (Redis 7 Alpine), app depends_on redis; Traefik terminates TLS; HTTP→HTTPS redirect

### Epic 2 — Key Security

- 2.1 keyStore exports set/get/delete/has; backing Map NOT exported; no serialisation imports; no .keys()/.entries() enumeration; api_key never appears in any queue.add() call — verified by code review
- 2.2 Job data: {job_id, report_id, email, marketplace_url} — NO api_key; keyStore.get undefined → fail: `"A sessão expirou. Por favor, submete o formulário novamente."`; finally block: keyStore.delete(job_id) on success AND failure; error catch logs only {job_id, error_code, error_type} — NOT err.message

### Epic 3 — Pipeline

- 3.1 Retry 429/5xx: delays 1s,2s,4s,8s,16s (max 30s), 5 retries; throws MiraklApiError after exhaustion; mirAklGet(baseUrl, endpoint, params, apiKey) — apiKey as param, not module-level; no direct fetch() to Mirakl elsewhere
- 3.2 OF21: max=100/page (offset pagination); assert allOffers.length === total_count BEFORE active filter → CatalogTruncationError on mismatch (no server-side active filter exists; total_count counts all offers); filter offer.active === true (NOT offer.state — that field does not exist); onProgress(n,total) every 1,000 offers; returns [{ean, shop_sku, price, product_title}]; reuse pagination from scale_test.js. See MCP-Verified Endpoint Reference for field specifics
- 3.3 P11: batches of 100 EANs via product_references=EAN|x,EAN|y (NOT product_ids — that expects SKUs not EANs, silently returns 0); TWO calls per batch (one per channel) with pricing_channel_code=WRT_PT_ONLINE (resp. WRT_ES_ONLINE) so offer.total_price reflects that channel; 10 concurrent via Promise.allSettled(); filter offer.active===true; take positions 0+1 of offer.total_price per channel → {pt:{first,second},es:{first,second}}; channel bucketing by which call returned the offer (NOT offer.channel_code — does not exist; NOT offer.channels — empty on competitors); onProgress every 500 EANs; failed batches after 5 retries → logged (type only), EANs → uncontested, job continues; reuse batch+concurrent from opportunity_report.js. See MCP-Verified Endpoint Reference for field specifics
- 3.4 For my_price > competitor_first: gap=my_price-first; gap_pct=gap/first; wow_score=my_price/gap_pct; is_quick_win=gap_pct<=0.02; winning=my_price<=first (no WOW); uncontested=no competitor data; opportunities_pt/es sorted wow_score DESC; summary per channel: {total,winning,losing,uncontested}
- 3.5 INSERT reports: expires_at=now+172800; CSV columns: EAN, product_title, shop_sku, my_price, pt_first_price, pt_gap_eur, pt_gap_pct, pt_wow_score, es_first_price, es_gap_eur, es_gap_pct, es_wow_score (ALL products, both channels); getReport: WHERE expires_at>now; null (not throws) if expired/not found
- 3.6 Resend; subject: `"O teu relatório MarketPilot está pronto"`; body: APP_BASE_URL/report/reportId + summary; try/catch — exceptions caught+logged (type only), not re-thrown; worker marks complete BEFORE email; email failure → status remains complete; RESEND_API_KEY unset → log warning, return (graceful degradation)
- 3.7 Phase messages update at each transition; finally: keyStore.delete always; 0 offers+200 → EmptyCatalogError; 401/403 → MiraklApiError; total_count mismatch → CatalogTruncationError; error_message always from getSafeErrorMessage — never raw error

### Epic 4 — HTTP API

- 4.1 Validates api_key non-empty + valid email → 400 if invalid; crypto.randomUUID() for job_id+report_id; keyStore.set(job_id, api_key) — ONLY place; queue.add payload has NO api_key; db.createJob; returns 202 {data:{job_id,report_id}} < 2s
- 4.2 Returns {data:{status, phase_message, progress_current, progress_total, report_id}}; `progress_current`/`progress_total` may be null per phase; 404 for unknown job_id; < 100ms; no api_key in response
- 4.3 GET /api/reports/:id: WHERE report_id=? AND expires_at>now → report JSON; 404: `"Este relatório expirou ou não existe..."`; GET /api/reports/:id/csv: csv_data, Content-Type:text/csv, Content-Disposition:attachment filename="marketpilot-report.csv", < 3s; GET /api/reports (no id) NOT registered → 404; GET /report/:id → public/report.html

### Epic 5 — Frontend Form & Progress

- 5.1 Validation errors: empty api_key → `"Introduz a tua chave API do Worten para continuar."`; empty email → `"Introduz o teu email para receber o relatório."`; invalid email → `"Introduz um email válido."`; errors via aria-describedby; valid submit: spinner + "A gerar...", inputs disabled; POST {api_key,email}; 202 → /progress?job_id=&report_id=; non-success → "Algo correu mal..."; 400 key format → `"O formato da chave não é válido..."`
- 5.2 On load: URL field immediately = APP_BASE_URL/report/report_id (before poll); copy: clipboard.writeText(), icon→checkmark green 2s, fallback: select + `"Link seleccionado — copia com Ctrl+C"`; progress fills: ~30% fetching_catalog, ~80% (crawl) scanning_competitors, ~95% building_report, 100% complete; progress bar ARIA: role=progressbar, aria-valuenow updated; complete→1.5s navigate, fallback at 3s show link; error: bar→red, label `"Este link não está disponível — a geração falhou."`, show "Tentar novamente"+"Contacta-nos"; job_id+report_id from URL params only, never localStorage

### Epic 6 — Frontend Report

- 6.1 Skeleton: grey shimmer stat cards+4 table rows, toggle disabled (pointer-events:none), CSV hidden, date "—", CTA renders immediately; on success: instant swap, date Portuguese long format ("14 de Abril de 2026"), PT default; both channels in memory on first fetch, no re-fetch on toggle; toggle: role=group, aria-label=Canal, aria-pressed updated; ES no data → `"Sem dados para Worten ES..."` per section
- 6.2 Opportunities: pre-sorted WOW DESC (no client re-sort); first row #EFF6FF tint; price "€799,00" (comma decimal, dot thousands); gap € "−€6,50" red #DC2626; gap % red pill; WOW right-aligned number; empty: `"Estás em 1.º lugar em todos os produtos neste canal."`; Quick Wins: no first-row tint; score = horizontal navy bar (relative width); empty: `"Não há vitórias rápidas disponíveis neste canal."`
- 6.3 CSV request to /api/reports/{id}/csv; filename: `marketpilot-report-{first-8-chars}.csv`; latency>1s: "A preparar..."; CSV link hidden during skeleton; CTA_URL: const at top of report.js (not in HTML); target="_blank" rel="noopener noreferrer"
- 6.4 Mobile (<640px): stat cards stack vertically; tables overflow-x:auto; `"← desliza para ver mais →"` hint; font ≥ 14px; desktop (≥1024px): no horizontal scroll, PT/ES always 2 pills; form trust message above fold all viewports
- 6.5 404: expiry card — clock icon, `"Este relatório já não está disponível"`, 48h explanation, `"Gerar um novo relatório →"` → /; 5xx/network: `"Não foi possível carregar o relatório"`, "Recarregar" (window.location.reload()), "Contacta-nos"; header+CTA remain visible in both cases
- 6.6 form: inputs have labels; errors via aria-describedby set by form.js; progress: role=progressbar, aria-valuemin/max/now, copy button aria-label="Copiar link do relatório"; report: toggle role=group aria-label=Canal, aria-pressed updated on click; colour not sole differentiator

### Epic 7 — Error Handling

- 7.1 401/403 → `"Chave API inválida ou sem permissão. Verifica se a chave está correcta e se a tua conta está activa no Worten."`; 0 offers+200 → `"Não encontrámos ofertas activas no teu catálogo. Verifica se a tua conta está activa no Worten."`; both: keyStore.delete in finally, status=error, progress shows message + "Contacta-nos"; no raw API response in DB
- 7.2 fetched.length !== total_count → CatalogTruncationError: `"Catálogo obtido parcialmente. Tenta novamente."`; stored via getSafeErrorMessage; keyStore.delete in finally; log: {job_id, fetched:N, declared:M, error_type:'CatalogTruncationError'} — no api_key
- 7.3 P11 429 backoff: 1s→2s→4s→8s→16s (max 30s); during wait: `"A verificar concorrentes — a aguardar limite de pedidos…"`; batch exhausted after 5 retries → EANs→uncontested, report generated from available data

### Epic 8 — Governance

- 8.1 cron every hour: `DELETE FROM reports WHERE expires_at < unixepoch()`; log `[cleanup] Deleted N expired report(s)` only if changes>0; started at server init (not separate process); cron failure caught+logged without crashing; after deletion: expired id → 404
- 8.2 GET /api/reports (no id) → 404 (not registered); GET /api/jobs (no id) → 404; every queries.js reports read uses WHERE report_id=?; no cross-report JOINs in HTTP-accessible queries; job_id never in final report URL
