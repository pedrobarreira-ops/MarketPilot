# Sprint Change Proposal — Add Story 8.3 (Platform-Hardening MVP Batch) to Epic 8

**Date:** 2026-04-23
**Facilitator:** Bob (Scrum Master, bmad-correct-course condensed solo-dev format)
**Author/Approver:** Pedro
**Scope classification:** Minor (additive, single-story)
**Status:** Draft — pending approval

---

## Section 1 — Issue Summary

**Triggering source:** Epic 7 Retrospective (`_bmad-output/implementation-artifacts/epic-7-retro-2026-04-22.md`), specifically:

- Challenge #5 — "T1 platform-hardening standalone story from Epic 6 retro did not ship." Backlog carry-over: Epic 6 (20 items) + Epic 7 (~12) = ~32 deferred items entering Epic 8.
- Key Insight #5 — "The deferred-work backlog is now unambiguously a platform-hardening epic-in-waiting."
- Ideal Epic 8 shape — "8.1 → 8.2 → 8-T3 (platform-hardening batch story, scoped to what's genuinely MVP-blocking) → epic-8-retrospective."
- **Action Item T3** — "Platform-hardening scoped-to-MVP batch — ships as dedicated story inside Epic 8, sequenced after 8.1 and 8.2."
- Next Steps #4 — "Epic 8 narrative arc: 8.1 → 8.2 → 8-T3 (platform-hardening scoped-to-MVP) → epic-8-retrospective → MVP ship."

**When / how discovered:** Surfaced across three consecutive retrospectives (Epic 5 → Epic 6 → Epic 7). Epic 6 retro designated it "T1" but left it unscheduled; Epic 7 retro recommitted with an explicitly-scoped and sequenced slot inside Epic 8.

**Current Epic 8 state:**
- `epic-8`: in-progress
- `8-1-hourly-ttl-deletion-cron`: done (merged 2026-04-23)
- `8-2-no-listing-endpoint-and-cross-seller-isolation`: done (merged 2026-04-23)
- `epic-8-retrospective`: optional

**Trigger to formalise NOW:** Both 8.1 and 8.2 have merged. The retro's sequencing prerequisite ("after 8.1 and 8.2") is satisfied. Formalising before create-story runs prevents the story from being implemented against an unamended plan (a failure mode Epic 7 retro Insight #1 explicitly named).

**Issue type:** Strategic-scope addition — a backlog-carried platform-hardening batch is promoted to in-MVP scope and formalised as a first-class story in the currently-active epic.

**Evidence that non-formalisation would fail:**
- Epic 6 retro carried T1 as unscheduled backlog; T1 did not ship; deferred-work grew by ~12 items.
- Epic 7 retro Insight #1: "retro → action items without action items → named prep PR reliably fails to deliver." The retro's corollary for T3 is "retro → action items without action items → formally-planned story reliably fails to deliver." Trickling T3 into "something we'll do later" recreates the failure mode.

**Story naming:** `8.3` / slug `8-3-platform-hardening-mvp-batch`, following the retroactive-story precedent set by `3-5a` and `4-2a` (sequential numbering, no uppercase prefix). Provenance to Epic 7 retro Action Item T3 captured in the story's **Satisfies:** and **Origin:** lines — not in the ID itself.

---

## Section 2 — Impact Analysis

### Epic Impact

| Epic | Impact | Action |
|---|---|---|
| Epic 1-7 | None | No change |
| Epic 8 (in-progress) | **Additive** — one new story appended | Add Story 8.3 block; adjust epic close-out ordering so `epic-8-retrospective` runs after 8.3 merges |
| Post-Epic-8 | None (Epic 8 is final MVP epic) | No change |

### Story Impact

| Story | Impact |
|---|---|
| 8.1 (done) | No change |
| 8.2 (done) | No change |
| **8.3 (new)** | Net-new. Sequenced after 8.2 by Epic-arc convention (not strict technical dependency). Blocks `epic-8-retrospective`. |
| Future (post-MVP) | Explicitly-excluded items (axe-core, keyboard-nav E2E, CSV behavioural timing tests, matchMedia, empty-tables hint) are explicitly annotated in deferred-work.md as `deferred-post-mvp`, not `closed-by-8-3`. |

### Artifact Conflicts

