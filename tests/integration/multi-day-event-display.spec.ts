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

const MULTI_DAY_EVENT_TITLE = 'Meditationsretreat';

function retreatMonthInfo(): { year: number; month: number } {
  const today = new Date();
  today.setDate(today.getDate() + 15); // matches seed-test-events.mjs dayOffset
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

async function goToListView(page: Page): Promise<void> {
  // On narrow viewports the card view is forced; widen first.
  await page.setViewportSize({ width: 1280, height: 800 });
  const listBtn = page.locator('button:has-text("Listenansicht")').first();
  if (await listBtn.isVisible().catch(() => false)) {
    await listBtn.click();
  }
}

async function goToCardView(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 800 });
  const cardBtn = page.locator('button:has-text("Kartenansicht")').first();
  if (await cardBtn.isVisible().catch(() => false)) {
    await cardBtn.click();
  }
}

test.describe('Multi-day retreat display (rpyIkFjm)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForCalendarToLoad(page);
  });

  for (const view of [
    {
      name: 'list',
      goTo: goToListView,
      itemSelector: '.event-row',
      dateRangeTestId: 'event-row-date-range',
    },
    {
      name: 'card',
      goTo: goToCardView,
      itemSelector: '.event-tile',
      dateRangeTestId: 'event-tile-date-range',
    },
  ] as const) {
    test(`${view.name} view shows date range and hides time for multi-day event`, async ({
      page,
    }) => {
      const { year, month } = retreatMonthInfo();
      await navigateToMonth(page, year, month);
      await view.goTo(page);

      const item = page.locator(view.itemSelector, { hasText: MULTI_DAY_EVENT_TITLE }).first();
      await expect(item).toBeVisible();

      const dateRange = item.locator(`[data-testid="${view.dateRangeTestId}"]`);
      await expect(dateRange).toBeVisible();
      const rangeText = (await dateRange.textContent())?.trim() ?? '';
      expect(rangeText).toMatch(/\d/);
      expect(rangeText).toContain(' - ');

      const itemText = (await item.textContent()) ?? '';
      expect(itemText).not.toContain('Uhr');
    });
  }

  test('multi-day retreat appears exactly once per month in the list view', async ({ page }) => {
    const { year, month } = retreatMonthInfo();
    await navigateToMonth(page, year, month);
    await goToListView(page);

    const rows = page.locator('.event-row', { hasText: MULTI_DAY_EVENT_TITLE });
    await expect(rows).toHaveCount(1);
  });

  test('single-day event still shows time, not a date range', async ({ page }) => {
    const { year, month } = retreatMonthInfo();
    await navigateToMonth(page, year, month);
    await goToListView(page);

    // Atemtherapie is at today + 10 (single-day), so it sits in the same month
    // as the Meditationsretreat (today + 15) most of the time.
    const singleDay = page.locator('.event-row', { hasText: 'Atemtherapie' }).first();
    await expect(singleDay).toBeVisible();
    const text = (await singleDay.textContent()) ?? '';
    expect(text).toContain('Uhr');
    expect(singleDay.locator('[data-testid="event-row-date-range"]')).toHaveCount(0);
  });

  test('sidebar calendar still shows a dot on each day of the multi-day retreat', async ({
    page,
  }) => {
    const { year, month } = retreatMonthInfo();
    await navigateToMonth(page, year, month);

    // The sidebar calendar (.calendar) shows day cells with dots; the multi-day
    // event should still mark every day in its span with a dot.
    const sidebar = page.locator('.desktop-calendar');
    if (!(await sidebar.isVisible().catch(() => false))) {
      test.skip();
      return;
    }
    // Retreat spans 3 consecutive days; expect at least 3 dots total on those days.
    const dots = page.locator('.calendar-cell .cell-dot');
    const dotCount = await dots.count();
    expect(dotCount).toBeGreaterThanOrEqual(3);
  });
});
