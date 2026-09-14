import { test, expect, Page } from '@playwright/test';
import { spawn } from 'child_process';
import { waitForCalendarToLoad } from '../helpers/auth';

async function resetRecurringEventFixture(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const proc = spawn('node', ['scripts/reset-recurring-event-fixtures.mjs'], {
      cwd: process.cwd(),
      stdio: 'ignore',
      shell: true,
    });
    proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`exit ${code}`))));
    proc.on('error', reject);
  });
}

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

test.describe('Recurring event list links do not pin to a specific occurrence (4bVW6i7o)', () => {
  const start = startMonthInfo();
  test.describe.configure({ timeout: 60000 });

  test.beforeEach(async ({ page }) => {
    await resetRecurringEventFixture();
    await page.goto('/');
    await waitForCalendarToLoad(page);
    await navigateToMonth(page, start.year, start.month);
  });

  test('card view tile for a recurring event links to the event without occurrenceDate', async ({
    page,
  }) => {
    const tile = page.locator('.event-tile', { hasText: RECURRING_EVENT_TITLE }).first();
    await expect(tile).toBeVisible();

    const href = await tile.getAttribute('href');
    expect(href).toBeTruthy();
    expect(href).toMatch(/^\/event\/[^/?]+$/);
    expect(href).not.toContain('occurrenceDate=');
  });

  test('list view row for a recurring event links to the event without occurrenceDate', async ({
    page,
  }) => {
    await page.locator('button:has-text("Listenansicht")').first().click();

    const row = page.locator('.event-row', { hasText: RECURRING_EVENT_TITLE }).first();
    await expect(row).toBeVisible();

    const href = await row.getAttribute('href');
    expect(href).toBeTruthy();
    expect(href).toMatch(/^\/event\/[^/?]+$/);
    expect(href).not.toContain('occurrenceDate=');
  });

  test('clicking a card view tile navigates to the detail page without occurrenceDate', async ({
    page,
  }) => {
    const tile = page.locator('.event-tile', { hasText: RECURRING_EVENT_TITLE }).first();
    await expect(tile).toBeVisible();

    await tile.click();

    await expect(page).toHaveURL(/\/event\/[^/?]+$/);
    expect(page.url()).not.toContain('occurrenceDate=');
  });

  test('similar-events slider tiles link to events without occurrenceDate', async ({ page }) => {
    // Open the recurring event's detail page (no occurrenceDate) and verify that
    // tiles inside the similar-events slider (which reuse EventCard) also omit
    // the query parameter.
    const tile = page.locator('.event-tile', { hasText: RECURRING_EVENT_TITLE }).first();
    await expect(tile).toBeVisible();

    await tile.click();
    await expect(page).toHaveURL(/\/event\/[^/?]+$/);

    const similarSlider = page.getByTestId('similar-events-slider');
    if ((await similarSlider.count()) === 0) {
      test.skip(true, 'no similar events for this category in the seed');
      return;
    }

    const similarTiles = similarSlider.locator('a.event-tile');
    const count = await similarTiles.count();
    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < count; i += 1) {
      const href = await similarTiles.nth(i).getAttribute('href');
      expect(href, `similar tile ${i}`).toBeTruthy();
      expect(href, `similar tile ${i} should not pin to a specific occurrence`).not.toContain(
        'occurrenceDate='
      );
    }
  });

  test('day-popover event click on a recurring date navigates without occurrenceDate', async ({
    page,
  }) => {
    // The recurring fixture starts ~7 days from today. We click through the
    // cells with events until the day-popover contains the recurring event,
    // then click that entry. The day-popover overlay must be dismissed between
    // attempts since it covers the rest of the calendar.
    const dayCells = page.locator('.calendar-cell.has-events');
    const cellCount = await dayCells.count();
    expect(cellCount).toBeGreaterThan(0);

    let popoverEventFound = false;
    for (let i = 0; i < cellCount; i += 1) {
      const cell = dayCells.nth(i);
      // Dismiss any open popover from a previous attempt.
      if (
        await page
          .locator('.day-popover-overlay')
          .isVisible()
          .catch(() => false)
      ) {
        await page.locator('.day-popover-overlay').click({ position: { x: 5, y: 5 } });
        await expect(page.locator('.day-popover')).not.toBeVisible();
      }

      await cell.click();
      const popover = page.locator('.day-popover');
      try {
        await expect(popover).toBeVisible({ timeout: 1000 });
      } catch {
        continue;
      }
      const candidate = popover
        .locator('.day-popover-event', { hasText: RECURRING_EVENT_TITLE })
        .first();
      if ((await candidate.count()) > 0) {
        await candidate.click();
        popoverEventFound = true;
        break;
      }
    }

    expect(popoverEventFound, 'no day-cell contained the recurring event').toBe(true);
    await expect(page).toHaveURL(/\/event\/[^/?]+$/);
    expect(page.url()).not.toContain('occurrenceDate=');
  });

  test('detail page still links individual recurring dates with occurrenceDate (regression guard)', async ({
    page,
  }) => {
    // Sanity check that the detail-page behavior (which we deliberately kept)
    // is not regressed by the list-view fix above.
    const tile = page.locator('.event-tile', { hasText: RECURRING_EVENT_TITLE }).first();
    await expect(tile).toBeVisible();

    await tile.click();
    await expect(page).toHaveURL(/\/event\/[^/?]+$/);

    // The detail page lists individual occurrence dates; each entry should still
    // link back with occurrenceDate= so the page can deep-link a specific date.
    const occurrenceLinks = page.locator('a[href*="occurrenceDate="]');
    await expect(occurrenceLinks.first()).toBeVisible({ timeout: 10000 });
    const count = await occurrenceLinks.count();
    expect(count).toBeGreaterThan(0);
  });
});