| Artifact | Conflict? | Action |
|---|---|---|
| `_bmad-output/planning-artifacts/prd.md` | None | No change — existing FR27/FR29 + NFR-S5 posture already covers the intent; 8.3 is implementation of cross-cutting NFRs already implied by MVP-grade platform posture |
| `_bmad-output/planning-artifacts/architecture.md` | None | No change — `@fastify/rate-limit` is an idiomatic plugin; header hardening + id-format validation are route-local concerns already within scope of `src/routes/`; no data model, component boundary, or integration-point changes |
| `_bmad-output/planning-artifacts/ux-design.md` | None | No change — zero user-visible behaviour change. 429 rate-limit response is an edge path (abuse/bot territory), not a designed UX state |
| `_bmad-output/planning-artifacts/epics.md` | **YES** | Append new Story 8.3 block under Epic 8 |
| `_bmad-output/planning-artifacts/epics-distillate.md` | **YES** | Update Epic-Story Map line, Story Dependencies (Build Order) line, and Epic 8 Compressed ACs subsection |
| `_bmad-output/implementation-artifacts/sprint-status.yaml` | **YES** | Add `8-3-platform-hardening-mvp-batch: backlog` entry under Epic 8; update `last_updated:` comment |
| `_bmad-output/implementation-artifacts/deferred-work.md` | Annotations pending (post-merge) | At 8.3 merge, annotate the four in-scope rows `-closed-by-8-3`; annotate out-of-scope rows `-deferred-post-mvp`. Not part of this proposal — belongs to Step 7 of the BAD cycle for Story 8.3. |

### Technical Impact

- New dependency: `@fastify/rate-limit` (Fastify-ecosystem idiomatic plugin; minimal install cost).
- New route-local code: `Cache-Control` header-setter on two routes; `:id` format-validator (regex or schema) on three routes.
- New test file: `tests/epic8-8.3-platform-hardening.atdd.test.js`.
- No schema changes. No migration. No worker-path changes. No Mirakl-API-touching changes (so **no live-smoke gate applies** — see memory rule `feedback_bad_review_live_smoke_gate.md`).
- **Worker-Path Opus rule check:** 8.3 does not touch `src/workers/`. But it DOES touch `src/routes/**` (and `src/server.js` if rate-limit registration lives there). Per `feedback_bad_step5_opus_worker_paths.md` + P1 codification in Epic 7 retro, `src/routes/**` is classified as "worker-path-adjacent" and Step 5 should run on Opus. Flag this in the story spec when create-story runs.

### Risk Assessment

| Risk | Likelihood | Mitigation |
|---|---|---|
| Rate-limit config breaks legitimate progress-polling traffic (`GET /api/jobs/:id` at 2s intervals from a single tab = 30 req/min baseline) | Low | Polling route carves explicit 120 req/min/IP override — 4× base-rate headroom comfortably covers multi-tab, mobile-reconnect, and retry-loop spikes. AC names the 120/min figure directly; no reliance on global default + "raise if insufficient" escape hatch. |
| Rate-limit breaks Coolify health-check | Low | AC explicitly excludes `GET /health` from rate-limiting. |
| `@fastify/rate-limit` version incompatible with Fastify v5 | Low | Version-pin at a Fastify-v5-compatible release; verify at install time. |
| `:id` format-guard over-restricts (e.g. rejects legitimate UUIDs due to regex error) | Low | `crypto.randomUUID()` emits lowercase hex at fixed length 36 — matches `^[0-9a-f-]{36}$` exactly. Single-regex form collapses length+charset into one trivially-unit-testable rejection path; "wrong length, right charset" and "right length, wrong charset" edge cases fold into the same 404. |
| BOM assertion conflicts with existing fixture | Very Low | Existing CSV in Story 3.5 does not prepend BOM; assertion codifies current-state, not a change. |
| Scope creep (post-MVP items accidentally included) | Low | Retro explicitly lists exclusions; AC block reproduces the exclusion list verbatim as a "NOT in scope" guard. |

---

## Section 3 — Recommended Approach

**Selected path: Option 1 — Direct Adjustment**
- Add one story inside the currently-active epic.
- No modification to existing stories.
- No rollback (8.1/8.2 are clean and complete).
- No MVP redefinition (this tightens MVP platform posture rather than reducing MVP functional scope).

