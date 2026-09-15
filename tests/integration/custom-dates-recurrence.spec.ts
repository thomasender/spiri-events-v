import { test, expect } from '@playwright/test';

import { enableRecurrence, waitForWizardToLoad } from '../helpers/wizard';

import { STORAGE_STATE } from '../helpers/roles';

// Signed in as `admin` via the session captured once by tests/auth.setup.ts,
// instead of driving the login form in every test.
test.use({ storageState: STORAGE_STATE.admin });

const ISO_DATE = (offsetDays) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().split('T')[0];
};

async function navigateToStep3(page) {
  await waitForWizardToLoad(page);
  await page.locator('button:has-text("Weiter")').click();

  await page.locator('#title').fill('Custom Dates Event');
  const editor = page.locator('[data-testid="description-editor"] .rte-content');
  await editor.click();
  await editor.fill('Beschreibung');
  await page.locator('button:has-text("Weiter")').click();
}

test.describe.configure({ mode: 'serial' });

test.describe('Custom dates recurrence (O54F3kAx)', () => {
  test.afterEach(async ({ page }) => {});

  test('wizard offers "Benutzerdefinierte Termine" radio option', async ({ page }) => {
    await page.goto('/admin/new');
    await navigateToStep3(page);

    await enableRecurrence(page);

    const customRadio = page.locator('.radio-label:has-text("Benutzerdefinierte Termine")');
    await expect(customRadio).toBeVisible();
  });

  test('selecting custom shows date list UI with add button', async ({ page }) => {
    await page.goto('/admin/new');
    await navigateToStep3(page);

    await enableRecurrence(page);
    await page.locator('.radio-label:has-text("Benutzerdefinierte Termine")').click();

    await expect(page.getByTestId('custom-dates-list')).toBeAttached();
    await expect(page.getByTestId('custom-date-add-button')).toBeVisible();
  });

  test('Wiederholung bis field is hidden when recurrence is custom', async ({ page }) => {
    await page.goto('/admin/new');
    await navigateToStep3(page);

    await expect(page.locator('#recurrenceEndDate')).not.toBeVisible();

    await enableRecurrence(page);
    await page.locator('.radio-label:has-text("Benutzerdefinierte Termine")').click();

    await expect(page.locator('#recurrenceEndDate')).not.toBeVisible();
  });

  test('submitting step 3 without custom dates shows validation error', async ({ page }) => {
    await page.goto('/admin/new');
    await navigateToStep3(page);

    await page.locator('#date').fill(ISO_DATE(7));
    await page.locator('#time').fill('10:00');

    await page.locator('select#bezirk').selectOption({ label: 'Bregenz' });
    await page.locator('#place').fill('Test Place');

    await page.locator('.kategorie-select').click();
    await page.locator('.kategorie__option:has-text("Yoga")').click();

    await enableRecurrence(page);
    await page.locator('.radio-label:has-text("Benutzerdefinierte Termine")').click();

    await page.getByRole('button', { name: 'Weiter', exact: true }).click();

    const error = page.getByTestId('custom-dates-error');
    await expect(error).toBeVisible();
    await expect(error).toContainText('mindestens ein Datum');
  });

  test('adding and removing custom dates works', async ({ page }) => {
    await page.goto('/admin/new');
    await navigateToStep3(page);

    await enableRecurrence(page);
    await page.locator('.radio-label:has-text("Benutzerdefinierte Termine")').click();

    await page.getByTestId('custom-date-add-button').click();
    await page.getByTestId('custom-date-add-button').click();

    await expect(page.getByTestId('custom-date-input-0')).toBeVisible();
    await expect(page.getByTestId('custom-date-input-1')).toBeVisible();

    await page.getByTestId('custom-date-input-0').fill(ISO_DATE(10));
    await page.getByTestId('custom-date-input-1').fill(ISO_DATE(20));

    await page.getByTestId('custom-date-remove-1').click();

    await expect(page.getByTestId('custom-date-input-0')).toBeVisible();
    await expect(page.getByTestId('custom-date-input-1')).not.toBeVisible();
  });

  test('admin event list shows the recurring badge for custom-dates events', async ({ page }) => {
    await page.goto('/admin');
    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    await expect(page.locator('.badge--recurring').first()).toBeVisible({ timeout: 10000 });
  });
});
