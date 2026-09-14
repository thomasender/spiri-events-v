import { test as setup, expect } from '@playwright/test';
import { TEST_ROLES, storageStatePath, type TestRole } from './helpers/roles';

/**
 * Runs once per full Playwright invocation, before any test project.
 *
 * Every spec used to sign in through the login form — 259 UI logins per pass,
 * each costing a page load, a Firebase Auth round trip and a hardcoded 2s
 * sleep. Here we do it three times (once per role) and persist the session so
 * the specs can start already authenticated via `test.use({ storageState })`.
 *
 * `indexedDB: true` is essential: the Firebase Web SDK keeps its session in
 * IndexedDB, not in cookies or localStorage, so a default storageState would
 * capture nothing usable.
 */
for (const role of Object.keys(TEST_ROLES) as TestRole[]) {
  const { email, password } = TEST_ROLES[role];

  setup(`authenticate as ${role}`, async ({ page, context }) => {
    await page.goto('/login');

    await page.fill('input[type="email"], input[name="email"], input[id="email"]', email);
    await page.fill(
      'input[type="password"], input[name="password"], input[id="password"]',
      password
    );
    await page.click('button[type="submit"]');

    // Wait for a real signal that the session exists rather than a fixed sleep:
    // the header swaps the "Anmelden" link for a logout button once auth resolves.
    await expect(page.locator('button.nav-link--logout').first()).toBeAttached({
      timeout: 15000,
    });

    await context.storageState({ path: storageStatePath(role), indexedDB: true });
  });
}
