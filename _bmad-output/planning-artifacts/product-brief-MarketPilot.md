---
title: "Product Brief: MarketPilot"
status: "draft"
created: "2026-04-14"
updated: "2026-04-14"
inputs: ["RESEARCH.md", "OUTREACH.md", "PRICING.md", "conversation discovery session", "product planning session 2026-04-14"]
---

# Product Brief: MarketPilot

## Executive Summary

Portuguese and Spanish sellers on Mirakl-based marketplaces (Worten, Phone House, PCComponentes, Carrefour ES, MediaMarkt) are losing a disproportionate share of their revenue to a structural problem they rarely notice: position invisibility. On these platforms, 95%+ of buyers purchase from the 1st-place seller. Being in 2nd place — even by €0.20 — is functionally the same as being invisible.

MarketPilot is an automated repricing engine for Mirakl marketplace sellers. It monitors competitor prices every 15 minutes via the official Mirakl API, automatically adjusts prices to reclaim 1st place without breaching a configurable margin floor, and raises prices to maximise margin when the seller is already winning. Price updates are live on Worten in under 10 seconds.

The immediate opportunity is the Iberian market: a concentrated pool of SME sellers doing meaningful volume on Mirakl platforms, with no local repricing solution, no local support, and in most cases no automation whatsoever. The M$P path is clear — close one client at €1,000 setup + €50/month before building, use Gabriel's real catalog as a working demo, and expand from there.

---

## The Problem

**Structural invisibility.** Mirakl's default sort is by price. The seller with the lowest price appears first. The vast majority of buyers never scroll further. Sellers in 2nd, 3rd, or 7th place compete for a fraction of sales — the difference between 1st and 2nd is not incremental, it is binary.

**Manual repricing doesn't scale.** A seller with 5,000 active SKUs checking prices manually is working with data that is hours or days old. Competitors with repricing tools react in minutes. INFOPAVON (50k+ sales, established seller) is already being beaten by a €0.01 repricing bot they apparently don't know exists.

**The ceiling problem is invisible too.** When a seller is already in 1st place, they often leave margin on the table — their price is lower than it needs to be. The 2nd-place seller might be €15 higher. Nobody raises their price manually when they're already winning.

**No accessible local solution.** The only tools that exist (Boardfy, Boostmyshop) charge €99+/month, operate in English or French, offer no local support, and are unknown to most Iberian sellers. Five discovery calls with Portuguese sellers confirmed the pain — all were repricing manually or not at all. None had heard of either competitor.

---

## The Solution

MarketPilot connects to a seller's Mirakl marketplace via their existing Shop API Key. No new accounts, no integrations — one key, one config.

**Every 15 minutes (contested products):**
1. Fetch competitor prices for all products not in 1st place (P11 API, up to 100 EANs/call, batched concurrently)
2. For each product: is the 1st-place total price (price + shipping) beatable above the seller's floor?
   - Yes → set new price at 1st-place total − €0.10, submit via CSV import (PRI01)
   - No → hold, log "floor reached"
3. On winning 1st place → move product to the ceiling cycle

**Every 2 hours (products already in 1st place):**
1. Check 2nd-place price
2. Calculate ceiling: min(2nd-place − €0.01, target margin price)
3. If ceiling > current price → raise price
4. If competitor undercuts → move product back to 15-minute cycle

**Daily (products with no competitors):**
1. Quick check — has anyone entered?
2. If yes → assign to appropriate tier
3. If no → hold

**Floor protection:** Seller sets a maximum discount % from their current listing price (default: 2%). Floor = current\_price × (1 − floor\_pct). No cost data required. The report shows exactly which products are winnable within their chosen floor.

**Per-channel pricing:** Worten PT and Worten ES have separate competitor price landscapes on the same API key. MarketPilot optimises each channel independently — a seller can be in 1st on PT at €49.90 and in 1st on ES at €54.90 simultaneously.

**Speed:** PRI01 price imports process in under 3 seconds on Worten's instance (confirmed via live test, April 2026). A 15-minute cycle is conservative — the system could run 5-minute cycles within Mirakl's recommended rate limits.

---

## What Makes This Different

