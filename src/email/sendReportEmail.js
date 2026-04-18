// src/email/sendReportEmail.js
// Sends a report-ready notification email via the Resend v4 SDK.
// Non-blocking: exceptions are caught and logged (type only) — never re-thrown.
// Graceful degradation: if RESEND_API_KEY is unset, logs a warning and returns.

import { Resend } from 'resend'
import pino from 'pino'
import { config } from '../config.js'

const log = pino({ level: config.LOG_LEVEL })

export async function sendReportEmail({ email, reportId, summary }) {
  if (!process.env.RESEND_API_KEY) {
    log.warn({ msg: 'RESEND_API_KEY not set — email skipped' })
    return
  }

  const resend = new Resend(process.env.RESEND_API_KEY)

  const reportUrl = `${config.APP_BASE_URL}/report/${reportId}`

  const ptWinning = summary?.pt?.winning ?? 0
  const ptLosing = summary?.pt?.losing ?? 0
  const ptUncontested = summary?.pt?.uncontested ?? 0
  const esWinning = summary?.es?.winning ?? 0
  const esLosing = summary?.es?.losing ?? 0
  const esUncontested = summary?.es?.uncontested ?? 0

  const htmlBody = `
<!DOCTYPE html>
<html lang="pt">
<head><meta charset="UTF-8"><title>Relatório MarketPilot</title></head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h1 style="color: #2563eb;">O teu relatório MarketPilot está pronto</h1>
  <p>O teu relatório de análise de preços foi gerado com sucesso.</p>
  <p><a href="${reportUrl}" style="background-color: #2563eb; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px;">Ver Relatório</a></p>
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
        <td style="border: 1px solid #d1d5db; padding: 8px; text-align: right;">${ptWinning}</td>
        <td style="border: 1px solid #d1d5db; padding: 8px; text-align: right;">${ptLosing}</td>
        <td style="border: 1px solid #d1d5db; padding: 8px; text-align: right;">${ptUncontested}</td>
      </tr>
      <tr>
        <td style="border: 1px solid #d1d5db; padding: 8px;">Espanha (ES)</td>
        <td style="border: 1px solid #d1d5db; padding: 8px; text-align: right;">${esWinning}</td>
        <td style="border: 1px solid #d1d5db; padding: 8px; text-align: right;">${esLosing}</td>
        <td style="border: 1px solid #d1d5db; padding: 8px; text-align: right;">${esUncontested}</td>
      </tr>
    </tbody>
  </table>
  <p style="color: #6b7280; font-size: 12px; margin-top: 20px;">MarketPilot — Repricing automático para Mirakl</p>
</body>
</html>
`

  try {
    await resend.emails.send({
      from: 'MarketPilot <no-reply@marketpilot.pt>',
      to: email,
      subject: 'O teu relatório MarketPilot está pronto',
      html: htmlBody,
    })
  } catch (err) {
    log.warn({ error_type: err.constructor.name }, 'sendReportEmail: Resend API call failed — email not delivered')
  }
}
