import { test, expect } from '@playwright/test';
import { waitForCalendarToLoad } from '../helpers/auth';

test.describe('Calendar: Datum quick filter (8aHT1FUG)', () => {
  test.describe('Datum section renders', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/');
      await waitForCalendarToLoad(page);
    });

    test('shows a "Datum" label above its chip row inside the filter panel', async ({ page }) => {
      const dateSection = page.locator('[data-testid="filter-options-date"]');
      await expect(dateSection).toBeVisible();

      // The label sits directly above the chip row, scoped to the filter panel.
      const label = page.locator('.filter-panel .filter-header--section .filter-label', {
        hasText: 'Datum',
      });
      await expect(label).toBeVisible();
    });

    test('exposes all three quick filter chips with German labels', async ({ page }) => {
      await expect(page.getByTestId('filter-chip-date-heute')).toHaveText('Heute');
      await expect(page.getByTestId('filter-chip-date-wochenende')).toHaveText('Wochenende');
      await expect(page.getByTestId('filter-chip-date-aktuelleWoche')).toHaveText('Aktuelle Woche');
    });

    test('is positioned between the category chips and the "Mehr Filter" accordion', async ({
      page,
    }) => {
      const order = await page.evaluate(() => {
        const panel = document.querySelector('.filter-panel');
        if (!panel) return null;
        const chipsContainer = panel.querySelector('[data-testid="filter-options-date"]');
        const accordion = panel.querySelector('.filter-accordion');
        if (!chipsContainer || !accordion) return null;
        const cmp = chipsContainer.compareDocumentPosition(accordion);
        // DOCUMENT_POSITION_FOLLOWING (4) means the accordion is after the chips.
        return Boolean(cmp & Node.DOCUMENT_POSITION_FOLLOWING);
      });
      expect(order).toBe(true);
    });
  });

  test.describe('Single-select behaviour', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/');
      await waitForCalendarToLoad(page);
    });

    test('starts with no date chip pressed', async ({ page }) => {
      for (const id of ['heute', 'wochenende', 'aktuelleWoche']) {
        await expect(page.getByTestId(`filter-chip-date-${id}`)).toHaveAttribute(
          'aria-pressed',
          'false'
        );
      }
    });

    test('clicking a date chip marks only that one as pressed', async ({ page }) => {
      await page.getByTestId('filter-chip-date-wochenende').click();
      await expect(page.getByTestId('filter-chip-date-wochenende')).toHaveAttribute(
        'aria-pressed',
        'true'
      );
      await expect(page.getByTestId('filter-chip-date-heute')).toHaveAttribute(
        'aria-pressed',
        'false'
      );
      await expect(page.getByTestId('filter-chip-date-aktuelleWoche')).toHaveAttribute(
        'aria-pressed',
        'false'
      );
    });

    test('clicking another date chip switches the selection instead of stacking', async ({
      page,
    }) => {
      await page.getByTestId('filter-chip-date-heute').click();
      await expect(page.getByTestId('filter-chip-date-heute')).toHaveAttribute(
        'aria-pressed',
        'true'
      );

      await page.getByTestId('filter-chip-date-aktuelleWoche').click();
      await expect(page.getByTestId('filter-chip-date-aktuelleWoche')).toHaveAttribute(
        'aria-pressed',
        'true'
      );
      await expect(page.getByTestId('filter-chip-date-heute')).toHaveAttribute(
        'aria-pressed',
        'false'
      );
    });

    test('clicking the active chip again clears the filter', async ({ page }) => {
      await page.getByTestId('filter-chip-date-wochenende').click();
      await expect(page.getByTestId('filter-chip-date-wochenende')).toHaveAttribute(
        'aria-pressed',
        'true'
      );

      await page.getByTestId('filter-chip-date-wochenende').click();
      await expect(page.getByTestId('filter-chip-date-wochenende')).toHaveAttribute(
        'aria-pressed',
        'false'
      );

      const stored = await page.evaluate(() => localStorage.getItem('calendarFilterState'));
      expect(stored).toBeTruthy();
      expect(JSON.parse(stored!).dateFilter).toBeNull();
    });
  });

  test.describe('Auto-jump to filter target month', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/');
      await waitForCalendarToLoad(page);
    });

    test('activating "Heute" jumps the calendar sidebar to the current month', async ({ page }) => {
      // Seed a different month so we can detect the jump.
      await page.evaluate(() => {
        localStorage.setItem(
          'calendarFilterState',
          JSON.stringify({
            currentMonth: '2026-03',
            selectedCategories: [],
            selectedOrte: [],
            dateFilter: null,
            viewMode: 'card',
          })
        );
      });
      await page.goto('/');
      await waitForCalendarToLoad(page);

      const headerBefore = await page.locator('.events-section h2').first().textContent();
      expect(headerBefore).toMatch(/März/);

      await page.getByTestId('filter-chip-date-heute').click();

      const headerAfter = await page.locator('.events-section h2').first().textContent();
      expect(headerAfter).not.toMatch(/März/);
    });

    test('activating a date filter persists the new month key in localStorage', async ({
      page,
    }) => {
      await page.getByTestId('filter-chip-date-heute').click();

      const stored = await page.evaluate(() => localStorage.getItem('calendarFilterState'));
      expect(stored).toBeTruthy();
      const parsed = JSON.parse(stored!);
      expect(parsed.dateFilter).toBe('heute');
      expect(parsed.currentMonth).toMatch(/^\d{4}-(0[1-9]|1[0-2])$/);
    });
  });

  test.describe('Functional filtering against seeded events', () => {
    // Seed events from scripts/seed-test-events.mjs use relative dates
    // (today + 0/+1/+2/...). The seeded "Yoga heute" event always lands on
    // today so we can verify the "Heute" filter against it without mocking
    // the clock.
    test.beforeEach(async ({ page }) => {
      await page.goto('/');
      await waitForCalendarToLoad(page);
    });

    test('"Heute" filter restricts the agenda to events on the real today', async ({ page }) => {
      // Sanity check: without a filter, the current month shows several events.
      const baselineCount = await page.locator('.event-tile, .event-row').count();
      expect(baselineCount).toBeGreaterThan(1);

      await page.getByTestId('filter-chip-date-heute').click();

      const filteredCount = await page.locator('.event-tile, .event-row').count();
      expect(filteredCount).toBeGreaterThan(0);
      expect(filteredCount).toBeLessThan(baselineCount);

      // The seeded "Yoga heute" event is anchored to makeDate(0) — it must
      // be visible whenever "Heute" is active.
      await expect(page.locator('.event-tile, .event-row', { hasText: 'Yoga heute' })).toHaveCount(
        1
      );
    });

    test('"Aktuelle Woche" filter shows events in the current Mon-Sun window', async ({ page }) => {
      await page.getByTestId('filter-chip-date-aktuelleWoche').click();

      const filteredCount = await page.locator('.event-tile, .event-row').count();
      expect(filteredCount).toBeGreaterThan(0);
      // The week window is at least as wide as a single day.
      const todayCount = await (async () => {
        await page.getByTestId('filter-chip-date-heute').click();
        const c = await page.locator('.event-tile, .event-row').count();
        await page.getByTestId('filter-chip-date-aktuelleWoche').click();
        return c;
      })();
      expect(filteredCount).toBeGreaterThanOrEqual(todayCount);

      // The seeded "Meditationsretreat" event is anchored to makeDate(15) —
      // 15 days from today, which is well outside the current calendar
      // week, so it must not appear.
      await expect(
        page.locator('.event-tile, .event-row', { hasText: 'Meditationsretreat' })
      ).toHaveCount(0);
    });

    test('"Wochenende" filter widens the agenda to the Fri-Sun window containing today', async ({
      page,
    }) => {
      await page.getByTestId('filter-chip-date-wochenende').click();

      const filteredCount = await page.locator('.event-tile, .event-row').count();
      // The weekend window is at least as wide as the "Heute" window.
      const todayCount = await (async () => {
        await page.getByTestId('filter-chip-date-heute').click();
        const c = await page.locator('.event-tile, .event-row').count();
        await page.getByTestId('filter-chip-date-wochenende').click();
        return c;
      })();
      expect(filteredCount).toBeGreaterThanOrEqual(todayCount);
    });

    test('clearing the date filter restores the full agenda for the current month', async ({
      page,
    }) => {
      const baselineCount = await page.locator('.event-tile, .event-row').count();

      await page.getByTestId('filter-chip-date-heute').click();
      const filteredCount = await page.locator('.event-tile, .event-row').count();
      expect(filteredCount).toBeLessThan(baselineCount);

      await page.getByTestId('filter-chip-date-heute').click();
      const restoredCount = await page.locator('.event-tile, .event-row').count();
      expect(restoredCount).toBe(baselineCount);
    });
  });

  test.describe('Persistence and schema migration', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/');
      await waitForCalendarToLoad(page);
    });

    test('persisted dateFilter is restored on page reload', async ({ page }) => {
      await page.getByTestId('filter-chip-date-aktuelleWoche').click();
      await expect(page.getByTestId('filter-chip-date-aktuelleWoche')).toHaveAttribute(
        'aria-pressed',
        'true'
      );

      await page.reload();
      await waitForCalendarToLoad(page);

      await expect(page.getByTestId('filter-chip-date-aktuelleWoche')).toHaveAttribute(
        'aria-pressed',
        'true'
      );
      await expect(page.getByTestId('filter-chip-date-heute')).toHaveAttribute(
        'aria-pressed',
        'false'
      );
    });

    test('an unknown persisted dateFilter value is dropped on load', async ({ page }) => {
      await page.evaluate(() => {
        localStorage.setItem(
          'calendarFilterState',
          JSON.stringify({
            currentMonth: '2026-09',
            selectedCategories: [],
            selectedOrte: [],
            dateFilter: 'next-week',
            viewMode: 'card',
          })
        );
      });

      await page.goto('/');
      await waitForCalendarToLoad(page);

      const stored = await page.evaluate(() => localStorage.getItem('calendarFilterState'));
      const parsed = JSON.parse(stored!);
      // Either deleted entirely (undefined) or reset to null — both mean "no
      // active filter". We accept either form so the test isn't coupled to
      // which way the migration runs.
      expect([undefined, null]).toContain(parsed.dateFilter);
    });
  });
});