| | MarketPilot | Boardfy / Boostmyshop | Manual |
|--|--|--|--|
| Local PT/ES support | ✅ Pedro, in Portuguese | ❌ English/French only | — |
| Price | €50-100/month | €99+/month | "Free" (staff time) |
| Data source | Official Mirakl API | Likely web scraping | Manual checks |
| Update speed | < 10 seconds | Unknown (scraping lag) | Hours/days |
| Ceiling optimisation | ✅ Built-in | ✅ (Boardfy) | ❌ |
| Per-channel pricing | ✅ | Unknown | ❌ |
| Awareness among PT sellers | To be built | Near zero | — |

**The actual moat is not the technology — it is local presence and trust.** Boardfy exists and works. Sellers don't know about it and wouldn't trust a foreign tool over a local person they can call. This window will not stay open indefinitely.

---

## Who This Serves

**Primary — Portuguese/Spanish Mirakl SME sellers**
- 1,000–100,000 active SKUs
- €10k–€200k GMV/month on Mirakl
- Selling on 1–5 Mirakl marketplaces simultaneously
- Currently repricing manually or not at all
- Strong pain signal: confirmed across 5 discovery calls

**Highest-value segment — multi-marketplace sellers**
Sellers on 3+ Mirakl marketplaces (You Get: 5 Mirakl platforms; WDMI: 4) represent 3-5x the revenue of single-marketplace clients. Same engine, additional API keys, nearly zero marginal build cost.

**First client vehicle — Gabriel's store**
Gabriel's catalog (31,177 products, Worten PT + ES) is the proof-of-concept. The tool is built for his needs first. His store is the live demo. He pays for the build (financing in ~3 months). Note: Gabriel is an existing client of Pedro's — the demo is real data, not an independent case study. The first independent paying client is the credibility milestone that matters.

---

## Success Criteria

**M$P phase (0–3 months)**
- 1 paying client signed at €1,000 setup + €50/month before build begins
- Gabriel's store live and repricing correctly
- Zero incorrect price submissions (floor protection working)
- PRI01 scale test passed: full catalog scan (31k products) completes within 15-minute window

**Growth phase (3–12 months)**
- 5 paying clients
- At least 2 multi-marketplace clients (€200+/month each)
- €1,000+ MRR
- First case study published (anonymised)

**Credibility signals**
- MarketPilot brand live at marketpilot.pt
- Professional email pedro@marketpilot.pt
- Opportunity report generated and sent for at least 3 warm leads
- Service agreement with liability cap signed by first client

---

## Scope

### Phase 1 — M$P (build this)
- Opportunity report generator: scan OF21 catalog → P11 competitor check → ranked output showing products losing 1st place, gap in €, recommended floor %
- Automated repricing engine: tiered cycles (15 min / 2h / daily), floor protection, ceiling optimisation, per-channel (PT + ES)
- Worten PT + ES only (one API key, two channels)
- Pedro-managed admin: client onboarding, config, monitoring
- Stripe billing integration (Pedro already has Stripe via Voleri)
- Service agreement with liability cap

### Phase 2 — Platform (after first 3 clients)
- Self-serve web interface with two distinct product areas: Free Report and Repricing Automation
- Encrypted API key storage (session-only for report, encrypted-at-rest for automation)
- Additional Mirakl marketplaces: Phone House ES, PCComponentes, Carrefour ES, MediaMarkt
- GDPR data processing agreement and privacy policy (required before public launch)
- Client dashboard: price history, adjustments count, position tracking

#### Free Report Journey
1. Seller enters API key + email, clicks Generate
2. Trust message on form: "Your key is used once to generate this report and never stored"
3. Progress screen with live status: fetching catalog → checking competitors → building report
4. Report renders on page in three sections:
   - **Your Position** — headline numbers (products winning / losing / uncontested)
   - **Biggest Opportunities** — high-ticket products losing 1st place by small margins, sorted by revenue impact (high price × small gap %)
   - **Quick Wins** — products winnable with a tiny price adjustment
5. Email sent with report link or summary
6. "Download Full CSV" exports complete catalog analysis
7. CTA at the bottom: "Start automating this"

### Explicitly out of scope
- MiraklConnect (expensive aggregation layer — 90% of sellers use direct MMP API)
- Stock management
- Order management
- Non-Mirakl marketplaces (Amazon, eBay)

---

## Technical Foundation

**Confirmed working via live tests (April 2026):**

