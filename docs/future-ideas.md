# Future Ideas

Ideas that are out of scope for the M$P but worth revisiting once the core tool is proven and clients are generating real data.

---

## Ranking Score Estimator

**The problem:** Worten's featured position (the default "buy" button on a product page) is determined by a composite score — not just lowest price. Factors include price, delivery speed, seller rating, and premium status. A non-premium seller with slower delivery may need to undercut significantly more than €0.01 to win the featured spot.

**The idea:** Given a seller's price, rating, delivery time, and premium status vs. competitors, predict whether they would win the featured position — and if not, calculate the minimum price reduction required to win it.

**Why it's V2:** Requires reverse-engineering Worten's algorithm empirically from real data — dozens of observed data points across products, price gaps, and seller profiles. Only feasible after multiple live clients are running and generating data. Each marketplace would need its own model.

**Value:** Sellers would know exactly how much to lower their price to win the featured spot, rather than blindly undercutting. Avoids unnecessary margin loss.

---

## Multi-Marketplace Dashboard

**The idea:** A single view showing a seller's position across all their Mirakl marketplaces (Worten, Carrefour, PCComponentes, Leroy Merlin, etc.) — how many products in 1st place per marketplace, how many within striking distance, estimated recoverable revenue per marketplace.

**Why it's V2:** Requires multiple API keys per client and a front-end. M$P has no UI — this is a product feature.

**Value:** Strong upsell for multi-marketplace sellers like OTeuPrimo. Makes the monthly fee easier to justify.

---

## Automated Opportunity Report (self-serve)

**The idea:** Instead of Pedro manually running the report for each prospect, a self-serve web form where a seller enters their Worten API key and gets an automatic opportunity report in minutes.

**Live demo angle:** Even before full self-serve, this could be used during sales calls — seller pastes their API key live, report generates immediately while Pedro is on the call. Removes the "I'll send you results in 48h" friction and creates the emotional reaction in the moment when they're most engaged.

**Technical flow:**
1. `GET /api/offers/export` (OF51/OF52) — fetch their full catalog with EANs and current prices
2. Batch EANs into P11 calls (100 per call max)
3. Compare their price vs 1st place `total_price` per product
4. Output: X products losing 1st place, average gap, estimated impact

**Sandbox:** Test this flow with Gabriel's shop (API key available: Easy - Store, shop_id 19706) once he has active offers listed.

**Why it's V2:** Requires a front-end and hosted infrastructure for full self-serve. In the M$P phase, the manual report is a feature (personal service), not a bug.

**Value:** Scales lead generation without Pedro's time. Could be a free lead magnet.

---

## Price History & Analytics

**The idea:** Store historical price data per product per marketplace, allowing sellers to see how their price and position have evolved over time and correlate with sales volume.

**Why it's V2:** Requires persistent storage per client and a reporting layer. Not needed to prove the core value.

**Value:** Strong retention feature — sellers see the tool working over time. Makes churn harder.

---

## 2nd Place Targeting (when 1st place is unreachable)

**The problem:** When a seller can't profitably win 1st place, the current logic holds price. But 2nd place is still significantly better than 5th or 7th — especially for premium sellers where buyers sometimes check multiple options.

**The idea:** If floor price can't beat 1st place, check if it can beat 2nd place. If yes, reprice to just below 2nd place instead of holding.

**Why it's V2:** Technically confirmed viable — `all_offers=true` returns full ranked offer list (tested Apr 7). Waiting for first live client before implementing. Raised by Ricardo Morais (WDMI) as a feature request.

**Value:** Meaningful for large catalogs where many products are permanently priced out of 1st place. WDMI specifically interested in this.
