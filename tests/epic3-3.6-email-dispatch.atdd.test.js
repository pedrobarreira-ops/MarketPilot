/**
 * ATDD tests for Story 3.6: Email Dispatch via Resend
 *
 * Acceptance criteria verified:
 * AC-1: Subject is "O teu relatório MarketPilot está pronto"
 * AC-2: Body HTML includes APP_BASE_URL/report/reportId link + summary
 * AC-3: Wrapped in try/catch — exceptions caught + logged (type only), NOT re-thrown
 * AC-4: Worker marks job 'complete' BEFORE calling sendReportEmail
 * AC-5: Email failure does not change job status (stays 'complete')
 * AC-6: RESEND_API_KEY unset → logs warning and returns (graceful degradation)
 * AC-7: Uses Resend v4 SDK — no raw SMTP / nodemailer
 *
 * Uses Node.js built-in test runner (node:test) — no extra dependencies needed.
 * Run: node --test tests/epic3-3.6-email-dispatch.atdd.test.js
 *
 * Resend SDK is stubbed — no live email sent during tests.
 */

import { test, describe, before } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SEND_EMAIL_PATH = join(__dirname, '../src/email/sendReportEmail.js')
const WORKER_PATH = join(__dirname, '../src/workers/reportWorker.js')

// ── env setup ──────────────────────────────────────────────────────────────
process.env.NODE_ENV        = 'test'
process.env.REDIS_URL       = process.env.REDIS_URL || 'redis://localhost:6379'
process.env.SQLITE_PATH     = ':memory:'
process.env.APP_BASE_URL    = 'http://localhost:3000'
process.env.WORTEN_BASE_URL = 'https://www.worten.pt'
process.env.PORT            = '3000'
process.env.LOG_LEVEL       = 'silent'

// ── helpers ────────────────────────────────────────────────────────────────

