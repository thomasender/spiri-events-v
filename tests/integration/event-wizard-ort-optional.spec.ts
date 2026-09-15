import { test, expect } from '@playwright/test';
import { spawn } from 'child_process';

import { STORAGE_STATE } from '../helpers/roles';
import { deleteEventsByTitlePrefix } from '../fixtures/events';

// Signed in as `admin` via the session captured once by tests/auth.setup.ts,
// instead of driving the login form in every test.
test.use({ storageState: STORAGE_STATE.admin });

import {
  confirmCopyrightCheckbox,
  waitForWizardToLoad,
  clickWeiter,
  fillStep2EventInfo,
  submitWizard,
  confirmSubmission,
  completeSubmissionAndReturnToAdmin,
} from '../helpers/wizard';

const EVENT_TITLE = 'Event ohne Ort';

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

test.describe('Event wizard: "Ort / Adresse" is optional (ZPiZqKrG) @mobile', () => {
  // The wizard specs create real events; remove them so they do not
  // accumulate in the emulator across runs.
  test.afterAll(async () => {
    await deleteEventsByTitlePrefix('Event ohne Ort');
  });

  test.afterEach(async ({ page }) => {});

  async function navigateToStep3(page) {
    await clickWeiter(page);
    await fillStep2EventInfo(page, {
      title: EVENT_TITLE,
      description: 'Event ohne Ort-Information.',
    });
    await clickWeiter(page);
  }

  test('"Ort / Adresse" label is not marked with an asterisk on step 3', async ({ page }) => {
    await page.goto('/admin/new');
    await waitForWizardToLoad(page);

    await navigateToStep3(page);

    const placeLabel = page.locator('label[for="place"]');
    await expect(placeLabel).toBeVisible();
    await expect(placeLabel).toContainText('Ort / Adresse');
    await expect(placeLabel).not.toContainText('*');
  });

  test('event can be submitted through the wizard without an "Ort / Adresse" value', async ({
    page,
  }) => {
    await page.goto('/admin/new');
    await waitForWizardToLoad(page);

    await navigateToStep3(page);

    const future = new Date();
    future.setDate(future.getDate() + 30);
    const futureIso = future.toISOString().split('T')[0];

    await page.fill('#date', futureIso);
    await page.fill('#time', '10:00');
    await page.selectOption('#bezirk', 'Bregenz');
    await page.click('.kategorie-select');
    await page.getByText('Yoga', { exact: true }).click();
    await page.click('.radio-label:has-text("Kostenlos")');

    await clickWeiter(page);

    await confirmCopyrightCheckbox(page);

    await submitWizard(page);
    await confirmSubmission(page);

    await completeSubmissionAndReturnToAdmin(page);

    // Admin-created events start as `pending` (ticket hGxrS6gp), and pending
    // events deliberately do NOT appear under "Meine Events" — that is asserted
    // in admin-review-tab.spec.ts. They land in the Review tab, so look there.
    await page.goto('/admin?tab=review');
    await page.waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 });

    const card = page.locator('#admin-tab-review .event-card', { hasText: EVENT_TITLE }).first();
    await expect(card).toBeVisible({ timeout: 15000 });
  });
});

// One test in this block saves an edit to the shared test-event-foreign-pending
// fixture; serialize so its beforeEach reset can't race the other test's own
// reset+read of the same doc.
test.describe.configure({ mode: 'serial' });

test.describe('Event edit form: "Ort / Adresse" is optional (8BzdB9xp)', () => {
  test.beforeEach(async () => {
    await resetSharedPendingFixture();
  });

  test.afterEach(async ({ page }) => {});

  test('"Ort / Adresse" label is not marked with an asterisk in the edit form', async ({
    page,
  }) => {
    await page.goto('/admin/edit/test-event-foreign-pending');

    await page.waitForURL(/\/admin\/edit\//);
    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    const placeLabel = page.locator('label[for="place"]');
    await expect(placeLabel).toBeVisible();
    await expect(placeLabel).toContainText('Ort / Adresse');
    await expect(placeLabel).not.toContainText('*');
  });

  test('edit form allows saving with an empty "Ort / Adresse" field', async ({ page }) => {
    await page.goto('/admin/edit/test-event-foreign-pending');

    await page.waitForURL(/\/admin\/edit\//);
    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    await page.fill('#place', '');

    await page.getByRole('button', { name: /änderungen speichern/i }).click();

    await page.waitForURL('/admin', { timeout: 10000 });

    const placeError = page.locator('.error-text', { hasText: 'Ort ist erforderlich' });
    await expect(placeError).toHaveCount(0);

    await expect(page).toHaveURL(/\/admin$/);
  });
});
