import { test, expect } from '@playwright/test';
import { waitForCalendarToLoad } from '../helpers/auth';

test.describe('Hero features', () => {
  test('renders the "Tribe ist für alle da" tagline as a 4th item inside .hero-features', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/');
    await waitForCalendarToLoad(page);

    const features = page.locator('.hero-features li');
    await expect(features).toHaveCount(4);

    const tagline = features.nth(3);
    await expect(tagline).toContainText('Tribe ist für alle da.');
    await expect(tagline).toContainText(
      'Ein Ort für Begegnung, Inspiration und echtes Miteinander.'
    );
    await expect(tagline.locator('svg').first()).toBeVisible();
  });

  test('all 4 hero features are visible on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/');
    await waitForCalendarToLoad(page);

    const features = page.locator('.hero-features li');
    await expect(features).toHaveCount(4);
    for (let i = 0; i < 4; i += 1) {
      await expect(features.nth(i), `feature ${i} should be visible on mobile`).toBeVisible();
    }
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

  test('shows the hero features on the calendar page only (not on /login or /impressum)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });

    await page.goto('/');
    await waitForCalendarToLoad(page);
    await expect(page.locator('.hero-features li')).toHaveCount(4);

    for (const path of ['/login', '/impressum']) {
      await page.goto(path);
      await expect(
        page.locator('.hero-features'),
        `hero features should not be visible on ${path}`
      ).toHaveCount(0);
    }
  });
});
