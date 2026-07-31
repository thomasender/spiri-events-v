import { test, expect } from '@playwright/test';

test.describe('Full User Journey', () => {
  test('user can browse events on homepage', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.calendar')).toBeVisible();
  });

  test('user can navigate to login', async ({ page }) => {
    await page.goto('/');
    await page.locator('.nav-desktop').locator('text=Anmelden').click();
    await expect(page).toHaveURL(/\/login/);
  });
});
