// tests/helpers/log-capture.js
// Runtime log-capture helper for NFR-S2 (api_key never logged) invariant tests.
//
// Why this exists: the grep-on-source pattern used across Epic 3/7 ATDDs catches
// only literal "api_key" text in log call sites. It misses aliased leaks
// (const k = apiKey; log.info({k})), object-spread leaks (log.info({...payload})),
// and template-literal interpolation. Runtime capture spies every channel the
// workers can log through and asserts the sentinel key value never appears —
// catching every leak class in one helper.
//
// Strategy: replace process.stdout.write / process.stderr.write / console.*
// methods with capturing wrappers during fn execution. Passes output through to
// the originals so test-runner output is not swallowed. Restores on completion
// (success or throw).

const CONSOLE_METHODS = ['log', 'warn', 'error', 'info', 'debug']

/**
 * Run `fn` while capturing all log output routed through stdout, stderr, and
 * console.*. Returns { captured, value } — captured is an array of entries,
 * value is fn's return value.
 *
 * @param {Function} fn - Sync or async function to execute under capture.
 * @returns {Promise<{captured: Array, value: any}>}
 */
export async function captureLogs (fn) {
  const captured = []

  const origStdout = process.stdout.write.bind(process.stdout)
  const origStderr = process.stderr.write.bind(process.stderr)
  const origConsole = {}
  for (const m of CONSOLE_METHODS) origConsole[m] = console[m]

  process.stdout.write = (chunk, ...rest) => {
    captured.push({ channel: 'stdout', chunk: String(chunk) })
    return origStdout(chunk, ...rest)
  }
  process.stderr.write = (chunk, ...rest) => {
    captured.push({ channel: 'stderr', chunk: String(chunk) })
    return origStderr(chunk, ...rest)
  }
  for (const m of CONSOLE_METHODS) {
    console[m] = (...args) => { captured.push({ channel: `console.${m}`, args }) }
  }

  const restore = () => {
    process.stdout.write = origStdout
    process.stderr.write = origStderr
    for (const m of CONSOLE_METHODS) console[m] = origConsole[m]
  }

  try {
    const value = await fn()
    restore()
    return { captured, value }
  } catch (err) {
    restore()
    throw err
  }
}

/**
 * Assert that `secret` (a string) does not appear anywhere in the captured
 * entries. Throws a descriptive error listing the full capture on violation.
 *
 * @param {Array} captured - Output of captureLogs().captured
 * @param {string} secret - Substring that must NOT appear in captured output
 * @param {string} [label] - Human-readable scenario label for the error message
 */
export function assertNoSecretInCaptured (captured, secret, label = 'captured logs') {
  const stringified = captured.map(c => {
    if (c.chunk !== undefined) return c.chunk
    return c.args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ')
  }).join('\n')
  if (stringified.includes(secret)) {
    throw new Error(
      `${label}: sentinel "${secret}" appeared in log output — NFR-S2 violation.\n` +
      `Full capture:\n${stringified}`
    )
  }
}
