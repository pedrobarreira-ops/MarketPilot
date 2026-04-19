---
name: bad-review
description: 'Audit a BAD-generated PR before merge — spawns parallel subagents to check code vs spec, MCP alignment, test quality, and PR-body accuracy, then guides a safe merge preserving any stranded BAD commits. Use when: "review PR #N", "audit BAD''s last PR", "check BAD''s work", "is this PR safe to merge", or when BAD reports a batch complete.'
---

# bad-review — Audit BAD-generated PRs before merge

## Purpose

BAD ships PRs autonomously. Its self-reports ("34/34 pass, clean review") are *sometimes* accurate and *sometimes* hide silent-failure bugs. This skill performs an independent audit using fresh-context subagents, then guides a safe merge that preserves any of BAD's sprint-status commits that got stranded on local via the push-race pattern.

## When to use

- BAD reports "Step 7 PR review clean" and you want to verify before merging
- You're about to `gh pr merge` a BAD PR and want to check nothing silently broke
- Epic-complete batches where multiple PRs landed and you want a consistency check
- Any time you don't trust the PR body (see project memory: `feedback_bad_pipeline_trust.md`)

## Args

- `<PR-number>` (optional) — e.g. `/bad-review 44`. If omitted, uses the most recent open PR whose branch starts with `story-`.

## Flow

```
Phase 1: Gather          [main context — ~5 tool calls]
Phase 2: Audit           [4 parallel subagents — each returns <400 words]
Phase 3: Synthesize      [main context — produces verdict + user HALT]
Phase 4: Merge           [only on user confirmation — main context, judgment-heavy]
Phase 5: Post-merge      [main context — verify main is clean]
```

---

## Phase 1: Gather

Run these in parallel — all `gh` CLI, no subagent needed:

1. `gh pr view <N> --json number,title,state,mergeable,mergeStateStatus,additions,deletions,changedFiles,body`
2. `gh pr diff <N> --name-only`
3. Locate the story spec file: look in `_bmad-output/implementation-artifacts/` for a filename matching the story number (e.g. `3-4-*.md` for Story 3.4). Parse from PR title (typical format: `story-3.4-<slug> - fixes #N`).
4. Locate the ATDD test file + any `.additional.test.js` / `.unit.test.js` supplements in `tests/`.
5. Check `gh pr checks <N>` — CI state.

Save the results as variables for the audit phase: `PR_NUMBER`, `PR_TITLE`, `STORY_FILE`, `CODE_FILES` (list), `TEST_FILES` (list), `PR_BODY`.

**If PR state is not OPEN or mergeable is CONFLICTING:** stop. Report to user — "PR is <state>, cannot audit in this session." This skill does not resolve PR-branch conflicts.

---

## Phase 2: Audit — 4 parallel subagents

Launch all four in a **single message** (parallel execution). Each is self-contained — subagents have no prior context. Use the Explore agent type unless otherwise noted.

### Subagent A: Code vs spec

```
You are auditing story implementation vs spec for DynamicPriceIdea
(a Mirakl marketplace repricing MVP in Node.js).

Story spec:
  {STORY_FILE}

Implementation files (may include none — e.g. a docs-only PR):
  {CODE_FILES}

For each numbered Acceptance Criteria (AC-1, AC-2, ...) in the spec:
  1. Locate where/if it is implemented in the code.
  2. Verify the implementation matches what the AC describes.
  3. Report one of: ✓ satisfied | ⚠️ deviation: <what differs> | ✗ missing

Also flag:
  - Any behavior in the code NOT required by spec (scope creep)
  - Any AC that is internally contradictory or contradicts Mirakl MCP
    (see references/mcp-forbidden-patterns.md in this skill)

Output format (use exactly this structure, stay under 400 words):

## AC Coverage
| AC  | Status | Note (if not ✓) |
|-----|--------|-----------------|
| AC-1| ✓      |                 |

## Scope creep
- <bullets or "none">

## Contradictions
- <bullets or "none">

## Verdict
Safe to merge / Blocking issues / Needs human judgment

Return only the report, no preamble.
```

### Subagent B: MCP alignment

