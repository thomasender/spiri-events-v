import { test, expect } from '@playwright/test';
import { waitForCalendarToLoad } from '../helpers/auth';

test.describe('Hero tagline', () => {
  test('shows the "Tribe ist für alle da" tagline inside the hero under the features on the calendar page', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/');
    await waitForCalendarToLoad(page);

    const heroTagline = page.locator('.hero-tagline');
    await expect(heroTagline).toBeVisible();
    await expect(heroTagline).toContainText('Tribe ist für alle da.');
    await expect(heroTagline).toContainText(
      'Ein Ort für Begegnung, Inspiration und echtes Miteinander.'
    );
  });

  test('renders a Sparkles icon next to the hero tagline', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/');
    await waitForCalendarToLoad(page);

    const heroTagline = page.locator('.hero-tagline');
    await expect(heroTagline).toBeVisible();
    await expect(heroTagline.locator('svg').first()).toBeVisible();
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

  test('shows the hero tagline on the calendar page only (not on /login or /impressum)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });

    await page.goto('/');
    await waitForCalendarToLoad(page);
    await expect(page.locator('.hero-tagline')).toBeVisible();

    for (const path of ['/login', '/impressum']) {
      await page.goto(path);
      await expect(
        page.locator('.hero-tagline'),
        `hero tagline should not be visible on ${path}`
      ).toHaveCount(0);
    }
  });
});
