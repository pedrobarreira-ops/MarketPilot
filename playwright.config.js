// playwright.config.js
// Playwright configuration for Epic 5/6 frontend smoke tests.
// See tests/e2e/README.md for the pattern the dev agent should follow.

import { defineConfig, devices } from '@playwright/test'

const PORT = 3001
const BASE_URL = `http://127.0.0.1:${PORT}`

export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: /.*\.spec\.js$/,
  fullyParallel: true,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'node scripts/test-static-server.js',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    stdout: 'ignore',
    stderr: 'pipe',
    timeout: 15_000,
  },
})