```
You are checking Mirakl MCP alignment for DynamicPriceIdea.

Files to grep:
  {CODE_FILES}

The authoritative endpoint reference is in
  _bmad-output/planning-artifacts/epics-distillate.md
under the section "MCP-Verified Endpoint Reference".

Load the file at:
  .claude/skills/bad-review/references/mcp-forbidden-patterns.md

That file lists five known-stale patterns that cause silent production
failures. For each pattern, grep the target files.

Report:

## Forbidden patterns
| Pattern | Found? | File:line (if found) |
|---------|--------|----------------------|
| state === 'ACTIVE' | ✓ or ✗ | |
| product_ids: <with EANs> | | |
| o.channel_code / offer.channel_code | | |
| offer.price without offer.total_price alongside | | |
| Compare activeOffers.length to total_count | | |

## Correct-pattern confirmation
- Files using {offer.active, product_references=EAN|, pricing_channel_code, offer.total_price, allOffers.length===total_count}: list or "none applicable"

## New endpoints / unusual patterns worth live-probing
- Any endpoint name, param, or field accessed that is NOT documented in
  epics-distillate.md's MCP-Verified section. List or "none".

## Verdict
Aligned / Drift found / Needs live probe

Return only the report, stay under 300 words.
```

### Subagent C: Test quality

```
You are assessing test quality for a DynamicPriceIdea story PR.

Target test files (any combination of ATDD, .additional, .unit):
  {TEST_FILES}

Classify each test() call:
- BEHAVIORAL: calls the actual implementation with fixtures; asserts on
  return value, state change, or mock call args.
- KEYWORD-GREP: reads the implementation file as text; asserts
  src.includes('...') or regex patterns against source.
- SKELETON: asserts export existence, function type, class name only.

Report:

## Test classification
- N behavioral / M keyword-grep / K skeleton (total: N+M+K)
- Behavioral %: X%

## Critical gaps
List checks that SHOULD exist but don't, focused on:
- Security invariants (no api_key leak, no err.message in logs)
- Error paths (what if the dependency throws?)
- Edge cases (empty input, null, boundary values)
Use your judgement on what "critical" means for the specific code.

## Verdict
Strong (>=50% behavioral, no critical gaps) /
Acceptable (>=20% behavioral OR has .additional supplement) /
Weak (mostly keyword-grep, no behavioral supplement)

Stay under 300 words.
```

### Subagent D: PR body vs diff (hallucination check)

Use the `general-purpose` subagent type (needs gh CLI access beyond Explore).

```
You are auditing a BAD-generated PR body for hallucinations.

PR number: {PR_NUMBER}

Known pattern in this repo (see project memory feedback_bad_pipeline_trust.md):
BAD's Step 6 subagent sometimes fabricates filenames, table/column names,
config flags, and behaviors not in the actual diff. Your job is to catch this.

Steps:
1. Read the PR body via: gh pr view {PR_NUMBER} --json body
2. Get the actual diff via: gh pr diff {PR_NUMBER}
3. Extract specific claims from the body: filenames mentioned, tables, env
   vars, flags, behaviors (e.g. "retry", "attachments").
4. For each claim, check whether the diff supports it.

Report:

## Body claims vs diff
| Claim from PR body | Supported by diff? |
|--------------------|--------------------|
| "Adds src/foo.js"  | ✓                  |
| "report_items table" | ✗ (not in schema) |

## Summary
Body accuracy: Accurate / Partial / Hallucinated

Stay under 300 words. Only list claims that are specific (filenames, field
names, flags, explicit behaviors). Ignore general prose like "implements the
story" or "adds tests".
```

---

## Phase 3: Synthesize

Once all four subagents return, synthesize a short verdict in main context:

```
# PR #{N} audit — {one-line verdict}

## Code vs spec
{from Subagent A — copy the AC Coverage table + scope/contradictions bullets}

## MCP alignment
{from Subagent B — forbidden patterns row + any drift notes}

## Test quality
{from Subagent C — classification totals + critical gaps}

## PR body accuracy
{from Subagent D — body verdict + top hallucinations if any}

## Overall verdict

- **Safe to merge** — all four green
- **Merge with awareness** — one or two minor issues (e.g. body
  hallucination, acceptable test weakness); doesn't block
- **Needs fixes first** — AC deviation, MCP drift, or security gap

## Recommendation
{1-2 sentences — what to do next}
```

Then **HALT and wait for user confirmation** before doing anything destructive. Present the three options:

