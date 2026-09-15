import { test, expect, type Page } from '@playwright/test';
import { spawn } from 'child_process';

import { waitForWizardToLoad, fillStep1Organizer, fillStep2EventInfo } from '../helpers/wizard';

import { STORAGE_STATE } from '../helpers/roles';

// Signed in as `admin` via the session captured once by tests/auth.setup.ts,
// instead of driving the login form in every test.
test.use({ storageState: STORAGE_STATE.admin });

const EVENT_TITLE = `Feedback Missing Fields ${Date.now()}`;

async function clickContinueImmediately(page: Page) {
  const continueButton = page.getByTestId('continue-button');
  await continueButton.click();
}

async function resetForeignPendingFixture(): Promise<void> {
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

test.describe('Event wizard: feedback for missing mandatory fields (QIwqfq6g)', () => {
  test.afterEach(async ({ page }) => {});

  test('clicking Weiter with empty organizer fields shows the validation error above the action buttons', async ({
    page,
  }) => {
    await page.goto('/admin/new');
    await waitForWizardToLoad(page);

    await fillStep1Organizer(page, {
      name: '',
      kontakt: '',
    });

    await clickContinueImmediately(page);

    const errorMessage = page.getByTestId('wizard-validation-error');
    await expect(errorMessage).toBeVisible();
    await expect(errorMessage).toContainText('Bitte fülle alle Pflichtfelder aus.');

    const fieldErrors = page.locator('.error-text', {
      hasText: /ist erforderlich/,
    });
    await expect(fieldErrors.first()).toBeVisible();
  });

  test('validation error is visible above the action buttons on step 1 after clicking Weiter', async ({
    page,
  }) => {
    await page.goto('/admin/new');
    await waitForWizardToLoad(page);

    await fillStep1Organizer(page, {
      name: '',
      kontakt: '',
    });

    await clickContinueImmediately(page);

    const errorMessage = page.getByTestId('wizard-validation-error');
    await expect(errorMessage).toBeVisible();

    const continueButton = page.getByTestId('continue-button');
    await expect(continueButton).toBeVisible();
    await expect(continueButton).toContainText('Weiter');
  });

  test('clicking Weiter with invalid data triggers the wobble animation on the Weiter button', async ({
    page,
  }) => {
    await page.goto('/admin/new');
    await waitForWizardToLoad(page);

    await fillStep1Organizer(page, {
      name: '',
      kontakt: '',
    });

    await clickContinueImmediately(page);

    const continueButton = page.getByTestId('continue-button');
    await expect(continueButton).toHaveClass(/btn-wobble/);

    await expect(continueButton).not.toHaveClass(/btn-wobble/);
  });

  test('fixing the missing fields and clicking Weiter clears the validation error', async ({
    page,
  }) => {
    await page.goto('/admin/new');
    await waitForWizardToLoad(page);

    await fillStep1Organizer(page, {
      name: '',
      kontakt: '',
    });

    await clickContinueImmediately(page);

    const errorMessage = page.getByTestId('wizard-validation-error');
    await expect(errorMessage).toBeVisible();

    await fillStep1Organizer(page, {
      name: 'Thomas Ender',
      kontakt: 'thomas@example.com',
    });

    await clickContinueImmediately(page);

    await expect(errorMessage).toHaveCount(0);
    await expect(page.locator('label[for="title"]')).toBeVisible();
  });

  test('clicking Weiter on step 2 with missing description shows the validation error above the action buttons', async ({
    page,
  }) => {
    await page.goto('/admin/new');
    await waitForWizardToLoad(page);

    await fillStep1Organizer(page, {
      name: 'Thomas Ender',
      kontakt: 'thomas@example.com',
    });
    await clickContinueImmediately(page);

    await page.fill('#title', EVENT_TITLE);
    const editor = page.locator('[data-testid="description-editor"] .rte-content');
    await editor.click();
    await editor.fill('');

    await clickContinueImmediately(page);

    const errorMessage = page.getByTestId('wizard-validation-error');
    await expect(errorMessage).toBeVisible();
    await expect(errorMessage).toContainText('Bitte fülle alle Pflichtfelder aus.');

    const continueButton = page.getByTestId('continue-button');
    await expect(continueButton).toHaveClass(/btn-wobble/);
  });

  test('wobble animation re-triggers when user clicks Weiter again after the animation has finished', async ({
    page,
  }) => {
    await page.goto('/admin/new');
    await waitForWizardToLoad(page);

    await fillStep1Organizer(page, {
      name: '',
      kontakt: '',
    });

    await clickContinueImmediately(page);

    const continueButton = page.getByTestId('continue-button');
    await expect(continueButton).toHaveClass(/btn-wobble/);

    await expect(continueButton).not.toHaveClass(/btn-wobble/);

    await page.locator('#organizer\\.name').fill('Thomas');
    await page.locator('#organizer\\.name').fill('');

    await clickContinueImmediately(page);

    await expect(continueButton).toHaveClass(/btn-wobble/);
  });

  test('clicking the greyed-out save-as-draft button without rights confirmation triggers the wobble animation', async ({
    page,
  }) => {
    await page.goto('/admin/new');
    await waitForWizardToLoad(page);

    await fillStep1Organizer(page, {
      name: 'Thomas Ender',
      kontakt: 'thomas@example.com',
    });
    await clickContinueImmediately(page);

    await fillStep2EventInfo(page, {
      title: EVENT_TITLE,
      description: 'Event für Test der Wobble-Animation.',
    });
    await clickContinueImmediately(page);

    const future = new Date();
    future.setDate(future.getDate() + 30);
    const futureIso = future.toISOString().split('T')[0];

    await page.fill('#date', futureIso);
    await page.fill('#time', '18:00');
    await page.fill('#place', 'Test Place');
    await page.selectOption('#bezirk', 'Bregenz');
    await page.click('.kategorie-select');
    await page.getByText('Yoga', { exact: true }).click();
    await page.click('.radio-label:has-text("Kostenlos")');
    await clickContinueImmediately(page);

    await expect(page.locator('.summary-card')).toBeVisible();

    const draftButton = page.getByTestId('save-as-draft-button');
    await draftButton.click({ force: true });

    const errorMessage = page.getByTestId('wizard-validation-error');
    await expect(errorMessage).toBeVisible();
    await expect(errorMessage).toContainText('Bitte bestätige die Nutzungsrechte.');
    await expect(draftButton).toHaveClass(/btn-wobble/);
  });

  test('clicking the greyed-out submit button without rights confirmation triggers the wobble animation', async ({
    page,
  }) => {
    await page.goto('/admin/new');
    await waitForWizardToLoad(page);

    await fillStep1Organizer(page, {
      name: 'Thomas Ender',
      kontakt: 'thomas@example.com',
    });
    await clickContinueImmediately(page);

    await fillStep2EventInfo(page, {
      title: EVENT_TITLE,
      description: 'Event für Test der Wobble-Animation.',
    });
    await clickContinueImmediately(page);

    const future = new Date();
    future.setDate(future.getDate() + 30);
    const futureIso = future.toISOString().split('T')[0];

    await page.fill('#date', futureIso);
    await page.fill('#time', '18:00');
    await page.fill('#place', 'Test Place');
    await page.selectOption('#bezirk', 'Bregenz');
    await page.click('.kategorie-select');
    await page.getByText('Yoga', { exact: true }).click();
    await page.click('.radio-label:has-text("Kostenlos")');
    await clickContinueImmediately(page);

    await expect(page.locator('.summary-card')).toBeVisible();

    const submitButton = page.getByTestId('submit-event-button');
    await submitButton.click({ force: true });

    const errorMessage = page.getByTestId('wizard-validation-error');
    await expect(errorMessage).toBeVisible();
    await expect(errorMessage).toContainText('Bitte bestätige die Nutzungsrechte.');
    await expect(submitButton).toHaveClass(/btn-wobble/);
  });
});

test.describe('Event edit form: feedback for missing mandatory fields (QIwqfq6g)', () => {
  test.beforeEach(async () => {
    await resetForeignPendingFixture();
  });

  test.afterEach(async ({ page }) => {});

  test('clicking submit with empty required fields triggers the wobble animation and shows the validation error', async ({
    page,
  }) => {
    await page.goto('/admin/edit/test-event-foreign-pending');

    await page.waitForURL(/\/admin\/edit\//);
    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    await page.fill('#title', '');

    const submitButton = page.getByTestId('submit-event-button');
    await submitButton.click();

    await expect(submitButton).toHaveClass(/btn-wobble/);

    const errorMessages = page.locator('.error-text', {
      hasText: 'Bitte fülle alle Pflichtfelder aus.',
    });
    await expect(errorMessages.first()).toBeVisible();
  });

  test('wobble animation is removed from the submit button after the animation has finished', async ({
    page,
  }) => {
    await page.goto('/admin/edit/test-event-foreign-pending');

    await page.waitForURL(/\/admin\/edit\//);
    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    await page.fill('#title', '');

    const submitButton = page.getByTestId('submit-event-button');
    await submitButton.click();
    await expect(submitButton).toHaveClass(/btn-wobble/);

    await expect(submitButton).not.toHaveClass(/btn-wobble/);
  });
});
