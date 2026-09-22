import { test, expect } from '@playwright/test';
import { generateSlug } from '../helpers/slug';

const CUSTOM_DATES_TITLE = 'Test Custom Dates Workshop';
const CUSTOM_DATES_CATEGORY = 'Yoga';
const CUSTOM_DATES_BEZIRK = 'Dornbirn';

function makeDate(dayOffset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  return d.toISOString().split('T')[0];
}

function expectedSlug(): string {
  return generateSlug(CUSTOM_DATES_TITLE, CUSTOM_DATES_CATEGORY, CUSTOM_DATES_BEZIRK, 7);
}

function expectedSeriesDates(): string[] {
  // From scripts/seed-test-events.mjs:
  //   date: makeDate(7)
  //   customDates: [makeDate(7), makeDate(21), makeDate(35), makeDate(63)]
  // getCustomSeriesDates() dedupes and sorts, so this is the canonical list.
  return [makeDate(7), makeDate(21), makeDate(35), makeDate(63)].sort();
}

function formatDe(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('de-DE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

test.describe('Event detail page shows all individual dates for custom-dates series (cXLyTMkj) @smoke', () => {
  test('lists every date of a custom-dates series on the public event detail page', async ({
    page,
  }) => {
    await page.goto(`/event/${expectedSlug()}`);
    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    await expect(page.locator('.event-title')).toContainText(CUSTOM_DATES_TITLE, {
      timeout: 10000,
    });

    const datesList = page.getByTestId('event-detail-dates-list');
    await expect(datesList).toBeVisible();

    const items = page.getByTestId('event-detail-date-item');
    await expect(items).toHaveCount(expectedSeriesDates().length);

    for (const isoDate of expectedSeriesDates()) {
      await expect(datesList).toContainText(formatDe(isoDate));
    }
  });

  test('navigating to a specific occurrence keeps the dates list visible and marks the selected date', async ({
    page,
  }) => {
    const target = makeDate(21);
    await page.goto(`/event/${expectedSlug()}?occurrenceDate=${target}`);
    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    await expect(page.locator('.event-title')).toContainText(CUSTOM_DATES_TITLE, {
      timeout: 10000,
    });

    const datesList = page.getByTestId('event-detail-dates-list');
    await expect(datesList).toBeVisible();

    const items = page.getByTestId('event-detail-date-item');
    await expect(items).toHaveCount(expectedSeriesDates().length);

    const currentItems = page.getByTestId('event-detail-date-current');
    await expect(currentItems).toHaveCount(1);
    await expect(currentItems.first()).toContainText(formatDe(target));

    // No anchors should still link individual dates back to the same page
    // (4bVW6i7o): clicking a date would only navigate to itself.
    const occurrenceAnchors = datesList.locator('a[href*="occurrenceDate="]');
    await expect(occurrenceAnchors).toHaveCount(0);
  });
});