```
[M] Merge now — execute the safe-merge procedure
[F] Fix first — tell me what needs fixing, I'll wait
[S] Stop — I'll read your report and merge manually later
```

Do NOT auto-merge. The user must explicitly confirm.

---

## Phase 4: Merge (on user [M] confirmation)

Read `references/merge-procedure.md` and follow it exactly. Core steps:

1. **Stash any local dev-state changes** (e.g. `.claude/settings.local.json`) so they don't get swept into git state.
2. **Detect local/origin divergence**. If local main has BAD's stranded sprint-status commits:
   - Do NOT reset local to origin (that would lose BAD's intent)
   - Do NOT merge-commit (messy history)
   - DO rebase local onto origin after the PR merge completes on GitHub
3. `gh pr merge <N> --squash --delete-branch` — GitHub handles the squash.
4. `git fetch origin main && git rebase origin/main` — replay any local commits onto the new tip.
5. **If rebase hits conflicts** (typically on the story spec file — "Status" field, checkboxes, or Dev Agent Record): resolve by keeping the MORE COMPLETE local version (BAD's post-review state has checkmarks + Dev Agent Record populated; origin's squashed state has raw unchecked skeleton).
6. **Check for conflict markers left behind** before continuing: `grep -c "<<<<<<< HEAD" <spec-file>`. If non-zero, fix them before pushing.
7. `git push origin main` — this completes the merge safely.
8. Pop the stash.

**Do NOT proceed to Phase 5 if any step in Phase 4 fails.** Report the failure to the user and stop.

---

## Phase 5: Post-merge verify

Run these in main context:

1. **Pull main** to ensure local matches origin.
2. **Sprint-status check**:
   ```bash
   grep -E "^  {story-prefix}" _bmad-output/implementation-artifacts/sprint-status.yaml
   ```
   Confirm the merged story shows `done`. If not, the push race stranded it — apply a quick one-commit fix: edit the yaml, commit, push.
3. **MCP alignment smoke test** — confirm no regression:
   ```bash
   grep -rE "state === 'ACTIVE'|product_ids: batchEans|o\.channel_code ===" src/workers/mirakl
   ```
   Expected: no matches (comments ok; only flag live param/field access).
4. **Run `npm test`** — report pass/fail counts. If a new test file landed in this PR that's not in `npm test`'s allowlist, note it and offer to add it (until the `skipUnlessImplExists()` helper is in place).
5. **CI state on main** — `gh run list --branch main --limit 1 --json conclusion,displayTitle`. Should be `success` or in_progress. If failure, show the user the link.
6. **Final report** — a compact status:

```
# PR #{N} merged and main verified

- Merged: ✓ at {timestamp}
- Local commits preserved: {N rebased / none}
- sprint-status: ✓ {story} = done
- MCP alignment: ✓ intact
- npm test: ✓ {passed/total} pass
- CI on main: ✓ {conclusion}

Main is clean. Ready for next batch.
```

---

## Rules

1. **Never merge without the user's explicit [M] confirmation** at the end of Phase 3.
2. **Never reset local main to origin** when divergent — always rebase to preserve BAD's stranded commits.
3. **Treat PR body as decorative** — never cite it as evidence of what's in the PR. Always verify against the diff.
4. **If the rebase conflict is ambiguous** (not just the known "[ ] vs [x]" or "Status: ready-for-dev vs done" patterns) — HALT and ask the user to choose. Don't guess.
5. **If any subagent reports an issue rated "blocking"** — do not offer the Merge option. Present only [F] Fix first and [S] Stop.
6. **If CI is failing on the PR** at Phase 1 — report it and stop. The skill does not fix CI failures.

## Repo-specific context (edit when things change)

- Stack: Node.js >=22 ESM, Fastify, BullMQ, SQLite/Drizzle, Resend
- Current epic: track via `_bmad-output/implementation-artifacts/sprint-status.yaml`
- Mirakl MCP: run `scripts/mcp-probe.js` for live verification against `marketplace.worten.pt`
- Pre-emptive ATDD files for unimplemented stories: see `_bmad-output/implementation-artifacts/deferred-work.md`
- Known merge-race pattern: see `references/merge-procedure.md`
- Known forbidden patterns: see `references/mcp-forbidden-patterns.md`
