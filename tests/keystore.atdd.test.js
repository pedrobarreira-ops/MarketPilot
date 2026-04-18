/**
 * ATDD tests for Story 2.1: keyStore module
 *
 * These tests verify all acceptance criteria from the story spec:
 * AC-1: Exports set/get/delete/has — no other exports
 * AC-2: Backing Map is NOT exported
 * AC-3: No serialisation imports (static source check)
 * AC-4: No .keys() / .entries() enumeration on the backing Map (static)
 * AC-5: api_key never passed into queue.add() calls — no queue import in keyStore (static)
 * FUNCTIONAL: set/get/delete/has behave correctly, keys are isolated per job_id
 *
 * Uses Node.js built-in test runner (node:test) — no extra dependencies needed.
 * Run: node --test tests/keystore.atdd.test.js
 *
 * No live Redis or Mirakl connection required.
 */

import { test, describe, before } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const KEY_STORE_PATH = join(__dirname, '../src/queue/keyStore.js')

// ── helpers ────────────────────────────────────────────────────────────────

/**
 * Strip single-line and block comments from source so static assertions
 * are not falsely triggered by comments mentioning these identifiers.
 */
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

describe('Story 2.1 — keyStore module', async () => {
  let keyStoreModule
  let set, get, del, has

  before(async () => {
    keyStoreModule = await import('../src/queue/keyStore.js')
    set  = keyStoreModule.set
    get  = keyStoreModule.get
    del  = keyStoreModule.delete
    has  = keyStoreModule.has
  })

  // ── AC-1: Exported interface ──────────────────────────────────────────────
  describe('AC-1: exports set, get, delete, has — all functions', () => {
    test('set is exported as a function', () => {
      assert.equal(typeof set, 'function', '"set" must be an exported function')
    })

    test('get is exported as a function', () => {
      assert.equal(typeof get, 'function', '"get" must be an exported function')
    })

    test('delete is exported as a function', () => {
      assert.equal(typeof del, 'function', '"delete" must be an exported function')
    })

    test('has is exported as a function', () => {
      assert.equal(typeof has, 'function', '"has" must be an exported function')
    })
  })

  // ── AC-2: Backing Map is NOT exported ────────────────────────────────────
  describe('AC-2: backing Map is not exported', () => {
    test('no named export is a Map instance', () => {
      const exports = Object.values(keyStoreModule)
      const hasMayExported = exports.some(v => v instanceof Map)
      assert.ok(
        !hasMayExported,
        'No named export may be a Map instance — the backing store must be private'
      )
    })

    test('module default export (if any) is not a Map instance', () => {
      const def = keyStoreModule.default
      if (def !== undefined) {
        assert.ok(
          !(def instanceof Map),
          'Default export must not be the backing Map'
        )
      }
      // If no default export — that is correct behaviour, no assertion needed
    })
  })

  // ── AC-3: No serialisation imports (static) ───────────────────────────────
  describe('AC-3: no serialisation imports in source', () => {
    let src

    before(() => {
      src = codeLines(readFileSync(KEY_STORE_PATH, 'utf8'))
    })

    test('source does not use JSON.stringify', () => {
      assert.ok(
        !src.includes('JSON.stringify'),
        'keyStore.js must not use JSON.stringify — the key must never be serialised'
      )
    })

    test('source does not use JSON.parse', () => {
      assert.ok(
        !src.includes('JSON.parse'),
        'keyStore.js must not use JSON.parse'
      )
    })

    test('source does not import node:fs or fs', () => {
      assert.ok(
        !src.includes("from 'fs'") && !src.includes("from 'node:fs'") && !src.includes("require('fs')"),
        'keyStore.js must not import the fs module'
      )
    })

    test('source does not use writeFile or appendFile', () => {
      assert.ok(
        !src.includes('writeFile') && !src.includes('appendFile'),
        'keyStore.js must not write to disk'
      )
    })
  })

  // ── AC-4: No .keys() / .entries() enumeration (static) ───────────────────
  describe('AC-4: no .keys() or .entries() enumeration on the backing Map', () => {
    let src

    before(() => {
      src = codeLines(readFileSync(KEY_STORE_PATH, 'utf8'))
    })

    test('source does not call .keys() on the Map', () => {
      // We check specifically for Map enumeration patterns
      // A generic .keys() call on a non-map object would be a false positive,
      // but keyStore.js has no business calling .keys() on anything else
      assert.ok(
        !src.includes('.keys()'),
        'keyStore.js must not enumerate .keys() — prevents bulk key extraction'
      )
    })

    test('source does not call .entries() on the Map', () => {
      assert.ok(
        !src.includes('.entries()'),
        'keyStore.js must not enumerate .entries() — prevents bulk key extraction'
      )
    })

    test('source does not call .values() on the Map', () => {
      assert.ok(
        !src.includes('.values()'),
        'keyStore.js must not enumerate .values() — prevents bulk key extraction'
      )
    })

    test('source does not use for...of on the Map', () => {
      // Catch patterns like: for (const [k, v] of _store)
      assert.ok(
        !src.match(/for\s*\(.*of\s+_store/),
        'keyStore.js must not iterate the Map with for...of'
      )
    })
  })

  // ── AC-5: api_key never in queue.add() (static) ───────────────────────────
  describe('AC-5: keyStore.js does not import or use reportQueue', () => {
    let src

    before(() => {
      src = codeLines(readFileSync(KEY_STORE_PATH, 'utf8'))
    })

    test('source does not import reportQueue', () => {
      assert.ok(
        !src.includes('reportQueue'),
        'keyStore.js must not import reportQueue — it is a pure key store'
      )
    })

    test('source does not contain .add( calls', () => {
      assert.ok(
        !src.includes('.add('),
        'keyStore.js must not call queue.add() — api_key must never reach job data'
      )
    })

    test('source does not import bullmq', () => {
      assert.ok(
        !src.includes('bullmq'),
        'keyStore.js must not import BullMQ — no queue coupling'
      )
    })
  })

  // ── FUNCTIONAL: set/get/delete/has behaviour ──────────────────────────────
  describe('FUNCTIONAL: set/get/delete/has operate correctly', () => {
    test('set then get returns the stored api_key', () => {
      set('job-func-1', 'key-abc-123')
      const result = get('job-func-1')
      assert.equal(result, 'key-abc-123', 'get must return the exact value stored by set')
      // Cleanup
      del('job-func-1')
    })

    test('has returns true for a stored job_id', () => {
      set('job-func-2', 'key-xyz')
      assert.equal(has('job-func-2'), true, 'has must return true for a key that was set')
      del('job-func-2')
    })

    test('has returns false for an unknown job_id', () => {
      assert.equal(has('job-nonexistent'), false, 'has must return false for a key that was never set')
    })

    test('get returns undefined for an unknown job_id', () => {
      const result = get('job-nonexistent-get')
      assert.equal(result, undefined, 'get must return undefined for a key that was never set')
    })

    test('delete removes the key — subsequent get returns undefined', () => {
      set('job-func-3', 'to-be-deleted')
      del('job-func-3')
      assert.equal(get('job-func-3'), undefined, 'get must return undefined after delete')
    })

    test('delete removes the key — subsequent has returns false', () => {
      set('job-func-4', 'to-be-deleted-2')
      del('job-func-4')
      assert.equal(has('job-func-4'), false, 'has must return false after delete')
    })

    test('delete on a non-existent key does not throw', () => {
      assert.doesNotThrow(
        () => del('job-never-existed'),
        'delete must not throw for an unknown job_id'
      )
    })

    test('keys are isolated — deleting one job_id does not affect another', () => {
      set('job-iso-a', 'key-for-a')
      set('job-iso-b', 'key-for-b')

      del('job-iso-a')

      assert.equal(get('job-iso-b'), 'key-for-b', 'key for job-iso-b must survive deletion of job-iso-a')
      assert.equal(has('job-iso-b'), true, 'has(job-iso-b) must still be true after deleting job-iso-a')

      // Cleanup
      del('job-iso-b')
    })

    test('set with same job_id overwrites the previous value', () => {
      set('job-overwrite', 'old-key')
      set('job-overwrite', 'new-key')
      assert.equal(get('job-overwrite'), 'new-key', 'set must overwrite the previous value for the same job_id')
      del('job-overwrite')
    })

    test('multiple concurrent job_ids can be stored simultaneously', () => {
      const jobs = [
        { id: 'job-multi-1', key: 'key-1' },
        { id: 'job-multi-2', key: 'key-2' },
        { id: 'job-multi-3', key: 'key-3' },
      ]

      for (const { id, key } of jobs) set(id, key)

      for (const { id, key } of jobs) {
        assert.equal(get(id), key, `get(${id}) must return correct key`)
        assert.equal(has(id), true, `has(${id}) must return true`)
      }

      for (const { id } of jobs) del(id)
    })
  })
})
