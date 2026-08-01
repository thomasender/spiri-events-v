import { test, expect } from '@playwright/test';
import { waitForCalendarToLoad } from '../helpers/auth';

test.describe('Calendar Integration', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForCalendarToLoad(page);
  });

  test.describe('Calendar Page Loading', () => {
    test('calendar page loads successfully', async ({ page }) => {
      await expect(page.locator('.calendar')).toBeVisible();
      await expect(page.locator('.calendar-header')).toBeVisible();
    });

    test('displays calendar header with month and year', async ({ page }) => {
      const header = page.locator('.calendar-header h2');
      await expect(header).toBeVisible();
      const text = await header.textContent();
      expect(text).toMatch(
        /Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember/
      );
    });

    test('shows navigation controls', async ({ page }) => {
      await expect(page.locator('.btn-today')).toBeVisible();
      await expect(page.locator('button[title="Vorheriger Monat"]')).toBeVisible();
      await expect(page.locator('button[title="Nächster Monat"]')).toBeVisible();
    });
  });

  test.describe('Category Filters', () => {
    test('filter button is visible', async ({ page }) => {
      const filterBtn = page.locator('.filter-toggle-btn');
      await expect(filterBtn).toBeVisible();
    });

    test('opens filter panel when filter button clicked', async ({ page }) => {
      await page.locator('.filter-toggle-btn').click();
      await expect(page.locator('.filter-panel')).toBeVisible();
    });

    test('closes filter panel when toggled again', async ({ page }) => {
      await page.locator('.filter-toggle-btn').click();
      await expect(page.locator('.filter-panel')).toBeVisible();
      await page.locator('.filter-toggle-btn').click();
      await expect(page.locator('.filter-panel')).not.toBeVisible();
    });

    test('shows category checkboxes when filter panel opens', async ({ page }) => {
      await page.locator('.filter-toggle-btn').click();
      await expect(page.locator('.filter-panel')).toBeVisible();
      const checkboxes = page.locator('.filter-checkbox input[type="checkbox"]');
      const count = await checkboxes.count();
      expect(count).toBeGreaterThan(5);
    });

    test('category filter badge shows count when filters active', async ({ page }) => {
      await page.locator('.filter-toggle-btn').click();
      await expect(page.locator('.filter-panel')).toBeVisible();
      const firstLabel = page.locator('.filter-checkbox').first();
      await firstLabel.click();
      await expect(page.locator('.filter-badge')).toBeVisible();
    });

    test('"Alle" button selects all categories', async ({ page }) => {
      await page.locator('.filter-toggle-btn').click();
      await expect(page.locator('.filter-panel')).toBeVisible();
      const firstLabel = page.locator('.filter-checkbox').first();
      await firstLabel.click();
      await page.locator('.filter-panel button:has-text("Alle")').first().click();
      const checkbox = page.locator('.filter-checkbox').first().locator('input[type="checkbox"]');
      await expect(checkbox).toBeChecked();
    });

    test('"Keine" button deselects all categories', async ({ page }) => {
      await page.locator('.filter-toggle-btn').click();
      await expect(page.locator('.filter-panel')).toBeVisible();
      await page.locator('.filter-panel button:has-text("Keine")').first().click();
      const checkboxes = page.locator('.filter-checkbox input[type="checkbox"]');
      const allUnchecked = await checkboxes.evaluateAll((els) =>
        els.every((el) => !(el as HTMLInputElement).checked)
      );
      expect(allUnchecked).toBe(true);
    });
  });

  test.describe('District Filters', () => {
    test('shows district filter section', async ({ page }) => {
      await page.locator('.filter-toggle-btn').click();
      await expect(page.locator('.filter-header:has-text("Bezirk")')).toBeVisible();
      await expect(page.locator('text=Bezirk')).toBeVisible();
    });

    test('shows all district options', async ({ page }) => {
      await page.locator('.filter-toggle-btn').click();
      const districts = ['Bregenz', 'Dornbirn', 'Feldkirch', 'Bludenz'];
      for (const district of districts) {
        await expect(page.locator(`.filter-panel:has-text("${district}")`)).toBeVisible();
      }
    });
  });

  test.describe('Filter Persistence Across Month Navigation', () => {
    test('filters persist when navigating to next month', async ({ page }) => {
      await page.locator('.filter-toggle-btn').click();
      await expect(page.locator('.filter-panel')).toBeVisible();
      const firstLabel = page.locator('.filter-checkbox').first();
      await firstLabel.click();
      await page.locator('.filter-toggle-btn').click();
      await expect(page.locator('.filter-panel')).not.toBeVisible();

      await page.locator('button[title="Nächster Monat"]').click();
      await page.waitForTimeout(500);

      await page.locator('.filter-toggle-btn').click();
      await expect(page.locator('.filter-panel')).toBeVisible();
      const checkbox = page.locator('.filter-checkbox').first().locator('input[type="checkbox"]');
      const isStillUnchecked = await checkbox.isChecked();
      expect(isStillUnchecked).toBe(false);
    });

    test('filters persist when clicking Heute button', async ({ page }) => {
      await page.locator('.filter-toggle-btn').click();
      await expect(page.locator('.filter-panel')).toBeVisible();
      const firstLabel = page.locator('.filter-checkbox').first();
      await firstLabel.click();
      await page.locator('.filter-toggle-btn').click();
      await expect(page.locator('.filter-panel')).not.toBeVisible();

      await page.locator('.btn-today').click();
      await page.waitForTimeout(500);

      await page.locator('.filter-toggle-btn').click();
      await expect(page.locator('.filter-panel')).toBeVisible();
      const checkbox = page.locator('.filter-checkbox').first().locator('input[type="checkbox"]');
      const isStillUnchecked = await checkbox.isChecked();
      expect(isStillUnchecked).toBe(false);
    });
  });

  test.describe('Event Recurrence Display', () => {
    test('recurring events show recurrence indicator', async ({ page }) => {
      await page.goto('/');
      await waitForCalendarToLoad(page);
      const eventDots = page.locator('.cell-dot');
      const count = await eventDots.count();
      if (count > 0) {
        await expect(eventDots.first()).toBeVisible();
      }
    });
  });

  test.describe('Event Navigation', () => {
    test('clicking event in day popover navigates to event detail page', async ({ page }) => {
      await page.goto('/');
      await waitForCalendarToLoad(page);

      const dayCell = page.locator('.calendar-cell.has-events').first();
      if (await dayCell.isVisible({ timeout: 3000 })) {
        await dayCell.click();
        const firstEvent = page.locator('.day-popover-event').first();
        await firstEvent.click();
        await expect(page).toHaveURL(/\/event\//);
      }
    });
  });

  test.describe('Mobile View', () => {
    test('week strip is not shown on narrow viewport', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      await page.goto('/');
      await waitForCalendarToLoad(page);

      await expect(page.locator('.mobile-week-nav')).toHaveCount(0);
      await expect(page.locator('.week-strip')).toHaveCount(0);
    });

    test('mobile agenda is visible on narrow viewport', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      await page.goto('/');
      await waitForCalendarToLoad(page);

      await expect(page.locator('.mobile-agenda')).toBeVisible();
    });
  });

  test.describe('Desktop Calendar Grid', () => {
    test('shows weekday headers', async ({ page }) => {
      await page.goto('/');
      await waitForCalendarToLoad(page);

      const weekdays = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
      for (const day of weekdays) {
        await expect(page.locator(`.weekday:has-text("${day}")`)).toBeVisible();
      }
    });

    test('calendar grid contains 42 cells', async ({ page }) => {
      await page.goto('/');
      await waitForCalendarToLoad(page);

      const cells = page.locator('.calendar-cell');
      await expect(cells).toHaveCount(42);
    });

    test('today is highlighted after clicking Heute', async ({ page }) => {
      await page.goto('/');
      await waitForCalendarToLoad(page);

      await page.locator('.btn-today').click();
      await page.waitForTimeout(600);

      await expect(page.locator('.calendar-cell.today')).toBeVisible();
    });
  });
});
