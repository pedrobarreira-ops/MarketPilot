// tests/helpers/skipUnlessImplExists.js
// Helper for pre-emptive ATDD tests generated BEFORE their implementation
// exists. Returns a node:test `options` object that auto-skips the
// describe block when the implementation file isn't found on disk.
//
// Usage — at the top of a pre-emptive test file:
//
//   import { describe } from 'node:test'
//   import { skipIfImplMissing } from './helpers/skipUnlessImplExists.js'
//
//   const skipOpts = skipIfImplMissing(
//     import.meta.url,
//     '../src/email/sendReportEmail.js'
//   )
//
//   describe('Story 3.6 — email dispatch', skipOpts, () => {
//     // tests run only when the impl file exists; otherwise skipped with a reason
//   })
//
// Once the story lands and the impl file is committed, the skip condition
// flips automatically — no manual allowlist editing in package.json.
//
// Why this exists: BAD's Phase 1 Epic-Start Test Design generates ATDD test
// files for every story in an upcoming epic, before their code is written.
// Without this helper, those red tests either (a) break `npm test` in CI or
// (b) force a manual allowlist in package.json that rots as stories land.

import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

/**
 * Return a node:test options object that skips the describe block when
 * the implementation file does not exist.
 *
 * @param {string} testFileUrl - Pass `import.meta.url` from the calling test file
 * @param {string} implRelativePath - Path to the impl file, relative to the test file
 * @returns {{skip?: string}} — spreadable options object for describe()
 */
export function skipIfImplMissing(testFileUrl, implRelativePath) {
  const testDir = dirname(fileURLToPath(testFileUrl))
  const implPath = resolve(testDir, implRelativePath)
  if (!existsSync(implPath)) {
    return { skip: `Pre-emptive test: implementation not found at ${implRelativePath} — skipped until the story implements it` }
  }
  return {}
}
