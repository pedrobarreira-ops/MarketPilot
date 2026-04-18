---
stepsCompleted: ["step-01-validate-prerequisites", "step-01-ux-incorporated", "step-02-design-epics", "step-03-create-stories", "step-04-final-validation"]
status: 'complete'
inputDocuments:
  - "_bmad-output/planning-artifacts/prd.md"
  - "_bmad-output/planning-artifacts/architecture.md"
  - "_bmad-output/planning-artifacts/ux-design.md"
  - "scripts/scale_test.js"
  - "scripts/opportunity_report.js"
  - "public/index.html"
  - "public/progress.html"
  - "public/report.html"
workflowType: 'epics'
project_name: 'MarketPilot Free Report'
user_name: 'Pedro'
date: '2026-04-15'
status: 'in-progress'
---

# MarketPilot Free Report - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for **MarketPilot Free Report**, decomposing the requirements from the PRD and Architecture document into implementable stories. Build order follows the Architecture recommendation: infrastructure → pipeline → frontend → email & cleanup.

---

## Requirements Inventory

### Functional Requirements

**Report Generation**
- FR1: A seller can submit their Worten Shop API Key and email address to initiate report generation
- FR2: The system analyses both Worten PT (`WRT_PT_ONLINE`) and Worten ES (`WRT_ES_ONLINE`) channels from a single submitted API key without requiring the seller to select a channel
- FR3: The system fetches the seller's complete active offer catalog via OF21, handling all paginated pages to ensure no products are silently truncated
- FR4: The system checks competitor prices for all fetched products via P11, batching 100 EANs per call, filtering to `active: true` offers, and using `total_price` (not `price`) for all competitive comparisons
- FR5: The system calculates a WOW score for each product per channel where the seller is not in 1st place: `WOW = my_price / gap_pct`, where `gap_pct = (my_price − competitor_total_price[0]) / competitor_total_price[0]`. Products where `my_price ≤ competitor_total_price[0]` are already in 1st place and are excluded.
- FR6: The system identifies Quick Wins as products where `gap_pct ≤ 0.02` — the seller's price exceeds the competitor's by 2% or less of the competitor's price. Uses the same `gap_pct` definition as FR5.
- FR7: The system generates a unique, unguessable report ID at job creation time and returns it to the client immediately — before generation completes
- FR8: The system provides the seller with real-time progress status updates during generation, reflecting actual processing phases

**Report Presentation**
- FR9: A seller can view a **Your Position** section showing headline counts per channel: products in 1st place, losing 1st place, and uncontested
- FR10: A seller can view a **Biggest Opportunities** section showing all products not in 1st place, sorted by WOW score descending, presented per channel
- FR11: A seller can view a **Quick Wins** section showing all products with `gap_pct ≤ 0.02`, presented per channel
- FR12: Each product row in Biggest Opportunities and Quick Wins displays: product identifier (name and/or EAN), seller's current price, competitor's 1st-place total price, gap in €, gap %, and WOW score
- FR13: A seller can view and interact with a call-to-action to enquire about the repricing automation service

**Report Access & Delivery**
- FR14: A seller can access their generated report via a persistent unique URL for a minimum of 48 hours after generation, without re-entering their API key
- FR15: The persistent report URL is displayed on the progress/completion screen at the moment the job ID is created — before email delivery and before generation completes — so the seller can copy it independently
- FR16: The system sends the seller a confirmation email containing the persistent report link upon generation completing
- FR17: A seller can download a CSV export of the full catalog analysis covering all products and both channels

**Trust & Credential Security**
- FR18: The form displays a trust statement ("Your key is used once to generate this report and never stored") at the same visual prominence as the submit action — not in fine print
- FR19: The system never writes the submitted API key to any persistent store, log entry, job queue record, or background processing context
- FR20: The system clears the API key from all in-memory context after the generation job completes — on both success and failure paths
- FR21: The form provides a privacy notice link at the point of submission

**Error Handling & Recovery**
- FR22: The system detects when a submitted API key returns an empty or zero-SKU catalog and surfaces a user-actionable error message (not a raw API error)
- FR23: The system surfaces a user-actionable error message when report generation fails for any reason — the message must indicate what the seller should check or do next
- FR24: The system performs API key session cleanup on all failure code paths — there is no error condition under which the key persists
- FR25: The progress screen displays descriptive status messages that identify the current generation phase, not only a loading indicator

**Data Governance & Privacy**
- FR26: Generated report output is automatically deleted after 48 hours from generation time
- FR27: Report data is accessible only via the unique report ID — no public index, listing, or discovery mechanism exists
- FR28: The seller's email address is used only for report delivery and disclosed sales follow-up; this use is stated at point of collection
- FR29: The system ensures no report contains, references, or exposes data belonging to another seller

---

### Non-Functional Requirements

**Performance**
- NFR-P1: Form submission to job enqueued + `report_id` returned to the client: < 2 seconds
- NFR-P2: Full report generation for catalogs ≤ 5,000 SKUs: < 3 minutes
- NFR-P3: Full report generation for catalogs 5,001–31,000 SKUs: < 10 minutes
- NFR-P4: Report page load time for a pre-computed report: < 2 seconds
- NFR-P5: CSV download initiation (response begins): < 3 seconds

**Security**
- NFR-S1: All traffic served over HTTPS; HTTP requests redirected; API key submission over plaintext HTTP must be rejected
- NFR-S2: The API key must not appear in any log entry, database record, error message, job queue payload, or background processing context at any point
- NFR-S3: Report content is accessible only via its UUID — no endpoint exposes a list or index of report IDs, and no sequential or predictable ID pattern is used
- NFR-S4: The `Authorization` header and any request field named `api_key` are redacted by logging middleware before any log is written
- NFR-S5: No cross-seller data — report storage and retrieval must be isolated by `report_id` with no shared query paths between reports

**Reliability**
- NFR-R1: Report generation success rate for valid, active API keys with non-empty catalogs: ≥ 98%
- NFR-R2: The system must never silently produce a truncated report — if OF21 fetched count does not match `total_count`, the job must fail with an explicit error rather than generate a partial report
- NFR-R3: Email delivery must be attempted within 5 minutes of job completion; email delivery failure must not affect job success status or report accessibility
- NFR-R4: Any report URL that has not yet expired must resolve and return the full report on 100% of valid requests within the 48h TTL

**Integration**
- NFR-I1: Mirakl MMP API non-200 responses and rate-limit responses (HTTP 429) must be handled with exponential backoff and retry — not surfaced directly to the user as raw errors
- NFR-I2: Mirakl API errors that are not recoverable after retry must produce a user-actionable error message (per FR22/FR23) — not a blank screen, timeout, or stack trace
- NFR-I3: Transactional email provider failure must not prevent the seller from accessing their report — the report URL displayed on the completion screen (FR15) is the primary access mechanism; email is a secondary delivery channel

---

### Additional Requirements (from Architecture)

**Stack & Tooling**
- Node.js 22 LTS with ESM modules (`"type": "module"` in package.json)
- Fastify v5 with Pino logger — `redact` config must strip `req.headers.authorization`, `req.body.api_key`, `*.api_key`, `*.Authorization` (satisfies NFR-S4)
- BullMQ v5 + Redis 7 for job queue — job data schema never includes `api_key` field (satisfies NFR-S2)
- SQLite via better-sqlite3 + Drizzle ORM — schema has no `api_key` column in any table (enforces NFR-S2 at data model level)
- Resend v4 for transactional email — single non-blocking API call per completed report
- Static HTML + Vanilla JS — no build step; no bundler
- Traefik via Coolify for HTTPS termination — Fastify configured with `trustProxy: true`

**API Key Security Architecture (HARD REQUIREMENT)**
- `src/queue/keyStore.js` is the ONLY location where an API key is ever stored — an in-memory `Map<job_id, api_key>` that is NEVER serialised
- BullMQ job data contains: `{ job_id, report_id, email, marketplace_url }` — NO `api_key`
- Worker retrieves key via `keyStore.get(job_id)` and clears it in a `finally` block unconditionally
- If `keyStore.get(job_id)` returns undefined (e.g., process restart), job fails gracefully with "session expired, resubmit" message

**Mirakl API Patterns (from existing scripts)**
- All Mirakl calls go through `src/workers/mirakl/apiClient.js` — a `fetch()` wrapper with exponential backoff (1s, 2s, 4s… max 30s, up to 5 retries) for 429/5xx
- Raw Mirakl error responses must NEVER be forwarded to the user or logged verbatim — all errors pass through `getSafeErrorMessage(err)`
- **For endpoint specifics (paths, params, response field names, pagination): the authoritative source is the "MCP-Verified Endpoint Reference" section below, which has been verified against the live Worten Mirakl instance (2026-04-18). Do NOT duplicate endpoint details in stories, architecture, or other sections — always refer back to avoid drift.**

**MCP-Verified Endpoint Reference** _(verified 2026-04-18 against Mirakl MCP AND live Worten instance via `scripts/mcp-probe.js` — treat as authoritative; do not assume beyond what is listed here)_

