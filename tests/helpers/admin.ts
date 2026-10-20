import type { Page } from '@playwright/test';

/**
 * The Verwaltung tabs live in drop-down menus. Opens the menu that contains the
 * tab (if it is not already open) so the tab can be clicked / asserted visible.
 */
export async function openAdminTab(page: Page, tab: string): Promise<void> {
  const item = page.getByTestId(`admin-tab-${tab}`);
  if (await item.isVisible()) return;
  // The menu is portalled to <body>, so find its group via the menu's test id.
  const menu = page.locator('.admin-page-group-menu').filter({ has: item });
  const menuId = await menu.getAttribute('data-testid');
  const group = menuId?.replace('admin-group-menu-', '');
  await page.getByTestId(`admin-group-${group}`).click();
}
