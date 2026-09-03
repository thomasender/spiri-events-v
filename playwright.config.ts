import { defineConfig, devices } from '@playwright/test'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  testDir: './tests',

  testMatch: [
    '**/integration/**/*.spec.ts',
    '**/e2e/**/*.spec.ts',
  ],

  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['html'],
    ['list'],
  ],

  use: {
    baseURL: 'http://localhost:5180',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  globalSetup: './tests/globalSetup.ts',

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'webkit',
      use: {
        ...devices['Desktop Safari'],
        // iPhone 13 viewport — the smallest realistic phone width where
        // Peter has reported the event wizard date/time fields overflow
        // the container on iOS Safari / iOS Chrome (both WebKit).
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
      },
    },
  ],

  webServer: {
    command: 'VITE_USE_EMULATORS=true npm run dev -- --port 5180',
    url: 'http://localhost:5180',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
})
