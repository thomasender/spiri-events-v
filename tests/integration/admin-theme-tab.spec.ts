import { test, expect } from '@playwright/test';
import { signInWithEmailAndPassword, signOut } from '../helpers/auth';

const PROJECT_ID = 'spirieventsvbg';
const FIRESTORE_BASE = `http://127.0.0.1:8181/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

async function clearThemeDoc(): Promise<void> {
  // The REST API doesn't support DELETE on a collection path — we have
  // to list every doc under `themes/` and delete each one individually.
  // Skipping silently if a collection doesn't exist or the emulator
  // returns a transient error keeps `beforeEach` resilient.
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

test.describe('Admin Theme tab (DfcpNYBw)', () => {
  // Run serially: tests leave saved themes in the registry, and parallel
  // worker collisions produce flaky assertions on the theme-library rows.
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async () => {
    await clearThemeDoc();
    await seedThemeDoc();
  });

  test.afterEach(async ({ page }) => {
    await signOut(page);
  });

  test('admin opens the Theme tab and sees every color token grouped', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin?tab=theme');

    await expect(page.getByTestId('admin-tab-theme')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('theme-tab')).toBeVisible();

    const rows = page.locator('[data-testid="theme-row"]');
    await expect(rows.first()).toBeVisible({ timeout: 15000 });
    const rowCount = await rows.count();
    expect(rowCount).toBeGreaterThan(15);

    await expect(page.getByTestId('theme-tab-group').first()).toBeVisible();
  });

  test('color-picker changes update the sandboxed editor and paint :root live', async ({
    page,
  }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin?tab=theme');

    const row = page.locator('[data-variable-name="--accent-primary"]');
    await expect(row).toBeVisible({ timeout: 15000 });
    const hex = row.getByTestId('color-picker-hex');
    await hex.fill('#123456');

    // The editor row now carries the modified badge.
    await expect(row).toHaveAttribute('data-modified', 'true', { timeout: 5000 });

    // The admin's :root also updates live, because the editor tab
    // broadcasts every change via BroadcastChannel and the page itself
    // (mounted through <ThemeApplier />) re-applies those preview
    // values onto :root. That gives the admin a live kitchen-sink
    // preview of their color picks across the whole admin UI without
    // waiting for "Aktivieren". Visitors without an open editor tab
    // never receive a broadcast so they keep the published theme.
    await expect
      .poll(async () => {
        return page.evaluate(() =>
          getComputedStyle(document.documentElement).getPropertyValue('--accent-primary').trim()
        );
      })
      .toBe('#123456');

    // And the preview card on the same tab reflects the editor value,
    // so the admin still gets the in-tab preview feedback too.
    await expect
      .poll(async () => {
        return page.evaluate(() => {
          const card = document.querySelector('.theme-tab-preview-card');
          if (!card) return null;
          const btn = card.querySelector('.btn-primary');
          return btn ? getComputedStyle(btn).backgroundColor : null;
        });
      })
      .not.toBeNull();
  });

  test('public calendar reflects published theme values after Aktivieren', async ({ browser }) => {
    // The calendar page no longer renders with static CSS defaults:
    // <ThemeApplier /> mounts the hook globally so :root gets the
    // live `app_settings/theme` values on every page load. Without
    // the admin's editor tab open, no BroadcastChannel traffic flows,
    // so the public site shows the published theme — not the
    // sandboxed editor draft.
    const adminCtx = await browser.newContext();
    const adminPage = await adminCtx.newPage();
    await signInWithEmailAndPassword(adminPage, 'admin@test.com', 'testpassword123');
    await adminPage.goto('/admin?tab=theme');

    const accentRow = adminPage.locator('[data-variable-name="--accent-primary"]');
    await expect(accentRow).toBeVisible({ timeout: 15000 });
    await accentRow.getByTestId('color-picker-hex').fill('#0f5132');
    await expect(accentRow).toHaveAttribute('data-modified', 'true', { timeout: 5000 });

    await adminPage.getByTestId('theme-tab-activate').click();
    await expect
      .poll(() =>
        adminPage.evaluate(() =>
          getComputedStyle(document.documentElement).getPropertyValue('--accent-primary').trim()
        )
      )
      .toBe('#0f5132');

    // Open the calendar in a SEPARATE browser context with no admin
    // session — no BroadcastChannel survives across contexts, so the
    // preview window is a fair simulation of what a public visitor
    // would see.
    const publicCtx = await browser.newContext();
    const publicPage = await publicCtx.newPage();
    await publicPage.goto('/');
    await expect
      .poll(() =>
        publicPage.evaluate(() =>
          getComputedStyle(document.documentElement).getPropertyValue('--accent-primary').trim()
        )
      )
      .toBe('#0f5132');

    await adminCtx.close();
    await publicCtx.close();
  });

  test('"Aktivieren" publishes the editor values to the live theme and :root updates', async ({
    page,
  }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin?tab=theme');

    const row = page.locator('[data-variable-name="--accent-primary"]');
    await expect(row).toBeVisible({ timeout: 15000 });
    await row.getByTestId('color-picker-hex').fill('#123456');
    await expect(row).toHaveAttribute('data-modified', 'true', { timeout: 5000 });

    const activate = page.getByTestId('theme-tab-activate');
    await expect(activate).toBeEnabled({ timeout: 5000 });
    await activate.click();

    await expect
      .poll(async () => {
        return page.evaluate(() =>
          getComputedStyle(document.documentElement).getPropertyValue('--accent-primary').trim()
        );
      })
      .toBe('#123456');
  });

  test('reset on a modified row restores the bundled default in the editor', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin?tab=theme');

    const row = page.locator('[data-variable-name="--accent-primary"]');
    await expect(row).toBeVisible({ timeout: 15000 });
    await row.getByTestId('color-picker-hex').fill('#123456');
    await expect(row).toHaveAttribute('data-modified', 'true', { timeout: 5000 });

    const reset = row.getByTestId('theme-row-reset');
    await expect(reset).toBeEnabled({ timeout: 5000 });
    await reset.click({ force: true });

    await expect(row).not.toHaveAttribute('data-modified', undefined, { timeout: 5000 });
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

  test('"Auf Standard zurücksetzen" wipes every editor change after confirmation', async ({
    page,
  }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin?tab=theme');

    const accentRow = page.locator('[data-variable-name="--accent-primary"]');
    await expect(accentRow).toBeVisible({ timeout: 15000 });
    await accentRow.getByTestId('color-picker-hex').fill('#123456');
    await expect(accentRow).toHaveAttribute('data-modified', 'true', { timeout: 5000 });

    const textRow = page.locator('[data-variable-name="--text-primary"]');
    await expect(textRow).toBeVisible({ timeout: 5000 });
    await textRow.getByTestId('color-picker-hex').fill('#abcdef');
    await expect(textRow).toHaveAttribute('data-modified', 'true', { timeout: 5000 });

    const resetAll = page.getByTestId('theme-tab-reset-all');
    await expect(resetAll).toBeEnabled({ timeout: 5000 });
    await resetAll.click({ force: true });
    await expect(page.getByText(/Alle Theme-Variablen auf Standard/i)).toBeVisible();
    await page.locator('.confirm-dialog').getByRole('button', { name: 'Zurücksetzen' }).click();

    await expect(accentRow).not.toHaveAttribute('data-modified', undefined, { timeout: 5000 });
    await expect(textRow).not.toHaveAttribute('data-modified', undefined, { timeout: 5000 });
  });

  test('"Als neues Theme speichern" creates a theme doc in the library', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin?tab=theme');

    const accentRow = page.locator('[data-variable-name="--accent-primary"]');
    await expect(accentRow).toBeVisible({ timeout: 15000 });
    await accentRow.getByTestId('color-picker-hex').fill('#123456');
    await expect(accentRow).toHaveAttribute('data-modified', 'true', { timeout: 5000 });

    await page.getByTestId('theme-tab-save-as-new').click();
    const dialog = page.getByTestId('save-theme-dialog');
    await expect(dialog).toBeVisible();
    const nameInput = dialog.getByTestId('save-theme-name');
    await nameInput.click();
    await nameInput.fill('');
    await nameInput.fill('Waldfrühling');
    await expect(nameInput).toHaveValue('Waldfrühling');
    await dialog.getByTestId('save-theme-confirm').click();

    // The new theme shows up in the library…
    await expect(page.getByTestId('theme-tab-library-empty')).toBeHidden({ timeout: 5000 });
    const row = page.getByTestId('theme-library-row').first();
    await expect(row).toBeVisible({ timeout: 5000 });
    await expect(row.getByTestId('theme-library-row-name')).toContainText('Waldfrühling');

    // …and the corresponding Firestore doc carries the entered name plus
    // the editor values (sanity check via the REST API).
    await expect
      .poll(async () => {
        const r = await fetch(`${FIRESTORE_BASE}/themes?pageSize=20`, {
          headers: { Authorization: 'Bearer owner' },
        });
        const data = await r.json();
        return data.documents?.find((d) => d.fields?.name?.stringValue === 'Waldfrühling');
      })
      .toBeTruthy();
  });

  test('"Aktivieren" on a saved-theme row publishes it to the live theme', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin?tab=theme');

    // Make a change and save it as a named theme via the UI so the row
    // goes through the real admin path (the REST emulator can't bypass
    // the admin auth rule for `themes/`).
    const accentRow = page.locator('[data-variable-name="--accent-primary"]');
    await expect(accentRow).toBeVisible({ timeout: 15000 });
    await accentRow.getByTestId('color-picker-hex').fill('#3f523c');
    await expect(accentRow).toHaveAttribute('data-modified', 'true', { timeout: 5000 });

    await page.getByTestId('theme-tab-save-as-new').click();
    const dialog = page.getByTestId('save-theme-dialog');
    await dialog.getByTestId('save-theme-name').fill('Mein Theme');
    await dialog.getByTestId('save-theme-confirm').click();

    await expect(page.getByTestId('theme-library-row').first()).toBeVisible({ timeout: 10000 });
    await page.getByTestId('theme-library-row-activate').first().click();

    await expect
      .poll(async () => {
        return page.evaluate(() =>
          getComputedStyle(document.documentElement).getPropertyValue('--accent-primary').trim()
        );
      })
      .toBe('#3f523c');
  });

  test('the active saved theme carries the "aktiv" badge', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin?tab=theme');

    const accentRow = page.locator('[data-variable-name="--accent-primary"]');
    await expect(accentRow).toBeVisible({ timeout: 15000 });
    await accentRow.getByTestId('color-picker-hex').fill('#9a5f38');
    await expect(accentRow).toHaveAttribute('data-modified', 'true', { timeout: 5000 });

    await page.getByTestId('theme-tab-save-as-new').click();
    const dialog = page.getByTestId('save-theme-dialog');
    await dialog.getByTestId('save-theme-name').fill('Aktives Theme');
    await dialog.getByTestId('save-theme-confirm').click();

    await expect(page.getByTestId('theme-library-row').first()).toBeVisible({ timeout: 10000 });
    await page.getByTestId('theme-library-row-activate').first().click();

    const row = page.getByTestId('theme-library-row').first();
    await expect(row).toHaveAttribute('data-active', 'true', { timeout: 5000 });
    await expect(row.getByTestId('theme-library-row-active-badge')).toBeVisible();
  });

  test('rename a saved theme via the library', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin?tab=theme');

    await page.getByTestId('theme-tab-save-as-new').click();
    const dialog = page.getByTestId('save-theme-dialog');
    const nameInput = dialog.getByTestId('save-theme-name');
    await nameInput.fill('');
    await nameInput.fill('Alt');
    await expect(nameInput).toHaveValue('Alt');
    await dialog.getByTestId('save-theme-confirm').click();

    await expect(page.getByTestId('theme-library-row').first()).toBeVisible({ timeout: 10000 });
    // Confirm we picked the right row before clicking.
    await expect(page.getByTestId('theme-library-row-name').first()).toContainText('Alt');

    await page.getByTestId('theme-library-row-rename').first().click();
    const input = page.getByTestId('theme-library-rename-input');
    await input.fill('');
    await input.fill('Neu');
    await expect(input).toHaveValue('Neu');
    await page.getByTestId('theme-library-rename-confirm').click();

    await expect
      .poll(async () => {
        const row = page.getByTestId('theme-library-row-name').first();
        return row.textContent();
      })
      .toContain('Neu');
  });

  test('delete a saved theme via the library after confirmation', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin?tab=theme');

    await page.getByTestId('theme-tab-save-as-new').click();
    const dialog = page.getByTestId('save-theme-dialog');
    await dialog.getByTestId('save-theme-name').fill('Wegdamit');
    await dialog.getByTestId('save-theme-confirm').click();

    await expect(page.getByTestId('theme-library-row').first()).toBeVisible({ timeout: 10000 });
    await page.getByTestId('theme-library-row-delete').first().click();
    const confirmDialog = page.locator('.confirm-dialog');
    await expect(confirmDialog).toBeVisible();
    await confirmDialog.getByRole('button', { name: 'Löschen' }).click();

    await expect(page.getByTestId('theme-tab-library-empty')).toBeVisible({ timeout: 10000 });
  });

  test('calendar preview link opens the public calendar in a new tab', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin?tab=theme');

    const link = page.getByTestId('theme-tab-preview-link');
    await expect(link).toBeVisible({ timeout: 10000 });
    await expect(link).toHaveAttribute('href', '/');
    await expect(link).toHaveAttribute('target', '_blank');
  });

  test('preview tab sees in-progress editor values live via BroadcastChannel', async ({
    browser,
  }) => {
    // Two pages share the same browser context so BroadcastChannel
    // (per-origin, per-browser) connects them. The admin's editor tab
    // broadcasts every color-pick via BroadcastChannel; the calendar
    // page (mounted globally via <ThemeApplier />) receives it and
    // paints the in-progress values onto its own `:root` so the
    // designer sees the live preview before clicking "Aktivieren".
    const context = await browser.newContext();
    const adminPage = await context.newPage();
    const previewPage = await context.newPage();

    await signInWithEmailAndPassword(adminPage, 'admin@test.com', 'testpassword123');

    // Open the calendar in a second tab FIRST, so it's already
    // subscribed to the BroadcastChannel before the admin broadcasts.
    await previewPage.goto('/');
    await expect(previewPage.locator('.calendar, .events-section').first()).toBeAttached({
      timeout: 15000,
    });

    // The preview initially reflects the live (seeded) accent color.
    await expect
      .poll(async () =>
        previewPage.evaluate(() =>
          getComputedStyle(document.documentElement).getPropertyValue('--accent-primary').trim()
        )
      )
      .toBe('#c48e6a');

    // Now open the admin editor and pick a non-default color.
    await adminPage.goto('/admin?tab=theme');
    const row = adminPage.locator('[data-variable-name="--accent-primary"]');
    await expect(row).toBeVisible({ timeout: 15000 });
    await row.getByTestId('color-picker-hex').fill('#ff00ff');
    await expect(row).toHaveAttribute('data-modified', 'true', { timeout: 5000 });

    // Without clicking "Aktivieren", the preview tab SHOULD pick up the
    // broadcast and paint the editor's in-progress color.
    await expect
      .poll(
        async () =>
          previewPage.evaluate(() =>
            getComputedStyle(document.documentElement).getPropertyValue('--accent-primary').trim()
          ),
        { timeout: 5000 }
      )
      .toBe('#ff00ff');

    await context.close();
  });

  test('loading a saved theme into the editor does NOT change the public site :root', async ({
    browser,
  }) => {
    // Loading a saved theme must NOT publish it — only "Aktivieren"
    // does. The admin tab's own :root now reflects whatever the editor
    // is holding (because the editor broadcasts via BroadcastChannel
    // and the page itself is a receiver), so the meaningful check is
    // on a separate context with no editor session — i.e. a fair
    // proxy for what a public visitor sees.
    const adminCtx = await browser.newContext();
    const adminPage = await adminCtx.newPage();
    await signInWithEmailAndPassword(adminPage, 'admin@test.com', 'testpassword123');
    await adminPage.goto('/admin?tab=theme');

    // Seed a saved theme via the admin UI — change a token and persist as
    // a new theme so the row exists in the library.
    const accentRow = adminPage.locator('[data-variable-name="--accent-primary"]');
    await expect(accentRow).toBeVisible({ timeout: 15000 });
    await accentRow.getByTestId('color-picker-hex').fill('#ff00ff');
    await expect(accentRow).toHaveAttribute('data-modified', 'true', { timeout: 5000 });

    await adminPage.getByTestId('theme-tab-save-as-new').click();
    const dialog = adminPage.getByTestId('save-theme-dialog');
    await dialog.getByTestId('save-theme-name').fill('Spezial');
    await dialog.getByTestId('save-theme-confirm').click();

    await expect(adminPage.getByTestId('theme-library-row').first()).toBeVisible({
      timeout: 10000,
    });
    // The accent row now has no modifications (we saved the editor's
    // values into the saved theme). Re-introduce a tiny edit so the
    // editor switches away from the freshly-saved theme before we click
    // "Laden" — otherwise the load button is disabled because the
    // editor already references the same theme.
    await accentRow.getByTestId('color-picker-hex').fill('#010101');
    await expect(accentRow).toHaveAttribute('data-modified', 'true', { timeout: 5000 });
    await adminPage.getByTestId('theme-library-row-load').first().click();

    // The editor source banner now shows the loaded theme name.
    await expect(adminPage.getByTestId('theme-tab-editor-source')).toContainText('Spezial');

    // The published live site, viewed from a separate context with no
    // editor session and therefore no BroadcastChannel traffic, must
    // still reflect the seeded live value (#c48e6a) — NOT the freshly
    // loaded theme's #ff00ff. Loading ≠ activating.
    const publicCtx = await browser.newContext();
    const publicPage = await publicCtx.newPage();
    await publicPage.goto('/');
    await expect
      .poll(() =>
        publicPage.evaluate(() =>
          getComputedStyle(document.documentElement).getPropertyValue('--accent-primary').trim()
        )
      )
      .toBe('#c48e6a');

    await adminCtx.close();
    await publicCtx.close();
  });
});
