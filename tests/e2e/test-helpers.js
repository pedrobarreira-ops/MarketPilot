// tests/e2e/test-helpers.js
// Shared Playwright assertion helpers for Epic 5/6 frontend E2E tests.
//
// Rationale: Epic 6 pages format many numbers and dates in Portuguese (pt-PT)
// locale — comma decimals, dot thousands, "14 de Abril de 2026" style. Rather
// than duplicate brittle regex assertions across every test() block, centralise
// the contract here. If the locale rule ever changes (e.g. we add en-US support
// for ES-only sellers), there's one place to update.
//
// See `tests/e2e/README.md` for the full pattern contract.

import { expect } from '@playwright/test'

/**
 * Assert that a Playwright locator contains a Portuguese-formatted price string.
 *
 * pt-PT locale: decimal separator is ',' and thousands separator is '.'.
 * Currency symbol is '€' (placed after the value with a non-breaking space by
 * default, or before depending on `Intl.NumberFormat` rendering — accept both).
 *
 * Examples:
 *   expectPortuguesePrice(locator, 799)        // matches "799,00 €" or "€ 799,00"
 *   expectPortuguesePrice(locator, 12400.5)    // matches "12.400,50 €"
 *   expectPortuguesePrice(locator, -6.50)      // matches "-6,50 €"
 *
 * @param {import('@playwright/test').Locator} locator — element expected to contain the price
 * @param {number} value — raw numeric value (will be formatted with pt-PT conventions)
 */
export async function expectPortuguesePrice(locator, value) {
  const formatted = new Intl.NumberFormat('pt-PT', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)

  // Intl returns a non-breaking-space between value and symbol (U+00A0). Tolerant match:
  // accept either ASCII space or non-breaking space, and allow symbol before or after.
  // Example outputs across runtimes: "799,00 €", "€ 799,00", "€799,00"
  const valueStr = Math.abs(value)
    .toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const sign = value < 0 ? '-' : ''
  const tolerant = new RegExp(`${sign}${valueStr.replace(/\./g, '\\.')}\\s*€|€\\s*${sign}${valueStr.replace(/\./g, '\\.')}`)

  await expect(locator).toContainText(tolerant, {
    // Context for failure messages: show what the expected formatted value looks like.
    // Playwright prefixes this on the assertion-failed error line.
  }).catch(async (err) => {
    throw new Error(
      `expectPortuguesePrice: expected locator to contain price formatted as "${formatted}" ` +
      `(tolerant match: ${tolerant}) — ${err.message}`,
    )
  })
}

/**
 * Assert that a Playwright locator contains a Portuguese-formatted date string.
 *
 * pt-PT long format: "14 de Abril de 2026" (day + "de" + month-name + "de" + year).
 * Month names are capitalised: Janeiro, Fevereiro, Março, Abril, Maio, Junho,
 * Julho, Agosto, Setembro, Outubro, Novembro, Dezembro.
 *
 * Examples:
 *   expectPortugueseDate(locator, new Date('2026-04-14'))  // matches "14 de Abril de 2026"
 *   expectPortugueseDate(locator, '2026-04-14')            // same
 *
 * @param {import('@playwright/test').Locator} locator — element expected to contain the date
 * @param {Date|string} date — Date object or ISO-8601 date string
 */
export async function expectPortugueseDate(locator, date) {
  const d = date instanceof Date ? date : new Date(date)
  if (isNaN(d.getTime())) {
    throw new Error(`expectPortugueseDate: invalid date argument: ${date}`)
  }

  // Intl.DateTimeFormat output for pt-PT long style: "14 de abril de 2026"
  // (lowercase month name in current ICU). We accept both cases.
  const formatted = new Intl.DateTimeFormat('pt-PT', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(d)

  // Tolerant match: allow lowercase or title-case month name.
  // e.g. "14 de abril de 2026" or "14 de Abril de 2026"
  const day = d.getDate()
  const year = d.getFullYear()
  const monthNames = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
                      'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
  const month = monthNames[d.getMonth()]
  const tolerant = new RegExp(`${day}\\s+de\\s+${month}\\s+de\\s+${year}`, 'i')

  await expect(locator).toContainText(tolerant).catch(async (err) => {
    throw new Error(
      `expectPortugueseDate: expected locator to contain date formatted as "${formatted}" ` +
      `(tolerant match: ${tolerant}) — ${err.message}`,
    )
  })
}

/**
 * Assert that a Playwright locator contains a Portuguese-formatted integer with
 * dot thousands separator. Used for progress-counter displays, stat card numbers,
 * catalog totals, etc.
 *
 * Examples:
 *   expectPortugueseInteger(locator, 31179)   // matches "31.179"
 *   expectPortugueseInteger(locator, 4821)    // matches "4.821" (not "4821")
 *
 * @param {import('@playwright/test').Locator} locator — element expected to contain the number
 * @param {number} value — integer value
 */
export async function expectPortugueseInteger(locator, value) {
  const formatted = value.toLocaleString('pt-PT')
  await expect(locator).toContainText(formatted).catch(async (err) => {
    throw new Error(
      `expectPortugueseInteger: expected locator to contain "${formatted}" (pt-PT locale) — ${err.message}`,
    )
  })
}
