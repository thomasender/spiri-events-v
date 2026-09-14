import { defineConfig, devices } from '@playwright/test';

// Specs that mutate globally shared state — the `categories` registry, the
// whole `events` collection, the Storage bucket. They cannot run alongside
// anything else, so they get their own project that only starts once the
// parallel suite has finished (see the `destructive` project below).
const DESTRUCTIVE_SPECS = [
  '**/integration/admin-categories-tab.spec.ts',
  '**/integration/profile.spec.ts',
];

export default defineConfig({
  testDir: './tests',

  testMatch: ['**/integration/**/*.spec.ts', '**/e2e/**/*.spec.ts'],

  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,

  // `html` used to be the default reporter, which writes a report directory on
  // every run and opens a server on failure. `list` is enough for a hook; pass
  // `--reporter=html` explicitly when you want to dig into a failure.
  reporter: [['list']],

  use: {
    baseURL: 'http://localhost:5180',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  globalSetup: './tests/globalSetup.ts',

  projects: [
    // Signs in once per role and persists the sessions to tests/.auth/*.json,
    // so specs don't have to click through the login form.
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: DESTRUCTIVE_SPECS,
      dependencies: ['setup'],
    },
    {
      // Invoked as a second, separate Playwright run *after* the `chromium`
      // project finishes (see the test:e2e:* scripts in package.json), so its
      // collection wipes cannot pull the rug out from under a spec that is
      // mid-assertion. A `dependencies: ['chromium']` would achieve the
      // ordering too, but Playwright ignores --grep for dependency projects,
      // so the smoke run would drag in the entire suite.
      name: 'destructive',
      use: { ...devices['Desktop Chrome'] },
      testMatch: DESTRUCTIVE_SPECS,
      dependencies: ['setup'],
    },
    {
      // WebKit exists for the iOS Safari bugs Peter reports (event wizard
      // fields overflowing at phone widths). It used to re-run the *entire*
      // suite at 390px — including desktop admin flows driven through the
      // mobile hamburger menu — which doubled the runtime for no coverage.
      // It now only runs specs explicitly tagged @mobile.
      name: 'webkit',
      grep: /@mobile/,
      testIgnore: DESTRUCTIVE_SPECS,
      use: {
        ...devices['Desktop Safari'],
        // iPhone 13 viewport — the smallest realistic phone width.
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
      },
      dependencies: ['setup'],
    },
  ],

  webServer: {
    command: 'VITE_USE_EMULATORS=true npm run dev -- --port 5180',
    url: 'http://localhost:5180',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
