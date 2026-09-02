import { test, expect, Page } from '@playwright/test';
import { waitForCalendarToLoad } from '../helpers/auth';

const TOGGLE_CONTAINER = '.events-section-view-toggle';
const CARD_BTN = '.events-section-view-toggle button:has-text("Kartenansicht")';
const LIST_BTN = '.events-section-view-toggle button:has-text("Listenansicht")';

async function clearFilterState(page: Page): Promise<void> {
  await page.evaluate(() => localStorage.removeItem('calendarFilterState'));
}

test.describe('Mobile view toggle visibility (FVp2Sfs1)', () => {
  test('toggle is hidden on a mobile viewport', async ({ page, context }) => {
    await context.clearCookies();
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    await waitForCalendarToLoad(page);
    await clearFilterState(page);
    await page.goto('/');
    await waitForCalendarToLoad(page);

    await expect(page.locator(TOGGLE_CONTAINER)).toHaveCount(0);
    await expect(page.locator(CARD_BTN)).toHaveCount(0);
    await expect(page.locator(LIST_BTN)).toHaveCount(0);
  });

  test('toggle is visible on a desktop viewport', async ({ page, context }) => {
    await context.clearCookies();
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    await waitForCalendarToLoad(page);
    await clearFilterState(page);
    await page.goto('/');
    await waitForCalendarToLoad(page);

    await expect(page.locator(TOGGLE_CONTAINER)).toBeVisible();
    await expect(page.locator(CARD_BTN)).toBeVisible();
    await expect(page.locator(LIST_BTN)).toBeVisible();
  });

  test('calendar grid is still rendered on mobile (toggle is the only thing hidden)', async ({
    page,
    context,
  }) => {
    await context.clearCookies();
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    await waitForCalendarToLoad(page);
    await clearFilterState(page);
    await page.goto('/');
    await waitForCalendarToLoad(page);

    await expect(page.locator('.events-section')).toBeVisible();
    const cards = page.locator('.events-section-grid .event-tile');
    const empty = page.locator('.events-section-empty');
    const cardsVisible = await cards
      .first()
      .isVisible()
      .catch(() => false);
    if (cardsVisible) {
      await expect(cards.first()).toBeVisible();
    } else {
      await expect(empty).toBeVisible();
    }
  });
});
