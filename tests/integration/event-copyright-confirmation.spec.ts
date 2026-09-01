import { test, expect } from '@playwright/test';
import { spawn } from 'child_process';
import { signInWithEmailAndPassword, signOut } from '../helpers/auth';
import { waitForWizardToLoad, clickWeiter, confirmCopyrightCheckbox } from '../helpers/wizard';

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

test.describe('Event wizard: Copyright confirmation (tQ9gWPJv)', () => {
  test.afterEach(async ({ page }) => {
    await signOut(page);
    await runVerificationScript('cleanup', EVENT_TITLE).catch(() => {});
  });

  async function fillWizardThroughToSummary(page) {
    const future = new Date();
    future.setDate(future.getDate() + 30);
    const futureIso = future.toISOString().split('T')[0];

    await page.fill('#organizer\\.firstName', 'Copyright');
    await page.fill('#organizer\\.lastName', 'Tester');
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
    await page.waitForTimeout(300);
    await page.getByText('Yoga', { exact: true }).click();
    await page.waitForTimeout(300);
    await page.click('.radio-label:has-text("Kostenlos")');
    await clickWeiter(page);

    await expect(page.locator('.summary-card')).toBeVisible();
  }

  test('summary step shows a copyright confirmation checkbox that is unchecked by default', async ({
    page,
  }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin/new');
    await waitForWizardToLoad(page);

    await fillWizardThroughToSummary(page);

    const checkbox = page.getByTestId('rights-confirmed-checkbox');
    await expect(checkbox).toBeVisible();
    await expect(checkbox).not.toBeChecked();

    const label = page.locator('label.checkbox-label').filter({ has: checkbox });
    await expect(label).toContainText('Rechte an dem hochgeladenen Bild');
    await expect(label).toContainText('am Text');
  });

  test('submit button is greyed out until the copyright confirmation is checked', async ({
    page,
  }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin/new');
    await waitForWizardToLoad(page);

    await fillWizardThroughToSummary(page);

    const submitButton = page.getByTestId('submit-event-button');
    await expect(submitButton).toHaveAttribute('aria-disabled', 'true');
    await expect(submitButton).toHaveClass(/btn-greyed-out/);

    await page.getByTestId('rights-confirmed-checkbox').check();
    await expect(submitButton).toHaveAttribute('aria-disabled', 'false');
    await expect(submitButton).not.toHaveClass(/btn-greyed-out/);
  });

  test('save-as-draft button is greyed out until the copyright confirmation is checked', async ({
    page,
  }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin/new');
    await waitForWizardToLoad(page);

    await fillWizardThroughToSummary(page);

    const draftButton = page.getByTestId('save-as-draft-button');
    await expect(draftButton).toHaveAttribute('aria-disabled', 'true');
    await expect(draftButton).toHaveClass(/btn-greyed-out/);

    await page.getByTestId('rights-confirmed-checkbox').check();
    await expect(draftButton).toHaveAttribute('aria-disabled', 'false');
    await expect(draftButton).not.toHaveClass(/btn-greyed-out/);

    await page.getByTestId('rights-confirmed-checkbox').uncheck();
    await expect(draftButton).toHaveAttribute('aria-disabled', 'true');
    await expect(draftButton).toHaveClass(/btn-greyed-out/);
  });

  test('toggling the copyright checkbox on and off keeps the submit button in sync', async ({
    page,
  }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin/new');
    await waitForWizardToLoad(page);

    await fillWizardThroughToSummary(page);

    const submitButton = page.getByTestId('submit-event-button');
    const checkbox = page.getByTestId('rights-confirmed-checkbox');

    await expect(submitButton).toHaveAttribute('aria-disabled', 'true');
    await expect(submitButton).toHaveClass(/btn-greyed-out/);
    await checkbox.check();
    await expect(submitButton).toHaveAttribute('aria-disabled', 'false');
    await expect(submitButton).not.toHaveClass(/btn-greyed-out/);
    await checkbox.uncheck();
    await expect(submitButton).toHaveAttribute('aria-disabled', 'true');
    await expect(submitButton).toHaveClass(/btn-greyed-out/);
    await expect(page.locator('.confirm-dialog')).toHaveCount(0);
  });

  test('clicking the greyed-out submit button without confirmation shows an inline copyright error', async ({
    page,
  }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin/new');
    await waitForWizardToLoad(page);

    await fillWizardThroughToSummary(page);

    const checkbox = page.getByTestId('rights-confirmed-checkbox');
    const errorLocator = page.getByTestId('rights-confirmed-error');

    await expect(errorLocator).toHaveCount(0);
    await page.getByTestId('submit-event-button').click({ force: true });
    await expect(errorLocator).toBeVisible();
    await expect(errorLocator).toHaveText('Bitte bestätige die Nutzungsrechte');
    await expect(errorLocator).toHaveClass(/error-text/);
    await expect(page.locator('.confirm-dialog')).toHaveCount(0);
    await expect(checkbox).not.toBeChecked();
  });

  test('clicking the greyed-out draft button without confirmation shows an inline copyright error', async ({
    page,
  }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin/new');
    await waitForWizardToLoad(page);

    await fillWizardThroughToSummary(page);

    const checkbox = page.getByTestId('rights-confirmed-checkbox');
    const errorLocator = page.getByTestId('rights-confirmed-error');

    await expect(errorLocator).toHaveCount(0);
    await page.getByTestId('save-as-draft-button').click({ force: true });
    await expect(errorLocator).toBeVisible();
    await expect(errorLocator).toHaveText('Bitte bestätige die Nutzungsrechte');
    await expect(errorLocator).toHaveClass(/error-text/);
    await expect(page.locator('.confirm-dialog')).toHaveCount(0);
    await expect(checkbox).not.toBeChecked();
  });

  test('checking the copyright checkbox after clicking the greyed-out button clears the inline error', async ({
    page,
  }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin/new');
    await waitForWizardToLoad(page);

    await fillWizardThroughToSummary(page);

    const checkbox = page.getByTestId('rights-confirmed-checkbox');
    const errorLocator = page.getByTestId('rights-confirmed-error');

    await page.getByTestId('submit-event-button').click({ force: true });
    await expect(errorLocator).toBeVisible();

    await checkbox.check();
    await expect(errorLocator).toHaveCount(0);

    await page.getByTestId('submit-event-button').click();
    await expect(page.locator('.confirm-dialog').filter({ hasText: 'Einreichen' })).toBeVisible({
      timeout: 10000,
    });
  });

  test('submitting with confirmation saves the rightsConfirmed flag on the event', async ({
    page,
  }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin/new');
    await waitForWizardToLoad(page);

    await fillWizardThroughToSummary(page);

    await confirmCopyrightCheckbox(page);
    await page.click('button:has-text("Event erstellen")');
    await page.waitForTimeout(500);

    const preSubmitDialog = page.locator('.confirm-dialog').filter({ hasText: 'Einreichen' });
    await expect(preSubmitDialog).toBeVisible({ timeout: 10000 });
    await preSubmitDialog.getByRole('button', { name: /^einreichen$/i }).click();

    const successDialog = page.getByTestId('success-dialog');
    await expect(successDialog).toBeVisible({ timeout: 15000 });
    await successDialog.getByTestId('success-dialog-confirm').click();

    await page.waitForURL('/admin', { timeout: 10000 });
    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    const cards = page.locator('.event-card', { hasText: EVENT_TITLE });
    await expect(cards.first()).toBeVisible({ timeout: 10000 });
    await expect(cards.first().locator('.status-badge--pending')).toBeVisible();

    // The pending event is created with a serverTimestamp for rightsConfirmedAt,
    // so wait briefly for it to settle before inspecting Firestore.
    await page.waitForTimeout(1500);

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
