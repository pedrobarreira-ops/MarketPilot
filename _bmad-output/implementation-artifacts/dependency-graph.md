# Story Dependency Graph
_Last updated: 2026-04-19T00:00:00Z_

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
| 3.2   | 3    | OF21 Catalog Fetch with Pagination | done | #10 | #38 | merged | 3.1 | ✅ Yes (done) |
| 3.3   | 3    | P11 Competitor Scan (Batch + Concurrent) | done | #11 | #39 | merged | 3.1 | ✅ Yes (done) |
| 3.4   | 3    | WOW Score + Quick Wins Scoring | done | #12 | #40 | merged | 3.2, 3.3 | ✅ Yes (done) |
| 3.5   | 3    | Report Persistence & CSV Generation | done | #13 | #41 | merged | 3.4 | ✅ Yes (done) |
| 3.6   | 3    | Email Dispatch via Resend | done | #14 | #42 | merged | 3.5 | ✅ Yes (done) |
| 3.7   | 3    | Full Worker Orchestration & Phase Updates | backlog | #15 | — | — | 3.2, 3.3, 3.4, 3.5, 3.6 | ✅ Yes |
| 4.1   | 4    | POST /api/generate Route | backlog | #16 | — | — | 1.2, 3.7 | ❌ No (epic 3 not complete) |
| 4.2   | 4    | GET /api/jobs/:job_id Polling Endpoint | backlog | #17 | — | — | 4.1 | ❌ No (epic 3 not complete) |
| 4.3   | 4    | GET /api/reports & CSV Routes | backlog | #18 | — | — | 4.1 | ❌ No (epic 3 not complete) |
| 5.1   | 5    | form.js — Validation, Loading & Submission | backlog | #19 | — | — | 4.1 | ❌ No (epic 3 not complete) |
| 5.2   | 5    | progress.js — Progress Bar, Copy & Redirect | backlog | #20 | — | — | 5.1 | ❌ No (epic 3 not complete) |
| 6.1   | 6    | report.js — Data Fetch, Skeleton & Your Position | backlog | #21 | — | — | 4.3 | ❌ No (epic 3 not complete) |
| 6.2   | 6    | Biggest Opportunities & Quick Wins Tables | backlog | #22 | — | — | 6.1 | ❌ No (epic 3 not complete) |
| 6.3   | 6    | CSV Download & CTA | backlog | #23 | — | — | 6.1 | ❌ No (epic 3 not complete) |
| 6.4   | 6    | Mobile & Screen-Share Layout Verification | backlog | #24 | — | — | 6.2, 6.3 | ❌ No (epic 3 not complete) |
| 6.5   | 6    | Expired Report & Fetch Error States | backlog | #25 | — | — | 6.1 | ❌ No (epic 3 not complete) |
| 6.6   | 6    | Accessibility Baseline | backlog | #26 | — | — | 6.4, 6.5 | ❌ No (epic 3 not complete) |
| 7.1   | 7    | Empty Catalog & Auth Failure Path | backlog | #27 | — | — | 3.2, 3.3 | ❌ No (epic 3 not complete) |
| 7.2   | 7    | total_count Mismatch Handling | backlog | #28 | — | — | 3.2 | ❌ No (epic 3 not complete) |
| 7.3   | 7    | P11 Rate Limit & Partial Data Recovery | backlog | #29 | — | — | 3.3 | ❌ No (epic 3 not complete) |
| 8.1   | 8    | Hourly TTL Deletion Cron | backlog | #30 | — | — | 3.5 | ❌ No (epic 3 not complete) |
| 8.2   | 8    | No Listing Endpoint & Cross-Seller Isolation | backlog | #31 | — | — | 4.3 | ❌ No (epic 3 not complete) |

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
- Epic 2 is fully complete — both 2.1 (#35) and 2.2 (#36) merged; retrospective done.
- Epic 3 is the active epic. Stories 3.1–3.6 are all merged (PRs #37–#42).
- **Story 3.6 PR #42 merged on 2026-04-19** — worktree `.worktrees/story-3.6-email-dispatch-via-resend` and remote branch cleaned up.
- **Story 3.7 is now Ready to Work** — all its dependencies (3.2, 3.3, 3.4, 3.5, 3.6) are merged.
- Epic ordering constraint: epics 4–8 may not start until epic 3 is fully merged into main.
- Stories 7.1, 7.2, 7.3 have their direct dependencies met (3.2/3.3 merged) but are blocked by the epic ordering rule (epic 3 not yet complete).
- Parallelization: 3.7 is the final story in epic 3; once 3.7 merges, epic 3 is complete and epic 4 unlocks.
- Once epic 3 completes: 4.1 unblocks; once 4.1 merges: 4.2, 4.3, 5.1 can run in parallel.
- No pending open PRs at this time — all open PRs have been merged.
