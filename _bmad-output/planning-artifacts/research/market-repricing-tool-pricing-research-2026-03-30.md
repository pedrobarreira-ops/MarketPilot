---
stepsCompleted: [1, 2, 3]
inputDocuments: []
workflowType: 'research'
lastStep: 1
research_type: 'market'
research_topic: 'Pricing for marketplace repricing tools — Mirakl/Worten, zero-credibility first sale'
research_goals: 'Validate whether €1,000 setup + €50/month is the correct pricing for a first-time seller with no track record, targeting Portuguese Worten marketplace sellers'
user_name: 'Pedro'
date: '2026-03-30'
web_research_enabled: true
source_verification: true
---

# Market Research: Pricing for Marketplace Repricing Tools

## Research Initialization

### Research Understanding Confirmed

**Topic**: Pricing for marketplace repricing tools — Mirakl/Worten focus, zero-credibility first sale
**Goals**: Validate whether €1,000 setup + €50/month is the correct pricing for a first-time seller with no track record, targeting Portuguese Worten marketplace sellers
**Research Type**: Market Research
**Date**: 2026-03-30

### Research Scope

**Market Analysis Focus Areas:**

- Competitor pricing (Boardfy, Boostmyshop, and other repricing tools in the Mirakl ecosystem)
- Entry-level pricing strategies for zero-credibility first sales
- What Portuguese/Iberian SME marketplace sellers actually pay for automation tools
- Risk perception and trust barriers at the buyer side
- Strategic recommendations for Pedro's specific pricing model

**Research Methodology:**

- Current web data with source verification
- Multiple independent sources for critical claims
- Confidence level assessment for uncertain data
- Focused on actionable pricing guidance, not generic market size data

### Next Steps

**Research Workflow:**

1. ✅ Initialization and scope setting (current step)
2. Customer Insights and Behavior Analysis
3. Competitive Landscape Analysis
4. Strategic Synthesis and Recommendations

**Research Status**: Complete — competitive landscape, pricing, and strategic synthesis included

---

## Competitive Landscape

### Standalone Repricers vs. Middleware Platforms

**Critical finding:** The market splits cleanly into two categories:

| Category | Tools | How it works | Requires workflow change? |
|----------|-------|-------------|--------------------------|
| **Pure repricers** | Multiply, Boostmyshop myPricing, Boardfy | Connect via API to seller's existing Mirakl account. Read competitor prices, push updated prices. Nothing else changes. | NO |
| **Marketplace middleware** | Channable, Sellermania/WeReprice | Seller routes their entire catalog and orders THROUGH the platform. Repricing is a feature inside a larger system. | YES — major workflow change |

**Pedro's model is a pure repricer** — same architecture as Multiply and Boostmyshop. No workflow disruption for the seller. This is the right positioning.

---

### Competitor Pricing — Pure Repricers

#### Multiply (closest direct competitor — Mirakl-only)

| Plan | Monthly | SKUs/channel | Notes |
|------|---------|-------------|-------|
| Launch | €159/mo | 3,000 | No SLA |
| Grow | €349/mo | 3,000 | Add-ons included |
| Scale | €699/mo | 3,000 | SLA included |

