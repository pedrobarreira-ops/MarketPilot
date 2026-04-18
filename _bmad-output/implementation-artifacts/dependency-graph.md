# Story Dependency Graph
_Last updated: 2026-04-18T14:00:00Z_

## Stories

| Story | Epic | Title | Sprint Status | Issue | PR | PR Status | Dependencies | Ready to Work |
|-------|------|-------|--------------|-------|----|-----------|--------------|---------------|
| 1.1   | 1    | Project Scaffold | done | #2 | — | — | none | ✅ Yes (done) |
| 1.2   | 1    | Fastify Server with Log Redaction | done | #3 | #1 | merged | none | ✅ Yes (done) |
| 1.3   | 1    | SQLite Schema & Drizzle Setup | done | #4 | #32 | merged | none | ✅ Yes (done) |
| 1.4   | 1    | BullMQ Queue & Redis Connection | done | #5 | #34 | merged | 1.3 | ✅ Yes (done) |
| 1.5   | 1    | Docker & Coolify Deployment Config | done | #6 | #33 | merged | none | ✅ Yes (done) |
| 2.1   | 2    | keyStore Module | done | #7 | #35 | merged | 1.3, 1.4 | ✅ Yes (done) |
| 2.2   | 2    | BullMQ Worker Scaffold with Key Lifecycle | done | #8 | #36 | merged | 2.1 | ✅ Yes (done) |
| 3.1   | 3    | Mirakl API Client with Retry | done | #9 | #37 | merged | 2.2 | ✅ Yes (done) |
| 3.2   | 3    | OF21 Catalog Fetch with Pagination | backlog | #10 | — | — | 3.1 | ✅ Yes |
| 3.3   | 3    | P11 Competitor Scan (Batch + Concurrent) | backlog | #11 | — | — | 3.1 | ✅ Yes |
| 3.4   | 3    | WOW Score + Quick Wins Scoring | backlog | #12 | — | — | 3.2, 3.3 | ❌ No (3.2, 3.3 not merged) |
| 3.5   | 3    | Report Persistence & CSV Generation | backlog | #13 | — | — | 3.4 | ❌ No (3.4 not merged) |
| 3.6   | 3    | Email Dispatch via Resend | backlog | #14 | — | — | 3.5 | ❌ No (3.5 not merged) |
| 3.7   | 3    | Full Worker Orchestration & Phase Updates | backlog | #15 | — | — | 3.2, 3.3, 3.4, 3.5, 3.6 | ❌ No (3.2–3.6 not merged) |
| 4.1   | 4    | POST /api/generate Route | backlog | #16 | — | — | 1.2, 3.7 | ❌ No (3.7 not merged) |
| 4.2   | 4    | GET /api/jobs/:job_id Polling Endpoint | backlog | #17 | — | — | 4.1 | ❌ No (4.1 not merged) |
| 4.3   | 4    | GET /api/reports & CSV Routes | backlog | #18 | — | — | 4.1 | ❌ No (4.1 not merged) |
| 5.1   | 5    | form.js — Validation, Loading & Submission | backlog | #19 | — | — | 4.1 | ❌ No (4.1 not merged) |
| 5.2   | 5    | progress.js — Progress Bar, Copy & Redirect | backlog | #20 | — | — | 5.1 | ❌ No (5.1 not merged) |
| 6.1   | 6    | report.js — Data Fetch, Skeleton & Your Position | backlog | #21 | — | — | 4.3 | ❌ No (4.3 not merged) |
| 6.2   | 6    | Biggest Opportunities & Quick Wins Tables | backlog | #22 | — | — | 6.1 | ❌ No (6.1 not merged) |
| 6.3   | 6    | CSV Download & CTA | backlog | #23 | — | — | 6.1 | ❌ No (6.1 not merged) |
| 6.4   | 6    | Mobile & Screen-Share Layout Verification | backlog | #24 | — | — | 6.2, 6.3 | ❌ No (6.2, 6.3 not merged) |
| 6.5   | 6    | Expired Report & Fetch Error States | backlog | #25 | — | — | 6.1 | ❌ No (6.1 not merged) |
| 6.6   | 6    | Accessibility Baseline | backlog | #26 | — | — | 6.4, 6.5 | ❌ No (6.4, 6.5 not merged) |
| 7.1   | 7    | Empty Catalog & Auth Failure Path | backlog | #27 | — | — | 3.2, 3.3 | ❌ No (3.2, 3.3 not merged) |
| 7.2   | 7    | total_count Mismatch Handling | backlog | #28 | — | — | 3.2 | ❌ No (3.2 not merged) |
| 7.3   | 7    | P11 Rate Limit & Partial Data Recovery | backlog | #29 | — | — | 3.3 | ❌ No (3.3 not merged) |
| 8.1   | 8    | Hourly TTL Deletion Cron | backlog | #30 | — | — | 3.5 | ❌ No (3.5 not merged) |
| 8.2   | 8    | No Listing Endpoint & Cross-Seller Isolation | backlog | #31 | — | — | 4.3 | ❌ No (4.3 not merged) |

## Dependency Chains

- **1.4** depends on: 1.3
- **2.1** depends on: 1.3, 1.4
- **2.2** depends on: 2.1
- **3.1** depends on: 2.2
- **3.2** depends on: 3.1
- **3.3** depends on: 3.1
- **3.4** depends on: 3.2, 3.3
- **3.5** depends on: 3.4
- **3.6** depends on: 3.5
- **3.7** depends on: 3.2, 3.3, 3.4, 3.5, 3.6
- **4.1** depends on: 1.2, 3.7
- **4.2** depends on: 4.1
- **4.3** depends on: 4.1
- **5.1** depends on: 4.1
- **5.2** depends on: 5.1
- **6.1** depends on: 4.3
- **6.2** depends on: 6.1
- **6.3** depends on: 6.1
- **6.4** depends on: 6.2, 6.3
- **6.5** depends on: 6.1
- **6.6** depends on: 6.4, 6.5
- **7.1** depends on: 3.2, 3.3
- **7.2** depends on: 3.2
- **7.3** depends on: 3.3
- **8.1** depends on: 3.5
- **8.2** depends on: 4.3

## Notes

- Epic 1 is fully complete — all 5 stories have merged PRs.
- Epic 2 is fully complete (retrospective done). Both 2.1 (#35) and 2.2 (#36) merged.
- Epic 3 is the active epic. Story 3.1 (Mirakl API Client with Retry) merged as PR #37 on 2026-04-18. GH Issue #9 auto-closed.
- **Two stories are now Ready to Work: Story 3.2 (OF21 Catalog Fetch with Pagination) and Story 3.3 (P11 Competitor Scan)**. Both depend only on 3.1 which is now merged. They can run in parallel.
- Story 3.1 worktree cleaned up — physical directory removed, remote branch already deleted by GitHub on merge.
- Story 2.2 worktree physical directory (`.worktrees/story-2.2-bullmq-worker-scaffold-with-key-lifecycle`) is locked by Windows (known issue from previous session) — git tracking removed, safe to delete manually.
- Parallelization opportunities: Stories 3.2 and 3.3 can run in parallel now. Once 3.2+3.3 merge, stories 3.4, 7.1, 7.2, 7.3 can start (with some parallel opportunities). Once 4.1 merges, stories 4.2, 4.3, and 5.1 can run in parallel.
- All GH Issue fields added to `_bmad-output/planning-artifacts/epics.md` for all 30 stories (#2–#31).
- Merge conflict resolved: local main (4 sprint-status commits) merged with origin/main (story 3.1 PR merge — 6 commits). Origin/main is authoritative.
