import type { Page } from '@playwright/test';

/**
 * The Verwaltung tabs live in drop-down menus. Opens the menu that contains the
 * tab (if it is not already open) so the tab can be clicked / asserted visible.
 */
export async function openAdminTab(page: Page, tab: string): Promise<void> {
  const item = page.getByTestId(`admin-tab-${tab}`);
  if (await item.isVisible()) return;
  await page
    .locator('.admin-page-group')
    .filter({ has: item })
    .locator('.admin-page-group-toggle')
    .click();
}
