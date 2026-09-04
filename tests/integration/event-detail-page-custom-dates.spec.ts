import { test, expect } from '@playwright/test';

const CUSTOM_DATES_TITLE = 'Test Custom Dates Workshop';
const CUSTOM_DATES_PLACE = 'Workshop Raum Test';

function makeDate(dayOffset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  return d.toISOString().split('T')[0];
}

function normalize(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function expectedSlug(): string {
  const datePart = makeDate(7).replace(/-/g, '');
  return [normalize(CUSTOM_DATES_TITLE), normalize(CUSTOM_DATES_PLACE), datePart].join('-');
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

test.describe('Event detail page shows all individual dates for custom-dates series (cXLyTMkj)', () => {
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

  test('navigating to a specific occurrence shows only that date', async ({ page }) => {
    const target = makeDate(21);
    await page.goto(`/event/${expectedSlug()}?occurrenceDate=${target}`);
    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    await expect(page.locator('.event-title')).toContainText(CUSTOM_DATES_TITLE, {
      timeout: 10000,
    });

    await expect(page.getByTestId('event-detail-dates-list')).toHaveCount(0);

    const detailValue = page.locator('.event-details .detail-item .detail-value').first();
    await expect(detailValue).toContainText(formatDe(target));
    await expect(detailValue).not.toContainText(formatDe(makeDate(7)));
  });
});