| Operation | Endpoint | Auth | Notes |
|-----------|----------|------|-------|
| Read own catalog | `GET /api/offers` (OF21) | Shop API Key | EAN in `product_references[0]`, `shop_sku` = PRI01 identifier |
| Read competitor prices | `GET /api/products/offers` (P11) | Shop API Key | 100 EANs/call, `all_offers=true`, use `total_price` not `price` |
| Write prices | `POST /api/offers/pricing/imports` (PRI01) | Shop API Key | CSV: `offer-sku;price;channel`, < 3 sec processing ✅ |
| Track write | `GET /api/offers/pricing/imports` (PRI02) | Shop API Key | Poll for COMPLETE/FAILED |

**Critical implementation notes:**
- Use `total_price` (price + shipping) for competitive comparison, not `price` alone
- Filter `active: true` from P11 results only
- `shop_sku` from OF21 (format: `EZ{EAN}`) is the correct PRI01 offer-sku identifier
- Per-channel pricing: PRI01 CSV accepts a `channels` column — reprice WRT_PT and WRT_ES separately
- OF24 (`POST /api/offers`) is NOT safe for price-only updates — resets all unspecified fields
- Do NOT use MiraklConnect under any circumstances

**Outstanding technical validation needed:**
- Full catalog scan at scale (31k products, concurrent P11 batches) — run on Gabriel's key before first client go-live
- OF21 pagination behaviour at scale (default page size unknown, 31k products require multiple pages)

---

## Go-to-Market — Immediate Actions

**This week:**
1. Buy marketpilot.pt (€11, OVH) — EUIPO confirmed zero trademarks
2. Set up pedro@marketpilot.pt email
3. Simple landing page (one page — what it is, who it's for, contact)
4. Run Gabriel's catalog through the pipeline → generate opportunity report
5. Re-engage 4 warm leads (WDMI, You Get, Clinks, Servelec) with new brand email + report sample

**Re-engagement message (Portuguese):**
> "Construí a ferramenta com um cliente real e tenho agora uma marca própria — MarketPilot. Posso gerar um relatório gratuito para o vosso catálogo no Worten que mostra exactamente quantos produtos estão a perder a primeira posição agora mesmo e por quanto. Sem pedir nada em troca — só para verem os números reais."

**Create urgency:** Pilot is limited to 3 clients. State a closing date ("pilot encerra a 30 de Abril") in the re-engagement message to create scarcity without being dishonest.

**Cold channel:** The free report offer works on cold prospects too — not just warm leads. Any seller visible on Worten can receive a personalised email showing their specific products losing 1st place (screenshot + report offer). This is the hook that got 5 meetings in the first outreach round.

**Pricing (confirmed):**
- Setup: €1,000 (report + build + deployment + config)
- Monthly: €50/month (months 1–6), €100/month (month 7+)
- Additional marketplace: €75/hour (typically 1–2h)
- Payment: 50% upfront, 50% on delivery — Stripe

---

## Risks & Open Questions

| Risk | Severity | Mitigation |
|------|----------|------------|
| Scale test not done | HIGH | Run before first client goes live — Gabriel's catalog |
| No service agreement yet | HIGH | Draft 1-page contract with liability cap before first client |
| GDPR/DPA missing | MEDIUM | Required before Phase 2 self-serve launch, not M$P blocker |
| Race to bottom between clients | LOW | Accepted for M$P — monitor, address in Phase 2 |
| Autopilot ApS Class 42 EUTM | LOW | Using "MarketPilot" avoids this entirely |
| Commission rates not in floor calc | LOW | Client sets floor %, we don't claim to calculate true margin |

---

## Vision

MarketPilot becomes the marketplace operations platform for Iberian sellers — the tool that runs in the background while sellers focus on their business.

**Year 1:** Repricing for Worten + Phone House + PCComponentes. 10+ clients. €1,500+ MRR.

**Year 2:** Self-serve platform. Full Mirakl marketplace coverage in PT + ES. Stock sync. 50+ clients. €5,000–10,000 MRR.

**Year 3:** Expand to FR and IT Mirakl markets. Explore white-label for Mirakl integrators and ecommerce agencies as distribution channels. Possible acquisition target for a larger marketplace tooling company.

The window is open because the competitors don't speak Portuguese and don't pick up the phone. That won't last.
