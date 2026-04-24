# Epic 8 — Running Retro Notes

Scratch file for observations during Epic 8 that should feed into the Epic 8 retrospective. Prepend new entries; oldest at the bottom.

---

## 2026-04-23 — P2 gate (clean-tree) taxonomy-refinement observation

**Story:** 8.1 (hourly-ttl-deletion-cron)
**Gate:** Step 3 → Step 4 clean-tree gate (memory: feedback_bad_step3_clean_tree_gate.md)
**Outcome:** Gate fired, but after inspection this was a **false positive relative to the gate's original intent**.

**What the gate caught:**
- `git -C worktree status --porcelain` returned ` M _bmad-output/implementation-artifacts/8-1-hourly-ttl-deletion-cron.md`

**What was actually true:**
- HEAD (commit `796eff0`) had the spec at `Status: review` with all tasks checked (the correct post-dev state)
- Working tree had reverted to `Status: ready-for-dev` with all tasks unchecked (the pre-dev state)
- Implementation was fully committed: `src/cleanup/reportCleanup.js` + `src/server.js` wire-up in `e0e7106`
- 24/24 ATDD tests pass; 739/739 full regression green
- So: work was complete and committed; working tree was BEHIND HEAD, not ahead

**Two distinct failure modes now visible in the data:**
1. **Working tree AHEAD of HEAD (uncommitted new work)** — the original Epic 7 incident the gate was designed for; dev-agent truncation leaves real work unsaved. True positive.
2. **Working tree BEHIND HEAD (regressed file)** — new mode seen here; some later action in the dev-story flow re-wrote the file back to an earlier state without committing. Git reports "modified" either way, but the semantic is opposite.

**Suggested gate refinement (for Epic 8 retro):**
- Before HALT, diff working tree vs HEAD:
  - If diff shows NEW content (lines added vs HEAD) → true positive → HALT
  - If diff shows REVERTED content (working tree is a subset/earlier version) → different class → auto-recover via `git checkout <file>` and record as a taxonomy-refinement observation
- Or: tighten the gate to only inspect `git diff HEAD --stat` for NEW untracked/added content, not regressed content

**Recovery applied:**
- `git -C .worktrees/story-8.1-hourly-ttl-deletion-cron checkout _bmad-output/implementation-artifacts/8-1-hourly-ttl-deletion-cron.md` — synced working tree to HEAD
- Verified clean with `git status --porcelain` — zero output
- Proceeded to Step 4

**Root cause hypothesis (not confirmed):**
The Step 3 subagent ran `/bmad-dev-story`, which edits the spec during execution. It committed the final version. Some later action (possibly a re-invocation of a spec-init path in dev-story, or a file-write race with the parallel 8.2 worktree) mutated the working-tree copy back to pre-run state. The commit was the last *commit*, not the last *disk write*.

**Epic 8 scope note:** Not a blocker for this batch. Record as taxonomy-refinement candidate.

---

## 2026-04-23 — M1 gate (sprint-status immutability) — RETRACTION + two real findings

**RETRACTED claim:** "M1 gate true-positive caught Step 6 commit-push-pr subagent-side-effect revert of 8.1/8.2 from review→backlog."

**Why retracted:** The hash comparison that drove the alarm was sampling two different files. Earlier in the batch I ran `cd ".worktrees/story-8.2-..." && node --test ...` to verify an ATDD scaffold, and Bash CWD persisted. Every subsequent `sha256sum _bmad-output/implementation-artifacts/sprint-status.yaml` with a *relative* path was reading the 8.2 WORKTREE's copy (always at `backlog`, never touched by Step 3 — which explicitly targets the repo root), not the repo root's copy.

- `STATUS_HASH_PRE` (`d67dd77d...`) was captured BEFORE the cd — it was the repo root copy at `review`.
- `STATUS_HASH_POST` (`0092e430...`) was captured AFTER the cd — it was the 8.2 worktree copy at `backlog`.
- Apples-to-oranges. No mutation occurred. The genuine repo-root `review` state survived Steps 4/5/6 untouched.

Verification after the fact: reading the repo-root sprint-status.yaml via an absolute path confirmed `review` at lines 120-121 was intact all along.

### Real Finding 1 — Coordinator CWD-persistence bug

**Problem:** An innocuous `cd <worktree>` in a Bash call leaves the coordinator's Bash CWD stuck in a worktree for the rest of the session. Any subsequent relative-path operation (`sha256sum foo`, `grep foo`, `sed -i foo`) silently targets the wrong file. This is a class-of-bug, not an isolated incident — any Phase 2 step that uses relative paths after such a cd is at risk.

**Impact in this batch:**
- False-positive M1 gate alarm (triggered a user decision and a spurious `git commit` that polluted the story-8.2 branch with commit `c492374` — cleaned up via `git reset --hard HEAD~1`, never pushed to origin).
- Misleading comment updates on repo-root sprint-status.yaml (reverted).
- ~20 minutes of investigation time.

