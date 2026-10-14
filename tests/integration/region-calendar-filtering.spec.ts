import { test, expect } from '@playwright/test';
import { waitForCalendarToLoad } from '../helpers/auth';
import { loadRegionEventFixtures, removeRegionEventFixtures } from '../helpers/regionFixtures';

// Runs in the `destructive` project (see playwright.config.ts): the fixtures
// activate Tirol, and with two active regions the "Wo suchst du?" dialog
// blocks every other spec running in parallel.
test.describe('Region filtering (tirol fixtures)', () => {
  // Fixture events are 12-14 days out; tests run in parallel with other
  // specs, so the events are removed again afterwards.
  test.describe.configure({ mode: 'serial' });
  test.beforeAll(() => loadRegionEventFixtures());
  test.afterAll(async () => removeRegionEventFixtures());

  // The fixture dates may fall into next month: page forward once if needed.
  async function openRegion(page: import('@playwright/test').Page, path: string) {
    await page.goto(path);
    await waitForCalendarToLoad(page);
    const later = new Date();
    later.setDate(later.getDate() + 14);
    if (later.getMonth() !== new Date().getMonth()) {
      await page
        .locator('.calendar-header')
        .getByRole('button', { name: 'Nächster Monat' })
        .click();
    }
  }
  const titleLocator = (page: import('@playwright/test').Page, title: string) =>
    page.getByText(`[Region-Test] ${title}`).first();

  test('/tirol shows the Tirol events and not the Vorarlberg one', async ({ page }) => {
    await openRegion(page, '/tirol');
    await expect(titleLocator(page, 'Yoga Innsbruck')).toBeVisible();
    await expect(titleLocator(page, 'Meditation Kufstein')).toBeVisible();
    await expect(titleLocator(page, 'Online Atemreise Tirol')).toBeVisible();
    await expect(titleLocator(page, 'Yoga Dornbirn')).toHaveCount(0);
  });

  test('/vorarlberg shows the Vorarlberg event, no Tirol events but online ones', async ({
    page,
  }) => {
    await openRegion(page, '/vorarlberg');
    await expect(titleLocator(page, 'Yoga Dornbirn')).toBeVisible();
    await expect(titleLocator(page, 'Online Atemreise Tirol')).toBeVisible();
    await expect(titleLocator(page, 'Yoga Innsbruck')).toHaveCount(0);
    await expect(titleLocator(page, 'Meditation Kufstein')).toHaveCount(0);
  });
});
