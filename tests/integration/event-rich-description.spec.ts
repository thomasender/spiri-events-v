import { test, expect } from '@playwright/test';
import { spawn } from 'child_process';

import { waitForWizardToLoad } from '../helpers/wizard';

import { STORAGE_STATE } from '../helpers/roles';

// Signed in as `admin` via the session captured once by tests/auth.setup.ts,
// instead of driving the login form in every test.
test.use({ storageState: STORAGE_STATE.admin });

// admin-event-edit-delete.spec.ts permanently deletes this shared seed fixture as
// part of its delete-flow tests; reset it here so this file passes regardless of
// file execution order.
async function resetSharedPendingFixture(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const proc = spawn('node', ['scripts/reset-draft-fixtures.mjs'], {
      cwd: process.cwd(),
      stdio: 'ignore',
      shell: true,
    });
    proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`exit ${code}`))));
    proc.on('error', reject);
  });
}

// The last test in this file edits and saves the shared test-event-foreign-pending
// fixture, then reads it back; serialize so other tests' beforeEach reset can't
// race that edit-then-verify sequence.
function runScript(script: string, arg: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn('node', [script, arg], { cwd: process.cwd(), stdio: 'ignore' });
    proc.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`${script} exit ${code}`))
    );
    proc.on('error', reject);
  });
}

test.describe.configure({ mode: 'serial' });

test.describe('Rich-text event description', () => {
  test.beforeEach(async () => {
    await resetSharedPendingFixture();
  });

  test('description field renders the rich-text toolbar on the create form', async ({ page }) => {
    await page.goto('/admin/new');
    await waitForWizardToLoad(page);

    await page.click('button:has-text("Weiter")');

    await expect(page.getByLabel('Fett (Strg+B)')).toBeVisible();
    await expect(page.getByLabel('Kursiv (Strg+I)')).toBeVisible();
    await expect(page.getByLabel('Aufzählung')).toBeVisible();
    await expect(page.getByLabel('Nummerierte Liste')).toBeVisible();
    await expect(page.getByLabel('Link (Strg+K)')).toBeVisible();
  });

  test('character counter updates as the user types', async ({ page }) => {
    await page.goto('/admin/new');
    await waitForWizardToLoad(page);

    await page.click('button:has-text("Weiter")');

    const editor = page.locator('[data-testid="description-editor"] .rte-content');
    await editor.click();
    await editor.fill('Hallo Welt');

    await expect(page.locator('[data-testid="description-editor"] .rte-counter')).toContainText(
      '10 / 5000'
    );
  });

  test('empty description triggers the required validation error', async ({ page }) => {
    await page.goto('/admin/new');
    await waitForWizardToLoad(page);

    await page.click('button:has-text("Weiter")');

    const editor = page.locator('[data-testid="description-editor"] .rte-content');
    await editor.click();
    await editor.fill('');

    await page.click('button:has-text("Weiter")');

    const descriptionError = page.getByTestId('description-error');
    await expect(descriptionError).toBeVisible();
    await expect(descriptionError).toContainText('Beschreibung ist erforderlich');
  });

  test('pressing Enter inside the description editor inserts a line break instead of advancing the wizard', async ({
    page,
  }) => {
    await page.goto('/admin/new');
    await waitForWizardToLoad(page);

    await page.click('button:has-text("Weiter")');

    await page.fill('#title', 'Enter-im-Beschreibung-Test');

    const editor = page.locator('[data-testid="description-editor"] .rte-content');
    await editor.click();
    await editor.fill('Erste Zeile');

    await editor.click();
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Zweite Zeile');

    await expect(page.locator('#title')).toBeVisible();
    await expect(editor).toBeVisible();
    await expect(page.locator('#date')).not.toBeVisible();
    await expect(editor).toContainText('Erste Zeile');
    await expect(editor).toContainText('Zweite Zeile');
  });

  test('formatted description (bold) roundtrips to the event detail page', async ({ page }) => {
    // Own throwaway event: the shared pending fixture is rewritten by other
    // specs running in parallel, which made this edit-then-read-back flaky.
    const eventId = `throwaway-rich-description-${Date.now()}`;
    await runScript('scripts/create-throwaway-pending-event.mjs', eventId);

    try {
      await page.goto(`/admin/edit/${eventId}`);
      const editor = page.locator('[data-testid="description-editor"] .rte-content');
      // The editor is filled asynchronously from the loaded event; clearing it
      // earlier is a silent no-op.
      await expect(editor).not.toBeEmpty();
      await editor.click();
      await page.keyboard.press('ControlOrMeta+A');
      await page.keyboard.press('Backspace');
      await page.keyboard.type('Mit fettem Text');

      await page.keyboard.press('ControlOrMeta+A');
      await page.getByLabel('Fett (Strg+B)').click();
      await expect(editor.locator('strong, b')).toContainText('Mit fettem Text');

      await page.getByRole('button', { name: /änderungen speichern/i }).click();
      await page.waitForURL('/admin', { timeout: 10000 });

      await page.goto(`/event/${eventId}`);
      const detailDescription = page.locator('.event-description .rich-text-view');
      await expect(detailDescription.locator('strong, b')).toContainText('Mit fettem Text');
    } finally {
      await runScript('scripts/delete-event-by-id.mjs', eventId);
    }
  });
});