**OF21 — Seller Catalog Fetch**
- Endpoint: `GET /api/offers`
- Auth header: `Authorization: <api_key>` (raw key, no `Bearer` prefix)
- Pagination: offset pagination — `max=100` per page, `offset=0,100,200,…`
- **Active filter: `offer.active === true`** (boolean field) — verified on live Worten instance
- ⚠️ `offer.state` does NOT exist (verified MISSING on live response). The field `offer.state_code` exists but represents offer CONDITION (e.g., `"11"` for new), not active/inactive
- EAN lookup: `offer.product_references[].reference` where `reference_type === 'EAN'`
- Seller's own price: `offer.applicable_pricing.price` (number) — channel-agnostic default. Also: `offer.total_price = applicable_pricing.price + min_shipping_price`
- Other verified offer fields: `shop_sku`, `product_sku` (UUID, not EAN), `product_title`, `product_references[]`, `channels[]` (populated for own offers), `all_prices[]`, `min_shipping_price`, `quantity`, `inactivity_reasons[]`
- `total_count` at root of response — assert `allOffers.length === total_count` (BEFORE active filter, since `total_count` counts all offers, no server-side active filter exists on OF21)
- On truncation (`allOffers.length !== total_count`): throw `CatalogTruncationError`

**P11 — Competitor Price Scan**
- Endpoint: `GET /api/products/offers`
- **Batch param: `product_references` (NOT `product_ids`)** — format: `product_references=EAN|xxx,EAN|yyy` (pipe-delimited type|value pairs, comma-separated list, max 100 values per call)
- ⚠️ `product_ids` expects product SKUs (in Worten: UUIDs like `321b4d45-…`), NOT EANs. Using EANs with `product_ids` silently returns 0 products — verified on live Worten instance
- **Channel eligibility filter: `channel_codes=WRT_PT_ONLINE,WRT_ES_ONLINE`** — comma-separated query param; restricts which offers are returned (offers sellable on specified channel(s))
- **Channel-specific pricing: `pricing_channel_code=WRT_PT_ONLINE`** (singular, query param) — makes `offer.applicable_pricing` and `offer.total_price` reflect that channel's price. **Required to get per-channel `total_price`** — without it, `applicable_pricing.channel_code` is `null` (default/fallback pricing)
- Active filter: `offer.active === true` (boolean, required)
- ⚠️ `offer.channels` (array) on COMPETITOR offers is typically EMPTY (`[]`) — do NOT use it to bucket by channel. Channel pricing info is in `offer.all_prices[].channel_code` (string, e.g. `"WRT_PT_ONLINE"`, or `null` for default)
- ⚠️ `offer.channel_code` (singular) does NOT exist — verified MISSING
- ✅ **Competitor total_price: `offer.total_price`** (number) = "price + minimum shipping rate" — **CORRECT field for competitor comparison**
- ⚠️ `offer.price` = offer price WITHOUT shipping — do NOT use for competitor comparison
- EAN lookup on response: `product.product_references[].reference` where `reference_type === 'EAN'`
- `product.product_title` (string, required), `product.product_sku` (UUID)
- `product.total_count` = number of offers FOR THAT PRODUCT (per-product count, not batch total)

**P11 — correct usage pattern (from live probe):**
To get per-channel competitor prices, make **two P11 calls per batch** — one per channel — each with `pricing_channel_code` set to that channel. This makes `offer.total_price` reflect that channel's price. Combine results into `{pt:{first,second}, es:{first,second}}` keyed by EAN.

```
GET /api/products/offers?product_references=EAN|x,EAN|y&channel_codes=WRT_PT_ONLINE&pricing_channel_code=WRT_PT_ONLINE
GET /api/products/offers?product_references=EAN|x,EAN|y&channel_codes=WRT_ES_ONLINE&pricing_channel_code=WRT_ES_ONLINE
```

For each returned offer: filter `offer.active === true`, take `offer.total_price` at positions 0 (first) and 1 (second).

**PRI01 — Import Price File (Epic 4+)**
- Endpoint: `POST /api/offers/pricing/imports`
- Content-Type: `multipart/form-data` with `file` field (form key is `file`)
- CSV format (semicolon-delimited): `"offer-sku";"price";"discount-price";"discount-start-date";"discount-end-date"` — optional columns for volume/channel/scheduled/customer pricing
- Max 50 prices per offer (if you need to represent 51+ channel/volume prices for a single offer)
- Returns `201 { import_id: "<uuid>" }` (also `importId` deprecated)
- Call frequency: recommended every 5 min, **max once per minute** (hard limit)
- ⚠️ **Import mode is DELETE AND REPLACE** — any price for an offer NOT in the submitted CSV will be DELETED. Always submit the complete set of prices for each offer in one call

**PRI02 — Import Status (Epic 4+)**
- Endpoint: `GET /api/offers/pricing/imports?import_id=<id>` — poll after PRI01
- Response: `data[].status` enum: `WAITING | RUNNING | COMPLETE | FAILED`
- Other fields: `lines_in_success`, `lines_in_error`, `offers_in_error`, `offers_updated`, `reason_status`, `has_error_report`
- Call frequency: recommended every 5 min, **max once per minute**

**PRI03 — Error Report (Epic 4+)**
- Endpoint: `GET /api/offers/pricing/imports/{import_id}/error_report`
- Returns CSV of errored rows (first column = line number, second = error reason)
- Use only when `PRI02` reports `has_error_report: true`
- Call frequency: recommended every 5 min after each PRI02, **max once per minute**

**Progress Phases (Portuguese)**
- Queued: `"A preparar…"`
- OF21 start: `"A obter catálogo…"` / progress: `"A obter catálogo… ({n} de {total} produtos)"`
- P11 start: `"A verificar concorrentes…"` / progress: `"A verificar concorrentes ({n} de {total} produtos)…"`
- Building: `"A construir relatório…"`
- Complete: `"Relatório pronto!"`
- Error: result of `getSafeErrorMessage(err)`

**Database Schema (Drizzle + SQLite)**
- `generation_jobs`: `job_id`, `report_id`, `status`, `phase_message`, `email`, `marketplace_url`, `created_at`, `completed_at`, `error_message` — **NO `api_key` column**
- `reports`: `report_id`, `generated_at`, `expires_at` (now + 172800s), `email`, `summary_json`, `opportunities_pt_json`, `opportunities_es_json`, `quickwins_pt_json`, `quickwins_es_json`, `csv_data`
- Index: `idx_reports_expires_at ON reports(expires_at)` for cron deletion performance

**Infrastructure**
- Single Docker container running Fastify server + BullMQ worker in same Node.js process
- SQLite file on Docker volume (survives container restarts)
- Coolify-managed Redis service (separate container, ~50 MB RAM)
- Coolify auto-deploy from Git repo; environment variables in Coolify dashboard
- No CI/CD pipeline at M$P phase

**Directory Structure (must follow)**
- `src/routes/` — HTTP only; no business logic; calls `src/db/queries.js` for DB access
- `src/workers/` — all business logic, Mirakl calls, scoring
- `src/queue/keyStore.js` — sole API key store; no other file holds a key reference
- `src/db/queries.js` — all SQLite reads/writes; no raw SQL outside this file (except schema.js)
- `public/` — static HTML, CSS, JS; served by `@fastify/static`

**Reference Scripts to Reuse (do not rewrite from scratch)**
- `scripts/scale_test.js` — working OF21 pagination logic (validated at 31,179 products)
- `scripts/opportunity_report.js` — working P11 batch + concurrent call logic

---

### UX Design Requirements

UX document: `_bmad-output/planning-artifacts/ux-design.md` — visual design locked from Google Stitch mockups.

**Critical implementation note:** The three HTML pages (`public/index.html`, `public/progress.html`, `public/report.html`) **already exist** — built from Stitch mockups using Tailwind CSS (CDN), Material Symbols icons, and Google Fonts (Manrope + Inter). The dev agent must wire up JS to these existing files. Do NOT rebuild them from scratch.

