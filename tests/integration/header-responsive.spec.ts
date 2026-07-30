import { test, expect } from '@playwright/test';
import { signInWithEmailAndPassword } from '../helpers/auth';

test.describe('Header responsive layout', () => {
  test('renders all nav labels inline on a wide desktop viewport', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');

    for (const label of ['Kalender', 'Verwaltung', 'Mein Profil', 'Event erstellen', 'Abmelden']) {
      const link = page.locator(`a.nav-link, button.nav-link`, { hasText: label }).first();
      await expect(link).toBeVisible();
      const whiteSpace = await link
        .locator('span')
        .first()
        .evaluate((el) => window.getComputedStyle(el).whiteSpace);
      expect(whiteSpace).toBe('nowrap');
    }
  });

  test('uses the wider viewport width on desktop (container is not stuck at 800px)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');

    const containerWidth = await page
      .locator('.header-container')
      .evaluate((el) => el.getBoundingClientRect().width);
    expect(containerWidth).toBeGreaterThan(900);
  });

  test('hides the labels but keeps icons when the viewport is between 561px and 800px', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 700, height: 800 });
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');

    await expect(page.locator('.nav-link', { hasText: 'Mein Profil' })).toBeVisible();
    const labelVisible = await page
      .locator('.nav-link', { hasText: 'Mein Profil' })
      .locator('span')
      .first()
      .isVisible();
    expect(labelVisible).toBe(false);
  });

  test('hides the Verwaltung and Abmelden icon links on very narrow viewports', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 500, height: 800 });
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');

    await expect(page.locator('a.nav-link--admin')).toBeHidden();
    await expect(page.locator('button.nav-link--logout')).toBeHidden();

    // Mein Profil and Event erstellen must still be reachable in the header
    await expect(page.locator('a.nav-link', { hasText: 'Mein Profil' })).toBeVisible();
    await expect(page.locator('a.nav-link', { hasText: 'Event erstellen' })).toBeVisible();
  });
});