**Remediation for Epic 8 retro prep PR (standing rule candidate):**
- Add a coordinator-side rule in `.claude/skills/bad/SKILL.md` (or its coordinator-common references) requiring absolute paths OR `git -C <absolute-path>` for ALL file operations inside Phase 2 story loops, and ALL gate hash samples.
- The symmetrical rule exists on the bad-review side (`.claude/skills/bad-review/references/merge-procedure.md`) because merge procedures learned this lesson. The BAD coordinator should inherit the same discipline.
- Consider an automated check: if a Bash call contains `cd <worktree>`, the next hash/grep/read must use an absolute path (could be enforced via prompt rule).

### Real Finding 2 — M1 gate effectiveness in Epic 8: UNTESTED

The gate fired, but on a phantom driven by the coordinator's own CWD bug. No real sprint-status mutation occurred in Epic 8. The gate's efficacy against a real violation still rests solely on its Epic 7 motivating case (commit `cf672d7`).

**Retro follow-through status:** "shipped, effectiveness-untested" — not "shipped + effective."

This is not a failure of the gate — it did exactly what it was designed to do given the (bogus) inputs it received. The gate is still valuable and should stay. But Pedro should not update confidence in the gate based on Epic 8 data.

### Note on P2 gate (prior entry above) — status unchanged

The P2 clean-tree gate entry higher in this file remains valid: it fired once, on a genuine working-tree-behind-HEAD file regression in story 8.1 (spec file reverted to pre-dev state while HEAD was post-dev). Taxonomy refinement (working-tree-ahead vs working-tree-behind) is still a recommended follow-up.

**Epic 8 gate scoreboard so far:**
- P1 (Epic-Start push): not triggered (scaffold committed + pushed cleanly by Phase 1 Epic-Start)
- P2 (clean-tree post-Step-3): 1 firing, false positive (taxonomy refinement candidate)
- P3 (Worker-Path Opus): not triggered (no `src/workers/`, `src/middleware/errorHandler.js`, or `src/routes/` touched)
- P4b (Live Smoke): not triggered (no Mirakl calls, no src/workers/mirakl/ touch)
- M1 (sprint-status immutability): 1 firing, false positive (coordinator CWD bug — see above)

Net: harness gates fired 2× in Epic 8 Batch 1, both false positives. Zero real defects gated. Standing rule P3 (Opus on worker paths) silently maintained by config (MODEL_QUALITY=opus), never needed to reject anything.

---

## 2026-04-23 — Step 2 (ATDD) rule violation: worktree-copy sprint-status write

**Finding:** Story 8.1 Step 7 `/code-review:code-review` pass flagged that `sprint-status.yaml` on the PR branch (story-8.1-hourly-ttl-deletion-cron) contained a stale `8-1-hourly-ttl-deletion-cron: atdd-done` value. Traced to Step 2 commit `82e7ded` ("story-8.1 atdd: scaffold sufficient — no new tests; set atdd-done in sprint-status"), which wrote to the WORKTREE copy of sprint-status.yaml and committed it to the branch.

**Skill rule violated:** Every Step N prompt states "Update sprint-status.yaml at the REPO ROOT (not the worktree copy)". The worktree copy is supposed to stay at whatever the branch base had. Only the repo-root copy is the state-machine ledger.

**Why it happened:** The Step 2 subagent interpreted "update sprint-status.yaml" as a single operation and used the worktree-relative path it was standing in. No visible guardrail against it.

**Consequence if uncaught:** When PR #63 merges to main, the stale `atdd-done` in the branch would have overwritten the repo-root's (uncommitted) `review`/`done` state. Step 7 caught this only because `/code-review:code-review` diffs against main and surfaced the contradiction. A future merge without that catch would silently regress main's sprint-status.

**Remediation candidate for Epic 8 retro prep PR:**
- Tighten every step prompt: "Do NOT modify `_bmad-output/implementation-artifacts/sprint-status.yaml` at the worktree path. Use the absolute path `D:/Plannae Project/DynamicPriceIdea/_bmad-output/implementation-artifacts/sprint-status.yaml`. Never `git add` this file to a worktree commit."
- Or add a `.gitignore`-style guard in each worktree that blocks `git add sprint-status.yaml` unless an explicit override flag is set.
- Or route sprint-status updates through a dedicated BAD helper that always writes absolute-path and stages on the main branch, not the worktree branch.

**Epic 8 Batch 1 status:** Caught before merge. PR #63 HEAD `152c156` now has the corrected `review` value. No regression landed on main.

**Check needed for 8.2:** The 8.2 Step 7 subagent didn't flag a similar issue on PR #64, but a retro follow-up should verify whether PR #64's diff also includes a sprint-status.yaml line (there may be a latent equivalent issue that merely wasn't caught because the current value happened to match main).
