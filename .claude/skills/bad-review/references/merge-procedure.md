# Merge Procedure — BAD PR Safe-Merge with Stranded-Commit Preservation

This procedure merges a BAD-generated PR while preserving BAD's stranded sprint-status commits on local main. It was developed after PRs #42 and #43 required manual rebase to avoid losing BAD's Step 7 `done` flips.

---

## The problem this solves

BAD's Step 7 subagent runs these commands on local main during the worker's lifecycle:
1. Update `_bmad-output/implementation-artifacts/sprint-status.yaml` — flip story to `review` / `done`
2. `git commit -m "Set story X to done in sprint-status"`
3. `git push origin main`

Sometimes step 3 races the PR squash-merge. When that happens:
- The push succeeds locally but the remote state advances first (PR merge lands)
- OR the push gets rejected and BAD doesn't retry
- Result: local main has 2-4 extra commits (sprint-status flips + code review findings) that never reached origin

When you then merge the PR and `git pull`, local has commits origin doesn't and origin has the PR merge commit local doesn't → diverged. A naive `git pull` tries to merge-commit, creating messy history. A `git reset --hard origin/main` loses BAD's work.

**The right fix: rebase local commits onto origin after the PR merge, preserving BAD's intent as a linear history.**

---

## Pre-merge checklist

Before doing anything destructive:

1. **Check if local has any uncommitted working-tree changes** that aren't BAD's work:
   ```bash
   git status --short
   ```
   Common finds: modified `.claude/settings.local.json`, untracked worktree/skill files. Stash them:
   ```bash
   git stash push -u -m "local dev state before PR #<N> merge" -- .claude/settings.local.json
   ```
   Only stash specific paths you recognize. Don't blanket-stash — untracked files like `.worktrees/`, `scripts/mcp-probe.js`, etc. are fine to leave.

2. **Verify the PR is actually mergeable on GitHub:**
   ```bash
   gh pr view <N> --json mergeable,mergeStateStatus,state
   ```
   Expect `mergeable: MERGEABLE`, `mergeStateStatus: CLEAN`. If BLOCKED or CONFLICTING, resolve on the PR branch first — this procedure assumes a clean merge on GitHub.

3. **Check for local/origin divergence:**
   ```bash
   git fetch origin main
   git log --oneline HEAD -5
   git log --oneline origin/main -5
   ```
   Compare the two. If they share the top commit, no divergence — safe path below applies. If local has commits origin doesn't, divergent path applies.

---

## Safe path (no divergence)

If local main is at the same commit as origin/main:

1. `gh pr merge <N> --squash --delete-branch` — GitHub squashes and merges.
   - `--delete-branch` will fail with a warning if a worktree still holds the branch. Ignore that — the remote branch is deleted regardless. BAD's next Phase 0 cleans up worktrees.
2. Verify merge succeeded: `gh pr view <N> --json state,mergedAt` — expect `state: MERGED`.
3. `git fetch origin main && git pull --ff-only origin main` — fast-forward local to the new tip.
4. Skip to Post-merge verification.

---

## Divergent path (local has stranded BAD commits)

1. `gh pr merge <N> --squash --delete-branch` — merge the PR on GitHub. Ignore local branch-delete failure (see above).

2. **Pull and fetch the new origin tip:**
   ```bash
   git fetch origin main
   ```

3. **Rebase local commits onto the new origin:**
   ```bash
   git rebase origin/main
   ```
   This replays each local commit on top of the PR-merge commit that's now on origin.

4. **Handle rebase conflicts.** The typical conflict is on `_bmad-output/implementation-artifacts/<story-N>.md` (the story spec file). Two common patterns:

   **Pattern A: Status field**
   ```
   <<<<<<< HEAD
   **Status:** ready-for-dev
   =======
   **Status:** review
   >>>>>>> <commit> (Set story N to review in sprint-status)
   ```
   Resolution: keep the local version (the one this rebased commit intends). Later commits in the rebase will flip it further (review → done).

   **Pattern B: Task checkboxes + Dev Agent Record**
   ```
   <<<<<<< HEAD
   - [ ] Task 1: ...
   =======
   - [x] Task 1: ...
   >>>>>>>
   ```
   Resolution: keep local (the `[x]` version with checkboxes filled + Dev Agent Record populated). Origin's state is the skeleton from the PR squash; local has the real post-review state.

