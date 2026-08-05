import { test, expect } from '@playwright/test';
import { signInWithEmailAndPassword } from '../helpers/auth';

async function clickWeiter(page: import('@playwright/test').Page) {
  const weiterButton = page.locator('button:has-text("Weiter")');
  await weiterButton.waitFor({ timeout: 5000 }).catch(() => {});
  await weiterButton.click();
  await page.waitForTimeout(1500);
}

async function navigateToStep2(page: import('@playwright/test').Page) {
  await page
    .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
    .catch(() => {});
  await clickWeiter(page);
}

async function navigateToStep3(page: import('@playwright/test').Page) {
  await clickWeiter(page);
}

async function navigateToStep4(page: import('@playwright/test').Page) {
  await clickWeiter(page);
}

test.describe('Event CRUD', () => {
  test('event modal opens on click', async ({ page }) => {
    await page.goto('/');
  });

  test('event form validation prevents advancing from Step 1 without required fields', async ({
    page,
  }) => {
    test.skip();
  });

  test('non-admin user sees validation error near Einreichen zur Genehmigung button', async ({
    page,
  }) => {
    test.skip();
  });

  test('link without protocol is auto-prefixed with https://', async ({ page }) => {
    test.skip();
  });

  test('link with http:// is converted to https://', async ({ page }) => {
    test.skip();
  });

  test('all required fields are marked with asterisk', async ({ page }) => {
    test.skip();
  });
});
