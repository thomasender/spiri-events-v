import { defineConfig } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = 5174;

export default defineConfig({
  testDir: './tests',
  testMatch: ['**/integration/hero-layout.spec.ts'],
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [['list']],

  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  globalSetup: './tests/globalSetup.ts',

  projects: [
    {
      name: 'chromium',
      use: { viewport: { width: 1280, height: 900 } },
    },
  ],

  webServer: {
    command: `VITE_USE_EMULATORS=true PORT=${PORT} npx vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 120000,
  },
});
