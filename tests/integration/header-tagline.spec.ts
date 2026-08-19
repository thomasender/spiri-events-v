import { test, expect } from '@playwright/test';
import { waitForCalendarToLoad } from '../helpers/auth';

test.describe('Header tagline', () => {
  test('shows the "Tribe ist für alle da" tagline inside the header logo on the calendar page', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/');
    await waitForCalendarToLoad(page);

    const tagline = page.locator('.logo-tagline');
    await expect(tagline).toBeVisible();
    await expect(tagline).toContainText('Tribe ist für alle da.');
    await expect(tagline).toContainText(
      'Ein Ort für Begegnung, Inspiration und echtes Miteinander.'
    );
  });

  test('does not render the old impact-strip section at the bottom of the calendar page', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/');
    await waitForCalendarToLoad(page);

    await expect(page.locator('.impact-strip')).toHaveCount(0);
    await expect(page.locator('.impact-message')).toHaveCount(0);
  });

  test('shows the tagline in the header on every public page', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });

    for (const path of ['/', '/login', '/impressum']) {
      await page.goto(path);
      const tagline = page.locator('.logo-tagline');
      await expect(tagline, `tagline should be visible on ${path}`).toBeVisible();
      await expect(tagline).toContainText('Tribe ist für alle da.');
    }
  });
});
