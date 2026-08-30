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
      await expect(page.locator('.filter-section-title')).toHaveText('Hier kannst du filtern');
      await expect(page.locator('.filter-toggle-btn')).toHaveCount(0);
    });
  });

  test.describe('Category Filters', () => {
    test('category chips are always visible', async ({ page }) => {
      const chips = page.locator('.filter-chip--category');
      const count = await chips.count();
      expect(count).toBeGreaterThan(5);
    });

    test('shows all category quick actions', async ({ page }) => {
      await expect(page.locator('.filter-panel button:has-text("Alle")').first()).toBeVisible();
      await expect(page.locator('.filter-panel button:has-text("Keine")').first()).toBeVisible();
    });

    test('"Alle" button selects all categories', async ({ page }) => {
      const firstChip = page.locator('.filter-chip--category').first();
      await firstChip.click();
      await expect(firstChip).toHaveAttribute('aria-pressed', 'false');
      await page.locator('.filter-panel button:has-text("Alle")').first().click();
      const firstChipAfter = page.locator('.filter-chip--category').first();
      await expect(firstChipAfter).toHaveAttribute('aria-pressed', 'true');
    });

    test('"Keine" button deselects all categories', async ({ page }) => {
      await page.locator('.filter-panel button:has-text("Keine")').first().click();
      const chips = page.locator('.filter-chip--category');
      const allUnpressed = await chips.evaluateAll((els) =>
        els.every((el) => el.getAttribute('aria-pressed') !== 'true')
      );
      expect(allUnpressed).toBe(true);
    });
  });

  test.describe('Mehr Filter Accordion', () => {
    test('accordion is initially collapsed and reveals Orte on open', async ({ page }) => {
      const accordion = page.locator('.filter-accordion');
      await expect(accordion).toBeVisible();
      await expect(accordion).toHaveJSProperty('open', false);
      await expect(page.locator('.filter-accordion-body')).toBeHidden();

      await accordion.locator('.filter-accordion-summary').click();
      await expect(accordion).toHaveJSProperty('open', true);
      const orte = ['Bregenz', 'Dornbirn', 'Feldkirch', 'Bludenz', 'Grenznahe'];
      for (const district of orte) {
        await expect(
          page.locator(`.filter-accordion button:has-text("${district}")`)
        ).toBeVisible();
      }

      await accordion.locator('.filter-accordion-summary').click();
      await expect(accordion).toHaveJSProperty('open', false);
    });
  });

  test.describe('Ort Filters', () => {
    test('Grenznahe district filter can be toggled once accordion is open', async ({ page }) => {
      await page.locator('.filter-accordion .filter-accordion-summary').click();
      await expect(page.locator('.filter-accordion')).toHaveJSProperty('open', true);
      const grenznaheChip = page
        .locator('.filter-chip--ort')
        .filter({ hasText: 'Grenznahe' })
        .first();
      await expect(grenznaheChip).toBeVisible();
      await grenznaheChip.click();
      await expect(grenznaheChip).toHaveAttribute('aria-pressed', 'true');
    });

    test('Online chip is visible alongside the districts and is toggleable', async ({ page }) => {
      await page.locator('.filter-accordion .filter-accordion-summary').click();
      await expect(page.locator('.filter-accordion')).toHaveJSProperty('open', true);

      const onlineChip = page.getByTestId('filter-chip-online');
      await expect(onlineChip).toBeVisible();
      await expect(onlineChip).toHaveText('Online');
      await onlineChip.click();
      await expect(onlineChip).toHaveAttribute('aria-pressed', 'true');
    });
  });

  test.describe('Filter Persistence', () => {
    test('stale ISO-timestamp localStorage value is dropped so user lands on current month', async ({
      page,
    }) => {
      await page.evaluate(() => {
        localStorage.setItem(
          'calendarFilterState',
          JSON.stringify({
            currentMonth: '2026-07-31T22:00:00.000Z',
            selectedCategories: [
              'Yoga',
              'Meditation',
              'Tanz',
              'Singen',
              'Breathwork',
              'Soundhealing',
              'Sonstiges',
            ],
            selectedOrte: [],
            viewMode: 'list',
          })
        );
      });

      await page.goto('/');
      await waitForCalendarToLoad(page);

      const stored = await page.evaluate(() => localStorage.getItem('calendarFilterState'));
      expect(stored).toBeTruthy();
      const parsed = JSON.parse(stored!);
      expect(parsed.currentMonth).toMatch(/^\d{4}-(0[1-9]|1[0-2])$/);
    });
  });

  test.describe('Day Popover', () => {
    test('opens on click, shows events, closes via close button and overlay, navigates to detail', async ({
      page,
    }) => {
      const dayCell = page.locator('.calendar-cell.has-events').first();
      if (!(await dayCell.isVisible({ timeout: 3000 }).catch(() => false))) {
        test.skip(true, 'no seeded day with events visible in current month');
        return;
      }

      await dayCell.click();
      await expect(page.locator('.day-popover')).toBeVisible();
      const events = page.locator('.day-popover-event');
      await expect(events.first()).toBeVisible();

      await page.locator('.day-popover-close').click();
      await expect(page.locator('.day-popover')).not.toBeVisible();

      await dayCell.click();
      await page.locator('.day-popover-overlay').click({ position: { x: 10, y: 10 } });
      await expect(page.locator('.day-popover')).not.toBeVisible();

      await dayCell.click();
      await page.locator('.day-popover-event').first().click();
      await expect(page).toHaveURL(/\/event\//);
    });
  });

  test.describe('Mobile View', () => {
    test('filter panel stays visible on narrow viewport', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      await page.goto('/');
      await waitForCalendarToLoad(page);

      await expect(page.locator('.filter-panel')).toBeVisible();
      await expect(page.locator('.calendar')).toBeHidden();
    });
  });

  test.describe('Desktop Calendar Grid', () => {
    test('shows weekday headers and 42 cells', async ({ page }) => {
      const weekdays = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
      for (const day of weekdays) {
        await expect(page.locator(`.weekday:has-text("${day}")`)).toBeVisible();
      }
      await expect(page.locator('.calendar-cell')).toHaveCount(42);
    });

    test('today is highlighted after clicking Heute', async ({ page }) => {
      await page.locator('.btn-today').click();
      await expect(page.locator('.calendar-cell.today')).toBeVisible();
    });

    test('month navigation arrows change displayed month and back', async ({ page }) => {
      const header = page.locator('.calendar-header h2');
      const initialMonth = await header.textContent();

      await page.locator('button[title="Nächster Monat"]').click();
      await expect(header).not.toHaveText(initialMonth ?? '');

      await page.locator('button[title="Vorheriger Monat"]').click();
      await expect(header).toHaveText(initialMonth ?? '');
    });
  });
});
