# Story Dependency Graph
_Last updated: 2026-04-23T00:00:00Z (phase0 reconciliation: PRs #59/#60/#61 merged; 7.1=done, 7.2=done, 7.3=done; epic-7 complete; epic-8 now active; stale worktrees and remote branches for 7.1/7.2/7.3 cleaned)_

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
| 3.5a  | 3    | CSV Formula Injection Hardening | done | #47 | #49 | merged | 3.5 | ✅ Yes (done) |
| 3.6   | 3    | Email Dispatch via Resend | done | #14 | #42 | merged | 3.5 | ✅ Yes (done) |
| 3.7   | 3    | Full Worker Orchestration & Phase Updates | done | #15 | #43 | merged | 3.2, 3.3, 3.4, 3.5, 3.6 | ✅ Yes (done) |
| 4.1   | 4    | POST /api/generate Route | done | #16 | #44 | merged | 1.2, 3.7 | ✅ Yes (done) |
| 4.2   | 4    | GET /api/jobs/:job_id Polling Endpoint | done | #17 | #45 | merged | 4.1 | ✅ Yes (done) |
| 4.2a  | 4    | Polling Progress Contract — Structured Counts | done | #48 | #50 | merged | 4.2, 3.7 | ✅ Yes (done) |
| 4.3   | 4    | GET /api/reports & CSV Routes | done | #18 | #46 | merged | 4.1 | ✅ Yes (done) |
| 5.1   | 5    | form.js — Validation, Loading & Submission | done | #19 | #51 | merged | 4.1 | ✅ Yes (done) |
| 5.2   | 5    | progress.js — Progress Bar, Copy & Redirect | done | #20 | #52 | merged | 5.1 | ✅ Yes (done) |
| 6.1   | 6    | report.js — Data Fetch, Skeleton & Your Position | done | #21 | #53 | merged | 4.3 | ✅ Yes (done) |
| 6.2   | 6    | Biggest Opportunities & Quick Wins Tables | done | #22 | #54 | merged | 6.1 | ✅ Yes (done) |
| 6.3   | 6    | CSV Download & CTA | done | #23 | #55 | merged | 6.1 | ✅ Yes (done) |
| 6.4   | 6    | Mobile & Screen-Share Layout Verification | done | #24 | #57 | merged | 6.2, 6.3 | ✅ Yes (done) |
| 6.5   | 6    | Expired Report & Fetch Error States | done | #25 | #56 | merged | 6.1 | ✅ Yes (done) |
| 6.6   | 6    | Accessibility Baseline | done | #26 | #58 | merged | 6.4, 6.5 | ✅ Yes (done) |
| 7.1   | 7    | Empty Catalog & Auth Failure Path | done | #27 | #60 | merged | 3.2, 3.3 | ✅ Yes (done) |
| 7.2   | 7    | total_count Mismatch Handling | done | #28 | #59 | merged | 3.2 | ✅ Yes (done) |
| 7.3   | 7    | P11 Rate Limit & Partial Data Recovery | done | #29 | #61 | merged | 3.3 | ✅ Yes (done) |
| 8.1   | 8    | Hourly TTL Deletion Cron | backlog | #30 | — | — | 3.5 | ✅ Yes |
| 8.2   | 8    | No Listing Endpoint & Cross-Seller Isolation | backlog | #31 | — | — | 4.3 | ✅ Yes |

## Dependency Chains

- **1.4** depends on: 1.3
- **2.1** depends on: 1.3, 1.4
- **2.2** depends on: 2.1
- **3.1** depends on: 2.2
- **3.2** depends on: 3.1
- **3.3** depends on: 3.1
- **3.4** depends on: 3.2, 3.3
- **3.5** depends on: 3.4
- **3.5a** depends on: 3.5
- **3.6** depends on: 3.5
- **3.7** depends on: 3.2, 3.3, 3.4, 3.5, 3.6
- **4.1** depends on: 1.2, 3.7
- **4.2** depends on: 4.1
- **4.2a** depends on: 4.2, 3.7
- **4.3** depends on: 4.1
- **5.1** depends on: 4.1 (DONE: PR #51 merged 2026-04-20)
- **5.2** depends on: 5.1 (DONE: PR #52 merged 2026-04-20)
- **6.1** depends on: 4.3 (DONE: PR #53 merged 2026-04-21)
- **6.2** depends on: 6.1
- **6.3** depends on: 6.1
- **6.4** depends on: 6.2, 6.3
- **6.5** depends on: 6.1
- **6.6** depends on: 6.4, 6.5
- **7.1** depends on: 3.2, 3.3 (DONE: PR #60 merged 2026-04-22)
- **7.2** depends on: 3.2 (DONE: PR #59 merged 2026-04-22)
- **7.3** depends on: 3.3 (DONE: PR #61 merged 2026-04-22)
- **8.1** depends on: 3.5
- **8.2** depends on: 4.3

## Notes

- **Epics 1–7 are fully complete** — all stories have merged PRs.
- **Epic 7 closed** (2026-04-22): PRs #59 (7.2), #60 (7.1), #61 (7.3) all merged. epic-7 row → done. Retrospective done.
- **Epic 8 is the current epic** — stories 8.1 and 8.2 are both backlog and now unblocked (all epic 1–7 stories done).
- **Stale worktrees cleaned** (2026-04-23): worktrees for 7.1, 7.2, 7.3 pruned; remote branches deleted.
- **8.1 and 8.2 are independent** — can be developed in parallel (MAX_PARALLEL_STORIES=3 allows it).
- **Pending open PRs:** none
