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

  test('collapses to a menu toggle and hides the desktop nav between 561px and 800px', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 700, height: 800 });
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');

    await expect(page.locator('.nav-desktop')).toBeHidden();
    await expect(page.locator('.menu-toggle')).toBeVisible();
  });

  test('reveals all nav links, including Verwaltung and Abmelden, via the menu toggle on narrow viewports', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 500, height: 800 });
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');

    await expect(page.locator('.nav-desktop')).toBeHidden();

    await page.locator('.menu-toggle').click();

    const mobileMenu = page.locator('#mobile-menu');
    await expect(mobileMenu.locator('a.nav-link--admin')).toBeVisible();
    await expect(mobileMenu.locator('button.nav-link--logout')).toBeVisible();
    await expect(mobileMenu.locator('a.nav-link', { hasText: 'Mein Profil' })).toBeVisible();
    await expect(mobileMenu.locator('a.nav-link', { hasText: 'Event erstellen' })).toBeVisible();
  });
});
