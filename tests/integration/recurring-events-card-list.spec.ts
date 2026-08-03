import { test, expect, Page } from '@playwright/test';
import { waitForCalendarToLoad } from '../helpers/auth';

const MONTHS_DE = [
  'Januar',
  'Februar',
  'März',
  'April',
  'Mai',
  'Juni',
  'Juli',
  'August',
  'September',
  'Oktober',
  'November',
  'Dezember',
];

const RECURRING_EVENT_TITLE = 'Test Weekly Yoga Series';

function nextMonthInfo(): { year: number; month: number } {
  const today = new Date();
  const next = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  return { year: next.getFullYear(), month: next.getMonth() };
}

function startMonthInfo(): { year: number; month: number } {
  const today = new Date();
  today.setDate(today.getDate() + 7);
  return { year: today.getFullYear(), month: today.getMonth() };
}

async function navigateToMonth(page: Page, year: number, month: number): Promise<void> {
  const target = `${MONTHS_DE[month]} ${year}`;
  const header = page.locator('.events-section-month h2');

  for (let attempts = 0; attempts < 24; attempts++) {
    const current = (await header.textContent())?.trim() ?? '';
    if (current === target) return;
    await page.locator('.events-section-month-nav button').nth(1).click();
    await page.waitForTimeout(150);
  }
  throw new Error(`Failed to navigate to ${target}`);
}

test.describe('Card and List view recurring events (TEgXPOfN)', () => {
  const start = startMonthInfo();
  const future = nextMonthInfo();

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForCalendarToLoad(page);
  });

  test('list view shows recurring event in its starting month', async ({ page }) => {
    await navigateToMonth(page, start.year, start.month);
    const eventRow = page.locator('.event-row', { hasText: RECURRING_EVENT_TITLE });
    await expect(eventRow.first()).toBeVisible();
  });

  test('card view shows recurring event in its starting month', async ({ page }) => {
    await page.locator('button:has-text("Kartenansicht")').first().click();
    await navigateToMonth(page, start.year, start.month);
    const eventTile = page.locator('.event-tile', { hasText: RECURRING_EVENT_TITLE });
    await expect(eventTile.first()).toBeVisible();
  });

  test('list view shows recurring event in a future month', async ({ page }) => {
    await navigateToMonth(page, future.year, future.month);
    const eventRow = page.locator('.event-row', { hasText: RECURRING_EVENT_TITLE });
    await expect(eventRow.first()).toBeVisible();
  });

  test('card view shows recurring event in a future month', async ({ page }) => {
    await page.locator('button:has-text("Kartenansicht")').first().click();
    await navigateToMonth(page, future.year, future.month);
    const eventTile = page.locator('.event-tile', { hasText: RECURRING_EVENT_TITLE });
    await expect(eventTile.first()).toBeVisible();
  });
});
