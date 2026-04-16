---
stepsCompleted: ["step-01-init", "step-02-discovery", "step-02b-vision", "step-02c-executive-summary", "step-03-success", "step-04-journeys", "step-05-domain", "step-06-innovation", "step-07-project-type", "step-08-scoping", "step-09-functional", "step-10-nonfunctional", "step-11-polish", "step-12-complete"]
inputDocuments:
  - "_bmad-output/planning-artifacts/product-brief-MarketPilot.md"
  - "RESEARCH.md"
workflowType: 'prd'
classification:
  projectType: "SaaS web app (self-serve report generator)"
  domain: "Marketplace / e-commerce tooling"
  complexity: "medium"
  projectContext: "greenfield"
briefCount: 1
researchCount: 1
brainstormingCount: 0
projectDocsCount: 0
---

# Product Requirements Document - MarketPilot Free Report Journey

**Author:** Pedro
**Date:** 2026-04-14

## Executive Summary

MarketPilot Free Report is a self-serve, zero-commitment tool that lets Mirakl marketplace sellers see their competitive position across their entire catalog in under 3 minutes. A seller provides their Shop API Key and email, the system fetches their full catalog via OF21, checks competitor prices on every active SKU via P11, and renders a ranked opportunity report on-page — segmented into three sections: Your Position, Biggest Opportunities, and Quick Wins. The report is also delivered by email. A full CSV download is available. The primary conversion goal is the CTA at the bottom: "Start automating this."

The journey is scoped to Worten PT and Worten ES. The API key is used in-session only and never persisted. This guarantee is surfaced prominently on the form — not in fine print — because API key trust was the primary reason previous prospects declined to proceed.

Target user: Portuguese and Spanish SME sellers actively listing on Worten with 1,000–100,000 SKUs, doing meaningful GMV (€10k+/month), currently repricing manually or not at all.

### What Makes This Special

Most competitive tools require account creation, credential storage, and a paid plan before showing any value. This report requires none of that — one key, one click, results in minutes, nothing stored. The trust barrier is addressed before it becomes an objection: the "never stored, session-only" guarantee appears at form-level, at the same visual weight as the submit button.

The Biggest Opportunities section is ranked by WOW score — defined as `my_price / gap_pct` where `gap_pct = (my_price − competitor_price) / competitor_price` — which surfaces the single highest-revenue-recovery item first. A high-ticket product losing by a small margin scores higher than a cheap product losing by the same margin percentage. A seller with 30,000 SKUs sees their #1 recoverable opportunity before they finish reading the page. That specificity is the conversion mechanism: it transforms a generic pitch into personal evidence.

The report is not a product feature. It is a sales tool designed to make one thing clear: "you are losing real money on specific products right now, and here is the number."

### Project Classification

| | |
|---|---|
| **Project Type** | SaaS web app — self-serve report generator |
| **Domain** | Marketplace / e-commerce tooling (Mirakl ecosystem) |
| **Complexity** | Medium — Mirakl MMP API integration (OF21 + P11), async processing, email delivery, CSV export; no regulated data, no persistent credential storage |
| **Project Context** | Greenfield — net-new Phase 2 feature, built on confirmed API foundations from live tests (April 2026) |
| **API Constraint** | Mirakl MMP API only — no MiraklConnect under any circumstances |

## Success Criteria

### User Success

- Seller completes the form and submits without abandoning — the trust guarantee ("Your key is used once and never stored") is prominent enough to overcome the API key friction that previously blocked conversions
- Progress screen keeps the seller engaged during processing — they don't close the tab before the report renders
- Report renders with all three sections populated: Your Position, Biggest Opportunities, Quick Wins
- Seller can identify their single biggest recoverable opportunity within 30 seconds of the report loading — the WOW score ranking makes it immediately obvious
- Email with report is received within 5 minutes of generation completing
- Seller clicks "Start automating this" CTA or contacts Pedro directly — the report creates urgency, not just interest

### Business Success

- **Primary metric:** Free report → paid client conversion. At least 1 paying client from the first 5 reports generated (20% conversion as M$P target)
- **Engagement metric:** At least 3 reports generated for warm leads before end of April 2026 pilot window
- Report can be offered as a cold outreach hook — any Worten seller can be targeted, not just warm leads already in the pipeline
- Zero failed report generations due to API errors or unhandled edge cases (a failed report destroys trust at the worst moment)