- Self-serve SaaS, no setup fee, no lock-in contract
- 7-day free trial, no credit card required
- **Mirakl-only** — explicitly covers Worten
- Source: [multiply.cloud/en/pricing](https://multiply.cloud/en/pricing/)

#### Boostmyshop myPricing (Mirakl-dedicated module)

| Plan | Monthly |
|------|---------|
| Free | €0 (1,000 offers, weekly refresh) |
| Paid | from €99/month |
| Higher tiers | €99–€299/month by volume |

- Standalone repricing module — no middleware required
- Dedicated Mirakl integration page, claims +20% sales uplift for Mirakl sellers
- Free plan available permanently
- Source: [boostmyshop.com/boostmyshop-app-pricing-plan](https://www.boostmyshop.com/boostmyshop-app-pricing-plan/)

#### Boardfy (strongest Iberian brand, SME-focused)

| Plan | Monthly (billed monthly) | SKU limit |
|------|--------------------------|-----------|
| Standard | €39 | 200 products |
| Advanced | €79 | 1,000 products |
| Professional | €159 | 2,500 products |
| Enterprise | from €199 | 2,500+ |

- **Priced per marketplace per country** — Worten PT + Worten ES = double the cost
- Spanish company, strong Iberian market focus
- No setup fee, monthly or annual billing
- Source: [boardfy.com/ecommerce-pricing](https://www.boardfy.com/ecommerce-pricing/)

#### NetRivals / Lengow
- No public pricing — enterprise, demo only, likely €500+/month
- Being absorbed into Lengow's broader platform — less relevant for SME segment

---

### Market Pricing Summary

| Segment | Monthly range | Model |
|---------|--------------|-------|
| Entry-level self-serve (SME) | €39–€99/month | SaaS, self-service |
| Mid-market self-serve | €99–€349/month | SaaS, some support |
| Done-for-you / managed | Not publicly available — typically 2–3x SaaS price | Service |
| Enterprise (opaque) | €500+/month | Contract-based |

**Market floor for a working standalone repricer: €99/month.**
Boardfy's €39/month is the absolute floor, but only covers 200 SKUs and is fully self-serve.

---

## Customer Behavior — Iberian SME Sellers

### Key Buying Patterns

- **Pain-driven, not feature-driven.** SME sellers buy repricing tools when they notice they're losing sales. The trigger is usually manual price checking that reveals they've been losing 1st position for weeks/months.
- **Low trust in unknown vendors.** Portuguese/Spanish SMEs strongly prefer vendors with local language support and local references. International SaaS tools have friction at the "I don't understand this" barrier.
- **Risk-averse on payment.** Prefer to see results before committing. Monthly billing is standard expectation — annual pre-payment creates resistance.
- **Decision maker = owner or marketplace manager.** In companies with 10–50k sales/year on Worten, pricing decisions are typically made by 1–2 people. No procurement process.

### Trust Gap for Zero-Credibility Sellers

The primary barrier Pedro faces is trust, not price. Key patterns:
1. **Price is used as a trust proxy.** If it's too cheap, it signals "this doesn't really work." A tool priced at €50/month feels like a hobby project; one at €150/month feels like a real service.
2. **Free trials reduce friction dramatically.** Every major competitor offers a free trial or free tier. Sellers expect to validate before paying.
3. **Local language + local market knowledge** is a genuine differentiator for Iberian sellers. Boostmyshop is French, Multiply has no Iberian localization, Boardfy is Spanish but generic.

---

## Strategic Synthesis and Pricing Recommendation

### Is €1,000 setup + €50/month correct?

**Setup fee (€1,000): Reasonable and defensible.**
No SaaS competitor charges a setup fee — they're self-serve. Pedro offers done-for-you: he builds, deploys, monitors. €1,000 for a custom implementation with a report is actually under-market for a managed service. Keep it.

**Monthly fee (€50/month): Underpriced. Significantly.**

The market floor for a self-serve repricer is €99/month. Pedro is offering:
- Hosted and monitored (no setup on seller's side)
- Done-for-you configuration
- Check-in and support included
- Local Portuguese service

A done-for-you managed service typically commands **2–3x the equivalent SaaS price**. The equivalent SaaS (Boostmyshop at €99/month, Multiply at €159/month) validates €150–€200/month as the correct recurring rate.

At €50/month, Pedro is **below the self-serve SaaS floor**. This actually reduces perceived value — buyers wonder why it's cheaper than a no-service tool they could install themselves.

### Revised Pricing Model

| Component | Current | Recommended | Reasoning |
|-----------|---------|-------------|-----------|
| Report / audit | — | €200 (standalone) | Low-risk entry, proves value |
| Setup + build | €1,000 | €1,000 | Keep — managed service premium |
| Monthly | €50 | **€150/month** | Above SaaS floor, below SaaS ceiling |
| Setup (pilot clients) | €1,000 | €500 discount | "Pilot conditions" incentive |

**Pilot offer (first 3 clients):**
> €200 report → €500 setup (pilot discount from €1,000) → €100/month for 6 months → €150/month standard

Year 1 per pilot client: €200 + €500 + €600 = **€1,300**
Year 2+: **€1,800/year**
Standard (post-pilot): €200 + €1,000 + €1,800/year

### The Iberian Gap

**No tool currently offers:**
- Portuguese-language support
- Focused explicitly on Worten PT / Phone House PT
- Local seller as the vendor (trust factor)
- Done-for-you managed service (vs. self-serve SaaS)

This gap justifies premium over pure SaaS tools and is Pedro's primary competitive moat during the M$P phase.

---

## Sources

- [Multiply Pricing](https://multiply.cloud/en/pricing/)
- [Multiply Mirakl Repricer](https://multiply.cloud/en/marketplaces/best-mirakl-repricer-multiply/)
- [Boostmyshop myPricing Plans](https://www.boostmyshop.com/boostmyshop-app-pricing-plan/)
- [Boostmyshop myPricing for Mirakl](https://www.boostmyshop.com/features/repricing-mirakl/)
- [Boardfy Ecommerce Pricing](https://www.boardfy.com/ecommerce-pricing/)
- [Channable Pricing](https://www.channable.com/pricing)
- [Sellermania WeReprice](https://www.sellermania.com/en/marketplaces-feed-integrator-platform/marketplace-repricing-software/)
- [NetRivals / Lengow](https://www.lengow.com/solutions/netrivals/)
- [Worten Marketplace — Mirakl](https://www.mirakl.com/news/worten-launches-marketplace-powered-by-mirakl)
