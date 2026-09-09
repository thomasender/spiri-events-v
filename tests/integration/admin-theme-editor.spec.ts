import { test, expect } from '@playwright/test';
import { signInWithEmailAndPassword, signOut } from '../helpers/auth';

const PROJECT_ID = 'spirieventsvbg';
const FIRESTORE_BASE = `http://127.0.0.1:8181/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

async function clearThemeState(): Promise<void> {
  const list = await fetch(`${FIRESTORE_BASE}/themes?pageSize=100`, {
    headers: { Authorization: 'Bearer owner' },
  }).catch(() => null);
  if (list && list.ok) {
    const data = await list.json();
    const ids = (data.documents || []).map((doc) => doc.name.split('/').pop()).filter(Boolean);
    await Promise.all(
      ids.map((id) =>
        fetch(`${FIRESTORE_BASE}/themes/${id}`, {
          method: 'DELETE',
          headers: { Authorization: 'Bearer owner' },
        }).catch(() => {})
      )
    );
  }
  await Promise.all([
    fetch(`${FIRESTORE_BASE}/app_settings/theme`, {
      method: 'DELETE',
      headers: { Authorization: 'Bearer owner' },
    }).catch(() => {}),
    fetch(`${FIRESTORE_BASE}/app_settings/activeTheme`, {
      method: 'DELETE',
      headers: { Authorization: 'Bearer owner' },
    }).catch(() => {}),
  ]);
}

async function seedThemeDoc(): Promise<void> {
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

test.describe('Admin Theme Editor v2 (U2Bcb7jJ)', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async () => {
    await clearThemeState();
    await seedThemeDoc();
  });

  test.afterEach(async ({ page }) => {
    await signOut(page);
  });

  test('admin opens /admin/theme-editor and sees the workspace + sandbox', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin/theme-editor');

    await expect(page.getByTestId('theme-editor-page')).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('theme-editor-workspace')).toBeVisible();
    await expect(page.getByTestId('theme-editor-sidebar')).toBeVisible();
    await expect(page.getByTestId('theme-editor-preview')).toBeVisible();
    await expect(page.getByTestId('theme-editor-sandbox')).toBeVisible();

    const rows = page.locator('[data-testid="theme-editor-row"]');
    await expect(rows.first()).toBeVisible({ timeout: 15000 });
    expect(await rows.count()).toBeGreaterThan(15);

    // Back link points at the admin area.
    const backLink = page.getByTestId('theme-editor-back-link');
    await expect(backLink).toHaveAttribute('href', '/admin');
  });

  test('editing a color paints it onto the live sandbox without affecting the sidebar', async ({
    page,
  }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin/theme-editor');

    const row = page.locator(
      '[data-testid="theme-editor-row"][data-variable-name="--accent-primary"]'
    );
    await expect(row).toBeVisible({ timeout: 15000 });
    await row.getByTestId('color-picker-hex').fill('#0f5132');

    // Sandbox wrapper now exposes the draft value as inline custom prop.
    await expect
      .poll(async () => {
        return page.evaluate(() => {
          const sandbox = document.querySelector('[data-testid="theme-editor-sandbox"]');
          return sandbox ? sandbox.style.getPropertyValue('--accent-primary').trim() : '';
        });
      })
      .toBe('#0f5132');

    // The sidebar <aside> lives OUTSIDE the sandbox, so its computed
    // --accent-primary is determined by :root (the published theme or
    // the editor's broadcast, depending on whether this tab receives
    // its own BroadcastChannel traffic). It must NOT carry the editor's
    // raw hex value as an inline custom property on the wrapper itself.
    const sidebarHasInlineDraft = await page.evaluate(() => {
      const sidebar = document.querySelector('[data-testid="theme-editor-sidebar"]');
      if (!sidebar) return false;
      return sidebar.style.getPropertyValue('--accent-primary').trim() === '#0f5132';
    });
    expect(sidebarHasInlineDraft).toBe(false);

    // Sandbox subtree: a descendant element's computed --accent-primary
    // resolves through the wrapper's inline style, not through :root.
    const sandboxResolves = await page.evaluate(() => {
      const frame = document.querySelector('[data-testid="theme-editor-sandbox-frame"]');
      if (!frame) return null;
      const probe = document.createElement('div');
      frame.appendChild(probe);
      const computed = getComputedStyle(probe).getPropertyValue('--accent-primary').trim();
      probe.remove();
      return computed;
    });
    expect(sandboxResolves).toBeTruthy();
  });

  test('Aktivieren publishes the editor values to the live theme', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin/theme-editor');

    const row = page.locator(
      '[data-testid="theme-editor-row"][data-variable-name="--accent-primary"]'
    );
    await expect(row).toBeVisible({ timeout: 15000 });
    await row.getByTestId('color-picker-hex').fill('#aa0066');

    await expect(row).toHaveAttribute('data-modified', 'true', { timeout: 5000 });
    const activate = page.getByTestId('theme-editor-activate');
    await expect(activate).toBeEnabled({ timeout: 5000 });
    await activate.click();

    // The live theme doc reflects the new value.
    await expect
      .poll(async () => {
        return page.evaluate(() =>
          getComputedStyle(document.documentElement).getPropertyValue('--accent-primary').trim()
        );
      })
      .toBe('#aa0066');

    // And the success banner is shown briefly.
    await expect(page.locator('.theme-editor-banner--success').first()).toBeVisible();
  });

  test('Speichern (Als neues Theme speichern) creates a saved theme', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin/theme-editor');

    const row = page.locator('[data-testid="theme-editor-row"][data-variable-name="--bg-primary"]');
    await expect(row).toBeVisible({ timeout: 15000 });
    await row.getByTestId('color-picker-hex').fill('#202020');

    await page.getByTestId('theme-editor-save-as-new').click();
    const dialog = page.locator('[role="dialog"]').last();
    await expect(dialog).toBeVisible({ timeout: 5000 });

    await dialog.getByLabel(/Name/i).fill('Mein Test-Theme');
    const submit = dialog.locator('button[type="submit"]');
    await submit.click();

    // The library row appears with the new name and an "aktiv"-related
    // tag isn't set yet (the theme hasn't been activated).
    await expect(page.getByTestId('theme-editor-library-row').first()).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByTestId('theme-editor-library-row').first()).toHaveAttribute(
      'data-active',
      'false'
    );
    await expect(page.locator('text=Mein Test-Theme')).toBeVisible();
  });

  test('reset-all confirm dialog resets all rows to the bundled defaults', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin/theme-editor');

    const row = page.locator(
      '[data-testid="theme-editor-row"][data-variable-name="--accent-primary"]'
    );
    await expect(row).toBeVisible({ timeout: 15000 });
    await row.getByTestId('color-picker-hex').fill('#abcdef');
    await expect(row).toHaveAttribute('data-modified', 'true', { timeout: 5000 });

    await page.getByTestId('theme-editor-reset-all').click();
    const confirm = page.locator('.confirm-dialog');
    await expect(confirm).toBeVisible({ timeout: 5000 });
    // The confirm dialog renders the danger-styled confirm button.
    await confirm.locator('.btn-danger').click();

    await expect(row).not.toHaveAttribute('data-modified', 'true', { timeout: 5000 });
  });

  test('Verwerfen reverts the editor to its starting base', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin/theme-editor');

    const row = page.locator(
      '[data-testid="theme-editor-row"][data-variable-name="--accent-primary"]'
    );
    await expect(row).toBeVisible({ timeout: 15000 });
    await row.getByTestId('color-picker-hex').fill('#112233');
    await expect(row).toHaveAttribute('data-modified', 'true', { timeout: 5000 });

    await page.getByTestId('theme-editor-discard').click();
    await expect(row).not.toHaveAttribute('data-modified', 'true', { timeout: 5000 });
  });

  test('the public Theme tab button now navigates to the new editor page', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin');
    const themeTab = page.getByTestId('admin-tab-theme');
    await expect(themeTab).toBeVisible();
    await themeTab.click();
    await page.waitForURL('**/admin/theme-editor');
    await expect(page.getByTestId('theme-editor-page')).toBeVisible({ timeout: 15000 });
  });
});
