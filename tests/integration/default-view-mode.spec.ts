import { test, expect, Page } from '@playwright/test';
import { waitForCalendarToLoad } from '../helpers/auth';

async function clearFilterState(page: Page): Promise<void> {
  await page.evaluate(() => localStorage.removeItem('calendarFilterState'));
}

async function setViewportDesktop(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 800 });
}

async function readStoredViewMode(page: Page): Promise<string | null> {
  const stored = await page.evaluate(() => localStorage.getItem('calendarFilterState'));
  if (!stored) return null;
  try {
    const parsed = JSON.parse(stored);
    return typeof parsed.viewMode === 'string' ? parsed.viewMode : null;
  } catch {
    return null;
  }
}

test.describe('Default view mode on the home page (OgTYnHip)', () => {
  test.beforeEach(async ({ page, context }) => {
    await context.clearCookies();
    await setViewportDesktop(page);
    await page.goto('/');
    await waitForCalendarToLoad(page);
    // Wipe any previously persisted state so we exercise the default branch.
    await clearFilterState(page);
  });

  test('card view is the default on first visit on desktop', async ({ page }) => {
    await page.goto('/');
    await waitForCalendarToLoad(page);

    const cardBtn = page.locator('.events-section-view-toggle button:has-text("Kartenansicht")');
    const listBtn = page.locator('.events-section-view-toggle button:has-text("Listenansicht")');
    await expect(cardBtn).toHaveClass(/active/);
    await expect(listBtn).not.toHaveClass(/active/);

    const tiles = page.locator('.events-section-grid .event-tile');
    const rows = page.locator('.events-section-list .event-row');

    const tilesVisible = await tiles
      .first()
      .isVisible()
      .catch(() => false);
    if (tilesVisible) {
      await expect(tiles.first()).toBeVisible();
      await expect(rows).toHaveCount(0);
    } else {
      // No events in the current month — the empty state is shown under the toggle,
      // but the toggle itself is still the card view (which is what we asserted above).
      await expect(page.locator('.events-section-empty')).toBeVisible();
    }
  });

  test('default view mode is persisted to localStorage as "card"', async ({ page }) => {
    await page.goto('/');
    await waitForCalendarToLoad(page);
    expect(await readStoredViewMode(page)).toBe('card');
  });

  test('user can switch to list view and the choice is persisted', async ({ page }) => {
    await page.goto('/');
    await waitForCalendarToLoad(page);

    await page.locator('.events-section-view-toggle button:has-text("Listenansicht")').click();

    const listBtn = page.locator('.events-section-view-toggle button:has-text("Listenansicht")');
    const cardBtn = page.locator('.events-section-view-toggle button:has-text("Kartenansicht")');
    await expect(listBtn).toHaveClass(/active/);
    await expect(cardBtn).not.toHaveClass(/active/);

    const rows = page.locator('.events-section-list .event-row');
    const rowsVisible = await rows
      .first()
      .isVisible()
      .catch(() => false);
    if (rowsVisible) {
      await expect(rows.first()).toBeVisible();
    }

    expect(await readStoredViewMode(page)).toBe('list');
  });

  test('switching back to card view updates the stored view mode', async ({ page }) => {
    await page.goto('/');
    await waitForCalendarToLoad(page);

    const cardBtn = page.locator('.events-section-view-toggle button:has-text("Kartenansicht")');
    const listBtn = page.locator('.events-section-view-toggle button:has-text("Listenansicht")');

    // Flip list, then back to card.
    await listBtn.click();
    await expect(listBtn).toHaveClass(/active/);
    expect(await readStoredViewMode(page)).toBe('list');

    await cardBtn.click();
    await expect(cardBtn).toHaveClass(/active/);
    await expect(listBtn).not.toHaveClass(/active/);
    expect(await readStoredViewMode(page)).toBe('card');
  });
});
