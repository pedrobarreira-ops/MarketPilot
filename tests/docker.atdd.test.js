/**
 * ATDD tests for Story 1.5: Docker and Coolify Deployment Config
 *
 * These tests verify acceptance criteria from the story spec by inspecting
 * file contents — no Docker daemon required, CI-safe.
 *
 * AC-1: Dockerfile exists with correct base image, CMD, USER, EXPOSE
 * AC-2: docker-compose.yml exists with redis:7-alpine, sqlite_data volume, /data mount, healthcheck
 * AC-3: .dockerignore exists and excludes .env and node_modules/
 * AC-4: src/server.js contains SIGTERM and SIGINT listeners
 * AC-5: src/server.js contains fs.existsSync(PUBLIC_DIR) guard
 *
 * Uses Node.js built-in test runner (node:test) — no extra dependencies needed.
 * Run: node --test tests/docker.atdd.test.js
 */

// ── env setup ──────────────────────────────────────────────────────────────
// Set required env vars before any imports that touch config.js
process.env.REDIS_URL       = process.env.REDIS_URL       || 'redis://localhost:6379'
process.env.SQLITE_PATH     = process.env.SQLITE_PATH     || '/tmp/test.db'
process.env.APP_BASE_URL    = process.env.APP_BASE_URL    || 'http://localhost:3000'
process.env.WORTEN_BASE_URL = process.env.WORTEN_BASE_URL || 'https://www.worten.pt'
process.env.PORT            = process.env.PORT            || '3000'
process.env.LOG_LEVEL       = 'silent'

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')

// ── helper ─────────────────────────────────────────────────────────────────
function readFile(relPath) {
  const abs = path.join(ROOT, relPath)
  if (!fs.existsSync(abs)) return null
  return fs.readFileSync(abs, 'utf8')
}

// ── test suites ────────────────────────────────────────────────────────────

describe('Story 1.5 — Docker and Coolify Deployment Config', () => {

  // ── AC-1: Dockerfile ──────────────────────────────────────────────────────
  describe('AC-1: Dockerfile exists with correct configuration', () => {
    test('Dockerfile exists', () => {
      const content = readFile('Dockerfile')
      assert.ok(content !== null, 'Dockerfile must exist at repo root')
    })

    test('Dockerfile uses node:22-alpine as base image', () => {
      const content = readFile('Dockerfile')
      assert.ok(content !== null, 'Dockerfile must exist')
      assert.ok(
        content.includes('FROM node:22-alpine'),
        'Dockerfile must contain "FROM node:22-alpine"'
      )
    })

    test('Dockerfile has CMD ["node", "src/server.js"]', () => {
      const content = readFile('Dockerfile')
      assert.ok(content !== null, 'Dockerfile must exist')
      assert.ok(
        content.includes('CMD ["node", "src/server.js"]'),
        'Dockerfile must contain CMD ["node", "src/server.js"]'
      )
    })

    test('Dockerfile runs as non-root node user', () => {
      const content = readFile('Dockerfile')
      assert.ok(content !== null, 'Dockerfile must exist')
      assert.ok(
        content.includes('USER node'),
        'Dockerfile must contain "USER node" to run as non-root'
      )
    })

    test('Dockerfile exposes port 3000', () => {
      const content = readFile('Dockerfile')
      assert.ok(content !== null, 'Dockerfile must exist')
      assert.ok(
        content.includes('EXPOSE 3000'),
        'Dockerfile must contain "EXPOSE 3000"'
      )
    })
  })

  // ── AC-2: docker-compose.yml ──────────────────────────────────────────────
  describe('AC-2: docker-compose.yml exists with correct services and volumes', () => {
    test('docker-compose.yml exists', () => {
      const content = readFile('docker-compose.yml')
      assert.ok(content !== null, 'docker-compose.yml must exist at repo root')
    })

    test('docker-compose.yml references redis:7-alpine image', () => {
      const content = readFile('docker-compose.yml')
      assert.ok(content !== null, 'docker-compose.yml must exist')
      assert.ok(
        content.includes('redis:7-alpine'),
        'docker-compose.yml must reference "redis:7-alpine"'
      )
    })

    test('docker-compose.yml defines sqlite_data named volume', () => {
      const content = readFile('docker-compose.yml')
      assert.ok(content !== null, 'docker-compose.yml must exist')
      assert.ok(
        content.includes('sqlite_data'),
        'docker-compose.yml must define "sqlite_data" named volume'
      )
    })

    test('docker-compose.yml mounts sqlite_data at /data', () => {
      const content = readFile('docker-compose.yml')
      assert.ok(content !== null, 'docker-compose.yml must exist')
      assert.ok(
        content.includes('/data'),
        'docker-compose.yml must mount volume at "/data"'
      )
    })

    test('docker-compose.yml includes healthcheck on /health', () => {
      const content = readFile('docker-compose.yml')
      assert.ok(content !== null, 'docker-compose.yml must exist')
      assert.ok(
        content.includes('/health'),
        'docker-compose.yml healthcheck must reference "/health" endpoint'
      )
    })
  })

  // ── AC-3: .dockerignore ────────────────────────────────────────────────────
  describe('AC-3: .dockerignore excludes sensitive and unnecessary files', () => {
    test('.dockerignore exists', () => {
      const content = readFile('.dockerignore')
      assert.ok(content !== null, '.dockerignore must exist at repo root')
    })

    test('.dockerignore excludes .env', () => {
      const content = readFile('.dockerignore')
      assert.ok(content !== null, '.dockerignore must exist')
      assert.ok(
        content.includes('.env'),
        '.dockerignore must exclude ".env" to prevent secrets from entering the image'
      )
    })

    test('.dockerignore excludes node_modules/', () => {
      const content = readFile('.dockerignore')
      assert.ok(content !== null, '.dockerignore must exist')
      assert.ok(
        content.includes('node_modules/') || content.includes('node_modules'),
        '.dockerignore must exclude "node_modules/"'
      )
    })
  })

  // ── AC-4: SIGTERM / SIGINT handlers in src/server.js ─────────────────────
  describe('AC-4: src/server.js contains graceful shutdown signal handlers', () => {
    test('src/server.js contains SIGTERM listener', () => {
      const content = readFile('src/server.js')
      assert.ok(content !== null, 'src/server.js must exist')
      assert.ok(
        content.includes('SIGTERM'),
        'src/server.js must register a SIGTERM signal listener for graceful Docker shutdown'
      )
    })

    test('src/server.js contains SIGINT listener', () => {
      const content = readFile('src/server.js')
      assert.ok(content !== null, 'src/server.js must exist')
      assert.ok(
        content.includes('SIGINT'),
        'src/server.js must register a SIGINT signal listener for graceful local dev shutdown'
      )
    })
  })

  // ── AC-5: public/ dir guard in src/server.js ──────────────────────────────
  describe('AC-5: src/server.js has public/ directory existence guard', () => {
    test('src/server.js contains fs.existsSync(PUBLIC_DIR) guard', () => {
      const content = readFile('src/server.js')
      assert.ok(content !== null, 'src/server.js must exist')
      assert.ok(
        content.includes('fs.existsSync(PUBLIC_DIR)') ||
        content.includes('existsSync(PUBLIC_DIR)'),
        'src/server.js must guard against missing public/ directory using fs.existsSync(PUBLIC_DIR)'
      )
    })
  })
})
