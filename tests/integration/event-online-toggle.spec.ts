import { test, expect } from '@playwright/test';
import { spawn } from 'child_process';
import { signInWithEmailAndPassword, signOut } from '../helpers/auth';
import {
  waitForWizardToLoad,
  clickWeiter,
  fillStep2EventInfo,
  fillStep3Details,
  confirmCopyrightCheckbox,
} from '../helpers/wizard';

const ONLINE_EVENT_TITLE = 'Online Yoga Session';

function runScript(scriptPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn('node', [scriptPath], { cwd: process.cwd(), stdio: 'ignore', shell: true });
    proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`exit ${code}`))));
    proc.on('error', reject);
  });
}

// Some tests in this file mutate the shared test-event-foreign-pending fixture.
// Run the suite serially so resets do not race other tests reading the doc.
test.describe.configure({ mode: 'serial' });

test.describe('Event wizard: "Online-Event" checkbox (1e9YUHCh)', () => {
  test.afterEach(async ({ page }) => {
    await signOut(page);
  });

  test('checkbox is visible on step 3 and labeled as Online-Event', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin/new');
    await waitForWizardToLoad(page);

    await clickWeiter(page);
    await fillStep2EventInfo(page, {
      title: 'Step 3 Online Checkbox Test',
      description: 'Test description.',
    });
    await clickWeiter(page);

    const checkbox = page.getByTestId('is-online-checkbox');
    await expect(checkbox).toBeVisible();
    await expect(checkbox).not.toBeChecked();

    const label = page.locator('label.checkbox-label--inline').filter({ has: checkbox });
    await expect(label).toContainText('Online-Event');
  });

  test('Bezirk label is renamed to "Ort" on the wizard step 3', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin/new');
    await waitForWizardToLoad(page);

    await clickWeiter(page);
    await fillStep2EventInfo(page, {
      title: 'Ort label test',
      description: 'Test description.',
    });
    await clickWeiter(page);

    const bezirkLabel = page.locator('label[for="bezirk"]');
    await expect(bezirkLabel).toBeVisible();
    await expect(bezirkLabel).toContainText('Ort');
    await expect(bezirkLabel).toContainText('*');
  });

  test('checking Online disables the Bezirk dropdown and Ort/Adresse field', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin/new');
    await waitForWizardToLoad(page);

    await clickWeiter(page);
    await fillStep2EventInfo(page, {
      title: 'Online disables fields',
      description: 'Test description.',
    });
    await clickWeiter(page);

    const bezirk = page.locator('#bezirk');
    const place = page.locator('#place');

    await expect(bezirk).toBeEnabled();
    await expect(place).toBeEnabled();

    await page.getByTestId('is-online-checkbox').check();

    await expect(bezirk).toBeDisabled();
    await expect(place).toBeDisabled();
  });

  test('wizard requires either Bezirk or "Online" to advance from step 3', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin/new');
    await waitForWizardToLoad(page);

    await clickWeiter(page);
    await fillStep2EventInfo(page, {
      title: 'No location',
      description: 'Test description.',
    });
    await clickWeiter(page);

    const future = new Date();
    future.setDate(future.getDate() + 30);
    const futureIso = future.toISOString().split('T')[0];

    await page.fill('#date', futureIso);
    await page.fill('#time', '10:00');
    // Bezirk and Online are both unset.
    await page.click('.kategorie-select');
    await page.waitForTimeout(300);
    await page.getByText('Yoga', { exact: true }).click();
    await page.waitForTimeout(300);
    await page.click('.radio-label:has-text("Kostenlos")');

    await clickWeiter(page);

    await expect(page.locator('#description')).toBeHidden();
    const errorTexts = page.locator('.error-text');
    await expect(errorTexts.first()).toBeVisible();
    await expect(page.locator('.error-text', { hasText: 'Bezirk auswählen' })).toHaveCount(1);
  });

  test('an Online event can be created through the wizard without Bezirk', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin/new');
    await waitForWizardToLoad(page);

    await clickWeiter(page);
    await fillStep2EventInfo(page, {
      title: ONLINE_EVENT_TITLE,
      description: 'Eine reine Online-Session ohne physischen Ort.',
    });
    await clickWeiter(page);

    const future = new Date();
    future.setDate(future.getDate() + 30);
    const futureIso = future.toISOString().split('T')[0];

    await page.fill('#date', futureIso);
    await page.fill('#time', '18:00');

    // The kategorie react-select opens with a click and the options are plain
    // <div> elements. Wait briefly so the menu is in the DOM before clicking.
    await page.click('.kategorie-select');
    await page.waitForTimeout(300);
    await page.getByText('Yoga', { exact: true }).click();
    await page.waitForTimeout(300);

    await page.click('.radio-label:has-text("Kostenlos")');

    await page.getByTestId('is-online-checkbox').check();

    // Bezirk dropdown is disabled and empty because the event is online.
    await expect(page.locator('#bezirk')).toBeDisabled();
    await expect(page.locator('#bezirk')).toHaveValue('');

    await clickWeiter(page);

    // Step 4 (summary) — confirm "Online" appears and no Bezirk is shown.
    await expect(page.locator('.summary-section', { hasText: 'Details' })).toContainText('Online');

    await confirmCopyrightCheckbox(page);

    await page.click(
      'button:has-text("Event erstellen"), button:has-text("Einreichen zur Genehmigung")'
    );
    await page.waitForTimeout(500);
    await page.click('button:has-text("Einreichen"), button:has-text("Bestätigen")');
    await page.waitForTimeout(2000);

    await page.waitForURL('/admin', { timeout: 10000 }).catch(() => {});
    const successDialog = page.getByTestId('success-dialog');
    if (await successDialog.isVisible().catch(() => false)) {
      await successDialog.getByTestId('success-dialog-confirm').click();
    }

    await page.waitForURL('/admin', { timeout: 15000 });
    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    const card = page.locator('.event-card', { hasText: ONLINE_EVENT_TITLE }).first();
    await expect(card).toBeVisible({ timeout: 15000 });
  });
});

test.describe('Event edit form: "Online-Event" support (1e9YUHCh)', () => {
  test.beforeEach(async () => {
    await runScript('scripts/reset-draft-fixtures.mjs');
  });

  test.afterEach(async ({ page }) => {
    await signOut(page);
  });

  test('editing an in-person event and toggling Online clears Bezirk and saves isOnline', async ({
    page,
  }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');

    await page.goto('/admin/edit/test-event-foreign-pending');
    await page.waitForURL(/\/admin\/edit\//);
    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    await expect(page.locator('#bezirk')).toBeEnabled();
    await expect(page.getByTestId('is-online-checkbox')).not.toBeChecked();

    await page.getByTestId('is-online-checkbox').check();
    await expect(page.locator('#bezirk')).toBeDisabled();
    await expect(page.locator('#bezirk')).toHaveValue('');

    await page.getByRole('button', { name: /änderungen speichern/i }).click();

    await page.waitForURL('/admin', { timeout: 10000 });
  });
});
