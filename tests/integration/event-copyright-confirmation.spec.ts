import { test, expect } from '@playwright/test';
import { spawn } from 'child_process';

import { waitForWizardToLoad, clickWeiter, confirmCopyrightCheckbox } from '../helpers/wizard';

import { STORAGE_STATE } from '../helpers/roles';

// Signed in as `admin` via the session captured once by tests/auth.setup.ts,
// instead of driving the login form in every test.
test.use({ storageState: STORAGE_STATE.admin });

const EVENT_TITLE = `Copyright Confirmation Event ${Date.now()}`;

function runVerificationScript(action: 'inspect' | 'cleanup', title: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn('node', ['scripts/verify-copyright-confirmation.mjs', action, title], {
      cwd: process.cwd(),
      shell: false,
    });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (chunk) => (stdout += chunk.toString()));
    proc.stderr.on('data', (chunk) => (stderr += chunk.toString()));
    proc.on('close', (code) => {
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(`verify-copyright-confirmation ${action} exited ${code}: ${stderr}`));
    });
    proc.on('error', reject);
  });
}

// UI behaviour of the confirmation (button state, inline error) is covered by
// tests/components/EventFormWizardValidation.spec.tsx. What needs a real browser
// and Firestore is that the flag is actually persisted.
test.describe('Event wizard: Copyright confirmation', () => {
  test.afterEach(async ({ page }) => {
    await runVerificationScript('cleanup', EVENT_TITLE).catch(() => {});
  });

  async function fillWizardThroughToSummary(page) {
    const future = new Date();
    future.setDate(future.getDate() + 30);
    const futureIso = future.toISOString().split('T')[0];

    await page.fill('#organizer\\.name', 'Copyright Tester');
    await page.fill('#kontakt', 'copyright@test.com');
    await clickWeiter(page);

    await page.fill('#title', EVENT_TITLE);
    const editor = page.locator('[data-testid="description-editor"] .rte-content');
    await editor.click();
    await editor.fill('Event zum Testen der Copyright-Bestätigung im Wizard.');
    await clickWeiter(page);

    await page.fill('#date', futureIso);
    await page.fill('#time', '18:00');
    await page.fill('#place', 'Test Place');
    await page.selectOption('#bezirk', 'Bregenz');
    await page.click('.kategorie-select');
    await page.getByText('Yoga', { exact: true }).click();
    await page.click('.radio-label:has-text("Kostenlos")');
    await clickWeiter(page);

    await expect(page.locator('.summary-card')).toBeVisible();
  }

  test('submitting with confirmation saves the rightsConfirmed flag on the event', async ({
    page,
  }) => {
    await page.goto('/admin/new');
    await waitForWizardToLoad(page);

    await fillWizardThroughToSummary(page);

    await confirmCopyrightCheckbox(page);
    await page.click('button:has-text("Event erstellen")');

    const preSubmitDialog = page.locator('.confirm-dialog').filter({ hasText: 'Einreichen' });
    await expect(preSubmitDialog).toBeVisible({ timeout: 10000 });
    await preSubmitDialog.getByRole('button', { name: /^einreichen$/i }).click();

    const successDialog = page.getByTestId('success-dialog');
    await expect(successDialog).toBeVisible({ timeout: 15000 });
    await successDialog.getByTestId('success-dialog-confirm').click();

    await page.waitForURL('/admin', { timeout: 10000 });
    await page.waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 });

    // Admin-created events are pending (ticket hGxrS6gp) and pending events do
    // not appear under "Meine Events" — they live in the Review tab.
    await page.getByTestId('admin-tab-review').click();
    const panel = page.locator('#admin-tab-review');
    await expect(panel).toBeVisible();

    const cards = panel.locator('.event-card', { hasText: EVENT_TITLE });
    await expect(cards.first()).toBeVisible({ timeout: 15000 });
    await expect(cards.first().locator('.status-badge--pending')).toBeVisible();

    // The pending event is created with a serverTimestamp for rightsConfirmedAt,
    // so wait briefly for it to settle before inspecting Firestore.

    const inspectOutput = await runVerificationScript('inspect', EVENT_TITLE);
    const result = JSON.parse(inspectOutput) as {
      found: boolean;
      rightsConfirmed?: boolean;
      hasRightsConfirmedAt?: boolean;
    };

    expect(result.found).toBe(true);
    expect(result.rightsConfirmed).toBe(true);
    expect(result.hasRightsConfirmedAt).toBe(true);
  });
});
