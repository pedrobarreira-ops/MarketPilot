#!/usr/bin/env node
/**
 * End-to-end integration test — runs the full worker pipeline once
 * against the real Worten API, real Redis (via .env REDIS_URL), and
 * real Resend. Must be invoked with `node --env-file=.env` so the
 * imports can read env vars at module-load time.
 *
 * Usage: node --env-file=.env scripts/run-integration-test.js
 *
 * Outputs the 6-point pass/fail spec from
 * `_bmad-output/implementation-artifacts/e2e-integration-test-runbook.md`
 *
 * Since this script imports reportWorker.js, a BullMQ Worker starts
 * inside THIS process — meaning the keyStore set here is the same
 * keyStore the worker reads from. That's why the test can use a real
 * apiKey without it crossing process boundaries.
 */

import { randomUUID } from 'node:crypto'
import * as keyStore from '../src/queue/keyStore.js'
import { reportQueue } from '../src/queue/reportQueue.js'
import * as db from '../src/db/queries.js'
// Importing reportWorker auto-starts the Worker (when NODE_ENV !== 'test')
import { worker } from '../src/workers/reportWorker.js'

// ── Pre-flight ──────────────────────────────────────────────────────────

const required = ['WORTEN_API_KEY', 'WORTEN_BASE_URL', 'REDIS_URL', 'RESEND_API_KEY', 'SQLITE_PATH', 'APP_BASE_URL']
const missing = required.filter(k => !process.env[k])
if (missing.length) {
  console.error('MISSING env vars:', missing.join(', '))
  process.exit(1)
}

if (!worker) {
  console.error('Worker not started — NODE_ENV may be "test". Unset it and retry.')
  process.exit(1)
}

// ── Wait for worker to be ready ─────────────────────────────────────────

console.log('Waiting for Worker to connect to Redis...')
await new Promise((resolve, reject) => {
  const onReady = () => { worker.off('error', onError); resolve() }
  const onError = (err) => { worker.off('ready', onReady); reject(err) }
  worker.once('ready', onReady)
  worker.once('error', onError)
  // If the worker is already ready (race), resolve immediately
  setTimeout(() => { worker.off('error', onError); worker.off('ready', onReady); resolve() }, 3000)
})
console.log('Worker ready.\n')

// ── Set up the job ──────────────────────────────────────────────────────

const job_id = randomUUID()
const report_id = randomUUID()
const email = 'pedro.belchior.barreira@gmail.com'

console.log('=== Integration test ===')
console.log('job_id:    ', job_id)
console.log('report_id: ', report_id)
console.log('email:     ', email)
console.log('marketplace_url:', process.env.WORTEN_BASE_URL)
console.log()

// Seed the job row so updateJobStatus has something to update
db.createJob(job_id, report_id, email, process.env.WORTEN_BASE_URL)

// Store API key in keyStore (worker reads from it)
keyStore.set(job_id, process.env.WORTEN_API_KEY)

// Enqueue
await reportQueue.add('generate', {
  job_id,
  report_id,
  email,
  marketplace_url: process.env.WORTEN_BASE_URL,
})
console.log('Job enqueued. Worker picking it up...\n')

// ── Poll until done ─────────────────────────────────────────────────────

const start = Date.now()
let lastStatus = null
let lastPhaseMessage = null

async function pollOnce() {
  const status = db.getJobStatus(job_id)
  if (!status) return null

  if (status.status !== lastStatus || status.phase_message !== lastPhaseMessage) {
    const elapsed = ((Date.now() - start) / 1000).toFixed(0)
    console.log(`[${elapsed}s] status=${status.status.padEnd(20)} phase="${status.phase_message}"`)
    lastStatus = status.status
    lastPhaseMessage = status.phase_message
  }

  if (status.status === 'complete' || status.status === 'error') return status
  return null
}

const SAFETY_TIMEOUT_MS = 15 * 60 * 1000
let final = null
while (Date.now() - start < SAFETY_TIMEOUT_MS) {
  final = await pollOnce()
  if (final) break
  await new Promise(r => setTimeout(r, 5000))
}

if (!final) {
  console.error('\nTIMEOUT: job did not complete within 15 minutes')
  await worker.close()
  await reportQueue.close()
  process.exit(2)
}

// ── 6-point verification ────────────────────────────────────────────────

const elapsed = ((Date.now() - start) / 1000).toFixed(1)
console.log()
console.log(`=== Job finished in ${elapsed}s ===`)
console.log(`Final status: ${final.status}`)
console.log(`Final phase_message: ${final.phase_message}`)
console.log()
console.log('6-point pass/fail verification:')

let pass = 0
let fail = 0
function check(n, label, ok, detail = '') {
  const mark = ok ? '✓' : '✗'
  console.log(`  ${mark} ${n}. ${label}${detail ? ' — ' + detail : ''}`)
  if (ok) pass++; else fail++
}

// 1. Phase A completed (inferred: if final status is 'complete', all phases including A passed)
check(1, 'Catalog fetch completed without truncation',
  final.status === 'complete',
  final.status === 'complete' ? 'reached "Relatório pronto!"' : `stopped at "${final.phase_message}"`)

const report = db.getReport(report_id, Math.floor(Date.now() / 1000))

// 2. Competitor scan returned non-empty pt/es for at least some EANs
const ptLen = report?.opportunities_pt_json?.length ?? 0
const esLen = report?.opportunities_es_json?.length ?? 0
check(2, 'Competitor scan produced opportunities for at least one channel',
  ptLen > 10 || esLen > 10,
  `pt_json=${ptLen} chars, es_json=${esLen} chars`)

// 3. Report row exists with correct TTL
const ttl = report ? (report.expires_at - report.generated_at) : null
check(3, 'Report persisted with expires_at = generated_at + 172800 (48h)',
  ttl === 172800,
  ttl === null ? 'no report row found' : `actual TTL: ${ttl}s`)

// 4. Email — can only verify manually; mark as PENDING
console.log('  ? 4. Email delivery — verify manually in your inbox (Resend API call completed if job status is complete)')

// 5. keyStore cleaned up after job
check(5, 'keyStore cleaned up after job (finally block ran)',
  !keyStore.has(job_id),
  keyStore.has(job_id) ? 'WARNING: key still in keyStore' : 'key cleared')

// 6. Job status is complete (redundant with #1 but explicit per spec)
check(6, 'generation_jobs.status === complete',
  final.status === 'complete',
  final.status)

console.log()
console.log(`Summary: ${pass} automated checks passed, ${fail} failed (check #4 = manual email verification)`)
console.log()

if (final.status === 'complete' && fail === 0) {
  console.log('✅ Pipeline is working end-to-end. Check your inbox for the email.')
  console.log('   Subject: "O teu relatório MarketPilot está pronto"')
  console.log(`   Sender:  ${process.env.RESEND_FROM}`)
} else {
  console.log('❌ Integration test failed. See phase_message above for debugging.')
}

await worker.close()
await reportQueue.close()
process.exit(final.status === 'complete' && fail === 0 ? 0 : 1)
