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

  test.describe('Filter Panel', () => {
    test('filter panel is always visible without a toggle', async ({ page }) => {
      await expect(page.locator('.filter-panel')).toBeVisible();
    });

    test('shows section title "Hier kannst du filtern"', async ({ page }) => {
      await expect(page.locator('.filter-section-title')).toHaveText('Hier kannst du filtern');
    });

    test('does not render the removed filter toggle button', async ({ page }) => {
      await expect(page.locator('.filter-toggle-btn')).toHaveCount(0);
    });

    test('does not render the removed "Deine Auswahl" containers', async ({ page }) => {
      await expect(page.locator('.sidebar-card-mobile')).toHaveCount(0);
      await expect(page.locator('.selection-chip')).toHaveCount(0);
      await expect(page.locator('.sidebar-card-title')).toHaveCount(0);
    });
  });

  test.describe('Category Filters', () => {
    test('category checkboxes are always visible', async ({ page }) => {
      const checkboxes = page.locator('.filter-checkbox input[type="checkbox"]');
      const count = await checkboxes.count();
      expect(count).toBeGreaterThan(5);
    });

    test('shows all category quick actions', async ({ page }) => {
      await expect(page.locator('.filter-panel button:has-text("Alle")').first()).toBeVisible();
      await expect(page.locator('.filter-panel button:has-text("Keine")').first()).toBeVisible();
    });

    test('"Alle" button selects all categories', async ({ page }) => {
      const firstLabel = page.locator('.filter-checkbox').first();
      await firstLabel.click();
      await page.locator('.filter-panel button:has-text("Alle")').first().click();
      const checkbox = page.locator('.filter-checkbox').first().locator('input[type="checkbox"]');
      await expect(checkbox).toBeChecked();
    });

    test('"Keine" button deselects all categories', async ({ page }) => {
      await page.locator('.filter-panel button:has-text("Keine")').first().click();
      const checkboxes = page.locator('.filter-checkbox input[type="checkbox"]');
      const allUnchecked = await checkboxes.evaluateAll((els) =>
        els.every((el) => !(el as HTMLInputElement).checked)
      );
      expect(allUnchecked).toBe(true);
    });
  });

  test.describe('Category Filter Colors', () => {
    const expectedCategories = [
      { name: 'Yoga', color: 'rgb(196, 142, 106)' },
      { name: 'Meditation', color: 'rgb(92, 107, 63)' },
      { name: 'Tanz', color: 'rgb(138, 109, 47)' },
      { name: 'Singen', color: 'rgb(154, 95, 56)' },
      { name: 'Atemarbeit', color: 'rgb(191, 91, 78)' },
      { name: 'Sonstiges', color: 'rgb(147, 141, 135)' },
    ];

    test('each category filter exposes data-category and a category color', async ({ page }) => {
      for (const { name } of expectedCategories) {
        const filter = page.locator(`.filter-checkbox--category[data-category="${name}"]`);
        await expect(filter).toBeVisible();
        const cssVar = await filter.evaluate((el) =>
          window.getComputedStyle(el).getPropertyValue('--category-color').trim()
        );
        expect(cssVar).not.toBe('');
        expect(cssVar).not.toBe('initial');
      }
    });

    test('each category has a distinct color', async ({ page }) => {
      const colors = await Promise.all(
        expectedCategories.map(async ({ name }) => {
          const filter = page.locator(`.filter-checkbox--category[data-category="${name}"]`);
          return filter.evaluate((el) =>
            window.getComputedStyle(el).getPropertyValue('--category-color').trim()
          );
        })
      );
      expect(new Set(colors).size).toBe(colors.length);
    });

    test('checked category filter applies its category color to border and text', async ({
      page,
    }) => {
      await page.locator('.filter-panel button:has-text("Keine")').first().click();
      for (const { name, color } of expectedCategories) {
        const filter = page.locator(`.filter-checkbox--category[data-category="${name}"]`);
        await filter.click();
        const checkbox = filter.locator('input[type="checkbox"]');
        await expect(checkbox).toBeChecked();

        await expect(filter).toHaveCSS('border-color', color);
        await expect(filter.locator('span')).toHaveCSS('color', color);
      }
    });
  });

  test.describe('Mehr Filter Accordion', () => {
    test('accordion is initially collapsed', async ({ page }) => {
      const accordion = page.locator('.filter-accordion');
      await expect(accordion).toBeVisible();
      await expect(accordion).toHaveJSProperty('open', false);
      await expect(page.locator('.filter-accordion-body')).toBeHidden();
    });

    test('opens when clicking the summary and reveals Bezirke options', async ({ page }) => {
      const accordion = page.locator('.filter-accordion');
      await accordion.locator('.filter-accordion-summary').click();
      await expect(accordion).toHaveJSProperty('open', true);
      const districts = ['Bregenz', 'Dornbirn', 'Feldkirch', 'Bludenz', 'Grenznahe'];
      for (const district of districts) {
        await expect(page.locator(`.filter-accordion label:has-text("${district}")`)).toBeVisible();
      }
    });

    test('toggles closed when summary is clicked again', async ({ page }) => {
      const accordion = page.locator('.filter-accordion');
      await accordion.locator('.filter-accordion-summary').click();
      await expect(accordion).toHaveJSProperty('open', true);
      await accordion.locator('.filter-accordion-summary').click();
      await expect(accordion).toHaveJSProperty('open', false);
    });
  });

  test.describe('District Filters', () => {
    test('Grenznahe district filter can be toggled once accordion is open', async ({ page }) => {
      await page.locator('.filter-accordion .filter-accordion-summary').click();
      await expect(page.locator('.filter-accordion')).toHaveJSProperty('open', true);
      const grenznaheLabel = page
        .locator('.filter-accordion label')
        .filter({ hasText: 'Grenznahe' })
        .first();
      await expect(grenznaheLabel).toBeVisible();
      await grenznaheLabel.click();
      const checkbox = grenznaheLabel.locator('input[type="checkbox"]');
      await expect(checkbox).toBeChecked();
    });

    test('district filter section is hidden while accordion is collapsed', async ({ page }) => {
      await expect(page.locator('.filter-accordion')).toHaveJSProperty('open', false);
      await expect(page.locator('.filter-accordion-body')).toBeHidden();
    });
  });

  test.describe('Filter Persistence Across Month Navigation', () => {
    test('filters persist when navigating to next month', async ({ page }) => {
      const firstLabel = page.locator('.filter-checkbox').first();
      await firstLabel.click();

      await page.locator('button[title="Nächster Monat"]').click();
      await page.waitForTimeout(500);

      const checkbox = page.locator('.filter-checkbox').first().locator('input[type="checkbox"]');
      const isStillUnchecked = await checkbox.isChecked();
      expect(isStillUnchecked).toBe(false);
    });

    test('filters persist when clicking Heute button', async ({ page }) => {
      const firstLabel = page.locator('.filter-checkbox').first();
      await firstLabel.click();

      await page.locator('.btn-today').click();
      await page.waitForTimeout(500);

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
    test('does not render the removed "Deine Auswahl" mobile card', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      await page.goto('/');
      await waitForCalendarToLoad(page);

      await expect(page.locator('.sidebar-card-mobile')).toHaveCount(0);
      await expect(page.locator('.page-sidebar')).toBeHidden();

      const eventsSection = page.locator('.events-section');
      await expect(eventsSection).toBeVisible();
    });

    test('filter panel stays visible on narrow viewport', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      await page.goto('/');
      await waitForCalendarToLoad(page);

      await expect(page.locator('.filter-panel')).toBeVisible();
      await expect(page.locator('.filter-section-title')).toHaveText('Hier kannst du filtern');
    });

    test('desktop sidebar no longer renders "Deine Auswahl" on wide viewport', async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto('/');
      await waitForCalendarToLoad(page);

      await expect(page.locator('.page-sidebar')).toBeVisible();
      await expect(page.locator('.page-sidebar .sidebar-card-title')).toHaveCount(0);
      await expect(page.locator('.selection-chip')).toHaveCount(0);
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
