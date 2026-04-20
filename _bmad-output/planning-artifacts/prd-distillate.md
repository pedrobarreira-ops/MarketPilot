---
type: bmad-distillate
sources:
  - "prd.md"
downstream_consumer: "BMAD create-story and dev-story skills running in Claude Code VSCode extension for a solo developer building a Mirakl marketplace repricing tool MVP"
created: "2026-04-16"
token_estimate: 3100
parts: 1
---

## Product Identity
- MarketPilot Free Report: self-serve, zero-commitment Mirakl repricing analysis tool; form → async job → persistent report
- Primary function: sales instrument to convert warm/cold Worten sellers into paying automation clients
- Scope: Worten PT (`WRT_PT_ONLINE`) and Worten ES (`WRT_ES_ONLINE`) only
- API constraint: Mirakl MMP API only — no MiraklConnect under any circumstances
- PRI01 explicitly out of scope — read-only journey (OF21 + P11 only)
- Build context: greenfield, solo developer (Pedro), April 2026 pilot window
- API foundations confirmed: OF21 + P11 validated live in April 2026

## Target Users
- Portuguese and Spanish SME sellers on Worten; 1,000–100,000 SKUs; ≥ €10k/month GMV
- Currently repricing manually or not at all
- Journey 1 (Rui): warm lead, ~8,000 SKUs, Pedro generates report on their behalf
- Journey 2 (Ana): cold prospect, ~3,200 SKUs, self-generates
- Journey 3 (Miguel): edge case — valid key, suspended account, zero-SKU result
- Journey 4 (Pedro): operator, live sales demo, ~12,000 SKUs, no special admin mode needed

## Core Trust Mechanism
- API key: session-only, never persisted; held in server-side memory for job duration only, then discarded
- Trust statement on form at same visual prominence as submit button: "A tua chave é usada uma vez para gerar este relatório e nunca fica armazenada."
- Key must not appear in logs, error messages, DB records, job queue payloads, async contexts — on all paths including failure
- Session cleanup required on success AND failure paths
- Rejected: Boardfy, Boostmyshop-style ongoing credential storage; this product inverts that pattern

## Report Architecture
- Unique `report_id` (UUID v4) generated at job creation; returned to client immediately (before generation completes)
- Report persisted for ≥ 48 hours from generation; accessible via `/report/{report_id}` with no re-authentication
- Report URL displayed on progress screen immediately — primary defence against email delivery failure
- Report output automatically deleted after 48h TTL
- No public index or listing of report IDs; UUID is only access token
- Stored payload: JSON + CSV blob; ~1–5 MB for 30k-SKU catalog
- Key architectural rule: API key ≠ persisted; report output = persisted

## Data Model (minimum viable)
- `generation_job`: `job_id`, `report_id`, `status`, `marketplace_instance`, `email`, `created_at`, `completed_at`, `error_message` — api_key NOT a field
- `report`: `report_id`, `generated_at`, `expires_at`, `summary` (JSON), `opportunities_pt` (JSON), `opportunities_es` (JSON), `quickwins_pt` (JSON), `quickwins_es` (JSON), `csv_data` (blob or path) — no raw API responses stored