- UX-DR1: **Design system (already in HTML)** — Tailwind CSS via CDN with inline config; Material Symbols Outlined for icons; Manrope (headlines) + Inter (body) fonts via Google Fonts. Color palette: Primary `#002366` (navy), Secondary `#475569`, Semantic Green `#16A34A`, Semantic Red `#DC2626`, Semantic Blue `#2563EB`, Background `#F8FAFC`. No separate `main.css` needed — Tailwind handles all styling.
- UX-DR2: **Form validation — client-side** — Before POSTing, `form.js` must validate: API key non-empty → red border + inline message "Introduz a tua chave API do Worten para continuar."; email non-empty → "Introduz o teu email para receber o relatório."; invalid email format → "Introduz um email válido." Focus moves to first invalid field. Button does NOT enter loading state on client-side validation failure.
- UX-DR3: **Submit button loading state** — On valid submit: button text changes to loading spinner (CSS animation), input fields disabled. Clears back to default on server error. Stays until navigation to progress page.
- UX-DR4: **Server error on form submit** — Non-success server response: loading state clears; inline error above button: "Algo correu mal. Tenta novamente ou contacta o suporte." Button returns to default.
- UX-DR5: **Progress bar animation** — Animated fill (navy, rounded) driven by phase:  Phase A (catalog) → fills to ~30%; Phase B (competitors) → fills to ~80% with crawl animation; Phase C (building) → fills to ~95%; Complete → jumps to 100%. Uses `role="progressbar"` with `aria-valuenow` / `aria-valuemin` / `aria-valuemax`.
- UX-DR6: **Copy button — clipboard feedback** — Click: copies URL via `navigator.clipboard.writeText()`; icon changes to checkmark, outline turns green (`#16A34A`) for 2 seconds; reverts to copy icon. Fallback if clipboard API unavailable: select all text in URL field, show tooltip "Link seleccionado — copia com Ctrl+C". Button has `aria-label="Copiar link do relatório"`.
- UX-DR7: **Auto-redirect on completion** — When polling returns `status: "complete"`: bar fills to 100%, status message shows "Relatório pronto!", after 1.5 seconds browser navigates to `/report/{report_id}`. Fallback: if redirect hasn't fired within 3 seconds of complete, show link "O teu relatório está pronto — [ver relatório →]".
- UX-DR8: **Progress error state** — When polling returns `status: "error"`: progress bar stops and fill colour changes to red (`#DC2626`) at current position; status message replaced by server's `phase_message` (safe error text); "PROCESSAMENTO EM TEMPO REAL" label hidden; link box label updates to "Este link não está disponível — a geração falhou."; show "Tentar novamente" link (back to form) and "Contacta-nos" link.
- UX-DR9: **Report page skeleton loading state** — While `GET /api/reports/:id` is in flight: stat cards show grey shimmer placeholders; table areas show 4 shimmer rows; PT/ES toggle is disabled (`pointer-events: none`, reduced opacity); CSV download link hidden; header date shows "—". On fetch success: instant swap from skeleton to real content (no fade animation). CTA banner renders immediately (no data dependency).
- UX-DR10: **PT/ES channel toggle** — Both channels' data loaded into JS memory on first fetch — no re-fetch on toggle. Clicking ES: toggle pill switches active state, stat cards repopulate, both tables repopulate — instant, no reload. Default: PT active. Edge case — no ES data: show per-section message "Sem dados para Worten ES — este catálogo não tem ofertas activas neste canal." Toggle uses `role="group"` + `aria-label="Canal"` + `aria-pressed` on each button.
- UX-DR11: **Report table rendering details** — Biggest Opportunities: first row gets a light blue tint background (`#EFF6FF`) — the #1 WOW score product must be visually distinct. Price formatting: Portuguese locale, e.g. "€799,00" (comma decimal, dot thousands). Gap € column: negative value in red (`#DC2626`), e.g. "−€6,50". Gap % column: small red pill badge. Quick Wins score column: rendered as a short horizontal bar (navy fill) instead of a raw number. Empty state per section/channel: friendly message + icon (no raw "no data").
- UX-DR12: **Expired report state** — When `GET /api/reports/:id` returns 404 (expired or not found): render a dedicated expiry view inside the page (not a separate page) — clock icon, headline "Este relatório já não está disponível", body explaining 48h TTL, primary button "Gerar um novo relatório →" linking to `index.html`. No raw 404 error shown.
- UX-DR13: **Fetch error state (report page)** — When `GET /api/reports/:id` returns 5xx or network error: render centred error card — warning triangle icon, headline "Não foi possível carregar o relatório", body with reload suggestion, "Recarregar" button (`window.location.reload()`), "Contacta-nos" secondary link. Header and CTA banner remain visible.
- UX-DR14: **CSV filename** — Downloaded file must be named `marketpilot-report-{first-8-chars-of-report-id}.csv` (the report_id is available in page context from the URL).
- UX-DR15: **CTA destination as configurable constant** — The "Começar a automatizar →" link destination (WhatsApp, mailto, or contact form URL) must be a single `const CTA_URL` at the top of `report.js` — not hardcoded in the HTML. Opens `target="_blank"` with `rel="noopener noreferrer"`. Pedro must be able to update this without touching HTML.
- UX-DR16: **Responsive breakpoints** — Mobile (<640px): stat cards stack vertically; table containers have `overflow-x: auto` with visible horizontal scroll hint "← desliza para ver mais →"; progress card full-width (16px margin). Tablet (640–1024px): two-column stat cards. Desktop (>1024px): three-column stat cards, full-width tables. All layouts using Tailwind responsive prefixes (`sm:`, `lg:`) already in the existing HTML — JS must not interfere with responsive layout.

---

### FR Coverage Map

| FR | Epic | Story |
|---|---|---|
| FR1 — form submission | Epic 5 | Story 5.1 |
| FR2 — both channels | Epic 3 | Story 3.3 |
| FR3 — OF21 pagination + total_count | Epic 3 | Story 3.2 |
| FR4 — P11 batching, filtering, total_price | Epic 3 | Story 3.3 |
| FR5 — WOW score calculation | Epic 3 | Story 3.4 |
| FR6 — Quick Wins identification | Epic 3 | Story 3.4 |
| FR7 — report_id returned immediately | Epic 4 | Story 4.1 |
| FR8 — real-time progress updates | Epic 3 + 4 + 5 | Stories 3.7, 4.2, 5.2 |
| FR9 — Your Position section | Epic 6 | Story 6.1 |
| FR10 — Biggest Opportunities section | Epic 6 | Story 6.2 |
| FR11 — Quick Wins section | Epic 6 | Story 6.2 |
| FR12 — product row columns | Epic 6 | Story 6.2 |
| FR13 — CTA | Epic 6 | Story 6.3 |
| FR14 — 48h persistent URL | Epic 3 + 4 | Stories 3.5, 4.3 |
| FR15 — report URL on progress screen | Epic 5 | Story 5.2 |
| FR16 — confirmation email | Epic 3 | Story 3.6 |
| FR17 — CSV download | Epic 4 + 6 | Stories 4.3, 6.3 |
| FR18 — trust message at button level | Epic 5 | Story 5.1 |
| FR19 — key never persisted | Epic 2 | Story 2.1 |
| FR20 — key cleared after job | Epic 2 + 3 | Stories 2.2, 3.7 |
| FR21 — privacy notice link | Epic 5 | Story 5.1 |
| FR22 — empty catalog error | Epic 7 | Story 7.1 |
| FR23 — user-actionable error message | Epic 7 | Stories 7.1, 7.2, 7.3 |
| FR24 — cleanup on all failure paths | Epic 2 + 7 | Stories 2.2, 7.1 |
| FR25 — descriptive progress messages | Epic 3 + 5 | Stories 3.7, 5.2 |
| FR26 — 48h TTL deletion | Epic 8 | Story 8.1 |
| FR27 — no report listing endpoint | Epic 4 | Story 4.3 |
| FR28 — email use disclosure | Epic 5 | Story 5.1 |
| FR29 — no cross-seller data | Epic 4 | Story 4.3 |
| NFR-S1 — HTTPS only | Epic 1 | Story 1.5 |
| NFR-S2 — key never in log/DB/queue | Epic 2 | Story 2.1 |
| NFR-S3 — UUID-only report access | Epic 4 | Story 4.3 |
| NFR-S4 — log redaction | Epic 1 | Story 1.2 |
| NFR-S5 — no cross-seller query | Epic 4 | Story 4.3 |
| NFR-R1 — ≥ 98% success rate | Epic 3 | Story 3.1 |
| NFR-R2 — no silent truncation | Epic 3 | Story 3.2 |
| NFR-R3 — email failure ≠ job failure | Epic 3 | Story 3.6 |
| NFR-R4 — expired URL returns 404 | Epic 4 + 8 | Stories 4.3, 8.1 |
| NFR-I1 — backoff + retry on 429/5xx | Epic 3 | Story 3.1 |
| NFR-I2 — safe error surfaces | Epic 7 | Stories 7.1–7.3 |
| NFR-I3 — email failure ≠ no report | Epic 3 + 5 | Stories 3.6, 5.2 |
| NFR-P1 — < 2s to enqueue | Epic 4 | Story 4.1 |
| NFR-P2/P3 — generation time targets | Epic 3 | Stories 3.2, 3.3 |
| NFR-P4 — < 2s report page load | Epic 6 | Story 6.1 |
| NFR-P5 — < 3s CSV download | Epic 4 | Story 4.3 |
| UX-DR1 — Design system (Tailwind/fonts/icons) | Epic 1 | Story 1.1 |
| UX-DR2 — Client-side form validation | Epic 5 | Story 5.1 |
| UX-DR3 — Submit button loading state | Epic 5 | Story 5.1 |
| UX-DR4 — Server error on form submit | Epic 5 | Story 5.1 |
| UX-DR5 — Progress bar animation phases | Epic 5 | Story 5.2 |
| UX-DR6 — Copy button clipboard feedback | Epic 5 | Story 5.2 |
| UX-DR7 — Auto-redirect on completion | Epic 5 | Story 5.2 |
| UX-DR8 — Progress error state UI | Epic 5 | Story 5.2 |
| UX-DR9 — Report skeleton loading state | Epic 6 | Story 6.1 |
| UX-DR10 — PT/ES channel toggle | Epic 6 | Story 6.1 |
| UX-DR11 — Table rendering details | Epic 6 | Story 6.2 |
| UX-DR12 — Expired report state | Epic 6 | Story 6.5 |
| UX-DR13 — Fetch error state (report) | Epic 6 | Story 6.5 |
| UX-DR14 — CSV filename format | Epic 6 | Story 6.3 |
| UX-DR15 — CTA configurable constant | Epic 6 | Story 6.3 |
| UX-DR16 — Responsive breakpoints | Epic 6 | Story 6.4 |

---

## Epic List

