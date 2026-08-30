import { test, expect } from '@playwright/test';
import { waitForCalendarToLoad } from '../helpers/auth';

test.describe('Calendar: "Ort" filter with "Online" chip (bN2nCsOa)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForCalendarToLoad(page);
  });

  test('the filter accordion label is "Ort" (was previously "Bezirk")', async ({ page }) => {
    await page.locator('.filter-accordion .filter-accordion-summary').click();
    await expect(page.locator('.filter-accordion')).toHaveJSProperty('open', true);
    await expect(page.locator('.filter-accordion .filter-label')).toHaveText('Ort');
  });

  test('the Online filter chip is present alongside the district chips', async ({ page }) => {
    await page.locator('.filter-accordion .filter-accordion-summary').click();
    await expect(page.locator('.filter-accordion')).toHaveJSProperty('open', true);

    const districts = ['Bregenz', 'Dornbirn', 'Feldkirch', 'Bludenz', 'Grenznahe'];
    for (const district of districts) {
      await expect(page.locator(`.filter-accordion button:has-text("${district}")`)).toBeVisible();
    }

    const onlineChip = page.getByTestId('filter-chip-online');
    await expect(onlineChip).toBeVisible();
    await expect(onlineChip).toHaveText('Online');
  });

  test('"Alle" button in the location filter also selects the Online chip', async ({ page }) => {
    await page.locator('.filter-accordion .filter-accordion-summary').click();

    const onlineChip = page.getByTestId('filter-chip-online');
    await onlineChip.click();
    await expect(onlineChip).toHaveAttribute('aria-pressed', 'true');

    // Click the "Keine" button first to clear the Online chip, then "Alle" should
    // re-enable it together with the district chips.
    await page.locator('.filter-accordion button:has-text("Keine")').click();
    await expect(onlineChip).toHaveAttribute('aria-pressed', 'false');

    await page.locator('.filter-accordion button:has-text("Alle")').click();
    await expect(onlineChip).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.filter-accordion button:has-text("Bregenz")')).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });

  test('selecting only the Online chip filters the agenda to online events', async ({ page }) => {
    await page.locator('.filter-accordion .filter-accordion-summary').click();
    const onlineChip = page.getByTestId('filter-chip-online');
    await onlineChip.click();

    // Read the persisted filter state and confirm it stores the new key.
    const stored = await page.evaluate(() => localStorage.getItem('calendarFilterState'));
    expect(stored).toBeTruthy();
    const parsed = JSON.parse(stored!);
    expect(parsed.selectedOrte).toEqual(['Online']);
    expect(parsed.selectedBezirke).toBeUndefined();
  });

  test('legacy localStorage state with selectedBezirke is migrated to selectedOrte', async ({
    page,
  }) => {
    await page.evaluate(() => {
      localStorage.setItem(
        'calendarFilterState',
        JSON.stringify({
          currentMonth: '2026-08',
          selectedCategories: [
            'Yoga',
            'Meditation',
            'Tanz',
            'Singen',
            'Breathwork',
            'Soundhealing',
            'Sonstiges',
          ],
          selectedBezirke: ['Bregenz'],
          viewMode: 'card',
        })
      );
    });

    await page.goto('/');
    await waitForCalendarToLoad(page);

    await page.locator('.filter-accordion .filter-accordion-summary').click();
    await expect(page.locator('.filter-accordion button:has-text("Bregenz")')).toHaveAttribute(
      'aria-pressed',
      'true'
    );

    const stored = await page.evaluate(() => localStorage.getItem('calendarFilterState'));
    const parsed = JSON.parse(stored!);
    expect(parsed.selectedOrte).toEqual(['Bregenz']);
    expect(parsed.selectedBezirke).toBeUndefined();
  });
});
