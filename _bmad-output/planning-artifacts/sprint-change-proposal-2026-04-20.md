# Sprint Change Proposal — Progress Polling Contract: Structured Counts

**Date:** 2026-04-20
**Author:** Bob (Scrum Master) — via `bmad-correct-course`
**Triggered by:** Pedro
**Scope classification:** **Moderate** (backlog reorganization; no PRD MVP change)
**Status:** DRAFT — awaiting Pedro's approval

---

## Section 1 — Issue Summary

### Problem statement

The Claude Design handoff (`MarketPilot.html`, delivered 2026-04-17, received 2026-04-20 as part of Epic 5 prep) includes a Progress Screen mockup that displays **structured per-phase counts** (e.g. `A obter catálogo ✓ 31 179` / `A analisar concorrência 15 427 / 28 440`). The UX design doc (`ux-design.md:283-298`) had already specified the same pattern on 2026-04-15: "When available from the job status endpoint, show actual progress counts. Format large numbers with `.` thousand separator."

However, the Epic 4 polling endpoint (`GET /api/jobs/:job_id`, Story 4.2, shipped in PR #45 on 2026-04-19) returns only `{ data: { status, phase_message, report_id } }`. The count data exists in the worker — `fetchCatalog` and `scanCompetitors` both call `onProgress(n, total)` at 1,000- and 500-offer boundaries — but the worker embeds those counts **inside the `phase_message` prose string** (e.g. `"A obter catálogo… (12 400 de 31 179 produtos)"`) rather than writing them to dedicated columns. The polling endpoint has no structured counts to expose.

### How it was discovered

- 2026-04-20: design handoff inspection (via `bmad-review`-adjacent Claude Design URL fetch)
- Cross-referenced with UX design doc (3-phase spec, structured counts language already present)
- Cross-referenced with `scripts/run-integration-test.js` run logs — worker already emits `(n, total)` via `onProgress`; the data flow exists, the persistence layer doesn't capture it
- Current state verified in `src/db/schema.js:11` (`phaseMessage` column) and `src/db/queries.js:47` (`updateJobStatus(jobId, status, phaseMessage)` signature)

### Evidence — concrete

- **UX doc** (`_bmad-output/planning-artifacts/ux-design.md:293-298`): live status examples are `"A obter catálogo... (12.400 / 31.179 produtos)"` with explicit count format.
- **Design mockup** (`project/MarketPilot.html:192-195`): `const PROGRESS_PHASES = [{ label, total }]` with per-phase `total` values driving a structured UI, not prose parsing.
- **Shipped worker** (`src/workers/reportWorker.js:43-63`): `onProgress (n, total) => db.updateJobStatus(job_id, 'fetching_catalog', 'A obter catálogo… (12 400 de 31 179 produtos)')` — structured data collapsed into text.
- **Shipped route** (`src/routes/jobs.js:29`): returns `phase_message: row.phase_message ?? null` — no numeric fields.

### Why this surfaced now and not during Story 4.2 dev

Story 4.2's ATDD (`tests/epic4-4.2-get-api-jobs-polling.atdd.test.js`) verified AC-1 through AC-6 against `{ status, phase_message, report_id }` without asserting the UX doc's "structured counts" language — it treated the prose `phase_message` as sufficient. Epic 4 retro (2026-04-20) already flagged this class of gap under "Epic 4 Test Design pre-Phase-2 review" — design-contract drift between UX and API slipped through because no ATDD cross-checked them.

---

## Section 2 — Impact Analysis

### Epic Impact

| Epic | Status | Impact |
|---|---|---|
| Epic 3 (Report Generation Pipeline) | done → in-progress (reopened) | Sibling story required: worker must persist structured counts. Same retrofit that reopened the epic for Story 3.5a already breaks the "all stories done" invariant; adding another hardening story compounds nothing. |
| Epic 4 (HTTP API Layer) | done → in-progress (reopened) | Sibling story required: polling route must expose structured counts. Same mechanism as Epic 3 reopen. |
| Epic 5 (Frontend Form & Progress) | backlog (unchanged) | Story 5.2 (progress.js) AC must be authored against the retrofitted contract. 5.2 has no existing file; spec authoring is pending. Net effect: NO rework. |
| Epic 6 (Frontend Report) | backlog (unchanged) | No impact. |
| Epic 7 (Error Handling) | backlog (unchanged) | No impact. |
| Epic 8 (Data Governance) | backlog (unchanged) | No impact. |

**Epic sequencing:** unchanged. The retrofit ships before Story 5.1 begins, per Epic 4 retro's "pre-Epic-5 critical path".

### Story Impact

| Story | Current state | Change |
|---|---|---|
| 3.7 (full worker orchestration) | done | Sibling retrofit story `3-7a` NOT created — scope consolidated into single retrofit story `4-2a-polling-progress-contract` instead (cheaper: single migration, single commit train, single reviewer pass). The `4-2a` story will touch `reportWorker.js` as part of its scope. |
| 4.2 (polling endpoint) | done | Retroactive hardening via new sibling story `4-2a-polling-progress-contract` — adds structured count fields to the response. Original 4.2 ATDD tests remain green; new ATDD assertions added for the new fields. |
| 5.2 (progress.js — not yet created) | backlog | When its `bmad-create-story` runs (after retrofit merges), the spec will reference the new contract fields directly. NO rework, because 5.2 doesn't exist yet. |

### Artifact Conflicts

#### PRD (`prd.md`, `prd-distillate.md`)
- **No change needed.** FR8 ("real-time progress status reflecting actual processing phases") is general enough to accommodate either the prose-only or structured-count implementation.
- FR25 ("progress screen shows descriptive phase messages, not only spinner") is satisfied either way.

#### UX Design (`ux-design.md`)
- **Small clarifying edit needed.** The doc already specifies structured counts but doesn't name the API fields. Update `## Page 2 — Progress Screen → Live Status Message` to explicitly reference the two fields (`progress_current`, `progress_total`) and specify null-handling.
- **No phase-count change** — stays at 3 phases per A1 decision.

#### Epics (`epics.md`, `epics-distillate.md`)
- **Small update at the polling endpoint contract section** (`epics-distillate.md:121`): response shape extends from `{status, phase_message, report_id}` to `{status, phase_message, progress_current, progress_total, report_id}`.
- **Story 4.2 AC table** (`epics-distillate.md:260`): same update.
- **Story 5.2 AC** (`epics-distillate.md` — progress.js section at lines 147-151): add a line saying the phase counts render from the new fields.
- **No status-value changes**: `fetching_catalog`, `scanning_competitors`, `building_report` all remain exactly as-is.

#### Architecture (`architecture-distillate.md`)
- **Small schema update** (`architecture-distillate.md:75`): `generation_jobs` table gains two nullable INTEGER columns: `progress_current`, `progress_total`.
- **Route response format** (`architecture-distillate.md:163`): `polling → {status, phase_message, progress_current, progress_total, report_id}`.

#### Other artifacts
- **Tests** — additions (not rewrites) in `tests/epic4-4.2-get-api-jobs-polling.atdd.test.js` to cover the new fields. The retrofit story's own ATDD covers these.
- **CI/CD / Deployment / IaC / Monitoring** — no change.
- **Sprint-status.yaml** — add the retrofit story entry; epics 3 and 4 stay `in-progress` until all their retrofit stories are `done`.

---

## Section 3 — Recommended Approach

### Selected path: **Direct Adjustment (single new retrofit story)**

**What it means:** Add one new story `4-2a-polling-progress-contract` to Epic 4, covering schema migration, worker write-path, and route read-path in a single reviewable unit. Ship before Story 5.1 dev begins.

### Why this path

| Option considered | Verdict |
|---|---|
| Direct Adjustment, **one** retrofit story (worker + schema + route) | ✅ Selected |
| Direct Adjustment, **two** retrofit stories (3-7a worker, 4-2a route) | ❌ Rejected — schema migration + write-path + read-path are inseparable; splitting creates inter-story dependency without review value. |
| Rollback Story 4.2 and re-ship with counts | ❌ Rejected — 4.2 shipped clean; rolling back loses audit trail and forces the rework to be re-reviewed. Hardening retrofit is the right pattern. |
| PRD MVP review / scope reduction | ❌ Not applicable — MVP unchanged. |
| Do nothing (client-side prose-parse) | ❌ Rejected earlier during design handoff (`bmad-review`-adjacent analysis). Fragile on locale, breaks when phase_message prose changes, not test-enforced. |

### Effort estimate

| Task | Estimate |
|---|---|
| Drizzle schema + SQLite migration (2 nullable columns on `generation_jobs`) | 20 min |
| `queries.js` — extend `updateJobStatus` signature to accept `progressCurrent`, `progressTotal`; extend `getJobStatus` to return them | 20 min |
| `reportWorker.js` — update 4 `onProgress` call sites (2 in `fetchCatalog` wrapper, 2 in `scanCompetitors` wrapper; 0 in building_report phase) to pass counts | 15 min |
| `routes/jobs.js` — add fields to response | 5 min |
| ATDD tests — 4 new assertions on polling response fields (each phase) + round-trip worker→route test | 45 min |
| Docs edits (UX doc, epics-distillate.md, architecture-distillate.md) | 25 min |
| Review + merge | 30 min |
| **Total** | **~2.5 hours** |

### Risk assessment

| Risk | Level | Mitigation |
|---|---|---|
| SQLite migration on existing data (dev/test DBs) | Low | Columns are nullable with no default required; `ALTER TABLE ADD COLUMN` is SQLite-safe and atomic. Existing rows get NULL, which the route serializes as `null`. |
| Breaking change to `updateJobStatus` signature | Low | Single caller (`reportWorker.js`); change is mechanical. |
| Regression in existing polling ATDD | Low | New fields are additive; existing assertions (`status`, `phase_message`, `report_id`) stay valid. |
| Retrofit shipping after Epic 4 "done" — sprint-status integrity | Accepted | Already broken by Story 3.5a. Epic 3 and Epic 4 both flip back to `in-progress` until retrofits land. Pattern is documented and understood. |
| Design mockup's 4-phase UI vs shipped 3-phase backend | Accepted | A1 decision: keep 3 phases. The mockup's 4th phase "A gerar relatório" is a sub-state of `building_report`; the progress bar can animate its final 5% smoothly without a status split. Any visual richness beyond 3 phases is a frontend-only styling concern, not a backend one. |

### Timeline impact

- No delay to Epic 5. The retrofit is on the pre-5.1 critical path (Epic 4 retro commitment) and fits within the same pre-5.1 batch as Story 3.5a (CSV injection), the BAD config edit, and the Playwright wire-up.
- No delay to any future epic.
- No delay to Pedro's broader roadmap.

---

## Section 4 — Detailed Change Proposals

### Edit 4.1 — UX Design Doc (`_bmad-output/planning-artifacts/ux-design.md`)

**Section:** `## Page 2 — Progress Screen` → `#### Live Status Message`

**OLD (lines 290-298):**

```markdown
#### Live Status Message

- **Text examples (cycling per phase):**
  - "A obter catálogo... (12.400 / 31.179 produtos)"
  - "A verificar concorrentes... (4.800 / 12.400 produtos)"
  - "A construir relatório..."
- **Style:** Inter body, `#475569`, centred
- **Update frequency:** Refreshed on each status poll response (polling interval: 2–3 seconds)
- **Numbers:** When available from the job status endpoint, show actual progress counts. Format large numbers with `.` thousand separator (Portuguese locale).
```

**NEW:**

```markdown
#### Live Status Message

- **Text examples (cycling per phase):**
  - "A obter catálogo... (12.400 / 31.179 produtos)"
  - "A verificar concorrentes... (4.800 / 12.400 produtos)"
  - "A construir relatório..."
- **Style:** Inter body, `#475569`, centred
- **Update frequency:** Refreshed on each status poll response (polling interval: 2–3 seconds)
- **Numbers:** The polling endpoint (`GET /api/jobs/:job_id`) returns `progress_current` and `progress_total` integer fields alongside `status` and `phase_message`. The frontend composes `{phase_message} ({progress_current.toLocaleString('pt-PT')} / {progress_total.toLocaleString('pt-PT')} produtos)` when both fields are non-null; otherwise renders just `{phase_message}`. The `building_report` phase never emits counts (both fields are null) — the UI shows only `phase_message` (e.g. "A construir relatório…"). The `queued` phase similarly has null counts.
```

**Rationale:** Names the specific API fields, specifies null handling, locks the formatting contract. UX doc stays authoritative; no phase count change.

---

### Edit 4.2 — Epics Distillate (`_bmad-output/planning-artifacts/epics-distillate.md`)

**Section:** API shape

**OLD (line 121):**

```markdown
- `GET /api/jobs/:job_id`: returns `{ data: { status, phase_message, report_id } }`; 404 for unknown; < 100ms target
```

**NEW:**

```markdown
- `GET /api/jobs/:job_id`: returns `{ data: { status, phase_message, progress_current, progress_total, report_id } }`; `progress_current` and `progress_total` are integers or null (null in `queued`, `building_report`, `complete` phases; non-null during `fetching_catalog` and `scanning_competitors`); 404 for unknown; < 100ms target
```

**Section:** Story 4.2 AC

**OLD (line 260):**

```markdown
- 4.2 Returns {data:{status, phase_message, report_id}}; 404 for unknown job_id; < 100ms; no api_key in response
```

**NEW:**

```markdown
- 4.2 Returns {data:{status, phase_message, progress_current, progress_total, report_id}}; `progress_current`/`progress_total` may be null per phase; 404 for unknown job_id; < 100ms; no api_key in response
```

**Section:** Story 5.2 (progress.js) Behaviour

**OLD (lines 147-151):**

```markdown
## progress.js Behaviour

- Poll `GET /api/jobs/:job_id` every 2 seconds
- Progress bar fill by phase: `fetching_catalog` → ~30%; `scanning_competitors` → ~80% (crawl animation); `building_report` → ~95%; `complete` → 100%
- Progress bar ARIA: `role="progressbar"`, `aria-valuemin="0"`, `aria-valuemax="100"`, `aria-valuenow` updated each transition
```

**NEW:**

```markdown
## progress.js Behaviour

- Poll `GET /api/jobs/:job_id` every 2 seconds
- Progress bar fill by phase: `fetching_catalog` → ~30%; `scanning_competitors` → ~80% (crawl animation); `building_report` → ~95%; `complete` → 100%
- Live status line: compose `{phase_message} ({progress_current} / {progress_total} produtos)` when both count fields non-null, else `{phase_message}` alone; numbers formatted with pt-PT locale (thousand separator is `.`)
- Progress bar ARIA: `role="progressbar"`, `aria-valuemin="0"`, `aria-valuemax="100"`, `aria-valuenow` updated each transition
```

**Rationale:** Pins the contract for future Story 5.2 authoring.

**Note:** The sibling non-distillate file `epics.md` receives parallel edits at the corresponding sections for audit trail (same OLD → NEW, but applied to the original file). Per project convention (CLAUDE.md), BAD and skill subagents load the distillate, so the distillate is the functional source of truth.

---

### Edit 4.3 — Architecture Distillate (`_bmad-output/planning-artifacts/architecture-distillate.md`)

**Section:** Database schema — `generation_jobs`

**OLD (line 75):**

```markdown
- `generation_jobs`: `job_id TEXT PK`, `report_id TEXT NOT NULL`, `status TEXT DEFAULT 'queued'` (values: queued|fetching_catalog|scanning_competitors|building_report|complete|error), `phase_message TEXT`, `email TEXT NOT NULL`, `marketplace_url TEXT NOT NULL`, `created_at INTEGER`, `completed_at INTEGER`, `error_message TEXT` — NO api_key column ever
```

**NEW:**

```markdown
- `generation_jobs`: `job_id TEXT PK`, `report_id TEXT NOT NULL`, `status TEXT DEFAULT 'queued'` (values: queued|fetching_catalog|scanning_competitors|building_report|complete|error), `phase_message TEXT`, `progress_current INTEGER` (nullable — set during fetching_catalog and scanning_competitors phases), `progress_total INTEGER` (nullable — set alongside progress_current), `email TEXT NOT NULL`, `marketplace_url TEXT NOT NULL`, `created_at INTEGER`, `completed_at INTEGER`, `error_message TEXT` — NO api_key column ever
```

**Section:** API response formats

**OLD (line 163):**

```markdown
- API response format: success → `{"data": {...}}`; error → `{"error": "code", "message": "Portuguese message"}`; polling → `{"status": "...", "phase_message": "...", "report_id": "uuid"}`
```

**NEW:**

```markdown
- API response format: success → `{"data": {...}}`; error → `{"error": "code", "message": "Portuguese message"}`; polling → `{"status": "...", "phase_message": "...", "progress_current": number|null, "progress_total": number|null, "report_id": "uuid"}`
```

**Rationale:** Architecture becomes the single place a future developer reads to learn the schema and wire format.

---

### Edit 4.4 — New Story File `4-2a-polling-progress-contract.md`

**To be authored via `bmad-create-story 4-2a-polling-progress-contract`** once this proposal is approved. High-level scope (the create-story workflow will expand it fully):

**Epic:** 4 — HTTP API Layer (retroactive hardening, same reopen pattern as Story 3.5a)
**Status on creation:** `ready-for-dev`
**Depends on:** Nothing — all data sources already exist
**User story:** "As a frontend developer building `progress.js`, I want `GET /api/jobs/:job_id` to return structured `progress_current` and `progress_total` fields so that I can render the live-status message per the UX spec without parsing Portuguese prose out of `phase_message`."

**AC sketch (to be expanded by create-story):**
1. Schema: `generation_jobs` gains `progress_current INTEGER` and `progress_total INTEGER`, both nullable. Drizzle schema + raw `CREATE TABLE` migration both updated.
2. `queries.js → updateJobStatus(jobId, status, phaseMessage, progressCurrent = null, progressTotal = null)` — two new optional params; default to null; existing callers pass null implicitly (no breakage).
3. `queries.js → getJobStatus(jobId)` — return object adds `progress_current`, `progress_total` keys (snake-case for route).
4. `reportWorker.js` — 2 `onProgress` callsites (fetchCatalog wrapper, scanCompetitors wrapper) pass `n` and `total` as the 4th and 5th args. Non-count phase calls (`A preparar…`, `A construir relatório…`, `Relatório pronto!`) omit them (auto-null).
5. `routes/jobs.js` — adds both fields to the response; null preserved as JSON `null`.
6. ATDD additions (`tests/epic4-4.2-get-api-jobs-polling.atdd.test.js` gets new assertions, OR create `tests/epic4-4.2a-polling-progress-contract.additional.test.js` — create-story picks per convention):
   - fetching_catalog seeded row → response has `progress_current`, `progress_total` non-null
   - scanning_competitors seeded row → same
   - building_report seeded row → both null
   - queued seeded row → both null
   - complete seeded row → both null
   - Round-trip: invoke worker fixture with a fake `onProgress`; assert DB rows; assert route returns them
7. No changes to Story 4.2's original ATDD file — existing assertions stay valid.
8. `npm test` green across the board.
9. No Mirakl API changes.

**Files to modify:**
- `src/db/schema.js`
- `src/db/migrate.js` (add columns)
- `src/db/queries.js`
- `src/workers/reportWorker.js`
- `src/routes/jobs.js`
- `tests/` — new or additional test file

---

### Edit 4.5 — Sprint Status (`_bmad-output/implementation-artifacts/sprint-status.yaml`)

**Changes:**

1. `epic-4: done` → `epic-4: in-progress` (retrofit pending)
2. Add under Epic 4:
   ```yaml
   4-2a-polling-progress-contract: backlog
   ```
   (will flip to `ready-for-dev` when `bmad-create-story` runs for it, per the standard workflow)
3. Update `last_updated` field with the reason.

---

## Section 5 — Implementation Handoff

### Scope classification: **Moderate**

- Backlog reorganization required (new story added, two epics reopened).
- No PRD MVP change.
- No architect-level replan (schema additions are trivial, not structural).

### Roles

| Role | Responsibility |
|---|---|
| Pedro (user / decider) | Approve this proposal; then kick off `bmad-create-story 4-2a-polling-progress-contract` |
| Bob (SM, via `bmad-create-story`) | Author the full story file with comprehensive dev context |
| BAD pipeline | Pick up `4-2a` at `ready-for-dev` status; run ATDD design → dev → review → PR |
| `bad-review` skill | Audit the PR before Pedro merges |

### Deliverables from this proposal (once approved)

1. This proposal document (`sprint-change-proposal-2026-04-20.md`) — audit trail (already written).
2. Edits 4.1, 4.2, 4.3 applied to UX doc, epics-distillate.md (+ epics.md mirror), architecture-distillate.md — applied upon approval.
3. Edit 4.5 applied to sprint-status.yaml — applied upon approval.
4. `bmad-create-story 4-2a-polling-progress-contract` invoked next — produces the dev-ready story file.

### Success criteria

- `4-2a` PR merges with all tests green.
- `epic-4` flips back to `done` after retrofit merges (assuming 4-2a is the last open story in Epic 4).
- `progress.js` (Story 5.2, future) authored cleanly against the new contract — zero prose-parsing logic.
- UX design doc, epics-distillate.md, architecture-distillate.md in sync with shipped backend.

### What's NOT in this proposal (scope guard)

- **CSV formula injection retrofit** — separate story `3-5a-csv-formula-injection-hardening`, already authored.
- **BAD config edit** (Phase 0 epic-row auto-flip + Step 6 PR-body prompt tweak) — Epic 4 retro action item, separate work.
- **Playwright infra** — Epic 4 retro action item, separate work.
- **Rate limiting** — deferred to post-Epic-6 platform hardening story.
- **Phase-model 4-phase split** — considered and rejected (Option A2, not selected by Pedro).

---

## Section 6 — Open questions

None at this time. Pedro confirmed:
- Workflow mode: Batch
- Phase model: A1 (3 phases + counts, no status-value split)
- Scope: single retrofit story, not two

If any of the above are later revisited, this proposal is the baseline to diff against.

---

*End of Sprint Change Proposal — awaiting explicit Pedro approval (yes / no / revise) before edits 4.1, 4.2, 4.3, 4.5 are applied and `bmad-create-story 4-2a` is invoked.*