## Scoring & Ranking
- WOW score: `WOW = my_price / gap_pct` where `gap_pct = (my_price − competitor_total_price[0]) / competitor_total_price[0]`
- WOW score calculated only when `my_price > competitor_total_price[0]` (seller not in 1st place); seller in 1st place excluded
- Quick Win: `gap_pct ≤ 0.02` (seller's price exceeds competitor by ≤ 2%)
- Uses `total_price` (price + shipping) from P11 — NOT `price` alone (incorrect gap if price used)
- Ranking rationale: high-ticket product losing by small margin scores higher than cheap product losing by same margin %

## Mirakl API Requirements
- OF21: paginate all active offers; collect EAN + `shop_sku` + `price` + channel; assert fetched count vs `total_count`; fail loudly if mismatch
- OF21 scale validated: Gabriel's catalog (31,179 products) fetched in 173 seconds, zero pagination errors (April 2026)
- P11: batch 100 EANs/call; concurrent calls within Mirakl rate limits (no unbounded concurrency); filter `active: true` only; use `total_price` per channel
- P11 per-channel: `all_prices` array contains `WRT_PT_ONLINE` and `WRT_ES_ONLINE` in single call — both channels from one API key
- Rate-limit handling: HTTP 429 → exponential backoff + retry; not surfaced to user as raw error

## Generation Job Steps (server-side)
1. Validate API key format (non-empty, reasonable length) + email format
2. Enqueue job; return `job_id` + `report_id` to frontend immediately
3. Step A — OF21 catalog fetch: paginate all active offers; assert total_count; fail loudly on mismatch
4. Step B — P11 competitor scan: batch 100 EANs, concurrent within rate limits, filter active:true, extract total_price for positions 1 and 2 per channel
5. Step C — Scoring: calculate gap, gap_pct, WOW per product per channel; flag Quick Wins (gap_pct ≤ 0.02)
6. Step D — Persist report: write to report table; set expires_at = now + 48h
7. Step E — Send email: dispatch with report link; non-blocking; job marked complete regardless of email success
8. Step F — Cleanup: clear API key from all in-memory context; update job status to complete
- If job process crashes mid-execution: key is lost — acceptable; seller re-enters it

## Processing Model
- Async with progress feedback; not instantaneous (2–10 min for large catalogs)
- Form submits → server enqueues, returns `job_id` + `report_id` immediately
- Progress screen polls job status: `fetching_catalog` → `scanning_competitors` → `building_report` → `complete` / `error`
- On `complete`: frontend redirects/renders `/report/{report_id}`
- On `error`: user-actionable message; session cleaned regardless

## Frontend — Form Page
- Fields: Shop API Key (text, required), Email (email, required); no channel selector
- Trust statement at button level, same visual weight as submit
- Privacy notice link (one line, below trust message)
- Submit → POST to generation endpoint; form replaced by progress screen

## Frontend — Progress Screen
- Displays persistent report URL immediately on job creation (before generation completes) — copy independently of email
- Live status messages: "A obter catálogo…" → "A verificar concorrentes (X de Y produtos)…" → "A construir relatório…"
- Messages reflect actual job phases — not fake countdown
- On error: clear non-technical message + "contacta-nos" link; no raw API errors

## Frontend — Report Page (`/report/{report_id}`)
- Three sections: Your Position → Biggest Opportunities → Quick Wins
- Your Position: headline stat cards PT and ES side-by-side — total SKUs, winning, losing, uncontested
- Biggest Opportunities: table per channel, sorted by WOW descending; columns: product name/EAN, current price, competitor price, gap €, gap %, WOW score
- Quick Wins: table per channel, products with gap_pct ≤ 0.02; same columns
- "Download Full CSV" button
- CTA at bottom: "Start automating this" → contact form or WhatsApp/email
- Mobile-responsive; screen-share-friendly
- Accessible within 48h TTL, no re-authentication
- No filtering/sorting controls at MVP — single ranked list only

## Functional Requirements (FR1–FR29)
- FR1: seller submits API key + email to initiate generation
- FR2: both channels (WRT_PT_ONLINE, WRT_ES_ONLINE) analysed from single key — no channel selection
- FR3: OF21 fetch handles all pages; no silent truncation
- FR4: P11 batches 100 EANs/call; active:true only; total_price for comparisons
- FR5: WOW score per product per channel where seller not in 1st place (formula above)
- FR6: Quick Wins = gap_pct ≤ 0.02 (same gap_pct as FR5)
- FR7: unique unguessable report_id generated at job creation; returned to client before generation completes
- FR8: real-time progress status reflecting actual processing phases
- FR9: Your Position section — headline counts per channel
- FR10: Biggest Opportunities — all products not in 1st place, sorted by WOW desc, per channel
- FR11: Quick Wins — all products gap_pct ≤ 0.02, per channel
- FR12: each product row shows name/EAN, seller price, competitor total_price, gap €, gap %, WOW
- FR13: CTA to enquire about repricing automation service
- FR14: report accessible via persistent URL ≥ 48h post-generation, no API key re-entry
- FR15: persistent report URL displayed on progress screen at job creation (before email, before completion)
- FR16: confirmation email with persistent report link sent on generation complete
- FR17: CSV export of full catalog analysis — all SKUs, both channels
- FR18: trust statement at form level, same prominence as submit
- FR19: API key never written to any persistent store, log, job queue record, or background context
- FR20: API key cleared from all in-memory context after job completes — success AND failure
- FR21: privacy notice link at point of submission
- FR22: zero-SKU or empty catalog → user-actionable error, not raw API error
- FR23: any generation failure → user-actionable error with next steps
- FR24: API key session cleanup on all failure paths — no error condition allows key to persist
- FR25: progress screen shows descriptive phase messages, not only spinner
- FR26: report output auto-deleted after 48h from generation
- FR27: report accessible only via report_id — no public index or discovery
- FR28: email used only for report delivery + disclosed sales follow-up; stated at collection
- FR29: no report contains or exposes data belonging to another seller

## Non-Functional Requirements
- NFR-P1: form submission → job enqueued + report_id returned < 2 seconds
- NFR-P2: full generation ≤ 5,000 SKUs < 3 minutes
- NFR-P3: full generation 5,001–31,000 SKUs < 10 minutes
- NFR-P4: pre-computed report page load < 2 seconds
- NFR-P5: CSV download initiation < 3 seconds
- NFR-S1: HTTPS only; HTTP rejected; API key over plaintext HTTP rejected
- NFR-S2: API key absent from all logs, DB records, error messages, job queue payloads, background contexts
- NFR-S3: report accessible only via UUID; no index/list endpoint; no sequential IDs
- NFR-S4: `Authorization` header and `api_key` fields redacted by logging middleware before write
- NFR-S5: no cross-seller data — isolated by report_id with no shared query paths
- NFR-R1: generation success rate ≥ 98% for valid active keys with non-empty catalogs
- NFR-R2: OF21 fetched count ≠ total_count → job fails with explicit error; no partial/silent truncation
- NFR-R3: email delivery attempted within 5 min of job completion; email failure does not affect job status or report access
- NFR-R4: valid unexpired report URL must resolve and return full report on 100% of valid requests within 48h TTL
- NFR-I1: Mirakl MMP API non-200 and HTTP 429 → exponential backoff + retry; not surfaced as raw errors
- NFR-I2: unrecoverable Mirakl errors → user-actionable message; no blank screen/timeout/stack trace
- NFR-I3: email provider failure must not prevent report access — progress screen URL is primary access mechanism

## Success Criteria
- Form abandonment rate < 30% after page load
- Report generation success rate > 98% for valid API keys
- Time to report render (5k SKUs) < 3 min; (30k SKUs) < 10 min
- Email delivery < 5 min post-generation
- Report → CTA click rate > 40%
- Report → paid conversion ≥ 1 in 5 (M$P target)
- ≥ 3 reports generated for warm leads before end of April 2026
- Zero failed report generations due to API errors or unhandled edge cases
- Seller identifies single biggest recoverable opportunity within 30 seconds of report loading

## Scope Boundaries
- IN (MVP): input form, async generation, progress screen, OF21 + P11 integration, WOW scoring, Quick Wins, Your Position, report persistence 48h, email delivery, CSV export, CTA, session cleanup, error handling
- OUT (MVP): PRI01 writes, channel selection, filtering/sorting controls, admin UI, user accounts, login, rate limiting/abuse prevention
- DEFERRED Phase 2: floor simulator, configurable link expiry, branded PDF, rate limiting, automated outreach-triggered generation, GDPR DPA
- DEFERRED Phase 3: full self-serve public launch, onboarding flow, additional marketplaces (Phone House ES, PCComponentes, Carrefour ES, MediaMarkt), full GDPR compliance

## Implementation Stack Guidance
- Job queue: lightweight sufficient at M$P scale (1–5 concurrent reports); BullMQ on Redis or serverless function viable
- Report storage: SQLite-backed store viable at M$P scale; TTL support required
- Email: Resend, Postmark, or SendGrid — one call per completed report; failure must not fail job
- Hosting: VPS or serverless over HTTPS
- No admin UI at MVP — monitoring via provider logs

## Data Sensitivity & Privacy
- Report content (catalog snapshot + competitor pricing) is commercially sensitive; must not be publicly indexed
- Access via UUID only; no cross-seller leakage; isolated by report_id
- GDPR DPA deferred to Phase 3; M$P baseline: privacy notice linked on form; email disclosed at collection; report output deleted after 48h TTL
- Seller email may be retained for sales follow-up if disclosed at collection

## Key Risks
- HIGH MARKET RISK: sellers won't enter API key even with trust message → mitigation: Pedro generates first reports on their behalf (Journey 1); self-serve not required for M$P conversion
- MEDIUM RISK: P11 rate limiting under sustained concurrent load → backoff + retry; validate concurrent batch behaviour before first client go-live
- MEDIUM RISK: generation timeout for very large catalogs → finite job timeout; partial results or retry prompt, not silent failure
- MEDIUM RISK: report impresses but doesn't convert → CTA links directly to Pedro's contact; conversion is a conversation
- RESOURCE RISK: solo build exceeds April pilot window → prioritise Journey 1 (Pedro generates manually) first; Journey 2 self-serve can follow
- RESOURCE RISK: email delivery setup delays launch → report URL on progress screen means email not on critical path
- LOW RISK: OF21 pagination at 31k SKUs → already validated (April 2026); runtime guard: assert total_count vs fetched
- RISK: report link shared beyond intended recipient → acceptable at M$P phase; UUID + 48h TTL sufficient
