import { test, expect } from '@playwright/test';
import { signInWithEmailAndPassword, signOut } from '../helpers/auth';

const PROJECT_ID = 'spirieventsvbg';
const FIRESTORE_BASE = `http://127.0.0.1:8181/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

async function clearThemeDoc(): Promise<void> {
  await fetch(`${FIRESTORE_BASE}/app_settings/theme`, {
    method: 'DELETE',
    headers: { Authorization: 'Bearer owner' },
  }).catch(() => {});
}

async function seedThemeDoc(): Promise<void> {
  // The seeder uses anonymous writes gated on `createdBy == 'system'`, so
  // we mirror that exact shape here — emulators don't enforce auth on
  // writes that match this rule.
  await fetch(`${FIRESTORE_BASE}/app_settings/theme?documentId=theme`, {
    method: 'POST',
    headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fields: {
        '--bg-primary': { stringValue: '#f4f2f0' },
        '--bg-secondary': { stringValue: '#eae7e2' },
        '--bg-calendar': { stringValue: '#ffffff' },
        '--heading-color': { stringValue: '#a6a487' },
        '--accent-secondary': { stringValue: '#667c62' },
        '--accent-primary': { stringValue: '#c48e6a' },
        '--accent-primary-hover': { stringValue: '#9a5f38' },
        '--accent-primary-strong': { stringValue: '#9a5f38' },
        '--accent-soft': { stringValue: 'rgba(196, 142, 106, 0.14)' },
        '--text-primary': { stringValue: '#161819' },
        '--text-secondary': { stringValue: '#605e5e' },
        '--text-light': { stringValue: '#938d87' },
        '--border': { stringValue: '#e2dcd2' },
        '--error': { stringValue: '#bf5b4e' },
        '--error-hover': { stringValue: '#a94a3e' },
        '--chip-bg': { stringValue: 'rgba(196, 142, 106, 0.14)' },
        '--chip-text': { stringValue: '#9a5f38' },
        '--free-bg': { stringValue: 'rgba(122, 138, 95, 0.16)' },
        '--free-text': { stringValue: '#5c6b3f' },
        '--fee-bg': { stringValue: 'rgba(196, 142, 106, 0.16)' },
        '--fee-text': { stringValue: '#9a5f38' },
        '--donation-bg': { stringValue: 'rgba(140, 120, 180, 0.16)' },
        '--donation-text': { stringValue: '#6b568b' },
        '--pending-bg': { stringValue: 'rgba(198, 160, 92, 0.18)' },
        '--pending-text': { stringValue: '#8a6d2f' },
        '--sound-healing': { stringValue: '#6b568b' },
        '--category-teal': { stringValue: '#4a7572' },
        createdBy: { stringValue: 'system' },
      },
    }),
  });
}

test.describe('Admin Theme tab (Xks3pwLt)', () => {
  test.beforeEach(async () => {
    await clearThemeDoc();
    await seedThemeDoc();
  });

  test.afterEach(async ({ page }) => {
    await signOut(page);
  });

  test('admin can open the Theme tab and see all theme variables grouped', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin?tab=theme');

    await expect(page.getByTestId('admin-tab-theme')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('theme-tab')).toBeVisible();

    // Wait for the snapshot to land and the rows to render.
    const rows = page.locator('[data-testid="theme-row"]');
    await expect(rows.first()).toBeVisible({ timeout: 15000 });
    const rowCount = await rows.count();
    expect(rowCount).toBeGreaterThan(15); // we expose ~22 color tokens

    // Group headers are rendered.
    await expect(page.getByTestId('theme-tab-group').first()).toBeVisible();
  });

  test('admin can change a variable via the color picker and the live :root updates', async ({
    page,
  }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin?tab=theme');

    // Find the row for --accent-primary and edit it.
    const row = page.locator('[data-variable-name="--accent-primary"]');
    await expect(row).toBeVisible({ timeout: 15000 });
    const hex = row.getByTestId('color-picker-hex');
    await hex.fill('#123456');

    // The hook should set document.documentElement.style.setProperty
    // on the live page. We assert against the computed style of the
    // document root.
    await expect
      .poll(async () => {
        return page.evaluate(() =>
          getComputedStyle(document.documentElement).getPropertyValue('--accent-primary').trim()
        );
      })
      .toBe('#123456');

    // The row should now show the "modified" badge.
    await expect(row).toHaveAttribute('data-modified', 'true');
  });

  test('reset on a modified row restores the bundled default', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin?tab=theme');

    const row = page.locator('[data-variable-name="--accent-primary"]');
    await expect(row).toBeVisible({ timeout: 15000 });
    await row.getByTestId('color-picker-hex').fill('#123456');

    await expect(row).toHaveAttribute('data-modified', 'true', { timeout: 5000 });

    // Wait until the reset button is enabled. The Firestore snapshot
    // causes the row to re-render briefly, so we wait for a stable
    // enabled state before clicking.
    const reset = row.getByTestId('theme-row-reset');
    await expect(reset).toBeEnabled({ timeout: 5000 });
    await reset.click({ force: true });

    await expect
      .poll(async () => {
        return page.evaluate(() =>
          getComputedStyle(document.documentElement).getPropertyValue('--accent-primary').trim()
        );
      })
      .toBe('#c48e6a');
  });

  test('info dialog opens and shows the usage list', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin?tab=theme');

    const row = page.locator('[data-variable-name="--accent-primary"]');
    await expect(row).toBeVisible({ timeout: 15000 });
    await row.getByTestId('theme-row-info').click();

    const dialog = page.getByTestId('theme-info-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('[data-testid="theme-info-name"]')).toContainText(
      '--accent-primary'
    );
    await expect(dialog.locator('[data-testid="theme-info-usage-list"] li').first()).toBeVisible();
  });

  test('"Reset all" confirm dialog restores every token to the bundled defaults', async ({
    page,
  }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin?tab=theme');

    // Change two tokens to confirm the counter shows up and the reset works.
    const accentRow = page.locator('[data-variable-name="--accent-primary"]');
    await expect(accentRow).toBeVisible({ timeout: 15000 });
    await accentRow.getByTestId('color-picker-hex').fill('#123456');
    await expect(accentRow).toHaveAttribute('data-modified', 'true', { timeout: 5000 });

    const textRow = page.locator('[data-variable-name="--text-primary"]');
    await expect(textRow).toBeVisible({ timeout: 5000 });
    await textRow.getByTestId('color-picker-hex').fill('#abcdef');
    await expect(textRow).toHaveAttribute('data-modified', 'true', { timeout: 5000 });

    // The modified counter should appear and the reset button should enable.
    const resetAll = page.getByTestId('theme-tab-reset-all');
    await expect(resetAll).toBeEnabled({ timeout: 5000 });
    await resetAll.click({ force: true });
    await expect(page.getByText(/Alle Theme-Variablen zurücksetzen/)).toBeVisible();
    await page.locator('.confirm-dialog').getByRole('button', { name: 'Zurücksetzen' }).click();

    await expect
      .poll(async () => {
        return page.evaluate(() =>
          getComputedStyle(document.documentElement).getPropertyValue('--accent-primary').trim()
        );
      })
      .toBe('#c48e6a');

    await expect
      .poll(async () => {
        return page.evaluate(() =>
          getComputedStyle(document.documentElement).getPropertyValue('--text-primary').trim()
        );
      })
      .toBe('#161819');
  });
});
