// src/config.js
// Validates all required environment variables at startup.
// Import this module early in server.js — if it throws, the server should not start.

const required = [
  'REDIS_URL',
  'SQLITE_PATH',
  'APP_BASE_URL',
  'WORTEN_BASE_URL',
]

const missing = required.filter(key => !process.env[key])
if (missing.length > 0) {
  throw new Error(
    `Missing required environment variables: ${missing.join(', ')}\n` +
    `Copy .env.example to .env and fill in all values.`
  )
}

const urlVars = ['REDIS_URL', 'APP_BASE_URL', 'WORTEN_BASE_URL']
for (const key of urlVars) {
  try {
    new URL(process.env[key])
  } catch {
    throw new Error(`${key} is not a valid URL: ${process.env[key]}`)
  }
}

const port = parseInt(process.env.PORT || '3000', 10)
if (Number.isNaN(port) || port < 1 || port > 65535) {
  throw new Error(`PORT must be a number between 1 and 65535 (got: ${process.env.PORT})`)
}

const validLogLevels = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']
const logLevel = process.env.LOG_LEVEL || 'info'
if (!validLogLevels.includes(logLevel)) {
  throw new Error(`LOG_LEVEL must be one of: ${validLogLevels.join(', ')} (got: ${logLevel})`)
}

// RESEND_API_KEY is optional. Treat the .env.example placeholder as unset so the
// app starts with emails disabled rather than failing with 401 at send time.
const resendKey = process.env.RESEND_API_KEY
const resendConfigured = resendKey && resendKey !== 're_your_key_here'

export const config = {
  PORT: port,
  NODE_ENV: process.env.NODE_ENV || 'development',
  REDIS_URL: process.env.REDIS_URL,
  SQLITE_PATH: process.env.SQLITE_PATH,
  RESEND_API_KEY: resendConfigured ? resendKey : null,
  APP_BASE_URL: process.env.APP_BASE_URL,
  WORTEN_BASE_URL: process.env.WORTEN_BASE_URL,
  LOG_LEVEL: logLevel,
}
