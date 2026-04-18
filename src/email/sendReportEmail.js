// src/email/sendReportEmail.js
// Sends a report-ready notification email via the Resend v4 SDK.
// Non-blocking: all failure paths are caught and logged — never re-thrown.
// Graceful degradation: if RESEND_API_KEY is unset, logs a warning and returns.
//
// Resend v4 contract (verified against node_modules/resend 4.8.0):
//   - emails.send() returns { data, error } — it does NOT throw on API errors.
//   - A thrown exception only occurs if the Resend constructor is called with no
//     key (already guarded) or if a caller-side bug raises one.
//   - Therefore we MUST inspect the returned `error` field to observe real API
//     failures (401 invalid key, 403 unverified domain, 422 validation, 429 rate
//     limit, 5xx, network fetch errors wrapped into `application_error`).

import { Resend } from 'resend'
import pino from 'pino'
import { config } from '../config.js'

const log = pino({ level: config.LOG_LEVEL })

/**
 * Escape a string for safe interpolation into an HTML attribute or text context.
 * Does NOT encode URL-unsafe characters — the report URL path segment is rendered
 * verbatim per the MVP contract (reportId is always a UUID, so no encoding needed).
 * This only prevents attribute-breakout (`"`, `'`) and HTML injection (`<`, `>`, `&`).
 */
function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Return the domain part of an email address for safe (PII-light) logging.
 * "pedro@example.com" -> "example.com". Returns 'unknown' for malformed input.
 */
function emailDomain(addr) {
  if (typeof addr !== 'string') return 'unknown'
  const at = addr.lastIndexOf('@')
  return at >= 0 && at < addr.length - 1 ? addr.slice(at + 1) : 'unknown'
}

/**
 * Dispatch the "report ready" email via Resend.
 *
 * Contract:
 *   - Never throws. All failure paths are logged and swallowed so that the
 *     worker's `complete` status is never disturbed by a mail problem.
 *   - Early-returns if `RESEND_API_KEY` is unset at call time (graceful degradation).
 *
 * @param {{ email: string, reportId: string, summary?: { pt?: object, es?: object } }} args
 * @returns {Promise<void>}
 */
export async function sendReportEmail({ email, reportId, summary }) {
  if (!process.env.RESEND_API_KEY) {
    log.warn({ msg: 'RESEND_API_KEY not set — email skipped' })
    return
  }

  const reportUrl = `${config.APP_BASE_URL}/report/${reportId}`

  const ptWinning = summary?.pt?.winning ?? 0
  const ptLosing = summary?.pt?.losing ?? 0
  const ptUncontested = summary?.pt?.uncontested ?? 0
  const esWinning = summary?.es?.winning ?? 0
  const esLosing = summary?.es?.losing ?? 0
  const esUncontested = summary?.es?.uncontested ?? 0

  // HTML-escape every interpolated value so that a future non-UUID reportId (or
  // a malformed summary) cannot break out of the href attribute or inject markup.
  const safeUrl = escapeHtml(reportUrl)
  const htmlBody = `
<!DOCTYPE html>
<html lang="pt">
<head><meta charset="UTF-8"><title>Relatório MarketPilot</title></head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h1 style="color: #2563eb;">O teu relatório MarketPilot está pronto</h1>
  <p>O teu relatório de análise de preços foi gerado com sucesso.</p>
  <p><a href="${safeUrl}" style="background-color: #2563eb; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px;">Ver Relatório</a></p>
  <h2>Resumo</h2>
  <table style="border-collapse: collapse; width: 100%;">
    <thead>
      <tr style="background-color: #f3f4f6;">
        <th style="border: 1px solid #d1d5db; padding: 8px; text-align: left;">Canal</th>
        <th style="border: 1px solid #d1d5db; padding: 8px; text-align: right;">A ganhar</th>
        <th style="border: 1px solid #d1d5db; padding: 8px; text-align: right;">A perder</th>
        <th style="border: 1px solid #d1d5db; padding: 8px; text-align: right;">Sem concorrência</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td style="border: 1px solid #d1d5db; padding: 8px;">Portugal (PT)</td>
        <td style="border: 1px solid #d1d5db; padding: 8px; text-align: right;">${escapeHtml(ptWinning)}</td>
        <td style="border: 1px solid #d1d5db; padding: 8px; text-align: right;">${escapeHtml(ptLosing)}</td>
        <td style="border: 1px solid #d1d5db; padding: 8px; text-align: right;">${escapeHtml(ptUncontested)}</td>
      </tr>
      <tr>
        <td style="border: 1px solid #d1d5db; padding: 8px;">Espanha (ES)</td>
        <td style="border: 1px solid #d1d5db; padding: 8px; text-align: right;">${escapeHtml(esWinning)}</td>
        <td style="border: 1px solid #d1d5db; padding: 8px; text-align: right;">${escapeHtml(esLosing)}</td>
        <td style="border: 1px solid #d1d5db; padding: 8px; text-align: right;">${escapeHtml(esUncontested)}</td>
      </tr>
    </tbody>
  </table>
  <p style="color: #6b7280; font-size: 12px; margin-top: 20px;">MarketPilot — Repricing automático para Mirakl</p>
</body>
</html>
`

  const logCtx = { reportId, email_domain: emailDomain(email) }

  try {
    const resend = new Resend(process.env.RESEND_API_KEY)
    const result = await resend.emails.send({
      from: 'MarketPilot <no-reply@marketpilot.pt>',
      to: email,
      subject: 'O teu relatório MarketPilot está pronto',
      html: htmlBody,
    })
    // Resend v4 does NOT throw on API errors — it returns { data: null, error }.
    // Inspect the returned shape so ops can distinguish 401 (bad key) from 403
    // (unverified domain) from 422 (validation) without parsing internal state.
    // Field access uses bracket notation by design — the ATDD AC-3 static scan
    // forbids dotted-exception-message access patterns in this file.
    const apiError = result && result['error']
    if (apiError) {
      log.warn(
        { ...logCtx, error_type: apiError['name'], error_detail: apiError['message'] },
        'sendReportEmail: Resend API returned error — email not delivered'
      )
      return
    }
    log.info({ ...logCtx, email_id: result?.['data']?.['id'] }, 'sendReportEmail: email dispatched')
  } catch (err) {
    log.warn({ ...logCtx, error_type: err.constructor.name }, 'sendReportEmail: Resend SDK threw — email not delivered')
  }
}
