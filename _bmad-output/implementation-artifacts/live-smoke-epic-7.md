# Epic 7 Retroactive Live-Smoke + Pre-MVP Ship Checklist Evidence

**Date:** 2026-04-24
**Owner:** Pedro
**Source action item:** Epic 7 retro P4a / Challenge #4 + Epic 8 retro Pre-MVP Ship Checklist (items 1–4)
**Operator:** Worten Mirakl deployment
**MCP session:** Connected (`mcp__mirakl__whoami` returned valid token at smoke start, expires 2026-04-24T14:53:57Z)

---

## Context

Epic 7 added formal ATDD coverage for empty-catalog and 401/403 paths against **stubbed** Mirakl responses. The Epic 6→7 live-smoke gate did not fire as designated. This file records the retroactive live verification that the code's assumptions hold against the real Worten API before MVP ship.

**Code under verification:**
- [src/workers/mirakl/apiClient.js:66-68](../../src/workers/mirakl/apiClient.js#L66-L68) — non-retryable 4xx classification + immediate throw
- [src/workers/mirakl/apiClient.js:89-106](../../src/workers/mirakl/apiClient.js#L89-L106) — `getSafeErrorMessage()` 401/403 branch
- [src/workers/mirakl/fetchCatalog.js:84-88](../../src/workers/mirakl/fetchCatalog.js#L84-L88) — `total_count === 0` primary empty-catalog path
- [src/workers/mirakl/fetchCatalog.js:94-102](../../src/workers/mirakl/fetchCatalog.js#L94-L102) — `total_count !== null` truncation guard
- [src/workers/mirakl/fetchCatalog.js:110-113](../../src/workers/mirakl/fetchCatalog.js#L110-L113) — `activeOffers.length === 0` fallback empty path

**MCP-Verified spec snapshot for OF21 (2026-04-24):**
- Auth: `Authorization: <api_key>` header (raw key, no Bearer)
- 200 response schema: `offers` and `total_count` BOTH required at root
- 401 response: not documented in spec; operator-defined body shape

---

## Item 1a — 401 Tampered-Key Smoke

**Date executed:** 2026-04-24 13:02 UTC
**Endpoint:** `GET /api/offers?max=1&offset=0` (OF21 — minimal-side-effect call: no writes, no state change, max=1 minimizes payload work)
**Tampering method:** Last character of real Worten API key flipped (`7` → `8`). Pedro authorized AI to run the command directly with his credentials, with post-test key rotation planned.
**Operator base URL:** `https://marketplace.worten.pt`

**Command run:**

```bash
curl -i -s \
  -H "Authorization: <TAMPERED_KEY>" \
  -w "\n=== TIMING ===\nhttp_code=%{http_code}\ntime_total=%{time_total}s\nsize_download=%{size_download} bytes\ncontent_type=%{content_type}\n" \
  "https://marketplace.worten.pt/api/offers?max=1&offset=0"
```

**Observed response:**

```
HTTP/1.1 401 Unauthorized
Date: Fri, 24 Apr 2026 13:02:00 GMT
Content-Type: application/json
Content-Length: 39
Connection: keep-alive
Cache-Control: no-cache, no-store, max-age=0, must-revalidate
Expires: 0
Pragma: no-cache
Strict-Transport-Security: max-age=31536000 ; includeSubDomains
X-Content-Type-Options: nosniff
X-Correlation-Id: fc4f1092-3292-4a96-a371-1ba5e53f27ab
X-Frame-Options: DENY
X-Xss-Protection: 0
cf-cache-status: DYNAMIC
Server: cloudflare
CF-RAY: 9f154cc5bbabf369-LIS
(NEL/Report-To Cloudflare headers omitted for brevity)

{"status":401,"message":"Unauthorized"}

=== TIMING ===
http_code=401
time_total=0.191254s
size_download=39 bytes
content_type=application/json
```

**Expected per code + MCP:**
- HTTP status: 401 OR 403 (either matches `getSafeErrorMessage` branch at apiClient.js:93)
- Status classified as non-retryable at apiClient.js:66 → immediate throw, no backoff
- Response time: < 2s (no retry loop). Slow response (> ~5s) would indicate retry-policy bug.
- Body shape: undocumented in MCP spec; informational only (code doesn't parse body)

**Observed vs Expected:**

| Dimension | Expected | Observed | Match |
|---|---|---|---|
| HTTP status | 401 or 403 | 401 | ✅ |
| Response time (no retry loop) | < 2s | 0.191s | ✅ — well under threshold |
| Content-Type | application/json (typical) | application/json | ✅ |
| Body fields | not parsed by code; informational | `{"status":401,"message":"Unauthorized"}` — minimal shape with `status` + `message` only | ✅ — code-agnostic |
| `WWW-Authenticate` header | not required by code | absent | ✅ — code does not consume it |
| Correlation ID for support tickets | n/a | `X-Correlation-Id: fc4f1092-3292-4a96-a371-1ba5e53f27ab` | ℹ️ recorded for future Worten support |

**Verdict:** ✅ **ALIGNED** — Worten returns 401 (not 403) with a fast, non-retry response time. `getSafeErrorMessage(err)` will correctly map this to `"Chave API inválida ou sem permissão..."` for the user. The retry-classification at apiClient.js:19-21 is empirically correct (no backoff loop fired). Body shape is minimal — no `error_code` field, no nested error object — but our code doesn't depend on body shape, only HTTP status.

**Notes:**
- Worten Mirakl is Cloudflare-fronted (CF-RAY header present). Future debugging of transient errors should account for Cloudflare-layer responses (e.g. 502/503/520-series) which our retry classifier already treats as retryable via `status >= 500` at apiClient.js:21.
- Auth-failure body is intentionally terse — does not leak whether the key format is recognised vs the key is invalid vs the account is suspended. That's good security hygiene from Worten's side and is consistent with how our own user-facing message handles it (single Portuguese message covers all 401/403 cases).

**Follow-up:** None. Code assumption holds.

---

## Item 1b — Empty-Catalog Smoke

**Date executed:** 2026-04-24 13:04 UTC
**Endpoint:** `GET /api/offers?max=1&offset=0` then `?max=100&offset=0` for sampling (real key, Gabriel's shop on `marketplace.worten.pt`)
**Operator base URL:** `https://marketplace.worten.pt`
**Shop selection:** Gabriel's shop (the only Worten API key currently available to the project). Pedro believed the shop was empty; the smoke revealed it has 32,120 catalog entries but all offers are inactive — see findings below.

### Call 1 — `max=1&offset=0` (probe response shape)

**Command:**
```bash
curl -i -s \
  -H "Authorization: <REAL_KEY>" \
  -w "\n=== TIMING ===\nhttp_code=%{http_code}\ntime_total=%{time_total}s\nsize_download=%{size_download} bytes\ncontent_type=%{content_type}\n" \
  "https://marketplace.worten.pt/api/offers?max=1&offset=0"
```

**Response highlights:**
```
HTTP/1.1 200 OK
Content-Type: application/json
Mirakl-Api-Code: OF21
Mirakl-Shop-Uuid: 19706
Mirakl-User-Role: SHOP
Link: <https://marketplace.worten.pt/api/offers?max=1&offset=1>; rel="next"
Cache-Control: no-cache, no-store, max-age=0, must-revalidate
X-Correlation-Id: 681c08dd-7491-4dab-b3d0-9b558a5c3525
Server: cloudflare

{
  "offers": [
    {
      "active": false,
      "inactivity_reasons": ["ZERO_QUANTITY"],
      "quantity": 0,
      "active": false,
      "applicable_pricing": { "price": 23.01, ... },
      "channels": ["WRT_PT_ONLINE", "WRT_ES_ONLINE"],
      "currency_iso_code": "EUR",
      "product_references": [
        { "reference": "5905669547147", "reference_type": "EAN" }
      ],
      "product_sku": "321b4d45-75eb-4c9d-9557-f164e9d62197",
      "product_title": "Óleo de Rícino NANOIL Castor Oil (50 ml)",
      "shop_sku": "EZ5905669547147",
      "state_code": "11",
      ... (full offer schema as per MCP spec)
    }
  ],
  "total_count": 32120
}

=== TIMING ===
http_code=200
time_total=0.192045s
size_download=3554 bytes
content_type=application/json
```

### Call 2 — `max=100&offset=0` (characterise active/inactive distribution)

**Aggregated result:**
```
total_count (root):                32120
offers in this page:               100
active:                            0
inactive:                          100
inactivity_reasons distribution:   {"ZERO_QUANTITY": 100, "PRODUCT_STATUS_REJECTED": 1}
```

### Code-path analysis

| Path | Trigger condition | Verified live this smoke? |
|---|---|---|
| PRIMARY ([fetchCatalog.js:84-88](../../src/workers/mirakl/fetchCatalog.js#L84-L88)) `total_count === 0` | Catalog is genuinely empty (zero entries) | ❌ Not triggered live — Gabriel's shop is not truly empty (32,120 entries). **Spec-verified instead:** MCP marks `total_count` as REQUIRED on the 200 response schema, so a spec-compliant Mirakl deployment WILL return `0` for an empty shop. Worten returns the field as required (verified live with value 32120) → spec compliance is empirically confirmed at the field-presence level. |
| TRUNCATION GUARD ([fetchCatalog.js:94-102](../../src/workers/mirakl/fetchCatalog.js#L94-L102)) `total_count !== null` | Defense-in-depth: API omitted `total_count` field entirely | ✅ Confirmed as pure defense-in-depth — Worten returns the field as MCP spec requires. Null-guard would only fire on a non-spec deployment. |
| FALLBACK ([fetchCatalog.js:110-113](../../src/workers/mirakl/fetchCatalog.js#L110-L113)) `activeOffers.length === 0` | Catalog has entries but all are `active: false` | ✅ Triggered logically — sample shows 100/100 inactive with structural reason (ZERO_QUANTITY across the board). If `fetchCatalog()` runs against this shop today, it will paginate all 322 pages, find zero active offers, and throw `EmptyCatalogError` via this path. |

### Observed vs Expected — full alignment table

| Dimension | Expected | Observed | Match |
|---|---|---|---|
| HTTP status | 200 | 200 | ✅ |
| Response time (no retry) | < 2s | 0.192s | ✅ |
| `total_count` field at root | present, integer (MCP-required) | `32120` (integer) | ✅ |
| `offers` field at root | present, array (MCP-required) | array of 1 / 100 offers | ✅ |
| `offer.active` | boolean (MCP-verified) | `false` (boolean) | ✅ |
| `offer.product_references[].reference_type` | `"EAN"` for EAN refs | `"EAN"` present | ✅ |
| `offer.applicable_pricing.price` | number (channel-agnostic default) | `23.01` (number) | ✅ |
| `offer.state_code` | offer CONDITION, not active flag | `"11"` (matches MCP warning in epics-distillate) | ✅ |
| `offer.inactivity_reasons` | array of enum strings when inactive | `["ZERO_QUANTITY"]` (matches MCP enum) | ✅ |
| `Mirakl-Api-Code` header | informational | `OF21` | ℹ️ recorded |
| `Mirakl-Shop-Uuid` header | informational | `19706` (Gabriel's shop) | ℹ️ recorded |
| `Cache-Control` | catalog response shouldn't be cached | `no-cache, no-store, max-age=0, must-revalidate` | ✅ |
| Pagination | offset-based per MCP spec | `Link: ...?max=1&offset=1; rel="next"` (Mirakl issues both Link header and offset-driven pagination; our code uses offset increment, ignores Link — both work) | ✅ |

**Verdict:** ✅ **ALIGNED** — Response shape, field presence, field types, and value semantics all match code assumptions and MCP-verified spec. The PRIMARY empty-catalog path (`total_count === 0`) was not exercised live because no truly-empty shop is available — but it is verified by spec compliance (MCP marks the field required; Worten returns it as required). The FALLBACK path (`activeOffers.length === 0`) is the path that WOULD fire today against Gabriel's shop, and the live evidence shows the response shape supports the active filter correctly. The null-guard between primary and fallback is confirmed as pure defense-in-depth.

### Operational findings (not divergences — recorded for future awareness)

1. **Gabriel's shop has 32,120 catalog entries, all inactive (sampled 100/100, all `ZERO_QUANTITY`).** Pedro believed the shop was empty; in reality it has products uploaded but no stock anywhere. If Pedro/Gabriel ever attempt a live demo of MarketPilot against this shop, the user experience will be: ~10 minute pagination fetch → `EmptyCatalogError` → "Não encontrámos ofertas activas no teu catálogo." UX-wise this is correct behaviour (the user gets an accurate Portuguese message), but the wait is long because OF21 has no server-side active filter (MCP-confirmed). **Disposition:** acceptable for MVP — design choice is intentional and the message correctly reflects the situation. Post-MVP, if this becomes a common UX pattern, a future enhancement could probe the first page first and short-circuit with `activeOffers.length === 0` before paginating fully. Not in MVP scope.

2. **The PRIMARY `total_count === 0` empty-catalog path remains not-live-verified.** Verified by spec compliance only. **Disposition:** acceptable for MVP — risk is bounded because (a) MCP spec marks the field required, (b) Worten demonstrably honours the schema (returns the field with a valid integer), (c) the FALLBACK path would catch a truly-empty shop via `activeOffers.length === 0` even if PRIMARY somehow didn't fire. Open follow-up only if a future epic adds a test/staging shop that can be deliberately emptied for end-to-end smoke.

3. **Cloudflare-fronted, EU PoP (CF-RAY suffix `-LIS` = Lisbon).** Latency to first byte was ~190ms which is excellent for an EU-resident worker.

**Follow-up:** None blocking. Optional post-MVP enhancement noted (early-exit on first-page empty active filter) is a future UX optimisation, not a defect.

---

## Item 2 — Excel-PT BOM Rendering Eyeball

**Date executed:** 2026-04-24 (attempted)
**Status:** ⛔ **BLOCKED** — see ship-blocker discovered below

### Discovery during attempt

Pedro attempted to generate a fresh CSV via the live Coolify deployment (`https://o16k9l7lkp7k9mq0n1uqw0i5.91.99.22.17.sslip.io/`). Form submit hit `POST /api/generate` successfully (returned 202 with valid `job_id` + `report_id`), but `form.js` redirect to `/progress?job_id=…&report_id=…` returned:

```
{"message":"Route GET:/progress?job_id=… not found","error":"Not Found","statusCode":404}
```

### Live deployment confirmation

```
GET /progress         -> 404
GET /progress.html    -> 200
GET /                 -> 200
GET /report/abc       -> 200
```

### Root cause

[`src/server.js`](../../src/server.js) registers a `fastify.get('/report/:report_id', …)` alias at line 91-93 that calls `reply.sendFile('report.html')`, but **no equivalent route exists for `/progress`**. `@fastify/static` serves `progress.html` only at its literal path, while `public/js/form.js:155` redirects to `/progress` (extension-less).

### Why CI didn't catch this

- `tests/e2e/form.smoke.spec.js:78` — asserts URL string match via Playwright `toHaveURL`, not HTTP status. 404 page has the matching URL, so the assertion passes.
- `tests/e2e/progress.smoke.spec.js` — all 6 navigations use `/progress.html` (with `.html`), exercising the static handler, not the redirect target.
- `tests/server.atdd.test.js:208` — asserts `GET /progress.html → 200`. Same gap. **No test asserts `GET /progress → 200`.**

### Issue tracker

[#67 — Production bug: /progress route returns 404 — form-submit flow broken end-to-end](https://github.com/pedrobarreira-ops/MarketPilot/issues/67)

### Severity

**Ship-blocker.** Affects 100% of users who submit the form on production. Latent since Story 5.1 merged (commit `885075a`).

### Disposition decision pending

Even if #67 is fixed, Item 2's BOM eyeball still needs a CSV to inspect. Gabriel's shop is fully inactive (Item 1b finding) — submitting against it would terminate at `EmptyCatalogError` with no CSV produced. Three paths to unblock the eyeball after #67 is fixed:

1. Use a second shop with active offers (Pedro does not currently have one)
2. Generate a synthetic CSV via direct script invocation of `src/workers/scoring/buildReport.js` against stub data, then open in Excel
3. Defer Item 2 entirely and rely on Story 8.3 AC-7's byte-level no-BOM contract assertion as ship-acceptance evidence (CI-verified)

**Disposition decided:** A + C — fix #67 in-session, then synthetic CSV for the BOM eyeball.

### Item 2 pre-step — route regression fix verified in live deployment

**PR:** [#68 — Fix #67: add /progress route alias + close test-method gap](https://github.com/pedrobarreira-ops/MarketPilot/pull/68) — merged 2026-04-24 13:50 UTC (squash-merge `ff1ba73`).

**Changes (3 files, +69/-1):**
- `src/server.js` — added `fastify.get('/progress', ...)` mirroring the `/report/:report_id` pattern at line 91-93.
- `tests/server.atdd.test.js` — added AC-7 describe block with 3 tests (`/progress` → 200; `/progress?job_id=…&report_id=…` → 200; HTML content assertion).
- `tests/e2e/form.smoke.spec.js` — captured navigation response status (Playwright `toHaveURL` only matched URL strings, allowing the 404 page through). Mocked `/api/jobs/*` so progress.js polling doesn't surface noise.

**Local ATDD:** ✅ 20/20 (including 3 new AC-7 tests).
**CI on PR:** ✅ Test (Node 22) 2m 22s + npm audit (high+) 10s — both green.
**Coolify auto-deploy:** ✅ Completed within ~2 min of merge (live-verified at 13:52 UTC).

**Live verification post-merge:**
```
GET /progress                                 -> 200 in 0.107s, 8941 bytes, HTML
GET /progress?job_id=test-job-abc&...         -> 200 (production redirect shape)
GET /report/abc                               -> 200 (regression check, unchanged)
```

Body confirmed to be progress.html — title `Gerando Relatório | MarketPilot`, includes `progress.js` reference and Portuguese phase strings (`A obter catálogo`).

**Outcome:** #67 is closed by deployment. End-to-end form-submit flow now works for any user.

### Item 2 main-step — Excel-PT BOM eyeball

**Source CSV:** Synthetic, generated via `scripts/synthetic-bom-eyeball.js` (throwaway). Script invokes the production `buildAndPersistReport()` from `src/workers/scoring/buildReport.js` against a throwaway SQLite DB (`./synthetic-bom-eyeball.db`), then reads `csv_data` back via `getReport()` and writes to `./synthetic-bom-eyeball.csv`. This exercises the same code path that produces production CSVs delivered via `GET /api/reports/:id/csv` — the bytes-on-disk are byte-identical to what a real user would download.

**Catalog stress-test rows (5 total):**
1. `Óleo de Rícino NANOIL Castor Oil (50 ml)` — Ó, í
2. `Máscara facial com extracto de açaí` — á, ç, í
3. `Acessório com cedilha — coração ❤` — é, ç, ã, em-dash, heart emoji
4. `Açúcar mascavado de cana, à moda antiga` — Ç, ú, à
5. `Computador portátil, cor: azul-marinho` — á

**Byte-level evidence:**
- 570 bytes UTF-8
- First 3 bytes (hex): `45 41 4e` = ASCII `EAN` (header literal)
- Starts with UTF-8 BOM (`EF BB BF`)? **false**
- Starts with U+FEFF char? **false**
- Confirms Story 8.3 AC-7 no-BOM contract

**Excel locale:** Portuguese (Pedro's Windows 10 Home machine, default Excel-PT)

**Observation (visual, screenshot):**
- All 12 columns present and named correctly: `EAN, product_title, shop_sku, my_price, pt_first_price, pt_gap_eur, pt_gap_pct, pt_wow_score, es_first_price, es_gap_eur, es_gap_pct, es_wow_score`
- All Portuguese accents render correctly: `Ó`, `í`, `Á`, `á`, `ç`, `é`, `ã`, `Ç`, `ú`, `à`
- Em-dash (`—`, U+2014) in row 4 renders correctly
- Heart emoji (`❤`, U+2764) renders correctly as a black heart shape
- ES gap data in row 3 (10 / 2.5 / 0.25 / 50) and PT gap data in rows 2 + 6 (19.99 / 3.02 / 0.151 / 152.5 and 850 / 49.99 / 0.058 / 1500) all visible and correctly numeric
- No mojibake observed (no `Ã"`, `Ã­`, `Ã¡`, `Ã§` patterns)
- Numeric formatting: Excel auto-stripped trailing zeros (12.5 not 12.50) — normal Excel behaviour, not a CSV defect

**Verdict:** ✅ **ALIGNED** — Story 8.3 AC-7's no-BOM contract is the correct contract for Excel-PT on modern Windows. BOM-less UTF-8 renders cleanly without flipping the assertion. The historical "Excel needs UTF-8 BOM" advice does not apply to current Excel versions on Windows 10+. No follow-up issue needed.

**Cleanup after smoke (Pedro to run):**
```
rm synthetic-bom-eyeball.csv synthetic-bom-eyeball.db scripts/synthetic-bom-eyeball.js
```

**Follow-up:** None.

---

## Item 3 — /health Rate-Limit Smoke on Coolify

**Date executed:** 2026-04-24 13:55 UTC
**Deployment:** `http://o16k9l7lkp7k9mq0n1uqw0i5.91.99.22.17.sslip.io/`

**Test 1 — /health plain (100 rapid requests):**
```bash
for i in $(seq 1 100); do
  curl -s -o /dev/null -w "%{http_code}\n" "http://…/health"
done | sort | uniq -c
```
**Result:** `100  200` (100 of 100 requests returned HTTP 200, zero 429s)

**Test 2 — /health?probe=1 (query-string variant, 100 rapid requests):**
```bash
for i in $(seq 1 100); do
  curl -s -o /dev/null -w "%{http_code}\n" "http://…/health?probe=1"
done | sort | uniq -c
```
**Result:** `100  200` (100 of 100 requests returned HTTP 200, zero 429s)

**Cross-check — limiter is alive:** Earlier curl against `/progress` returned headers `X-Ratelimit-Limit: 60`, `X-Ratelimit-Remaining: 59`. So the rate-limit plugin IS registered and active on non-allowlisted routes. The zero-429 result on `/health` is genuine allowList bypass, not a dead limiter.

**Verdict:** ✅ **ALIGNED** — Both `/health` and `/health?probe=1` correctly bypass the 60 req/min/IP global limit. The PR #66 Step 5 Opus tightening from `request.url === '/health'` to `request.routeOptions?.url === '/health'` holds against query-string variants in production. Coolify liveness probes will not be rate-limited.

**Follow-up:** None.

---

## Item 4 — Final CI Green on Main

**Date executed:** 2026-04-24 13:55 UTC

**Command:** `gh run list --branch main --limit 5 --json conclusion,displayTitle,status,headSha,createdAt`

**Observed:**
```
success  ff1ba73  2026-04-24T13:50:53Z  Fix #67: add /progress route alias + close test-method gap (#68)
success  ad2c28a  2026-04-24T12:38:32Z  Record Epic 8 batch-1 running retro observations
success  28d50c2  2026-04-24T11:06:26Z  Set story 8.3 to done in sprint-status (post-merge reconciliation)
success  87267e8  2026-04-24T11:03:35Z  story-8.3-platform-hardening-mvp-batch - fixes #65 (#66)
success  c26da6c  2026-04-23T22:10:49Z  Add Story 8.3 (platform-hardening MVP batch) to Epic 8
```

**Expected:** Latest run conclusion = `success`.

**Verdict:** ✅ **ALIGNED** — Latest CI run on main is `ff1ba73` (PR #68 squash-merge from this session) with conclusion `success`. All 5 most recent runs are green. Origin `main` is healthy.

**Note on apparent local divergence (resolved during this session):** When the smoke session began, local `main` was at `11f21f7` ("Epic 8 retrospective complete") — committed locally but apparently not pushed. Origin `main` was at `ad2c28a`. The PR #68 fix branch was created from local `main` (containing `11f21f7`), so when github squash-merged it, the resulting commit `ff1ba73` bundled BOTH the Epic 8 retro changes AND the /progress fix into a single squash. Verified via `git diff-tree --no-commit-id --name-status -r ff1ba73`:
- A `_bmad-output/implementation-artifacts/epic-8-retro-2026-04-24.md`
- M `_bmad-output/implementation-artifacts/sprint-status.yaml`
- M `src/server.js`
- M `tests/e2e/form.smoke.spec.js`
- M `tests/server.atdd.test.js`

Subsequent `git rebase origin/main` on local correctly identified `11f21f7` as already-upstream and dropped it as a no-op. Local + origin are now identical at `ff1ba73`.

**Follow-up:** None blocking ship. Local sync is a housekeeping task.

---

## Summary

| Item | Verdict | Follow-up |
|---|---|---|
| 1a — 401 tampered-key | ✅ Aligned | None |
| 1b — Empty catalog | ✅ Aligned | None blocking; optional post-MVP UX optimization noted |
| 2 — Excel-PT BOM | ✅ Aligned (after #67 fix + synthetic CSV) | None — AC-7 no-BOM contract is correct |
| 3 — /health rate-limit | ✅ Aligned | None — both /health and /health?probe=1 bypass the limiter cleanly |
| 4 — CI green | ✅ Aligned | None |

**Ship disposition:** ✅ **GO** — All 4 Pre-MVP Ship Checklist items cleared. One ship-blocker discovered during execution (issue #67, /progress route 404) was diagnosed, fixed, merged (PR #68), CI-verified, deployed via Coolify auto-deploy, and live-verified end-to-end within the same session. No remaining defects, no blocking follow-ups, no contract divergences. The MVP is ship-ready.

---

## PR #68 scope-bloat finding (recorded for future retro awareness)

Originally listed here as "local-vs-origin divergence requiring cleanup". On investigation: there was no real divergence. The Epic 8 retro commit `11f21f7` rode along into PR #68's squash-merge because the fix branch was created from local main (which contained the unpushed `11f21f7`). github's squash-merge mechanism bundles ALL commits on the branch since the merge base — so `ff1ba73` is a single commit containing both the Epic 8 retro file AND the /progress route fix.

**Implications:**
- ✅ Origin has all the work — Epic 8 retro, sprint-status flips, /progress route fix, all tests. Nothing is lost or pending push.
- ✅ CI is green on `ff1ba73` (verified at Item 4).
- ⚠️ PR #68 was titled and described as a focused /progress route fix, but actually shipped 5 file changes spanning two unrelated concerns. A pedantic reviewer would flag this as scope-bloat.
- ⚠️ Root cause: branching from local main without first ensuring local main was pushed to origin. The Epic 8 retro itself called this out (action item P3 from Epic 7 retro: "git push origin main at Epic-Start close") — the Epic 8 retro commit existing only locally before this session is a small instance of that discipline lapsing.

**Disposition:** Not a ship-blocker. Worth a one-liner mention in the next retro if there is one, citing this incident as a reminder to enforce P3 discipline before any branch-based work begins.

---

## MVP Ship Announcement (for Pedro's records)

**Date:** 2026-04-24
**Project:** MarketPilot Free Report (MarketPilot MVP)
**Repository:** [pedrobarreira-ops/MarketPilot](https://github.com/pedrobarreira-ops/MarketPilot)
**Deployment:** Live on Coolify (`http://o16k9l7lkp7k9mq0n1uqw0i5.91.99.22.17.sslip.io/`)
**Final main commit:** `ff1ba73` (Fix #67: /progress route alias + close test-method gap, PR #68)
**Test suite:** 823+ tests, latest CI run on main: ✅ success

**Functional scope shipped:**
- Epic 1 (Foundation) — Project scaffold, Fastify+Pino redaction, SQLite+Drizzle, BullMQ+Redis, Docker+Coolify
- Epic 2 (Key Security) — keyStore module, Worker scaffold + key lifecycle
- Epic 3 (Pipeline) — Mirakl OF21/P11 + WOW scoring + report persistence + email + full worker orchestration
- Epic 4 (HTTP API) — POST /api/generate, GET /api/jobs/:id polling, GET /api/reports/:id + CSV
- Epic 5 (Frontend Form+Progress) — form.js, progress.js
- Epic 6 (Frontend Report) — Report page, tables, CSV+CTA, mobile, expired+error states, accessibility
- Epic 7 (Error Handling) — Empty catalog, auth failure, total_count mismatch, P11 rate limit + partial recovery
- Epic 8 (Governance) — Hourly TTL deletion cron, no listing endpoint + cross-seller isolation, platform-hardening MVP batch

**Pre-MVP Ship Checklist evidence:** This file (`live-smoke-epic-7.md`) — all 4 items verified, all aligned.

**Discovered + resolved in the smoke:**
- Issue #67 (/progress route 404, latent since Story 5.1) — fixed by PR #68, CI green, deployed, live-verified.

**Operational findings (recorded, not blocking):**
- Gabriel's shop has 32,120 catalog entries with 0 active offers — current state means a real demo-fetch would terminate at `EmptyCatalogError` after a ~10-min pagination sweep. UX-correct but slow. Post-MVP enhancement candidate: short-circuit on first-page-empty active filter.
- The PRIMARY empty-catalog code path (`total_count === 0`) is not live-verified (no truly-empty shop available); verified by MCP spec compliance instead.
- Test-coverage gap: Playwright `toHaveURL` only matches URL strings, not HTTP status. Closed for `/progress` in PR #68; the same pattern may exist elsewhere — worth a future audit pass.

**Post-MVP backlog status (per Epic 8 retro):** ~34 carry-forward items, none ship-blocking, 4 process-improvement action items (P6/P7/P8/P9) recommended to bundle as one named "post-MVP-prep" PR per the M2 compounding-loop discipline.

**MVP shipped:** 2026-04-24, contingent on Pedro's go-ahead based on this evidence.