**Effort:** Low (≤ 1 BAD cycle — create-story → dev-story → code-review → merge).
**Risk:** Low (additive; plugin idiomatic; no schema/worker-path touch; test-coverage-first via ATDD scaffold).
**Timeline impact:** Fits between 8.2 merge and `epic-8-retrospective`. Does not push MVP ship.

**Why not Option 2 (Rollback):** Nothing to roll back. 8.1 and 8.2 merged clean. Rollback is meaningless.

**Why not Option 3 (MVP Review):** MVP scope is NOT shrinking; the retro already ran the MVP-vs-post-MVP triage and chose to keep the four in-scope items inside MVP and push the other five out. No further scope debate needed.

**Why bundling into 8.1 or 8.2 retroactively is wrong:** Both are merged; amending a merged story's AC violates state-machine invariants and creates retrofit risk. Additive new story is the idiomatic move.

---

## Section 4 — Detailed Change Proposals

### Change 4.1 — `_bmad-output/planning-artifacts/epics.md`

**Location:** Append new Story 8.3 block immediately after the existing Story 8.2 block (current end-of-file at line 1222 is a `---` separator; the new block replaces that boundary with its own content + trailing `---`).

**OLD (lines 1222-1223, end of file):**

```
**And** the `job_id` is never exposed to the seller in the final report URL — only `report_id` appears in the URL

---
```

**NEW:**

