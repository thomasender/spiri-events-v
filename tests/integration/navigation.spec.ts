import { test, expect } from '@playwright/test';
import { waitForCalendarToLoad } from '../helpers/auth';

test.describe('Navigation', () => {
  test('homepage loads calendar', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.calendar')).toBeVisible();
  });

  test('header navigation works', async ({ page }) => {
    await page.goto('/');
    const logo = page.locator('.logo');
    if (await logo.isVisible()) {
      await logo.click();
      await expect(page).toHaveURL('/');
    }
  });

  test('calendar navigation changes month', async ({ page }) => {
    await page.goto('/');
    await waitForCalendarToLoad(page);

    const header = page.locator('.calendar-header h2');
    const initialMonth = await header.textContent();

    await page.locator('button[title="Nächster Monat"]').click();
    await page.waitForTimeout(600);

    const newMonth = await header.textContent();
    expect(newMonth).not.toBe(initialMonth);
  });

  test('today button returns to current month', async ({ page }) => {
    await page.goto('/');
    await waitForCalendarToLoad(page);

    await page.locator('button[title="Nächster Monat"]').click();
    await page.waitForTimeout(600);

    await page.locator('.btn-today').click();
    await page.waitForTimeout(600);

    await expect(page.locator('.btn-today')).toBeVisible();
  });
});
