import { test, expect } from '@playwright/test';

test.describe('Impressum (qIrgNLRw)', () => {
  test('impressum page shows the new verein content', async ({ page }) => {
    await page.goto('/impressum');

    await expect(page.locator('.legal-title')).toHaveText('Impressum');
    await expect(page.locator('.legal-updated')).toHaveText('Stand: August 2026');

    const content = page.locator('.legal-content');
    await expect(content).toContainText(
      'Tribe Vorarlberg – Verein zur Förderung einer ganzheitlichen Lebensweise und Gesundheitsförderung'
    );
    await expect(content).toContainText('ZVR-Zahl: 1865711062');
    await expect(content).toContainText('Sitz des Vereins:');
    await expect(content).toContainText('Dornbirn, Österreich');
    await expect(content).toContainText('Vertretungsbefugtes Organ:');
    await expect(content).toContainText('Die Präsidenten gemäß den Vereinsstatuten.');
    await expect(content).toContainText('E-Mail: office@tribevorarlberg.at');
    await expect(content).toContainText('Grundlegende Richtung der Website:');
    await expect(content).toContainText(
      'Diese Website informiert über die Tätigkeiten, Veranstaltungen und Ziele des Vereins.'
    );
  });

  test('impressum link in footer navigates to the impressum page', async ({ page }) => {
    await page.goto('/');

    await page.locator('.footer-nav a', { hasText: 'Impressum' }).click();

    await expect(page).toHaveURL(/\/impressum$/);
    await expect(page.locator('.legal-title')).toHaveText('Impressum');
  });
});