```
**And** the `job_id` is never exposed to the seller in the final report URL — only `report_id` appears in the URL

---

### Story 8.3: Platform-Hardening MVP Batch

**GH Issue:** _TBD — create at `bmad-create-story` time_

As the operator of MarketPilot,
I want the HTTP API layer to enforce rate limits, send cache-control headers on report reads, avoid CSV byte-order-mark ambiguity, and reject malformed `:id` path parameters at route-guard time,
So that the MVP ships with defense-in-depth hardening against abuse, cache-leakage, Excel-locale ambiguity, and cheap scan/enumeration patterns — without deferring a platform-hardening batch into post-MVP.

**Satisfies:** Defense-in-depth MVP hardening — no new FR, implementation of cross-cutting NFR posture (rate-limit resilience, defense-in-depth cache policy, CSV locale-safety, route-input hygiene).

**Origin:** Epic 7 Retrospective (2026-04-22) Action Item T3 — "Platform-hardening scoped-to-MVP batch — ships as dedicated story inside Epic 8, sequenced after 8.1 and 8.2." Formalised via sprint-change-proposal-2026-04-23.md.

**Dependencies:** Story 8.1 and 8.2 done (Epic-arc sequencing, not strict technical dependency). Technical prerequisites: Story 3.5 (CSV generation — for BOM assertion), Story 4.1/4.2/4.3 (HTTP routes — for rate-limit + Cache-Control + id-format guards). All done.

**Scope (full spec in `_bmad-output/implementation-artifacts/8-3-platform-hardening-mvp-batch.md` when create-story runs):**
- Install `@fastify/rate-limit` (Fastify-v5-compatible version).
- Register globally in `src/server.js` with defaults and per-route overrides (see ACs).
- Add `Cache-Control: private, no-store` response header on `GET /api/reports/:id` and `GET /api/reports/:id/csv`.
- Add byte-level assertion that persisted `csv_data` does NOT begin with `﻿` (covers Story 3.5 CSV output).
- Add length + charset validation on `:id` path parameter for `/api/reports/:id`, `/api/reports/:id/csv`, and `/api/jobs/:id`. Malformed / oversized / control-char → 404 (same shape as unknown/expired — no enumeration oracle).
- ATDD coverage in `tests/epic8-8.3-platform-hardening.atdd.test.js` — one scenario per AC.

**Explicitly NOT in scope (post-MVP backlog — annotate `-deferred-post-mvp` in deferred-work.md at merge, NOT `-closed-by-8-3`):**
- axe-core integration.
- Keyboard-navigation E2E tests.
- CSV re-entrancy / filename / latency behavioural tests.
- `matchMedia` boundary test (mobile layout edge-case).
- Empty-tables scroll-hint edge case.

**Acceptance Criteria:**

**Given** `src/server.js` registers `@fastify/rate-limit` before route registration
**When** HTTP requests arrive
**Then** a global default of 60 requests/minute/IP applies to all registered routes by default
**And** `POST /api/generate` applies a tighter override: 5 requests/minute/IP
**And** `GET /api/reports/:id/csv` applies an override: 10 requests/minute/IP (legitimate use is one-shot download)
**And** `GET /api/jobs/:id` has a relaxed override: 120 requests/minute/IP (2s polling base-rate = 30 req/min; 4× headroom comfortably absorbs multi-tab, mobile-reconnect, and retry-loop spikes while staying well below abuse threshold)
**And** `GET /health` is explicitly excluded from rate-limiting (Coolify health-check must always succeed)
**And** when a client exceeds any applicable limit, the server responds `429 Too Many Requests` with the `errorHandler`'s standard `{ error, message }` shape (not raw plugin default) and does NOT log `api_key` or request body

**And** `GET /api/reports/:id` on success responds with header `Cache-Control: private, no-store`
**And** `GET /api/reports/:id/csv` on success responds with header `Cache-Control: private, no-store`
**And** the 404 responses on both routes also carry `Cache-Control: private, no-store` (defense-in-depth — prevents caching of the "not found" oracle)

**And** persisted `reports.csv_data` for a freshly-generated report does NOT begin with `﻿` — asserted at byte level by reading the first three characters of the stored string (supplements Story 3.5's CSV schema guarantee)

**And** the `:id` path parameter on `GET /api/reports/:id`, `GET /api/reports/:id/csv`, and `GET /api/jobs/:id` is validated against the strict regex `^[0-9a-f-]{36}$` before any DB read — anything failing this (oversized, undersized, non-hex, ASCII control character, whitespace, or uppercase hex) responds 404
**And** there is ONE regex, not a length-check-plus-charset-check pair — collapses the guard surface and eliminates "right length, wrong charset" / "right charset, wrong length" edge cases into one rejection path
**And** malformed / oversized / undersized / unknown / expired `:id` values all return the SAME 404 body shape — no enumeration oracle distinguishing the five cases

**And** no test in the existing suite regresses (full test suite green at close)
**And** `src/workers/**` is NOT modified (scope-discipline assertion — this is a routes-layer-only story)

---
```

**Rationale:**
- Preserves Epic 8's existing structure (Story 8.1, Story 8.2 blocks unchanged).
- Follows the compressed-AC-in-epic-file + full-spec-in-implementation-artifacts pattern used for 3.5a and 4.2a.
- ACs map 1:1 to the four retro-specified scope items plus explicit exclusions.
- Polling-compatibility AC is an added safety net against the rate-limit-breaks-progress-bar failure mode identified in risk assessment.

**Pre-apply verifications (2026-04-23, against current main):**
- **CSV BOM direction confirmed no-BOM.** Inspection of `src/workers/scoring/buildReport.js:114-140` shows `rows = [CSV_HEADER]; ... rows.join('\n')` with no `﻿` prepend anywhere in the build path. Grep across `src/` for `﻿` / `BOM` / literal `﻿` returns zero matches. AC direction "does NOT start with BOM" codifies current-state; a future Excel-PT accent-rendering change that chooses to emit a BOM would flip this assertion deliberately.
- **`:id` guard shape tightened** from "length > 36 OR control-char" two-check form to single-regex `^[0-9a-f-]{36}$` form. Matches `crypto.randomUUID()` output exactly; eliminates length-vs-charset edge cases.
- **Polling rate-limit set to 120 req/min/IP explicit** (was "≥ 60" initially) to give 4× headroom over the 2s × 60s = 30 req/min polling baseline for multi-tab / mobile-reconnect / retry-loop spikes.

---

### Change 4.2 — `_bmad-output/planning-artifacts/epics-distillate.md`

Three edits required.

#### 4.2a — Epic-Story Map line (line 213)

**OLD:**

```
- Epic 8 (Governance): 8.1 Hourly TTL deletion cron; 8.2 No listing endpoint + cross-seller isolation verification
```

**NEW:**

```
- Epic 8 (Governance): 8.1 Hourly TTL deletion cron; 8.2 No listing endpoint + cross-seller isolation verification; 8.3 Platform-hardening MVP batch (rate-limit + Cache-Control + CSV BOM + :id route guards)
```

#### 4.2b — Story Dependencies (Build Order) section (line 225)

**OLD:**

```
- 3.5 → 8.1; 4.3 → 8.2 (governance after persistence + routes)
```

**NEW:**

```
- 3.5 → 8.1; 4.3 → 8.2; {3.5, 4.1, 4.2, 4.3, 8.2} → 8.3 (governance after persistence + routes; 8.3 Epic-arc-sequenced after 8.2 but technically depends on routes/CSV-gen only)
```

#### 4.2c — Epic 8 — Governance compressed ACs subsection (after line 287)

**OLD (lines 286-287):**

```
- 8.1 cron every hour: `DELETE FROM reports WHERE expires_at < unixepoch()`; log `[cleanup] Deleted N expired report(s)` only if changes>0; started at server init (not separate process); cron failure caught+logged without crashing; after deletion: expired id → 404
- 8.2 GET /api/reports (no id) → 404 (not registered); GET /api/jobs (no id) → 404; every queries.js reports read uses WHERE report_id=?; no cross-report JOINs in HTTP-accessible queries; job_id never in final report URL
```

**NEW:**

```
- 8.1 cron every hour: `DELETE FROM reports WHERE expires_at < unixepoch()`; log `[cleanup] Deleted N expired report(s)` only if changes>0; started at server init (not separate process); cron failure caught+logged without crashing; after deletion: expired id → 404
- 8.2 GET /api/reports (no id) → 404 (not registered); GET /api/jobs (no id) → 404; every queries.js reports read uses WHERE report_id=?; no cross-report JOINs in HTTP-accessible queries; job_id never in final report URL
- 8.3 platform-hardening MVP batch: @fastify/rate-limit registered in src/server.js; global 60 req/min/IP default; POST /api/generate 5 req/min/IP; GET /api/reports/:id/csv 10 req/min/IP; GET /api/jobs/:id 120 req/min/IP (2s polling × 60 = 30/min base; 4× headroom for multi-tab/mobile-reconnect/retry-loop); GET /health excluded; 429 routed through errorHandler (no raw plugin body, no api_key in logs); Cache-Control: private, no-store on /api/reports/:id and /csv (success AND 404); persisted csv_data does NOT start with ﻿ — byte-level assertion, codifies current `src/workers/scoring/buildReport.js` behaviour (no BOM emission verified 2026-04-23); :id on /api/reports/:id + /csv + /api/jobs/:id validated via strict regex `^[0-9a-f-]{36}$` before any DB read (one regex, not length+charset pair — collapses guard surface); malformed/oversized/undersized/unknown/expired share one 404 shape (no enumeration oracle); NOT modifying src/workers/**; NOT in scope (post-MVP): axe-core, keyboard-nav E2E, CSV behavioural timing tests, matchMedia, empty-tables scroll-hint
```

**Rationale:** Compressed ACs must stay compressed (distillate token-budget discipline); this line follows the format used for 8.1 and 8.2 — semicolon-delimited clauses, no Given/When/Then scaffolding.

---

### Change 4.3 — `_bmad-output/implementation-artifacts/sprint-status.yaml`

Two edits.

#### 4.3a — `last_updated:` comment (lines 2 and 38)

**OLD (line 2):**

```
# last_updated: 2026-04-23  (phase0 reconciliation: epic-7 complete; epic-8 active)
```

**NEW (line 2):**

```
# last_updated: 2026-04-23  (phase0 reconciliation: epic-7 complete; epic-8 active; story 8.3 added via sprint-change-proposal-2026-04-23)
```

**OLD (line 38):**

```
last_updated: 2026-04-23  (phase0 reconciliation: epic-7 stories verified merged; epic-8 in-progress; stale worktrees/branches cleaned)
```

**NEW (line 38):**

```
last_updated: 2026-04-23  (phase0 reconciliation: epic-7 stories verified merged; epic-8 in-progress; stale worktrees/branches cleaned; story 8.3 platform-hardening-mvp-batch added per sprint-change-proposal-2026-04-23)
```

#### 4.3b — Epic 8 block (after line 121, before line 122)

**OLD (lines 118-122):**

```
  # ── Epic 8: Data Governance & Cleanup ────────────────────────────────────
  epic-8: in-progress
  8-1-hourly-ttl-deletion-cron: done
  8-2-no-listing-endpoint-and-cross-seller-isolation: done
  epic-8-retrospective: optional
```

**NEW (lines 118-123):**

```
  # ── Epic 8: Data Governance & Cleanup ────────────────────────────────────
  # Story 8.3 added 2026-04-23 per Epic 7 retro Action Item T3
  # (platform-hardening MVP batch: rate-limit + Cache-Control + CSV BOM + :id guards).
  # Sequenced after 8.2; blocks epic-8-retrospective.
  epic-8: in-progress
  8-1-hourly-ttl-deletion-cron: done
  8-2-no-listing-endpoint-and-cross-seller-isolation: done
  8-3-platform-hardening-mvp-batch: backlog
  epic-8-retrospective: optional
```

**Rationale:** Keeps the existing Epic 1/3/4-style "reopened" / "added retroactively" inline-comment convention. Retrospective stays `optional` per project convention — it flips when the human runs retro.

---

## Section 5 — Implementation Handoff

**Change scope classification: MINOR.**

**Rationale:** Additive, single-story, no existing-artifact amendments beyond well-bounded appends, no architectural or MVP-scope pivots, no dependencies / downstream epics / integrations affected.

**Handoff recipient:** Development team (Pedro, solo).

**Deliverables after approval:**

1. **Proposal artifact (this file):** `_bmad-output/planning-artifacts/sprint-change-proposal-2026-04-23.md` — already drafted.
2. **Three artifact edits** applied by the bmad-correct-course coordinator (this session) after approval:
   - `_bmad-output/planning-artifacts/epics.md` — append Story 8.3 block.
   - `_bmad-output/planning-artifacts/epics-distillate.md` — three-location update (Epic-Story Map + Dependencies + Compressed ACs).
   - `_bmad-output/implementation-artifacts/sprint-status.yaml` — add `8-3-platform-hardening-mvp-batch: backlog` + comment update.
3. **Downstream follow-ups (not in this proposal's scope — belong to BAD Story 8.3 cycle):**
   - `bmad-create-story 8.3` → generates `_bmad-output/implementation-artifacts/8-3-platform-hardening-mvp-batch.md`.
   - Open GH issue for Story 8.3; wire `GH Issue: #NN` into both the epics.md block AND the generated spec file.
   - Run BAD Step 3 → 4 → 5 → 6 → 7 per standard cycle (Step 5 Opus because `src/routes/**` is worker-path-adjacent; no live-smoke gate because no `src/workers/mirakl/**` touch).
   - At Step 7 (post-merge reconciliation): annotate deferred-work.md rows 95-96 / 125-128 / 131-133 / 141 / 168-171 with `-closed-by-8-3`; annotate the five explicitly-out-of-scope rows (axe-core / keyboard-nav E2E / CSV behavioural timing / matchMedia / empty-tables hint) with `-deferred-post-mvp`.

**Success criteria:**

- Story 8.3 merges clean (no mechanical conflict resolution needed — Epic-Start push rule per `feedback_bad_epic_start_push.md` already holds).
- Full ATDD suite green at 8.3 close; no regression in 7xx or 3xx suites.
- Zero `api_key` exposure in 429 response paths or 404 enumeration-oracle paths.
- Deferred-work count drops by ≥ 4 items (the four in-scope) and ≥ 5 (the five explicitly-deferred) — net backlog shrink of ≥ 9 items.
- `epic-8-retrospective` becomes runnable (all Epic 8 stories `done`).

**Not delegated / out of handoff scope:**
- Any changes to `src/workers/**` (explicit AC-level non-modification assertion in the 8.3 story).
- Any changes to scope items deferred post-MVP (those remain deferred).

---

## Section 6 — Approval

By approving this proposal, Pedro authorises:

1. Immediate application of the three artifact edits in Section 4 via Edit tool calls (this session).
2. Subsequent invocation of `bmad-create-story 8.3` in a follow-up session (out of scope for this workflow).

**Approval request:** Review this complete proposal. Approve [yes], revise [revise], or reject [no]?

---

**Bob (Scrum Master):** "Retro said T3 ships as a story; this formalises it as Story 8.3. No strategic debate — retro already ran it. The value of correct-course here is the paper trail: three artifact edits, one proposal document, one sprint-status line, and `bmad-create-story` can run cleanly against an amended plan instead of against a retro bullet point. That's the whole point of Epic 7 retro Insight #1."
