# End-to-End Integration Test Runbook

**When to run:** Before Story 4.1 ships (`POST /api/generate`). This is the critical-path item #3 from the Epic 3 retrospective. The full pipeline has never executed with real components; 4.1 exposes it to real users.

**Duration:** ~30 minutes.

**Prerequisites:**
- Real Worten Mirakl API key in `.env` (`WORTEN_API_KEY`)
- `WORTEN_BASE_URL=https://marketplace.worten.pt`
- Redis running locally (or reachable via `REDIS_URL`)
- `RESEND_API_KEY` set, `no-reply@marketpilot.pt` domain verified in Resend
- `APP_BASE_URL` set (e.g. `http://localhost:3000` for local)
- `SQLITE_PATH` set to a writable path (e.g. `./data/marketpilot.db`)

---

## What you're testing

The full worker pipeline A → B → C → D → E against Gabriel's real Worten catalog. 336 unit/ATDD tests pass but none of them have exercised the real chain with live Mirakl + Redis + Resend.

Likely failure modes this catches:
- Redis connection misconfigured → worker can't dequeue
- Resend sender domain not DNS-verified → email 403 at runtime
- Drizzle migrations fail on a real SQLite file (permissions, path)
- Real catalog (31,000+ products) hits timeouts we haven't measured
- Real P11 rate limits lower than assumed → scan fails mid-run
- Env variable missing from `.env.example`

---

## Execute

### 1. Preflight — sanity-check infrastructure

```bash
# Confirm Node is 22+, deps installed
node --version    # expect v22.x or higher
npm ci

# Confirm .env is populated
cat .env | grep -E "WORTEN_API_KEY|WORTEN_BASE_URL|REDIS_URL|RESEND_API_KEY|APP_BASE_URL|SQLITE_PATH"

# Confirm Redis is up
redis-cli ping    # expect PONG

# Confirm the probe still passes (quick smoke test — ~10 seconds)
node scripts/mcp-probe.js
# Expect: OF21 returns offers; P11-B (product_references) returns products
```

If any preflight fails, fix before continuing. Do not proceed with a broken prereq.

### 2. Run a real job end-to-end

Start the server (which also starts the worker in the same process):

```bash
node src/server.js
```

In a second terminal, enqueue a job manually (Epic 4.1 doesn't exist yet, so we use a direct helper):

```bash
node -e "
import('./src/queue/reportQueue.js').then(async ({ reportQueue }) => {
  const { randomUUID } = await import('node:crypto')
  await import('./src/queue/keyStore.js').then(ks => {
    const job_id = randomUUID()
    const report_id = randomUUID()
    ks.set(job_id, process.env.WORTEN_API_KEY)
    reportQueue.add('generate', {
      job_id,
      report_id,
      email: 'pedro.belchior.barreira@gmail.com',
      marketplace_url: process.env.WORTEN_BASE_URL,
    })
    console.log('Enqueued:', { job_id, report_id })
  })
})
"
```

Watch the server logs. The worker will execute Phase A → B → C → D → E in sequence. Expect phase_message updates logged at each transition.

### 3. The 6-point pass/fail spec

Every item must be ✓ for the test to pass. Any ✗ → stop, debug, re-run.

1. **Catalog fetch completes without truncation error**
   - Check logs: no `CatalogTruncationError` thrown
   - Check DB:
     ```bash
     sqlite3 ./data/marketpilot.db "SELECT status, phase_message FROM generation_jobs WHERE job_id='<job_id>'"
     ```
     Expect intermediate `phase_message` like `A obter catálogo… (N de M produtos)`

2. **Competitor scan returns non-empty pt/es buckets for at least some EANs**
   - Not directly queryable from DB (competitors data is consumed in-memory), but indirectly verifiable:
   - After the job completes, check `reports.opportunities_pt_json` and `reports.opportunities_es_json` — at least one should be a non-empty JSON array for Gabriel's catalog
     ```bash
     sqlite3 ./data/marketpilot.db "SELECT length(opportunities_pt_json), length(opportunities_es_json) FROM reports WHERE report_id='<report_id>'"
     ```
     Expect both > 50 (empty JSON array `[]` is length 2)

3. **Report row appears in `reports` with correct `expires_at`**
   ```bash
   sqlite3 ./data/marketpilot.db "SELECT generated_at, expires_at, (expires_at - generated_at) AS ttl FROM reports WHERE report_id='<report_id>'"
   ```
   Expect `ttl = 172800` (exactly 48 hours in seconds).

4. **Email arrives in your inbox**
   - Within ~5 minutes after job completes
   - Subject: `"O teu relatório MarketPilot está pronto"`
   - Body contains a link to `${APP_BASE_URL}/report/${report_id}`
   - Body contains the per-channel summary counts (PT and ES winning/losing/uncontested)

5. **`keyStore.has(job_id)` returns false after the job completes**
   - The `finally` block in `processJob` must run `keyStore.delete(job_id)`. Verify:
   ```bash
   node -e "import('./src/queue/keyStore.js').then(ks => console.log('has:', ks.has('<job_id>')))"
   ```
   Expect `has: false`.

6. **`generation_jobs.status === 'complete'` after the job finishes**
   ```bash
   sqlite3 ./data/marketpilot.db "SELECT status, phase_message, completed_at FROM generation_jobs WHERE job_id='<job_id>'"
   ```
   Expect `status='complete'`, `phase_message='Relatório pronto!'`, `completed_at` populated.

---

## If something fails

For each failure mode, the fix is different:

| Symptom | Likely cause | Fix |
|---|---|---|
| Worker never dequeues | Redis unreachable | Check `REDIS_URL`; verify `redis-cli ping` |
| Phase A crashes with `EmptyCatalogError` | Wrong API key, or Worten shop inactive | Verify API key in Worten portal |
| Phase A crashes with `CatalogTruncationError` | OF21 dropping pages under load | Check `max=100` + `offset` params; retry |
| Phase B returns 0 competitors for every EAN | MCP drift — check forbidden patterns in `scripts/mcp-probe.js` output | See `.claude/skills/bad-review/references/mcp-forbidden-patterns.md` |
| Phase D fails with "no such table: reports" | Drizzle migrations didn't run at server start | Import chain issue; check `src/db/queries.js` runs `runMigrations()` at import |
| Email doesn't arrive | Resend 403 (domain not verified) OR `RESEND_API_KEY` missing/wrong | Check Resend dashboard; check `.env` |
| `keyStore.has(job_id) === true` after | `finally` block not running | Code regression in `reportWorker.js`; `try/finally` structure broken |
| Job status != 'complete' after | Phase E threw (and was caught, so status should be 'error' with safe message) | Check `generation_jobs.error_message` for Portuguese user-safe text |

For anything else: capture the log output, check the specific phase message on failure, and debug from there. Do not ship 4.1 until all 6 points pass.

---

## When all 6 points pass

You have real proof the full pipeline works end-to-end against real Worten + Redis + Resend with Gabriel's real catalog. Ship 4.1 with confidence.

Also worth doing:
- Note the actual duration of phases A-E for Gabriel's 31k-product catalog. This tells you whether the NFR-P3 budget (`< 10 min` for 5,001–31,000 SKUs) holds in reality.
- Note the email delivery latency (time from `status=complete` to inbox). Verifies NFR-R3 (within 5 min).
- Take a screenshot of the final generation_jobs + reports rows for the retro artifact — "first real report" milestone.

Once this test is clean, Story 4.1 creates a user-facing `POST /api/generate` that does exactly what you just did manually. The worker it hands off to is the same worker you just verified works.