1. **Epic 1 — Project Foundation & Infrastructure**: Scaffold the Node.js project, configure Fastify with log redaction, set up SQLite + Drizzle schema, BullMQ + Redis connection, Docker + Coolify deployment.
2. **Epic 2 — API Key Security Layer**: Implement the `keyStore` module and the BullMQ worker scaffold with the in-memory key pattern — the security boundary for FR19, FR20, NFR-S2, NFR-S4.
3. **Epic 3 — Report Generation Pipeline**: Mirakl API client with retry, OF21 catalog fetch, P11 competitor scan, WOW/Quick Wins scoring, report persistence, email dispatch, and full worker orchestration.
4. **Epic 4 — HTTP API Layer**: All Fastify routes: POST /api/generate, GET /api/jobs/:id (polling), GET /api/reports/:id (report + CSV). No listing endpoints.
5. **Epic 5 — Frontend: Form & Progress Pages**: Wire up `form.js` and `progress.js` to the existing `index.html` and `progress.html` (already built from Stitch mockups). Covers validation states, loading state, progress bar animation, copy button, auto-redirect, and error state.
6. **Epic 6 — Frontend: Report Page**: Wire up `report.js` to the existing `report.html`. Covers skeleton loading, PT/ES toggle, table rendering (with first-row highlight and score bar), CSV download, CTA, expired/error states, and accessibility.
7. **Epic 7 — Error Handling & Edge Cases**: Empty catalog / auth failure path, total_count mismatch handling, P11 rate limit + partial data recovery, safe error surfaces.
8. **Epic 8 — Data Governance & Cleanup**: Hourly cron for TTL deletion, read-time expiry check, no listing endpoint verification.

---

## Epic 1: Project Foundation & Infrastructure

**Goal:** Produce a running, deployable project skeleton — Fastify listening on port 3000 behind Traefik, SQLite initialized with the correct schema (no `api_key` column), BullMQ connected to Redis, and all environment variables validated on startup. Nothing works end-to-end yet, but the infrastructure is solid and the security constraints are baked in from the start.

### Story 1.1: Project Scaffold

**GH Issue:** #2

As a developer (Pedro),
I want a fully configured Node.js 22 ESM project with the correct directory structure and dependencies installed,
So that I have a solid foundation to build on without configuration drift later.

**Satisfies:** Architecture infrastructure requirements

**Acceptance Criteria:**

**Given** an empty project directory  
**When** I run `npm install`  
**Then** the project installs without errors and all required dependencies are present: `fastify`, `@fastify/static`, `bullmq`, `ioredis`, `better-sqlite3`, `drizzle-orm`, `drizzle-kit`, `resend`, `node-cron`, `uuid`

**And** `package.json` has `"type": "module"` (ESM)  
**And** the directory structure matches the architecture spec exactly:  
```
src/routes/, src/workers/mirakl/, src/workers/scoring/, src/queue/,
src/db/, src/email/, src/cleanup/, src/middleware/, public/css/, public/js/
```
**And** `.env.example` documents all required variables: `PORT`, `NODE_ENV`, `REDIS_URL`, `SQLITE_PATH`, `RESEND_API_KEY`, `APP_BASE_URL`, `WORTEN_BASE_URL`, `LOG_LEVEL`  
**And** `.gitignore` excludes `.env`, `node_modules/`, `*.db`, `*.db-shm`, `*.db-wal`  
**And** `src/config.js` reads all env vars, validates they are non-empty, and throws a descriptive error on startup if any required var is missing  
**And** `public/index.html`, `public/progress.html`, and `public/report.html` already exist (built from Stitch); the scaffold task only confirms these are present and served correctly — no CSS authoring needed, Tailwind CDN handles all styling  
**And** `public/js/form.js`, `public/js/progress.js`, `public/js/report.js` are created as empty stubs (will be implemented in Epics 5–6)

---

### Story 1.2: Fastify Server with Log Redaction

**GH Issue:** #3

As a developer,
I want a Fastify v5 server instance with Pino log redaction configured,
So that the `api_key` field and `Authorization` header are NEVER written to any log output, satisfying NFR-S4 from the first request.

**Satisfies:** NFR-S1 (trust proxy for HTTPS), NFR-S4 (log redaction)

**Acceptance Criteria:**