5. **CRITICAL: after manually editing to resolve conflicts, check for leftover markers before continuing:**
   ```bash
   grep -c "<<<<<<< HEAD" <path-to-conflicted-file>
   ```
   If this returns anything other than `0`, you missed a conflict block. **This has happened** — a rebase can "succeed" with markers still embedded in the committed file if you `git add` before resolving all blocks. Fix all markers before proceeding.

6. `git add <resolved-file>` then `git rebase --continue`. Repeat until rebase completes.

7. **If you amended a commit to clean up markers after a "successful" rebase**, that's fine — `git commit --amend --no-edit` works. Just verify no markers remain in any file:
   ```bash
   grep -rn "<<<<<<< HEAD" _bmad-output/
   ```
   Should return nothing.

8. **Push the rebased local to origin:**
   ```bash
   git push origin main
   ```
   This is a regular push, not a force-push — the rebased commits are new commits on top of origin/main's tip, so it fast-forwards cleanly.

9. **Pop the stash** (if anything was stashed):
   ```bash
   git stash pop
   ```

---

## Post-merge verification

Whichever path was taken, confirm main is in a good state:

1. **Sprint-status correctness:**
   ```bash
   grep -E "^  {story-prefix}-" _bmad-output/implementation-artifacts/sprint-status.yaml
   ```
   The story just merged should show `done`. If not, the rebase either skipped BAD's final flip or origin ended up with a stale flip. Quick fix:
   ```bash
   # edit the yaml, set the story to done
   git add _bmad-output/implementation-artifacts/sprint-status.yaml
   git commit -m "Set story X to done in sprint-status (post-merge reconciliation)"
   git push origin main
   ```

2. **MCP alignment smoke test** (ensure no regression in the merge):
   ```bash
   grep -rnE "state === 'ACTIVE'|product_ids: batchEans|\.channel_code ===" src/workers/mirakl/
   ```
   Expected: no matches in non-comment lines.

3. **Run the full test suite:**
   ```bash
   npm test
   ```
   Report pass/fail counts.

4. **CI on main:**
   ```bash
   gh run list --branch main --limit 2 --json conclusion,displayTitle
   ```
   Latest should be `success` or `in_progress`. If `failure`, investigate before declaring "clean."

5. **New test file check:** If the PR introduced new test files (e.g. `tests/epic3-3.X.additional.test.js` or `tests/epic3-3.X.unit.test.js`), verify they're in the `npm test` script in `package.json`. If not, add them. Until the `skipUnlessImplExists()` helper ships, this is manual.

---

## What NOT to do

1. **Never `git reset --hard origin/main` when divergent.** That discards BAD's sprint-status commits permanently. Always rebase.

2. **Never `git merge origin/main` when rebasing instead would work.** A merge commit creates a non-linear history that makes the push-race pattern harder to audit later.

3. **Never skip the conflict-marker check (step 5 above).** A rebase can appear to succeed with markers embedded in files. Always `grep -c "<<<<<<< HEAD"` on any file that had a conflict before pushing.

4. **Never bypass `git push` with `--force` on main.** If push fails for any reason other than the normal race, stop and investigate. Force-pushing main destroys collaborator work and is not required for this procedure.

5. **Do not trust `gh pr merge`'s local-branch-delete failure as a merge failure.** The merge succeeds on GitHub regardless; the local-delete failure is just because a worktree holds the branch. Always verify via `gh pr view <N> --json state,mergedAt`.

---

## Escape hatches

If the rebase gets hopelessly tangled:

- **`git rebase --abort`** returns local to the state before the rebase. You can then retry with a cleaner approach (e.g. cherry-pick specific commits you want to preserve, reset the rest).
- **Last resort — handcraft:** `git reset --soft origin/main` keeps all local changes as staged edits. Then make a single clean commit capturing just the real content (e.g. sprint-status updates, review findings). Push that single commit. You lose BAD's commit history but keep the file content.

Both escape hatches are acceptable but should be explicit decisions, not accidents. Report to the user before using either.