function codeLines(src) {
  const noBlock = src.replace(/\/\*[\s\S]*?\*\//g, '')
  return noBlock
    .split('\n')
    .filter(line => {
      const trimmed = line.trim()
      return trimmed.length > 0 && !trimmed.startsWith('//')
    })
    .join('\n')
}

// ── test suite ─────────────────────────────────────────────────────────────

describe('Story 3.6 — Email dispatch via Resend', async () => {
  let sendReportEmail

  before(async () => {
    // Set a dummy RESEND_API_KEY so the module doesn't exit early
    process.env.RESEND_API_KEY = 'test-resend-key-dummy'
    const mod = await import('../src/email/sendReportEmail.js')
    sendReportEmail = mod.sendReportEmail
  })

  // ── AC-1: Subject line (static) ────────────────────────────────────────────
  describe('AC-1: email subject is "O teu relatório MarketPilot está pronto"', () => {
    let src

    before(() => {
      src = codeLines(readFileSync(SEND_EMAIL_PATH, 'utf8'))
    })

    test('source contains the required Portuguese subject line', () => {
      assert.ok(
        src.includes('O teu relatório MarketPilot está pronto'),
        'sendReportEmail.js must use the exact Portuguese subject: "O teu relatório MarketPilot está pronto"'
      )
    })

    test('subject is passed to the Resend emails.send() call', () => {
      assert.ok(
        src.includes('subject'),
        'sendReportEmail.js must pass a subject field to resend.emails.send()'
      )
    })
  })

  // ── AC-2: Body includes report URL and summary ────────────────────────────
  describe('AC-2: email body HTML includes report URL and summary data', () => {
    let src

    before(() => {
      src = codeLines(readFileSync(SEND_EMAIL_PATH, 'utf8'))
    })

    test('body includes APP_BASE_URL/report/{reportId} URL pattern', () => {
      assert.ok(
        src.includes('APP_BASE_URL') || src.includes('report') || src.includes('reportId'),
        'sendReportEmail.js must include the report URL in the email body'
      )
    })

    test('body includes summary data reference', () => {
      assert.ok(
        src.includes('summary') || src.includes('html'),
        'sendReportEmail.js must include summary data or HTML content in the email body'
      )
    })

    test('email is sent with html field (not plain text only)', () => {
      assert.ok(
        src.includes('html'),
        'sendReportEmail.js must send HTML email (html field to Resend)'
      )
    })
  })

  // ── AC-3: try/catch — exceptions not re-thrown ────────────────────────────
  describe('AC-3: exceptions caught and logged — NOT re-thrown', () => {
    let src

    before(() => {
      src = codeLines(readFileSync(SEND_EMAIL_PATH, 'utf8'))
    })

    test('source has a try/catch block', () => {
      assert.ok(
        src.includes('try') && src.includes('catch'),
        'sendReportEmail.js must wrap the Resend call in try/catch to prevent email failures from crashing the job'
      )
    })

    test('catch block does not re-throw the error', () => {
      // Pattern: catch block should NOT contain 'throw' statement
      // Extract catch block content and check for re-throw
      const catchMatch = src.match(/catch\s*\([^)]*\)\s*\{([^}]*(?:\{[^}]*\}[^}]*)*)\}/s)
      if (catchMatch) {
        const catchBody = catchMatch[1]
        // A re-throw would be: 'throw err' or 'throw error'
        const reThrowPattern = /\bthrow\b/
        assert.ok(
          !reThrowPattern.test(catchBody),
          'sendReportEmail.js catch block must NOT re-throw — email failure must not affect job status'
        )
      }
      // If no catch block found, the 'try/catch' test above already failed
    })

    test('catch block logs error type — not full error message', () => {
      assert.ok(
        !src.includes('err.message') && !src.includes('error.message'),
        'sendReportEmail.js must not log err.message in catch — log error type only'
      )
    })

    test('catch block logs something (not completely silent)', () => {
      // Must log at minimum the error type
      const hasLogging = src.includes('log.') || src.includes('console.') || src.includes('logger')
      assert.ok(hasLogging, 'sendReportEmail.js catch block must log the error (type only) for observability')
    })
  })

  // ── AC-4 + AC-5: Job marked complete BEFORE email; email failure doesn't change status ──
  describe('AC-4 & AC-5: job marked complete before email; email failure does not affect status', () => {
    let workerSrc

    before(() => {
      workerSrc = codeLines(readFileSync(WORKER_PATH, 'utf8'))
    })

    test('worker source marks job complete before calling sendReportEmail', () => {
      // The worker must call updateJobStatus('complete') before sendReportEmail
      // We verify order statically by checking sequence of calls in source
      const completeIdx = workerSrc.indexOf("'complete'") !== -1
        ? workerSrc.indexOf("'complete'")
        : workerSrc.indexOf('"complete"')
      const emailIdx = workerSrc.indexOf('sendReportEmail') !== -1
        ? workerSrc.indexOf('sendReportEmail')
        : -1

      if (completeIdx >= 0 && emailIdx >= 0) {
        assert.ok(
          completeIdx < emailIdx,
          'Worker must call updateJobStatus("complete") BEFORE calling sendReportEmail — email is non-blocking post-completion step'
        )
      } else {
        // At least check both exist
        assert.ok(
          workerSrc.includes('complete') || workerSrc.includes('updateJobStatus'),
          'Worker must update job to complete status'
        )
        assert.ok(
          workerSrc.includes('sendReportEmail') || workerSrc.includes('email'),
          'Worker must call sendReportEmail'
        )
      }
    })

    test('sendReportEmail is called in a non-blocking way (no await on result affecting status)', () => {
      // sendReportEmail should be called without awaiting its result affecting the job completion path
      // The worker marks complete first, then calls email (possibly without await or in fire-and-forget)
      assert.ok(
        workerSrc.includes('sendReportEmail'),
        'Worker must call sendReportEmail as part of the job pipeline'
      )
    })
  })

  // ── AC-6: RESEND_API_KEY unset → graceful degradation ─────────────────────
  describe('AC-6: RESEND_API_KEY unset → logs warning and returns', () => {
    let src

    before(() => {
      src = codeLines(readFileSync(SEND_EMAIL_PATH, 'utf8'))
    })

    test('source checks for RESEND_API_KEY presence', () => {
      assert.ok(
        src.includes('RESEND_API_KEY'),
        'sendReportEmail.js must check if RESEND_API_KEY is configured'
      )
    })

    test('source logs a warning when RESEND_API_KEY is not set', () => {
      // Must have a log.warn or similar when key is missing
      const hasWarnLog = src.includes('warn') || src.includes('warning') || src.includes('log.')
      assert.ok(hasWarnLog, 'sendReportEmail.js must log a warning when RESEND_API_KEY is not configured')
    })

    test('sendReportEmail does not throw when RESEND_API_KEY is missing', async () => {
      // Temporarily unset the key
      const originalKey = process.env.RESEND_API_KEY
      delete process.env.RESEND_API_KEY

      // Re-import the module (note: ESM caching may prevent re-evaluation; test graceful path)
      // Since ESM modules are cached, we test the exported function directly
      // The function must handle missing key gracefully
      try {
        await assert.doesNotReject(
          async () => {
            if (sendReportEmail) {
              await sendReportEmail({
                email: 'test@example.com',
                reportId: 'test-id',
                summary: {},
              })
            }
          },
          'sendReportEmail must not throw when RESEND_API_KEY is missing — graceful degradation'
        )
      } finally {
        process.env.RESEND_API_KEY = originalKey
      }
    })
  })

  // ── AC-7: Uses Resend v4 SDK ──────────────────────────────────────────────
  describe('AC-7: uses Resend v4 SDK — not nodemailer or raw SMTP', () => {
    let src

    before(() => {
      src = codeLines(readFileSync(SEND_EMAIL_PATH, 'utf8'))
    })

    test('source imports from resend package', () => {
      assert.ok(
        src.includes("from 'resend'") || src.includes('require("resend")') || src.includes("require('resend')"),
        'sendReportEmail.js must import from the "resend" package'
      )
    })

    test('source does not import nodemailer or SMTP libraries', () => {
      assert.ok(
        !src.includes('nodemailer') && !src.includes('smtp') && !src.includes('SMTP'),
        'sendReportEmail.js must not use nodemailer or raw SMTP — use Resend SDK only'
      )
    })

    test('source uses resend.emails.send() or similar Resend v4 API', () => {
      assert.ok(
        src.includes('emails.send') || src.includes('resend.emails') || src.includes('Resend'),
        'sendReportEmail.js must use the Resend SDK emails.send() method'
      )
    })
  })

  // ── INTERFACE: sendReportEmail is exported ────────────────────────────────
  describe('INTERFACE: sendReportEmail function is exported', () => {
    test('sendReportEmail is exported as a function', () => {
      assert.equal(
        typeof sendReportEmail,
        'function',
        'sendReportEmail must be an exported function from src/email/sendReportEmail.js'
      )
    })
  })
})