### Technical Success

- API key is **never written to any persistent store** — session memory only, cleared after report generation
- OF21 catalog fetch handles pagination correctly — works for catalogs up to 31,000+ SKUs (Gabriel's catalog is the scale test)
- P11 competitor check batches 100 EANs/call with concurrency — full catalog scan completes within 3 minutes for a 5,000-SKU catalog, within 10 minutes for 30,000+ SKUs
- Both Worten channels (`WRT_PT_ONLINE` and `WRT_ES_ONLINE`) are analysed from the single API key in every report — no channel selection by the seller
- PRI01 is not called in this journey — this is a read-only report
- Report renders on-page before email is sent — on-page experience is not blocked by email delivery
- CSV export contains the full catalog analysis across both channels (all SKUs, not just top opportunities)

### Measurable Outcomes

| Outcome | Target |
|---|---|
| Form abandonment rate | < 30% after page load |
| Report generation success rate | > 98% for valid API keys |
| Time to report render (5k SKUs) | < 3 minutes |
| Time to report render (30k SKUs) | < 10 minutes |
| Email delivery time | < 5 minutes post-generation |
| Report → CTA click rate | > 40% |
| Report → paid conversion | ≥ 1 in 5 (M$P phase) |

---


## User Journeys

### Journey 1 — Rui (Warm Lead Seller, Portuguese SME)

**Who:** Rui manages e-commerce operations for a Lisbon-based electronics seller with ~8,000 SKUs active on Worten PT and ES. He spoke with Pedro two weeks ago on the phone. He confirmed they reprice manually — "we check on Mondays." He hasn't replied to Pedro's follow-up email yet. He's curious but not convinced he needs a tool.

**Opening scene:** Pedro sends Rui a short email: "Gerei o relatório para o vosso catálogo. Ficaram em 2.º lugar em 340 produtos. O maior é um router de €189 — estão a perder para um concorrente por €2.40. Podem ver aqui: [link]." Rui opens the link on his phone during lunch.

**Rising action:** He lands on the report page. Before he looks at the numbers, he notices the message under the form — "A chave foi usada uma vez e nunca ficou armazenada." He recalls being wary of sharing the key with Pedro. Seeing the explicit statement relaxes him. He scrolls down to the report, which has already rendered.

**Climax:** He sees "Your Position: 340 products in 2nd place or lower. 87 winnable within 2% price adjustment." He clicks into Biggest Opportunities. The first row is the €189 router — gap of €2.40, WOW score high. He recognises the product immediately. He's been manually checking this one every week. He didn't know about the 87 others.

**Resolution:** He scrolls to the bottom. Reads "Start automating this." He clicks it. He fills out the contact form and writes "quando podemos falar?" — when can we talk? Pedro gets the notification that evening. The call happens the next morning. Rui signs within the week.

**What this journey reveals:** The trust message must appear even when Pedro generates the report on Rui's behalf — it's the reassurance that closes a previously-stalled lead. The on-page report must render fast enough for mobile. The Biggest Opportunities table must be scannable in seconds with the WOW score doing the ranking.

---

### Journey 2 — Ana (Cold Prospect via Outreach)

**Who:** Ana owns a home appliances shop in Porto. She has 3,200 SKUs on Worten, does about €25k/month GMV. She has never heard of MarketPilot or repricing tools. She received a cold email from Pedro with a screenshot showing two of her specific products losing 1st place.

**Opening scene:** Ana reads the email sceptically. The screenshot shows her brand name and two products she recognises. She clicks the link to "ver o relatório completo."

**Rising action:** She lands on the report page. She sees a simple form: API key, email, and a large "Generate my report" button. Under the button: "A tua chave é usada uma vez para gerar este relatório e nunca fica armazenada." She hesitates. She searches in a new tab "o que é uma shop API key Worten." She finds it in her Worten seller portal under Account → API. She copies it, pastes it, enters her email, and submits.

**Climax:** The progress screen shows: "A obter catálogo… A verificar concorrentes… A construir relatório…" — it takes about 2 minutes. The report renders. She is in 2nd place or lower on 211 products. The biggest opportunity: a Bosch washing machine at €549 — she's losing to a competitor by €4.10. That single product does 6 units/month. She hadn't noticed.

**Resolution:** She doesn't click the CTA immediately — she closes the tab and thinks about it for a day. The next morning she opens her email, finds the report summary. The email contains a persistent link back to her report. She clicks it — the report is still there, no key re-entry required. She reads it again and calls the number in the footer.

**What this journey reveals:** The progress screen is load-bearing for cold users — informative messages, not just a spinner. Email delivery must be reliable. **The report link in the email must be persistent — the generated report output is stored for a minimum of 48 hours and accessible via unique link without re-authentication. The API key is never stored; only the computed report output is persisted.**

---

### Journey 3 — Edge Case: Invalid or Suspended Key

**Who:** Miguel is a seller whose Worten account was temporarily suspended. He received Pedro's cold outreach, entered his API key — technically valid, but the account is suspended.

**Opening scene:** Miguel submits the form. The progress screen starts: "A obter catálogo…" — and the OF21 call returns an empty catalog or an auth error.

**What happens:** The system detects zero active offers returned (or a non-200 response). Rather than timing out silently or showing a raw API error, it surfaces a clear, non-technical message: "Não foi possível obter o teu catálogo. Verifica se a chave está correcta e se a tua conta está activa no Worten. Se o problema persistir, contacta-nos."

**Resolution:** Miguel sees the message. He knows to check his account status. His API key is not stored — session cleanup happens even on failure. He returns the following week after resolving the suspension and generates a successful report.

**What this journey reveals:** Error states must be explicit and user-actionable, never raw API errors. Zero-SKU catalog must be handled as a distinct error condition. Session cleanup (key never stored) must happen on all code paths including failures.

---

### Journey 4 — Pedro (Operator, Live Demo on a Sales Call)

**Who:** Pedro is on a video call with a prospect from You Get — a multi-marketplace seller with 12,000 SKUs. The prospect said "show me how it works" mid-call.

**Opening scene:** Pedro opens the MarketPilot report page on screen share. He asks the prospect to read their key from their Worten seller portal. Pedro types it in. Both see the trust message. Pedro points to it: "aqui está — a chave é usada uma vez e nunca fica armazenada, podem ver mesmo aqui."

**Rising action:** Pedro submits. The progress screen runs. 12,000 SKUs takes about 90 seconds. The report renders during the call.

**Climax:** The prospect sees their own data for the first time. 1,847 products in 2nd place or lower. The Biggest Opportunities table leads with a Sony TV at €799 — losing by €6.50. The prospect says "isso é um produto que vendemos muito."

**Resolution:** Pedro scrolls to the CTA. The prospect says "quanto custa?" Pedro answers. They agree to a proposal. The demo became the close.

**What this journey reveals:** The report must be impressive in under 2 minutes for mid-size catalogs. The layout must be readable when screen-shared. Pedro needs no admin mode — the public-facing tool is the demo tool.

---

### Journey Requirements Summary

| Journey | Capabilities Revealed |
|---|---|
| Warm lead (Rui) | Trust message at form level; mobile-responsive report; WOW score ranking in Biggest Opportunities; CTA linking to contact |
| Cold prospect (Ana) | Meaningful progress messages; reliable email delivery; **persistent report link (48h minimum, no key re-entry)**; report retrievable after session closes |
| Edge case (Miguel) | Graceful error handling for empty catalog / auth failure; user-actionable error messages; session cleanup on all failure paths |
| Live demo (Pedro) | Sub-2-minute generation for mid-size catalogs; screen-share-friendly layout; no special operator mode needed |

> **Key architectural distinction:** The API key is never stored. The report output is — persisted for ≥ 48 hours, accessible via a unique report ID in the URL, with no credential in the store.

---

## Domain-Specific Requirements

### API Constraints (Mirakl MMP)

- **MMP API only — no MiraklConnect under any circumstances.** All reads (OF21, P11) use the Shop API Key directly against the marketplace instance URL.
- **P11 batch limit:** 100 EANs per call. Catalog scans must batch accordingly. Concurrent calls are acceptable within Mirakl's recommended rate limits — the system must not send unbounded concurrent requests.
- **OF21 pagination:** ✅ Validated at scale — Gabriel's catalog (31,179 products) fetched successfully with zero pagination errors in 173 seconds (April 2026). The report generator must handle multi-page OF21 responses correctly and assert fetched count against `total_count`.
- **P11 response filtering:** Only `active: true` offers are used for competitive comparison. Inactive offers must be excluded.
- **`total_price` not `price`:** Competitive comparison uses `total_price` (price + shipping) on P11 responses. Using `price` alone produces incorrect gap calculations.
- **Per-channel data:** P11 returns an `all_prices` array with per-channel breakdown (`WRT_PT_ONLINE`, `WRT_ES_ONLINE`) in a single call. Both channels are parsed and presented in the report.

### Data Sensitivity & Access Control

- **Report output is commercially sensitive.** A generated report contains a seller's full catalog snapshot (prices, SKUs) and competitor pricing data. It must not be publicly indexed or discoverable.
- **Access via unique report ID only.** The report is accessible at a URL containing an unguessable report ID (UUID). No authentication required, but no public listing of reports exists.
- **No cross-seller data leakage.** Each report is isolated by report ID. There is no mechanism by which one seller's report reveals another seller's data.

### Privacy & GDPR (Minimum Viable Compliance)

- Full GDPR DPA is deferred to Phase 2 self-serve public launch (per product brief). M$P baseline requirements:
  - A privacy notice must be linked or shown on the form
  - The seller's email address is used only to deliver the report and for sales follow-up (disclosed on the form)
  - Report output (catalog snapshot) is deleted after the 48-hour TTL — no indefinite retention
- **Seller email retention:** Email address may be retained by Pedro for sales follow-up, but this must be disclosed at point of collection.

### Security Constraints

- **API key never persisted.** The Shop API Key is held in server-side session memory only for the duration of the generation job. It must not appear in logs, error messages, database records, or any persistent store — including on failure paths.
- **HTTPS only.** The form and report page must be served over HTTPS. The API key travels in a POST body — plaintext HTTP is unacceptable.
- **No key in URL.** The API key must never appear in a URL parameter, query string, or redirect.
- **Log redaction.** Logging middleware must redact the `Authorization` header and any field named `api_key` before writing to any log store.

### Integration Requirements

- **Outbound only to Mirakl.** The report generator calls OF21 and P11. No inbound webhooks, no real-time data stream — all data is pulled synchronously during generation.
- **Email delivery via transactional provider.** An external transactional email service is required for report delivery. Email includes the persistent report link.
- **No repricing writes in this journey.** PRI01 is explicitly out of scope — this journey is read-only (OF21 + P11 only).

### Risk Mitigations

| Risk | Mitigation |
|---|---|
| Seller enters a valid key but suspended account (OF21 returns empty) | Detect zero-SKU result, surface user-actionable error message, clean session immediately |
| OF21 pagination bug silently truncates catalog | Assert `total_count` from first page against actual records fetched; fail loudly if mismatch |
| P11 rate limit hit mid-scan | Implement backoff and retry; surface progress to user rather than failing silently |
| Report link shared beyond intended recipient | Acceptable at M$P phase — unguessable UUID provides sufficient access control for 48h TTL |
| API key appears in server logs | Logging middleware redacts `Authorization` header and `api_key` fields before write |
| Email delivery failure — cold user closed the tab before report rendered, loses access entirely | Display the persistent report URL on the progress/completion screen so the seller can copy it independently of email delivery; email is a backup channel, not the primary access mechanism |

---

## Distinctive Design Patterns

### 1. Session-Only Credential with Persistent Output

The standard pattern for marketplace tools is: connect your account, store the key, build on ongoing access. This product deliberately inverts it. The Shop API Key is ephemeral — held only in server-side session memory for the duration of the generation job, then discarded. The output (the computed report) is what persists, keyed to an unguessable report ID with a 48-hour TTL.

This is not merely a technical choice — it is the primary trust mechanism. Every competitor in this space (Boardfy, Boostmyshop) requires ongoing credential storage as a precondition of use. MarketPilot Free Report makes the opposite promise and makes it visible, at form level, before the seller does anything.

**Why this matters for implementation:** Every architectural decision downstream must honour this constraint. The key must not appear in logs, job queues, database records, or any async processing context that outlives the generation request. If the architecture requires passing the key to a background worker, that worker's context must be cleared on completion. There is no "we'll clean it up later" — the key is gone when the job is done.

### 2. Report as Sales Instrument (Not Product Feature)

Most SaaS analytics tools generate reports for existing paying users. This report's primary function is to convert a prospect — it exists before any commercial relationship begins. Every design decision in the report must be evaluated against one question: does this make a seller more likely to contact Pedro within 48 hours?

This shapes the WOW score ranking (`my_price / gap_pct` surfaces maximum revenue-recovery impact — a high-ticket product losing by a small margin scores higher than a cheap product losing by the same margin percentage), the three-section structure (headline numbers first, then ranked opportunities, then quick wins — largest impact first, not alphabetical or SKU-ordered), and the CTA placement (bottom of the report, after the seller has seen their losses, not at the top before they have context).

**Why this matters for implementation:** The report is not a dashboard. It does not need filtering, sorting controls, or saved views at MVP. It needs one clear ranked list and one clear next action. Complexity added in the name of "completeness" works against the conversion goal.

---

## SaaS Web App Specific Requirements

### Project-Type Overview

The Free Report is a stateless, single-use web application. There are no user accounts, no login, no persistent sessions beyond the generation job. The interaction model is: form submission → background job → persistent report accessible by unique ID. Each report generation is an isolated event. The "tenant" is the report ID — it is the only access boundary the system enforces.

### Technical Architecture Considerations

**Processing Model: Async with progress feedback**

The generation job is not instantaneous (2–10 minutes for large catalogs). The frontend must not block on a synchronous HTTP response. Architecture:

1. Form submits → server validates inputs, enqueues generation job, returns a `job_id` and `report_id` immediately
2. Progress screen polls job status endpoint (or uses SSE/WebSocket) for live updates: `fetching_catalog` → `scanning_competitors` → `building_report` → `complete` / `error`
3. On `complete`, frontend redirects to or renders the report at `/report/{report_id}`
4. On `error`, frontend displays user-actionable error message; session is cleaned up regardless

**Tenant / Isolation Model**

No user accounts. The `report_id` (UUID v4) is the only access token. It is:
- Generated server-side at job creation time
- Returned to the frontend immediately (displayed on progress screen for copy before email arrives)
- Included in the confirmation email
- Valid for 48 hours from generation time
- Not enumerable — no index, no listing endpoint

**Data Model (minimum viable)**

| Entity | Fields | Notes |
|---|---|---|
| `generation_job` | `job_id`, `report_id`, `status`, `marketplace_instance`, `email`, `created_at`, `completed_at`, `error_message` | API key is NOT a field — never written |
| `report` | `report_id`, `generated_at`, `expires_at`, `summary` (JSON), `opportunities_pt` (JSON), `opportunities_es` (JSON), `quickwins_pt` (JSON), `quickwins_es` (JSON), `csv_data` (stored blob or path) | Contains all computed output; no raw API responses stored |

### Frontend Requirements

**Form page**
- Fields: Shop API Key (text, required), Email (email, required)
- No channel selector — both channels analysed automatically
- Trust message at button level, same visual prominence as submit: "A tua chave é usada uma vez para gerar este relatório e nunca fica armazenada."
- Privacy notice link (one line, below trust message)
- Submit triggers POST to generation endpoint; form is replaced by progress screen on success

**Progress screen**
- Displays the persistent report URL immediately (before generation completes) so the seller can copy it — primary defence against email delivery failure
- Live status messages: "A obter catálogo…" → "A verificar concorrentes (X de Y produtos)…" → "A construir relatório…"
- Progress reflects actual job phases, not a fake countdown
- On error: clear, non-technical message + "contacta-nos" link; no raw API errors exposed

**Report page (`/report/{report_id}`)**
- Three sections rendered sequentially: Your Position → Biggest Opportunities → Quick Wins
- Your Position: headline stat cards (PT and ES side-by-side) — total SKUs, winning, losing, uncontested
- Biggest Opportunities: table per channel, sorted by WOW score descending; columns: product name/EAN, current price, competitor price, gap €, gap %, WOW score
- Quick Wins: table per channel, products winnable within ≤ 2% gap (gap_pct ≤ 0.02); same columns
- "Download Full CSV" button — triggers download of `report.csv_data`
- CTA at bottom: "Start automating this" — links to contact form or WhatsApp/email
- Mobile-responsive layout; screen-share-friendly
- Accessible at any time within the 48-hour TTL — no re-authentication required

### Backend / Processing Requirements

**Generation job steps (server-side)**

1. Validate API key format (basic — non-empty, reasonable length); validate email format
2. Enqueue job; return `job_id` + `report_id` to frontend immediately
3. **Step A — Catalog fetch (OF21):** Paginate through all active offers; collect EAN + `shop_sku` + `price` + channel; assert fetched count matches `total_count`; fail loudly if mismatch
4. **Step B — Competitor scan (P11):** Batch EANs in groups of 100; concurrent calls within Mirakl rate limits; filter `active: true`; extract `total_price` per channel (`WRT_PT_ONLINE`, `WRT_ES_ONLINE`) for positions 1 and 2
5. **Step C — Scoring:** For each product per channel where `my_price > total_price[0]` (seller is not in 1st place):
   - `gap = my_price − total_price[0]`
   - `gap_pct = gap / total_price[0]`
   - `WOW score = my_price / gap_pct`
   - Flag as Quick Win if `gap_pct ≤ 0.02`
6. **Step D — Persist report:** Write computed output to `report` table; set `expires_at = now + 48h`
7. **Step E — Send email:** Dispatch transactional email with report link; non-blocking (job marked `complete` regardless of email success)
8. **Step F — Cleanup:** Clear API key from all in-memory job context; update job status to `complete`

**Key constraint:** The API key is passed into the job at creation and must not be written to any store at any point. If the job process crashes mid-execution, the key is lost — this is acceptable; the seller re-enters it.

### Implementation Considerations

- **Job queue:** Lightweight background job processor sufficient at M$P scale (1–5 concurrent reports). Simple in-process queue or minimal external queue (e.g. BullMQ on Redis, or a serverless function) is adequate.
- **Report storage:** Simple key-value store or database table with TTL support. SQLite-backed store is viable at M$P scale. Stored payload per report is JSON + CSV blob — roughly 1–5 MB for a 30k-SKU catalog.
- **Email provider:** Any transactional email service (Resend, Postmark, SendGrid) — one API call per completed report. Email failure must not fail the job.
- **Hosting:** Server must be accessible over HTTPS. Simple VPS or serverless deployment sufficient.
- **No admin UI at MVP:** Pedro has no dashboard. Report monitoring handled by checking provider logs directly at M$P scale.

---

## Product Scope

### MVP Strategy & Philosophy

**MVP Approach:** Revenue MVP — the product's primary function is to convert a warm or cold prospect into a paying automation client. Every feature decision is evaluated against this: does it increase the probability of the seller contacting Pedro within 48 hours?

**Resource requirements:** Solo developer (Pedro). No team size assumptions built into scope. The MVP must be buildable by one person before the April 2026 pilot window closes.

---

### MVP Feature Set (Phase 1)

**Core user journeys supported:**
- Warm lead receives a report link generated by Pedro and opens it (Journey 1)
- Cold prospect self-generates their own report (Journey 2)
- Invalid/suspended key surfaces a clear error and cleans up correctly (Journey 3)
- Pedro runs a live demo during a sales call (Journey 4)

**Must-Have Capabilities:**

| Capability | Justification |
|---|---|
| Input form: API key + email, trust message at button level | Without trust message, conversion blocked (confirmed from lost prospects) |
| Async generation with live progress screen | Catalog scans take 2–10 min — sync response would timeout |
| Persistent report URL displayed on progress screen | Without this, email failure = lost cold prospect (Journey 2 finding) |
| OF21 catalog fetch with pagination | Without pagination, reports silently truncate for large catalogs |
| P11 batch scan (100 EANs/call, both channels) | Core data source — no report without it |
| WOW score calculation per channel | Ranking mechanism that makes Biggest Opportunities scannable in 30 seconds |
| Quick Wins identification (gap_pct ≤ 0.02) | Second report section; distinct value from Biggest Opportunities |
| Your Position headline numbers per channel | Gives the seller instant context before the detail |
| Report persistence (48h TTL, UUID access) | Without this, no return visits, no email link, no demo-sharing |
| Confirmation email with report link | Required for cold prospects who don't convert on first visit |
| CSV download (full catalog analysis) | Gives sellers a working artifact to take away |
| CTA: "Start automating this" | The product exists to generate this click |
| Session cleanup on all paths (success + failure) | Hard requirement — API key must never persist |
| User-actionable error messages | Silent failures destroy trust at the worst possible moment |

---

### Post-MVP Features

**Phase 2 (Growth — after first 3 paying clients):**
- Floor simulator on Biggest Opportunities: seller inputs floor % and sees winnable subset
- Configurable report link expiry (beyond 48h MVP minimum) — Pedro extends access for warm leads
- Branded PDF export for sales conversations
- Rate limiting / abuse prevention on the form (not needed at M$P scale, needed before public launch)
- Automated report generation triggered by Pedro's outreach sequences

**Phase 3 (Expansion — platform phase):**
- Full self-serve: any Worten seller generates their own report without Pedro's involvement
- Seamless onboarding flow: report → "Start automating" pre-populates automation config
- Support for additional Mirakl marketplaces (Phone House ES, PCComponentes, Carrefour ES, MediaMarkt)
- GDPR DPA and full privacy policy (required before Phase 3 public launch)

---

### Risk Mitigation Strategy

**Technical risks:**

| Risk | Severity | Mitigation |
|---|---|---|
| OF21 pagination at 31k SKUs | LOW | ✅ **Already validated** — scale test against Gabriel's catalog (31,179 products) completed successfully with zero pagination errors in 173 seconds (April 2026). Assert `total_count` vs fetched count as a runtime guard. |
| P11 rate limiting under sustained concurrent load | MEDIUM | Implement backoff + retry with progress update; validate concurrent batch behaviour under sustained load before first client go-live |
| Report generation timeout for very large catalogs | MEDIUM | Set a generous but finite job timeout; surface partial results or retry prompt rather than silent failure |

**Market risks:**

| Risk | Severity | Mitigation |
|---|---|---|
| Sellers won't enter their API key even with trust message | HIGH | Pedro generates first reports on their behalf (Journey 1) — self-serve is not required for M$P conversion |
| Report impresses but doesn't convert | MEDIUM | CTA links directly to Pedro's contact — conversion is a conversation, not a button |

**Resource risks:**

| Risk | Mitigation |
|---|---|
| Solo build takes longer than April pilot window | Prioritise Journey 1 (Pedro generates reports manually) first — Journey 2 self-serve can follow. Pedro can demo with a pre-generated report before the self-serve form is live. |
| Email delivery setup delays launch | Report URL on progress screen means email is not on the critical path for MVP functionality |

---

## Functional Requirements

> **This is the capability contract.** UX designers will only design what is listed here. Architects will only support what is listed here. Epics and stories will only implement what is listed here. If a capability is missing, it will not exist in the final product.

### Report Generation

- **FR1:** A seller can submit their Worten Shop API Key and email address to initiate report generation
- **FR2:** The system analyses both Worten PT (`WRT_PT_ONLINE`) and Worten ES (`WRT_ES_ONLINE`) channels from a single submitted API key without requiring the seller to select a channel
- **FR3:** The system fetches the seller's complete active offer catalog via OF21, handling all paginated pages to ensure no products are silently truncated
- **FR4:** The system checks competitor prices for all fetched products via P11, batching 100 EANs per call, filtering to `active: true` offers, and using `total_price` (not `price`) for all competitive comparisons
- **FR5:** The system calculates a WOW score for each product per channel where the seller is not in 1st place: `WOW = my_price / gap_pct`, where `gap_pct = (my_price − competitor_total_price[0]) / competitor_total_price[0]`. A positive `gap_pct` means the seller's price is higher than the competitor's (the seller is losing 1st place) — this is the only case where a WOW score is calculated. Products where `my_price ≤ competitor_total_price[0]` are already in 1st place and are excluded.
- **FR6:** The system identifies Quick Wins as products where `gap_pct ≤ 0.02` — the seller's price exceeds the competitor's by 2% or less of the competitor's price. Uses the same `gap_pct` definition as FR5.
- **FR7:** The system generates a unique, unguessable report ID at job creation time and returns it to the client immediately — before generation completes
- **FR8:** The system provides the seller with real-time progress status updates during generation, reflecting actual processing phases

### Report Presentation

- **FR9:** A seller can view a **Your Position** section showing headline counts per channel: products in 1st place, losing 1st place, and uncontested
- **FR10:** A seller can view a **Biggest Opportunities** section showing all products not in 1st place, sorted by WOW score descending, presented per channel
- **FR11:** A seller can view a **Quick Wins** section showing all products with `gap_pct ≤ 0.02`, presented per channel
- **FR12:** Each product row in Biggest Opportunities and Quick Wins displays: product identifier (name and/or EAN), seller's current price, competitor's 1st-place total price, gap in €, gap %, and WOW score
- **FR13:** A seller can view and interact with a call-to-action to enquire about the repricing automation service

### Report Access & Delivery

- **FR14:** A seller can access their generated report via a persistent unique URL for a minimum of 48 hours after generation, without re-entering their API key
- **FR15:** The persistent report URL is displayed on the progress/completion screen at the moment the job ID is created — before email delivery and before generation completes — so the seller can copy it independently
- **FR16:** The system sends the seller a confirmation email containing the persistent report link upon generation completing
- **FR17:** A seller can download a CSV export of the full catalog analysis covering all products and both channels

### Trust & Credential Security

- **FR18:** The form displays a trust statement ("Your key is used once to generate this report and never stored") at the same visual prominence as the submit action — not in fine print
- **FR19:** The system never writes the submitted API key to any persistent store, log entry, job queue record, or background processing context
- **FR20:** The system clears the API key from all in-memory context after the generation job completes — on both success and failure paths
- **FR21:** The form provides a privacy notice link at the point of submission

### Error Handling & Recovery

- **FR22:** The system detects when a submitted API key returns an empty or zero-SKU catalog and surfaces a user-actionable error message (not a raw API error)
- **FR23:** The system surfaces a user-actionable error message when report generation fails for any reason — the message must indicate what the seller should check or do next
- **FR24:** The system performs API key session cleanup on all failure code paths — there is no error condition under which the key persists
- **FR25:** The progress screen displays descriptive status messages that identify the current generation phase, not only a loading indicator

### Data Governance & Privacy

- **FR26:** Generated report output is automatically deleted after 48 hours from generation time
- **FR27:** Report data is accessible only via the unique report ID — no public index, listing, or discovery mechanism exists
- **FR28:** The seller's email address is used only for report delivery and disclosed sales follow-up; this use is stated at point of collection
- **FR29:** The system ensures no report contains, references, or exposes data belonging to another seller

---

## Non-Functional Requirements

### Performance

- **NFR-P1:** Form submission to job enqueued + `report_id` returned to the client: < 2 seconds
- **NFR-P2:** Full report generation for catalogs ≤ 5,000 SKUs: < 3 minutes
- **NFR-P3:** Full report generation for catalogs 5,001–31,000 SKUs: < 10 minutes
- **NFR-P4:** Report page load time for a pre-computed report: < 2 seconds
- **NFR-P5:** CSV download initiation (response begins): < 3 seconds

### Security

- **NFR-S1:** All traffic served over HTTPS; HTTP requests redirected; API key submission over plaintext HTTP must be rejected
- **NFR-S2:** The API key must not appear in any log entry, database record, error message, job queue payload, or background processing context at any point
- **NFR-S3:** Report content is accessible only via its UUID — no endpoint exposes a list or index of report IDs, and no sequential or predictable ID pattern is used
- **NFR-S4:** The `Authorization` header and any request field named `api_key` are redacted by logging middleware before any log is written
- **NFR-S5:** No cross-seller data — report storage and retrieval must be isolated by `report_id` with no shared query paths between reports

### Reliability

- **NFR-R1:** Report generation success rate for valid, active API keys with non-empty catalogs: ≥ 98%
- **NFR-R2:** The system must never silently produce a truncated report — if OF21 fetched count does not match `total_count`, the job must fail with an explicit error rather than generate a partial report
- **NFR-R3:** Email delivery must be attempted within 5 minutes of job completion; email delivery failure must not affect job success status or report accessibility
- **NFR-R4:** Any report URL that has not yet expired must resolve and return the full report on 100% of valid requests within the 48h TTL

### Integration

- **NFR-I1:** Mirakl MMP API non-200 responses and rate-limit responses (HTTP 429) must be handled with exponential backoff and retry — not surfaced directly to the user as raw errors
- **NFR-I2:** Mirakl API errors that are not recoverable after retry must produce a user-actionable error message (per FR22/FR23) — not a blank screen, timeout, or stack trace
- **NFR-I3:** Transactional email provider failure must not prevent the seller from accessing their report — the report URL displayed on the completion screen (FR15) is the primary access mechanism; email is a secondary delivery channel
