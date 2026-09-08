import { test, expect } from '@playwright/test';
import { waitForCalendarToLoad } from '../helpers/auth';

test.describe('Calendar: filter section arrangement (6PqH2x3p)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForCalendarToLoad(page);
  });

  test('shows a "Kategorie" label above its chip row inside the filter panel', async ({ page }) => {
    const categoryContainer = page.locator('[data-testid="filter-options-category"]');
    await expect(categoryContainer).toBeVisible();

    // The "Kategorie" label sits directly above the category chip row, scoped
    // to the filter panel. We scope by hasText to avoid matching the "Datum"
    // label which sits in the same kind of wrapper.
    const label = page
      .locator('.filter-panel .filter-header--section .filter-label', { hasText: 'Kategorie' })
      .first();
    await expect(label).toBeVisible();
  });

  test('renders sections in the order Datum → Kategorie → Mehr Filter accordion', async ({
    page,
  }) => {
    const order = await page.evaluate(() => {
      const panel = document.querySelector('.filter-panel');
      if (!panel) return null;
      const datumHeader = Array.from(
        panel.querySelectorAll('.filter-header--section .filter-label')
      ).find((el) => el.textContent?.trim() === 'Datum');
      const kategorieHeader = Array.from(
        panel.querySelectorAll('.filter-header--section .filter-label')
      ).find((el) => el.textContent?.trim() === 'Kategorie');
      const accordion = panel.querySelector('.filter-accordion');
      if (!datumHeader || !kategorieHeader || !accordion) return null;

      const datumBeforeKategorie = Boolean(
        datumHeader.compareDocumentPosition(kategorieHeader) & Node.DOCUMENT_POSITION_FOLLOWING
      );
      const kategorieBeforeAccordion = Boolean(
        kategorieHeader.compareDocumentPosition(accordion) & Node.DOCUMENT_POSITION_FOLLOWING
      );
      return datumBeforeKategorie && kategorieBeforeAccordion;
    });
    expect(order).toBe(true);
  });

  test('"Alle" and "Keine" quick actions live in the Kategorie section header', async ({
    page,
  }) => {
    const kategorieHeader = page
      .locator('.filter-panel .filter-header--section', { hasText: 'Kategorie' })
      .first();
    await expect(kategorieHeader.locator('button', { hasText: 'Alle' })).toBeVisible();
    await expect(kategorieHeader.locator('button', { hasText: 'Keine' })).toBeVisible();
  });

  test('the Ort quick actions stay inside the Mehr Filter accordion', async ({ page }) => {
    // The accordion is collapsed by default — its body is hidden but still in
    // the DOM. The "Ort" Alle/Keine buttons must live inside it, not at panel
    // top-level.
    const ortButtons = page.locator('.filter-accordion-body button:has-text("Alle")');
    await expect(ortButtons).toHaveCount(1);
    const ortKeineButtons = page.locator('.filter-accordion-body button:has-text("Keine")');
    await expect(ortKeineButtons).toHaveCount(1);
  });
});