**Given** the Fastify server is started  
**When** it initialises  
**Then** Pino is configured with:
```javascript
redact: {
  paths: ['req.headers.authorization', 'req.body.api_key', '*.api_key', '*.Authorization'],
  censor: '[REDACTED]'
}
```
**And** `trustProxy: true` is set (required for Traefik's `X-Forwarded-Proto` header)  
**And** a health-check route `GET /health` returns `200 { status: 'ok' }` — used by Coolify for container health checks  
**And** `@fastify/static` is registered to serve files from `/public/**`  
**And** `src/middleware/errorHandler.js` is registered as Fastify's `setErrorHandler` — maps unknown errors to `{ error: string, message: string }` shape

**Verification:** Send a POST with `{ "api_key": "secret123", "email": "test@test.com" }` to any route and confirm the log output shows `[REDACTED]` in place of the key value.

---

### Story 1.3: SQLite Schema & Drizzle Setup

**GH Issue:** #4

As a developer,
I want the SQLite database initialized with the `generation_jobs` and `reports` tables using Drizzle ORM,
So that all data persistence is type-safe and the schema enforces the security constraint (no `api_key` column) at the database level.

**Satisfies:** FR14 (48h TTL via `expires_at`), FR26, FR29, NFR-S2 (no api_key column)

**Acceptance Criteria:**

**Given** the app starts with a valid `SQLITE_PATH` env var  
**When** the database module initialises  
**Then** `generation_jobs` table is created with columns: `job_id TEXT PK`, `report_id TEXT`, `status TEXT DEFAULT 'queued'`, `phase_message TEXT`, `email TEXT`, `marketplace_url TEXT`, `created_at INTEGER`, `completed_at INTEGER`, `error_message TEXT` — **NO `api_key` column**

**And** `reports` table is created with columns: `report_id TEXT PK`, `generated_at INTEGER`, `expires_at INTEGER`, `email TEXT`, `summary_json TEXT`, `opportunities_pt_json TEXT`, `opportunities_es_json TEXT`, `quickwins_pt_json TEXT`, `quickwins_es_json TEXT`, `csv_data TEXT`  
**And** `CREATE INDEX idx_reports_expires_at ON reports(expires_at)` is applied  
**And** `src/db/queries.js` exposes named functions: `createJob()`, `updateJobStatus()`, `updateJobError()`, `insertReport()`, `getReport()`, `getJobStatus()`  
**And** all DB reads/writes go through `queries.js` — no raw SQL in route or worker files

---

### Story 1.4: BullMQ Queue & Redis Connection

**GH Issue:** #5

As a developer,
I want BullMQ v5 and Redis connected and the `reportQueue` defined,
So that the job queue is operational before the worker and routes are wired up.

**Satisfies:** Infrastructure prerequisite for Epic 3 and Epic 4

**Acceptance Criteria:**

**Given** `REDIS_URL` is set in the environment  
**When** the app starts  
**Then** a BullMQ `Queue` named `'report'` is created and connected to Redis at `REDIS_URL`  
**And** the app logs a startup message confirming Redis connection  
**And** if Redis is unreachable, the app fails to start with a clear error message (fail-fast)  
**And** the BullMQ queue is configured with `defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 5000 } }`

---

### Story 1.5: Docker & Coolify Deployment Config

**GH Issue:** #6

As a developer,
I want a Dockerfile and docker-compose.yml that deploy the app correctly on Coolify with Traefik HTTPS,
So that the production environment is reproducible and HTTPS is enforced from the first deploy.

**Satisfies:** NFR-S1 (HTTPS via Traefik), infrastructure

**Acceptance Criteria:**

**Given** the Dockerfile  
**When** built  
**Then** it produces a single container running Node.js 22 that starts the Fastify server + BullMQ worker in the same process  
**And** the container listens on `PORT` (default 3000) internally  
**And** the SQLite data file is stored at `SQLITE_PATH` which must be a Docker volume mount path

**Given** Coolify deployment  
**When** the app is deployed  
**Then** Traefik terminates TLS and forwards to the container on port 3000  
**And** HTTP (port 80) requests are redirected to HTTPS by Traefik  
**And** `docker-compose.yml` defines: `app` service (this container) + `redis` service (Redis 7 Alpine), with `app` depending on `redis`

---

## Epic 2: API Key Security Layer

**Goal:** Implement the `keyStore` module and the BullMQ worker scaffold with the correct key-retrieval and key-cleanup pattern. This is the security boundary: once this Epic is done, the API key can travel through the system safely, stored nowhere except process memory, and wiped on all code paths.

**HARD REQUIREMENT:** FR19, FR20, NFR-S2, NFR-S4 are the non-negotiable constraints in this Epic. The keyStore pattern and the `finally` block cleanup are architecture-level decisions, not implementation details. Any deviation — passing the API key in job data, logging it, storing it in a variable that outlives the `finally` block — is a defect.

### Story 2.1: keyStore Module

**GH Issue:** #7

As a developer,
I want the `src/queue/keyStore.js` in-memory key store implemented,
So that the API key has exactly one storage location in the entire system — process memory keyed to job_id — and cannot accidentally leak into any serialisable context.

**Satisfies:** FR19 (key never persisted), NFR-S2 (key not in log/DB/queue/background context)

**Acceptance Criteria:**

**Given** `src/queue/keyStore.js`  
**When** imported by any module  
**Then** it exports: `keyStore.set(jobId, apiKey)`, `keyStore.get(jobId)`, `keyStore.delete(jobId)`, `keyStore.has(jobId)`  
**And** the backing store is a plain `Map` — NOT exported, NOT referenced outside this module  
**And** the module has NO imports from any serialisation library (no JSON.stringify calls, no database imports, no Redis imports)  
**And** there is no mechanism to enumerate all stored keys (no `.keys()` or `.entries()` method on the exported object)  
**And** code review checklist verified: `api_key` does not appear as a field in any `queue.add()` call anywhere in the codebase

---

### Story 2.2: BullMQ Worker Scaffold with Key Lifecycle

**GH Issue:** #8

As a developer,
I want the `src/workers/reportWorker.js` worker registered with BullMQ,
So that the key retrieval → use → deletion lifecycle is correctly implemented before any pipeline logic is written into it.

**Satisfies:** FR20 (key cleared after job), FR24 (cleanup on all failure paths), NFR-S2

**Acceptance Criteria:**

**Given** `src/workers/reportWorker.js`  
**When** a BullMQ job is processed  
**Then** the worker:
1. Receives job data: `{ job_id, report_id, email, marketplace_url }` — **no `api_key` in job data**
2. Calls `keyStore.get(job_id)` to retrieve the API key
3. If key is `undefined` → fails job with message: `"A sessão expirou. Por favor, submete o formulário novamente."` and returns immediately
4. Calls `runReportPipeline(...)` (stub returning `Promise.resolve()` at this stage)
5. In a `finally` block (not try, not catch): calls `keyStore.delete(job_id)`

**And** the `finally` block executes on both success AND failure — confirmed by writing a test that causes `runReportPipeline` to throw and verifying `keyStore.has(job_id)` returns `false` afterwards  
**And** the worker never logs the `apiKey` variable value  
**And** the error catch block logs only: `{ job_id, error_code: err.code, error_type: err.constructor.name }` — NOT `err.message` (which may contain API response details)

---

## Epic 3: Report Generation Pipeline

**Goal:** Implement the complete 6-phase report generation pipeline inside the BullMQ worker. The pipeline adapts logic from `scripts/scale_test.js` (OF21 pagination) and `scripts/opportunity_report.js` (P11 batch + concurrent calls) — the dev agent must reuse that logic, not rewrite it. At the end of this Epic, a real Mirakl API key produces a fully computed, persisted report in SQLite.

### Story 3.1: Mirakl API Client with Retry

**GH Issue:** #9

As a developer,
I want `src/workers/mirakl/apiClient.js` with exponential backoff and safe error handling,
So that all Mirakl API calls retry on 429/5xx without ever exposing raw error messages to the user.

**Satisfies:** NFR-I1 (backoff + retry), NFR-I2 (safe error surfaces), NFR-R1 (≥ 98% success rate)

**Acceptance Criteria:**

**Given** a Mirakl API endpoint that returns HTTP 429  
**When** `mirAklGet()` is called  
**Then** it retries up to 5 times with delays: 1s, 2s, 4s, 8s, 16s (capped at 30s)  
**And** on each retry, it logs the attempt number and delay — but NOT the `apiKey` or `Authorization` header value  
**And** after all retries exhausted, it throws a `MiraklApiError` with `status` and a safe message string

**And** `mirAklGet()` signature is: `(baseUrl, endpoint, params, apiKey)` — apiKey passed as a parameter, used in `Authorization` header, never stored as a module-level variable  
**And** all Mirakl calls in the codebase use `mirAklGet()` — no direct `fetch()` calls to Mirakl URLs exist anywhere else

---

### Story 3.2: OF21 Catalog Fetch with Pagination

**GH Issue:** #10

As a developer,
I want `src/workers/mirakl/fetchCatalog.js` that paginates through all active offers using the OF21 endpoint,
So that catalogs of any size (validated up to 31,179 SKUs) are fully fetched with no silent truncation.

**Satisfies:** FR3 (full pagination), NFR-R2 (no silent truncation — assert total_count)

**Note:** Reuse pagination logic from `scripts/scale_test.js`. The core loop structure is already validated — adapt it into a function rather than rewriting.

**Acceptance Criteria:**

**Given** a Mirakl API key for a catalog with N active offers  
**When** `fetchCatalog(apiKey, baseUrl, onProgress)` is called  
**Then** it paginates OF21 with `max=100` per page until no more pages  
**And** after all pages, it asserts: `allOffers.length === page1.total_count` (BEFORE active filter — OF21 has no server-side active filter so `total_count` counts all offers) — if mismatch, throws `CatalogTruncationError` with message: `"Catálogo obtido parcialmente. Tenta novamente."`  
**And** every 1,000 offers fetched, it calls `onProgress(fetched, total)` so the worker can update `phase_message`  
**And** it returns an array of: `[{ ean, shop_sku, price, product_title }]`  
**And** it filters to `offer.active === true` (MCP+live-verified boolean field — NOT `state`, that field does NOT exist on OF21 response; see MCP-Verified Endpoint Reference above)  
**And** it works correctly for Gabriel's catalog (31,179 products) within the NFR-P3 time budget

---

### Story 3.3: P11 Competitor Scan (Batch + Concurrent)

**GH Issue:** #11

As a developer,
I want `src/workers/mirakl/scanCompetitors.js` that batches EANs into groups of 100 and runs 10 concurrent P11 calls,
So that a 31,000-SKU catalog is fully scanned within the NFR-P3 time budget with correct per-channel data extraction.

**Satisfies:** FR2 (both WRT_PT_ONLINE + WRT_ES_ONLINE), FR4 (P11 batching, active filter, total_price)

**Note:** Reuse the batch + concurrent call pattern from `scripts/opportunity_report.js`. Adapt for the two-channel extraction, not a rewrite.

**Acceptance Criteria:**

**Given** an array of EANs from the catalog fetch  
**When** `scanCompetitors(eans, apiKey, baseUrl, onProgress)` is called  
**Then** EANs are split into batches of 100 (per P11 per-call limit)  
**And** **each batch is queried TWICE — once per channel** — with `pricing_channel_code=WRT_PT_ONLINE` and `pricing_channel_code=WRT_ES_ONLINE` on separate calls (this is what makes `offer.total_price` channel-specific). Both calls pass `channel_codes=<that channel>` to restrict which offers come back  
**And** the batch P11 request param is `product_references` with format `EAN|<ean>,EAN|<ean>` (NOT `product_ids` — `product_ids` expects product SKUs, not EANs; using EANs with `product_ids` silently returns 0 products — verified on live Worten instance)  
**And** batches are processed concurrently in windows of 10 using `Promise.allSettled()` — no unbounded concurrency  
**And** each P11 response filters `offer.active === true` offers only  
**And** for each EAN's returned offers (active only, pre-sorted by price ascending), it takes positions 0 (first) and 1 (second) and captures `offer.total_price` (price + shipping — NOT `offer.price` alone)  
**And** channel bucketing is determined by which P11 call returned the offer (PT call → pt bucket; ES call → es bucket) — NOT by reading `offer.channel_code` (that field does NOT exist) or `offer.channels` (empty on competitor offers — verified)  
**And** every 500 EANs processed, it calls `onProgress(processed, total)` for phase_message updates  
**And** it returns: `Map<ean, { pt: { first, second }, es: { first, second } }>`  
**And** batches that fail after retry are logged (error type only) and excluded from the map — the job continues with available data  
**And** see MCP-Verified Endpoint Reference section above for the full P11 field contract

---

### Story 3.4: WOW Score + Quick Wins Scoring

**GH Issue:** #12

As a developer,
I want `src/workers/scoring/computeReport.js` that computes WOW scores, Quick Wins, and Your Position counts per channel,
So that the report data is ranked correctly before being persisted.

**Satisfies:** FR5 (WOW score formula), FR6 (Quick Wins: gap_pct ≤ 0.02), FR9 (Your Position counts)

**Acceptance Criteria:**

**Given** catalog offers + competitor scan results  
**When** `computeReport(offers, competitorData)` is called  
**Then** for each product × channel where `my_price > competitor_total_price_first`:
- `gap = my_price - competitor_total_price_first`
- `gap_pct = gap / competitor_total_price_first`
- `wow_score = my_price / gap_pct`
- `is_quick_win = gap_pct <= 0.02`

**And** products where `my_price <= competitor_total_price_first` are marked as `winning` (in 1st place) — **NOT** assigned a WOW score  
**And** products with no competitor data for that channel are marked as `uncontested`  
**And** `opportunities_pt` and `opportunities_es` are sorted by `wow_score DESC`  
**And** `quickwins_pt` and `quickwins_es` contain only products where `is_quick_win === true`  
**And** `summary` contains per-channel counts: `{ total, winning, losing, uncontested }` for both PT and ES  
**And** the function returns: `{ summary, opportunities_pt, opportunities_es, quickwins_pt, quickwins_es }`

---

### Story 3.5: Report Persistence & CSV Generation

**GH Issue:** #13

As a developer,
I want the computed report data inserted into SQLite and the full CSV generated and stored,
So that the report is accessible via UUID for 48 hours and the CSV download is available immediately.

**Satisfies:** FR14 (48h persistent URL), FR17 (CSV download), FR26 (expires_at set), FR29 (isolated by report_id)

**Acceptance Criteria:**

**Given** computed report data from `computeReport()`  
**When** `db.insertReport(reportId, email, reportData)` is called  
**Then** a row is inserted into `reports` with:
- `report_id` = the UUID generated at job creation
- `expires_at` = `Math.floor(Date.now() / 1000) + 172800` (now + 48h in Unix seconds)
- `summary_json` = JSON.stringify(summary)
- `opportunities_pt_json`, `opportunities_es_json`, `quickwins_pt_json`, `quickwins_es_json` = JSON.stringify of respective arrays
- `csv_data` = CSV string (all products, all columns, both channels)

**And** the CSV contains all analyzed products (not just top opportunities) with columns: `EAN`, `product_title`, `shop_sku`, `my_price`, `pt_first_price`, `pt_gap_eur`, `pt_gap_pct`, `pt_wow_score`, `es_first_price`, `es_gap_eur`, `es_gap_pct`, `es_wow_score`  
**And** `db.getReport(reportId, now)` returns the report only if `expires_at > now` (read-time expiry check)  
**And** a non-existent or expired `report_id` returns `null` (not throws)

---

### Story 3.6: Email Dispatch via Resend

**GH Issue:** #14

As a developer,
I want `src/email/sendReportEmail.js` that sends the confirmation email non-blockingly after report generation,
So that email delivery failure never affects the job success status or the seller's ability to access their report.

**Satisfies:** FR16 (confirmation email), NFR-R3 (email failure ≠ job failure), NFR-I3 (email is secondary channel)

**Acceptance Criteria:**

**Given** a completed report with `report_id` and seller `email`  
**When** `sendReportEmail(email, reportId, summary)` is called  
**Then** it sends an email via Resend with:
- To: seller's email
- Subject: `"O teu relatório MarketPilot está pronto"`
- Body (HTML): includes the persistent report link `${APP_BASE_URL}/report/${reportId}` and a summary (e.g., total SKUs analysed, number losing 1st place)
- The email is sent with `await resend.emails.send(...)` inside a try/catch — any exception is caught and logged (error type only), not re-thrown

**And** the worker marks the job `complete` in SQLite BEFORE calling `sendReportEmail`  
**And** if `sendReportEmail` throws, the worker logs the error and continues normally — job status remains `complete`  
**And** `RESEND_API_KEY` not set → `sendReportEmail` logs a warning and returns without attempting the send (graceful degradation)

---

### Story 3.7: Full Worker Orchestration & Phase Updates

**GH Issue:** #15

As a developer,
I want the `reportWorker.js` to orchestrate all phases A–F with correct phase_message updates at each transition,
So that the frontend polling endpoint always shows accurate progress and key cleanup is guaranteed on all code paths.

**Satisfies:** FR8 (real-time progress), FR20 (key cleared), FR22 (empty catalog error), FR23 (user-actionable errors), FR24 (cleanup on all paths), FR25 (descriptive phase messages)

**Acceptance Criteria:**

**Given** the worker processes a job  
**When** it runs through the phases  
**Then** it updates `generation_jobs.phase_message` at each transition:
- Start: `"A preparar…"` + status `fetching_catalog`
- OF21 progress: `"A obter catálogo… ({n} de {total} produtos)"`
- P11 start: status `scanning_competitors` + `"A verificar concorrentes…"`
- P11 progress: `"A verificar concorrentes ({n} de {total} produtos)…"`
- Scoring: status `building_report` + `"A construir relatório…"`
- Complete: status `complete` + `"Relatório pronto!"`
- Any error: status `error` + `getSafeErrorMessage(err)`

**And** all six phases (A–F from architecture) execute in order  
**And** the `finally` block always calls `keyStore.delete(job_id)` — regardless of which phase failed  
**And** if OF21 returns 0 offers with status 200: `throw EmptyCatalogError` → safe message surface  
**And** if OF21 returns 401/403: `throw MiraklApiError` → safe message surface  
**And** if `total_count` mismatch: `throw CatalogTruncationError` → safe message surface  
**And** raw Mirakl error objects are never written to `error_message` column — only `getSafeErrorMessage(err)` output

---

## Epic 4: HTTP API Layer

**Goal:** Wire up all four Fastify routes: the submission route (POST /api/generate) that stores the key and enqueues the job, the polling route (GET /api/jobs/:id), and the report + CSV routes (GET /api/reports/:id, GET /api/reports/:id/csv). No listing endpoint is registered.

### Story 4.1: POST /api/generate Route

**GH Issue:** #16

As a seller,
I want to submit my API key and email via a POST request and receive a job_id and report_id back in under 2 seconds,
So that report generation begins immediately without blocking the browser.

**Satisfies:** FR1 (form submission), FR7 (report_id returned immediately), NFR-P1 (< 2s response)

**Acceptance Criteria:**

**Given** `POST /api/generate` with body `{ api_key: "xxx", email: "seller@example.com" }`  
**When** the request is processed  
**Then** it validates: `api_key` is non-empty string; `email` is valid email format — returns 400 with `{ error, message }` if invalid  
**And** generates `job_id = crypto.randomUUID()` and `report_id = crypto.randomUUID()`  
**And** calls `keyStore.set(job_id, api_key)` — THIS IS THE ONLY PLACE the API key is stored  
**And** calls `reportQueue.add('generate', { job_id, report_id, email, marketplace_url: config.WORTEN_BASE_URL })` — **NO `api_key` in queue payload**  
**And** calls `db.createJob({ job_id, report_id, email, marketplace_url, status: 'queued', created_at: now })`  
**And** returns `202 { data: { job_id, report_id } }` within 2 seconds  
**And** the route handler never logs `req.body.api_key` (Pino redact handles this automatically)

---

### Story 4.2: GET /api/jobs/:job_id Polling Endpoint

**GH Issue:** #17

As a seller,
I want to poll job status every 2 seconds and receive the current phase message,
So that the progress screen can show me what the system is doing in real time.

**Satisfies:** FR8 (real-time progress updates), NFR-P1 (fast polling response)

**Acceptance Criteria:**

**Given** `GET /api/jobs/:job_id` with a valid `job_id`  
**When** the request is processed  
**Then** it queries `generation_jobs` by `job_id` and returns:
```json
{
  "data": {
    "status": "scanning_competitors",
    "phase_message": "A verificar concorrentes (3,200 de 8,400 produtos)…",
    "report_id": "uuid-v4-here"
  }
}
```
**And** for an unknown `job_id`: returns `404 { error: "not_found", message: "..." }`  
**And** response time is consistently < 100ms (single SQLite read)  
**And** no `api_key` data is ever returned in this response

---

### Story 4.3: GET /api/reports/:report_id & CSV Routes

**GH Issue:** #18

As a seller,
I want to retrieve my report as JSON and download it as CSV via UUID-based routes,
So that I can view the report page and download the full analysis at any time within 48 hours.

**Satisfies:** FR14 (48h access), FR17 (CSV download), FR27 (no listing endpoint), FR29 (isolated by report_id), NFR-S3 (UUID only), NFR-S5 (no cross-seller), NFR-P4 (< 2s report load), NFR-P5 (< 3s CSV)

**Acceptance Criteria:**

**Given** `GET /api/reports/:report_id` with a valid, unexpired report_id  
**When** the request is processed  
**Then** it queries `WHERE report_id = ? AND expires_at > now` and returns the full report JSON: `{ data: { summary, opportunities_pt, opportunities_es, quickwins_pt, quickwins_es } }`  
**And** for an expired or unknown report_id: returns `404 { error: "report_not_found", message: "Este relatório expirou ou não existe. Gera um novo relatório para obteres dados actualizados." }`  
**And** no listing endpoint `GET /api/reports` exists — the route is NOT registered in Fastify

**Given** `GET /api/reports/:report_id/csv` with a valid, unexpired report_id  
**When** the request is processed  
**Then** it returns the `csv_data` string with `Content-Type: text/csv` and `Content-Disposition: attachment; filename="marketpilot-report.csv"`  
**And** response begins within 3 seconds (NFR-P5)

**And** `GET /report/:report_id` (the human-facing URL) is registered as a static file route returning `public/report.html` (the JS then fetches the API)

---

## Epic 5: Frontend — Form & Progress Pages

**Goal:** Implement `public/js/form.js` and `public/js/progress.js` to wire up the existing Stitch-built HTML pages. Do NOT modify HTML structure — only add/edit JS. Covers all state transitions: validation, loading, submission, progress bar animation, copy button, auto-redirect, and error display.

### Story 5.1: form.js — Validation, Loading State & Submission

**GH Issue:** #19

As a seller,
I want the form to validate my inputs client-side, show a loading state while submitting, and navigate me to the progress screen on success,
So that I get immediate feedback and a smooth transition without page reloads.

**Satisfies:** FR1 (form submission), FR18 (trust message — already in HTML), FR21 (privacy — already in HTML), FR28 (email disclosure — already in HTML), UX-DR2 (client-side validation), UX-DR3 (loading state), UX-DR4 (server error on submit)

**Note:** `index.html` already exists with all static content. `form.js` wires up behaviour only — do NOT modify the HTML.

**Acceptance Criteria:**

**Given** seller clicks submit with API key field empty  
**When** `form.js` validates  
**Then** API key input gets red border; inline error below: "Introduz a tua chave API do Worten para continuar."; focus moves to the field; button does NOT enter loading state

**Given** seller clicks submit with empty email  
**Then** email input red border; inline error: "Introduz o teu email para receber o relatório."

**Given** seller clicks submit with invalid email format  
**Then** email input red border; inline error: "Introduz um email válido."

**Given** both fields are valid and seller clicks submit  
**When** form submits  
**Then** button immediately shows a CSS spinner, text changes to "A gerar..."; both inputs are disabled  
**And** `form.js` POSTs `{ api_key, email }` to `POST /api/generate`  
**And** on 202 response: browser navigates to `/progress?job_id={job_id}&report_id={report_id}`  
**And** on network error or non-success: loading clears; button returns to "Gerar o meu relatório →"; inputs re-enabled; inline error above button: "Algo correu mal. Tenta novamente ou contacta o suporte."  
**And** on server 400 with key format error: API key field red border + inline error: "O formato da chave não é válido. Verifica se copiaste a chave correcta do portal Worten."

---

### Story 5.2: progress.js — Progress Bar, Copy Button, Auto-Redirect & Error State

**GH Issue:** #20

As a seller,
I want the progress screen to show my report URL immediately, animate a progress bar through the generation phases, auto-redirect when done, and show a clear error if something goes wrong,
So that I stay engaged during the wait and never lose access to my report URL.

**Satisfies:** FR8 (real-time progress), FR15 (report URL immediately), FR25 (descriptive phase messages), NFR-I3 (email as secondary), UX-DR5 (progress bar animation), UX-DR6 (copy button), UX-DR7 (auto-redirect), UX-DR8 (error state)

**Note:** `progress.html` already exists with all static layout. `progress.js` wires up behaviour only.

**Acceptance Criteria:**

**Given** seller lands on `/progress?job_id={id}&report_id={rid}`  
**When** the page loads  
**Then** the read-only URL field is IMMEDIATELY populated with `{APP_BASE_URL}/report/{report_id}` — before any poll response

**Given** seller clicks the copy button  
**Then** URL is copied via `navigator.clipboard.writeText()`; icon changes to checkmark, outline turns green (`#16A34A`) for 2 seconds, then reverts  
**And** fallback if clipboard API unavailable: text in URL field is selected; tooltip shown: "Link seleccionado — copia com Ctrl+C"

**Given** polling is running (2-second interval)  
**When** phase transitions occur  
**Then** progress bar fill animates to: ~30% on `fetching_catalog`; ~80% (crawl) on `scanning_competitors`; ~95% on `building_report`  
**And** the `phase_message` from the server is displayed in the status message area  
**And** the phase, fetched count, and total count are formatted with Portuguese locale (`.` thousand separator)

**Given** polling returns `status: "complete"`  
**Then** progress bar fills to 100%; status message shows "Relatório pronto!"; after 1.5 seconds browser navigates to `/report/{report_id}`  
**And** if redirect has not fired within 3 seconds of complete: show fallback link "O teu relatório está pronto — [ver relatório →]"

**Given** polling returns `status: "error"`  
**Then** polling stops; progress bar fill changes to red (`#DC2626`) at current position; "PROCESSAMENTO EM TEMPO REAL" label hidden; status message replaced by server's `phase_message`  
**And** link box label updates to "Este link não está disponível — a geração falhou."  
**And** show "Tentar novamente" link (back to `/`) and "Contacta-nos" link

**And** job_id and report_id are read from URL query params only — never stored in localStorage or sessionStorage

---

## Epic 6: Frontend — Report Page

**Goal:** Implement `public/js/report.js` to wire up the existing `report.html` (built from Stitch — do NOT modify HTML structure). Covers: skeleton loading state, data fetch and render, PT/ES toggle, table building with UX-specified formatting, CSV download, CTA, expired/error states, and ARIA accessibility.

### Story 6.1: report.js — Data Fetch, Skeleton State & Your Position Section

**GH Issue:** #21

As a seller,
I want the report page to show skeleton placeholders while loading and then render my Your Position stats with the PT/ES toggle working,
So that the page feels fast and I can instantly switch between channels.

**Satisfies:** FR9 (Your Position), NFR-P4 (< 2s load), UX-DR9 (skeleton loading), UX-DR10 (PT/ES toggle)

**Note:** `report.html` already exists. `report.js` wires up behaviour — do NOT modify HTML structure.

**Acceptance Criteria:**

**Given** a seller opens `/report/{report_id}`  
**When** the page loads and `report.js` fires `GET /api/reports/{report_id}`  
**Then** while the fetch is in flight: stat card areas show grey shimmer placeholders; table areas show 4 shimmer rows; PT/ES toggle is disabled (`pointer-events: none`, reduced opacity); CSV download link is hidden; header date shows "—"; CTA banner renders immediately (no data dependency)

**Given** the fetch succeeds  
**When** data arrives  
**Then** skeleton elements are replaced instantly with real content (no fade); header date populates from `generated_at` in Portuguese long format (e.g. "14 de Abril de 2026"); PT/ES toggle becomes active (PT selected by default)  
**And** the "A Tua Posição Agora" section renders three stat cards for the active channel: "Em 1.º lugar" (green accent), "A perder posição" (red accent), "Sem concorrência" (blue accent) — each with its count from `summary.pt` or `summary.es`  
**And** clicking `[ES]` toggle: all three stat card numbers update to ES channel data; both tables update; toggle pill switches active state — **no re-fetch**, data already in memory  
**And** clicking `[PT]` toggle: reverts to PT data  
**And** if ES channel has no data: each section shows "Sem dados para Worten ES — este catálogo não tem ofertas activas neste canal."  
**And** the full page is interactive within 2 seconds of URL open (NFR-P4)

---

### Story 6.2: Biggest Opportunities & Quick Wins Tables

**GH Issue:** #22

As a seller,
I want to see ranked tables with the correct formatting so I can scan my top opportunity in seconds,
So that the #1 WOW score product is immediately obvious and the data is readable at a glance.

**Satisfies:** FR10 (Biggest Opportunities), FR11 (Quick Wins), FR12 (product row columns), UX-DR11 (table rendering details)

**Acceptance Criteria:**

**Given** the report data is loaded for the active channel  
**When** `report.js` builds the "Maiores oportunidades" table  
**Then** rows are sorted by WOW score descending (data arrives pre-sorted from API — no client-side re-sort needed)  
**And** the first row (highest WOW score) has a light blue tint background (`#EFF6FF`) — visually distinct from all other rows  
**And** each row shows: product name (Inter, navy) + EAN (Inter small, `#94A3B8`) below it; "O teu preço" formatted as "€799,00" (Portuguese locale: comma decimal, dot thousands); "Preço do 1.º lugar" same format; "Diferença €" as "−€6,50" in red (`#DC2626`); "Diferença %" as a small red pill badge e.g. "0,8%"; "Pontuação" as a right-aligned number  
**And** empty state (no products losing 1st place): centred message "Estás em 1.º lugar em todos os produtos neste canal." with green checkmark icon

**Given** `report.js` builds the "Vitórias rápidas" table  
**Then** no first-row highlight — all rows equal weight  
**And** the "Score" column renders as a short horizontal navy bar (relative width based on score value) instead of a raw number  
**And** empty state: "Não há vitórias rápidas disponíveis neste canal."  
**And** both tables update instantly when the PT/ES toggle changes (data already in memory)

---

### Story 6.3: CSV Download & CTA

**GH Issue:** #23

As a seller,
I want a one-click CSV download with the correct filename and a CTA that Pedro can update without touching HTML,
So that I can take the full data away and Pedro can change the contact link without a code change.

**Satisfies:** FR13 (CTA), FR17 (CSV download), NFR-P5 (< 3s CSV initiation), UX-DR14 (CSV filename), UX-DR15 (CTA configurable constant)

**Acceptance Criteria:**

**Given** the report page is loaded and data fetch succeeded  
**When** seller clicks "↓ Descarregar relatório completo CSV"  
**Then** browser requests `GET /api/reports/{report_id}/csv`; download starts within 3 seconds (NFR-P5)  
**And** the downloaded file is named `marketpilot-report-{first-8-chars-of-report-id}.csv` (report_id extracted from the page URL)  
**And** during download initiation (if latency > 1s): link text briefly shows "A preparar..." then returns to normal after download begins  
**And** the CSV download link is hidden while skeleton is showing and becomes visible after data loads

**Given** the CTA banner at the bottom of the page  
**Then** the "Começar a automatizar →" button href is set from a single `const CTA_URL` declared at the top of `report.js` — not hardcoded in HTML  
**And** the link opens `target="_blank"` with `rel="noopener noreferrer"`  
**And** Pedro can change `CTA_URL` in one place (top of `report.js`) to update the destination across the page without modifying HTML

---

### Story 6.4: Mobile & Screen-Share Layout Verification

**GH Issue:** #24

As a seller (or Pedro demoing on a call),
I want the report to be readable on a phone and clean on a shared screen,
So that Rui can open it on his phone and Pedro can demo live without layout issues.

**Satisfies:** UX-DR16 (responsive breakpoints), implicit requirements from Journeys 1 and 4

**Note:** Tailwind responsive classes are already in `report.html` — this story verifies that `report.js` does not break the responsive layout when it injects dynamic content (table rows, stat card numbers).

**Acceptance Criteria:**

**Given** the report page with data rendered  
**When** viewed on a mobile viewport (< 640px)  
**Then** stat cards stack vertically (Tailwind `sm:` classes already handle this — verify JS-injected content respects the same containers)  
**And** table containers have `overflow-x: auto`; tables scroll horizontally without breaking page layout  
**And** a "← desliza para ver mais →" hint is visible below each table on mobile  
**And** table row font size is ≥ 14px (readable without zooming)

**Given** the report is screen-shared at ~60% browser width (≥ 1024px viewport)  
**Then** all three sections, CTA banner, and CSV link are visible without horizontal page scrolling  
**And** the PT/ES toggle is always visible as two pills — does not collapse to a dropdown at any breakpoint

**Given** the form page (`index.html`) on any viewport  
**Then** the trust message is visible without scrolling on initial load (above the fold) — a prospect on a video call sees it immediately

---

### Story 6.5: Expired Report & Fetch Error States

**GH Issue:** #25

As a seller who opens a stale or broken report link,
I want to see a clear, actionable message rather than a blank page or raw error,
So that I know exactly what happened and how to get a fresh report.

**Satisfies:** UX-DR12 (expired report state), UX-DR13 (fetch error state)

**Acceptance Criteria:**

**Given** `GET /api/reports/{report_id}` returns 404 (expired TTL or unknown ID)  
**When** `report.js` handles the response  
**Then** the skeleton area is replaced with a centred expiry card containing: clock icon, headline "Este relatório já não está disponível" (Manrope, navy), body "Os relatórios do MarketPilot são guardados durante 48 horas. Este relatório expirou. Para gerar um novo, clica no botão abaixo." (Inter, `#475569`), primary button "Gerar um novo relatório →" linking to `/`  
**And** no raw 404 status code is displayed to the user  
**And** the header and CTA banner remain visible

**Given** `GET /api/reports/{report_id}` returns 5xx or a network error  
**When** `report.js` handles the response  
**Then** the skeleton area is replaced with a centred error card: warning triangle icon (`#475569`), headline "Não foi possível carregar o relatório" (Manrope, navy), body "Ocorreu um erro ao carregar os dados. Tenta recarregar a página. Se o problema persistir, contacta-nos.", primary button "Recarregar" (`window.location.reload()`), secondary link "Contacta-nos"  
**And** the header and CTA banner remain visible

---

### Story 6.6: Accessibility Baseline

**GH Issue:** #26

As a seller using a screen reader or keyboard navigation,
I want the form, progress screen, and report page to meet basic accessibility requirements,
So that the tool is usable beyond mouse-only interaction.

**Satisfies:** UX spec accessibility section (ARIA requirements across all three pages)

**Acceptance Criteria:**

**Given** `form.js` wires up the form  
**Then** all `<input>` elements have associated `<label>` elements (already in HTML — verify JS does not orphan them)  
**And** inline error messages are linked to their input via `aria-describedby` — set by `form.js` when errors appear  
**And** error messages are associated dynamically: when `form.js` injects an error, it sets `aria-describedby="field-error-id"` on the input

**Given** `progress.js` wires up the progress bar  
**Then** the progress bar element has `role="progressbar"`, `aria-valuemin="0"`, `aria-valuemax="100"`, and `aria-valuenow` updated by `progress.js` at each phase transition  
**And** the copy button has `aria-label="Copiar link do relatório"` (already in HTML — verify it is present)

**Given** `report.js` wires up the PT/ES toggle  
**Then** the toggle container has `role="group"` and `aria-label="Canal"`  
**And** each toggle button has `aria-pressed="true"` or `aria-pressed="false"` updated by `report.js` on every toggle click  
**And** colour alone is never the only differentiator — stat cards also use distinct text labels (already in HTML)

---

## Epic 7: Error Handling & Edge Cases

**Goal:** Implement all error paths specified in the architecture and PRD — empty catalog, auth failure, total_count mismatch, P11 rate limit, and process restart — so that every failure mode surfaces a user-actionable message and cleans up the API key.

### Story 7.1: Empty Catalog & Auth Failure Path

**GH Issue:** #27

As a seller with an invalid or suspended API key,
I want to see a clear, non-technical error message that tells me what to check,
So that I know how to resolve the issue without contacting support.

**Satisfies:** FR22 (empty catalog error), FR23 (user-actionable error), FR24 (cleanup on failure)

**Acceptance Criteria:**

**Given** an API key for a suspended account (OF21 returns 401/403 or empty catalog)  
**When** the worker runs Phase A  
**Then** on 401/403: `getSafeErrorMessage()` returns `"Chave API inválida ou sem permissão. Verifica se a chave está correcta e se a tua conta está activa no Worten."`  
**And** on empty catalog (0 offers, status 200): `getSafeErrorMessage()` returns `"Não encontrámos ofertas activas no teu catálogo. Verifica se a tua conta está activa no Worten."`  
**And** in both cases: `keyStore.delete(job_id)` is called in the `finally` block before the job function returns  
**And** `generation_jobs.status` is set to `error` with the safe error message  
**And** the progress page polling detects status `error` and displays the message + `"Contacta-nos"` link  
**And** no raw Mirakl API response body is stored in the database or returned to the frontend

---

### Story 7.2: total_count Mismatch Handling

**GH Issue:** #28

As a developer,
I want the system to fail loudly if OF21 returns fewer records than declared in total_count,
So that we never generate a report based on a silently truncated catalog.

**Satisfies:** NFR-R2 (no silent truncation), FR23 (user-actionable error)

**Acceptance Criteria:**

**Given** OF21 pagination completes but `fetched.length !== page1.total_count`  
**When** the assertion runs  
**Then** a `CatalogTruncationError` is thrown with message: `"Catálogo obtido parcialmente. Tenta novamente."`  
**And** this error message is stored in `generation_jobs.error_message` via `getSafeErrorMessage()`  
**And** `keyStore.delete(job_id)` is called in the `finally` block  
**And** a log entry records: `{ job_id, fetched: N, declared: M, error_type: 'CatalogTruncationError' }` — no api_key in the log

---

### Story 7.3: P11 Rate Limit & Partial Data Recovery

**GH Issue:** #29

As a seller with a large catalog,
I want the system to handle P11 rate limits gracefully without failing my report,
So that I still receive a useful report even if some competitor batches hit rate limits.

**Satisfies:** NFR-I1 (backoff + retry), NFR-R1 (≥ 98% success rate), FR23 (user-actionable message if needed)

**Acceptance Criteria:**

**Given** a P11 batch returns HTTP 429  
**When** the API client retries  
**Then** it waits with exponential backoff (1s → 2s → 4s → 8s → 16s → max 30s)  
**And** during the retry wait, the worker updates `phase_message` to: `"A verificar concorrentes — a aguardar limite de pedidos…"`  
**And** if a batch recovers within 5 retries: processing continues normally  
**And** if a batch is exhausted after 5 retries: the batch is skipped, its EANs are marked as having no competitor data (uncontested), and processing continues with the remaining batches  
**And** the final report is generated from available data — no total failure just because one batch was unrecoverable

---

## Epic 8: Data Governance & Cleanup

**Goal:** Implement the TTL deletion cron and verify the no-listing constraint. These ensure the system's privacy and data governance commitments are upheld automatically over time.

### Story 8.1: Hourly TTL Deletion Cron

**GH Issue:** #30

As the system,
I want to automatically delete expired reports every hour,
So that report data is not retained beyond the 48-hour TTL commitment made to sellers.

**Satisfies:** FR26 (48h TTL deletion), NFR-R4 (expired URLs return 404)

**Acceptance Criteria:**

**Given** `src/cleanup/expiredReports.js` is loaded on server startup  
**When** the cron runs (every hour, on the hour)  
**Then** it executes: `DELETE FROM reports WHERE expires_at < unixepoch()`  
**And** it logs: `[cleanup] Deleted N expired report(s)` only if `changes > 0` — no log spam on empty runs  
**And** after deletion, `GET /api/reports/{expired_report_id}` returns 404 (the read-time expiry check in `queries.js` also catches in-between-cron-runs cases)  
**And** the cron is started as part of server initialisation — not as a separate process  
**And** cron failure (unlikely) is caught and logged without crashing the server

---

### Story 8.2: No Listing Endpoint & Cross-Seller Isolation Verification

**GH Issue:** #31

As a developer,
I want to confirm that no report listing or enumeration endpoint exists and that all report queries are isolated by report_id,
So that one seller cannot discover or access another seller's report.

**Satisfies:** FR27 (no public listing), FR29 (no cross-seller data), NFR-S3 (UUID only access), NFR-S5 (no cross-seller queries)

**Acceptance Criteria:**

**Given** the Fastify server with all routes registered  
**When** `GET /api/reports` (no report_id) is requested  
**Then** it returns 404 — the route is NOT registered  
**And** `GET /api/jobs` (no job_id) is requested → returns 404 — not registered

**And** every SQL query in `src/db/queries.js` that reads from the `reports` table uses `WHERE report_id = ?` — no query selects multiple reports or aggregates across sellers  
**And** there is no JOIN between the `generation_jobs` table and the `reports` table in any query accessible via an HTTP route  
**And** the `job_id` is never exposed to the seller in the final report URL — only `report_id` appears in the URL

---
