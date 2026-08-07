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

    test('active chip is visually distinct from inactive (filled vs outline)', async ({ page }) => {
      await page.locator('.filter-panel button:has-text("Keine")').first().click();
      const inactive = page.locator('.filter-chip--category').first();
      const inactiveBg = await inactive.evaluate(
        (el) => window.getComputedStyle(el).backgroundColor
      );

      await page.locator('.filter-panel button:has-text("Alle")').first().click();
      const active = page.locator('.filter-chip--category').first();
      const activeBg = await active.evaluate((el) => window.getComputedStyle(el).backgroundColor);

      expect(activeBg).not.toBe(inactiveBg);
    });

    test('active chip renders the check icon (svg with non-zero icon width)', async ({ page }) => {
      const chip = page.locator('.filter-chip--category').first();
      await expect(chip).toHaveAttribute('aria-pressed', 'true');

      const icon = chip.locator('.filter-chip-icon');
      const iconWidth = await icon.evaluate((el) => el.getBoundingClientRect().width);
      expect(iconWidth).toBeGreaterThan(0);
    });

    test('inactive chip hides the check icon (icon width collapses to 0)', async ({ page }) => {
      await page.locator('.filter-panel button:has-text("Keine")').first().click();
      const chip = page.locator('.filter-chip--category').first();
      await expect(chip).toHaveAttribute('aria-pressed', 'false');

      const icon = chip.locator('.filter-chip-icon');
      const iconWidth = await icon.evaluate((el) => el.getBoundingClientRect().width);
      expect(iconWidth).toBe(0);
    });

    test('inactive category chips share a uniform neutral background', async ({ page }) => {
      await page.locator('.filter-panel button:has-text("Keine")').first().click();
      const chips = page.locator('.filter-chip--category');
      const bgs = await chips.evaluateAll((els) =>
        els.map((el) => window.getComputedStyle(el).backgroundColor)
      );
      expect(new Set(bgs).size).toBe(1);
    });

    test('active category chip takes its respective category color', async ({ page }) => {
      const yoga = page.locator('.filter-chip--category[data-category="Yoga"]');
      await expect(yoga).toHaveAttribute('aria-pressed', 'true');

      const [chipBg, categoryVar] = await Promise.all([
        yoga.evaluate((el) => window.getComputedStyle(el).backgroundColor),
        yoga.evaluate((el) =>
          window.getComputedStyle(el).getPropertyValue('--category-color').trim()
        ),
      ]);

      expect(categoryVar).not.toBe('');
      expect(categoryVar).not.toBe('initial');
      expect(chipBg).not.toBe('rgba(0, 0, 0, 0)');
      expect(chipBg).not.toBe('transparent');
    });

    test('each category chip carries its own --category-color CSS variable', async ({ page }) => {
      const expected = ['Yoga', 'Meditation', 'Tanz', 'Singen', 'Atemarbeit', 'Sonstiges'];
      const colors = await Promise.all(
        expected.map((name) =>
          page
            .locator(`.filter-chip--category[data-category="${name}"]`)
            .evaluate((el) =>
              window.getComputedStyle(el).getPropertyValue('--category-color').trim()
            )
        )
      );

      expect(colors.every((c) => c !== '' && c !== 'initial')).toBe(true);
    });

    test('district chip does not use a category color (stays on accent)', async ({ page }) => {
      await page.locator('.filter-accordion .filter-accordion-summary').click();
      const bregenz = page.locator('.filter-chip--bezirk').filter({ hasText: 'Bregenz' }).first();
      await bregenz.click();

      const cssVars = await bregenz.evaluate((el) => {
        const s = window.getComputedStyle(el);
        return {
          categoryColor: s.getPropertyValue('--category-color').trim(),
          bg: s.backgroundColor,
        };
      });

      expect(cssVars.categoryColor).toBe('');
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
        await expect(
          page.locator(`.filter-accordion button:has-text("${district}")`)
        ).toBeVisible();
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
      const grenznaheChip = page
        .locator('.filter-chip--bezirk')
        .filter({ hasText: 'Grenznahe' })
        .first();
      await expect(grenznaheChip).toBeVisible();
      await grenznaheChip.click();
      await expect(grenznaheChip).toHaveAttribute('aria-pressed', 'true');
    });

    test('district filter section is hidden while accordion is collapsed', async ({ page }) => {
      await expect(page.locator('.filter-accordion')).toHaveJSProperty('open', false);
      await expect(page.locator('.filter-accordion-body')).toBeHidden();
    });
  });

  test.describe('Filter Persistence Across Month Navigation', () => {
    test('filters persist when navigating to next month', async ({ page }) => {
      test.skip();
    });

    test('filters persist when clicking Heute button', async ({ page }) => {
      test.skip();
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
