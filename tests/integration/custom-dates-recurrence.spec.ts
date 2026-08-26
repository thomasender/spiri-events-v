import { test, expect } from '@playwright/test';
import { signInWithEmailAndPassword, signOut } from '../helpers/auth';
import { waitForWizardToLoad } from '../helpers/wizard';

const ISO_DATE = (offsetDays) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().split('T')[0];
};

async function navigateToStep3(page) {
  await waitForWizardToLoad(page);
  await page.locator('button:has-text("Weiter")').click();
  await page.waitForTimeout(400);

  await page.locator('#title').fill('Custom Dates Event');
  const editor = page.locator('[data-testid="description-editor"] .rte-content');
  await editor.click();
  await editor.fill('Beschreibung');
  await page.locator('button:has-text("Weiter")').click();
  await page.waitForTimeout(400);
}

test.describe.configure({ mode: 'serial' });

test.describe('Custom dates recurrence (O54F3kAx)', () => {
  test.afterEach(async ({ page }) => {
    await signOut(page);
  });

  test('wizard offers "Benutzerdefinierte Daten" radio option', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin/new');
    await navigateToStep3(page);

    const customRadio = page.locator('.radio-label:has-text("Benutzerdefinierte Daten")');
    await expect(customRadio).toBeVisible();
  });

  test('selecting custom shows date list UI with add button', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin/new');
    await navigateToStep3(page);

    await page.locator('.radio-label:has-text("Benutzerdefinierte Daten")').click();
    await page.waitForTimeout(200);

    await expect(page.getByTestId('custom-dates-list')).toBeAttached();
    await expect(page.getByTestId('custom-date-add-button')).toBeVisible();
  });

  test('Wiederholung bis field is hidden when recurrence is custom', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin/new');
    await navigateToStep3(page);

    await expect(page.locator('#recurrenceEndDate')).not.toBeVisible();

    await page.locator('.radio-label:has-text("Benutzerdefinierte Daten")').click();
    await page.waitForTimeout(200);

    await expect(page.locator('#recurrenceEndDate')).not.toBeVisible();
  });

  test('submitting step 3 without custom dates shows validation error', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin/new');
    await navigateToStep3(page);

    await page.locator('#date').fill(ISO_DATE(7));
    await page.locator('#time').fill('10:00');

    await page.locator('select#bezirk').selectOption({ label: 'Bregenz' });
    await page.locator('#place').fill('Test Place');

    await page.locator('.kategorie-select').click();
    await page.waitForTimeout(300);
    await page.locator('.kategorie__option:has-text("Yoga")').click();
    await page.waitForTimeout(300);

    await page.locator('.radio-label:has-text("Benutzerdefinierte Daten")').click();
    await page.waitForTimeout(200);

    await page.getByRole('button', { name: 'Weiter', exact: true }).click();
    await page.waitForTimeout(300);

    const error = page.getByTestId('custom-dates-error');
    await expect(error).toBeVisible();
    await expect(error).toContainText('mindestens ein Datum');
  });

  test('adding and removing custom dates works', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin/new');
    await navigateToStep3(page);

    await page.locator('.radio-label:has-text("Benutzerdefinierte Daten")').click();
    await page.waitForTimeout(200);

    await page.getByTestId('custom-date-add-button').click();
    await page.waitForTimeout(150);
    await page.getByTestId('custom-date-add-button').click();
    await page.waitForTimeout(150);

    await expect(page.getByTestId('custom-date-input-0')).toBeVisible();
    await expect(page.getByTestId('custom-date-input-1')).toBeVisible();

    await page.getByTestId('custom-date-input-0').fill(ISO_DATE(10));
    await page.getByTestId('custom-date-input-1').fill(ISO_DATE(20));

    await page.getByTestId('custom-date-remove-1').click();
    await page.waitForTimeout(150);

    await expect(page.getByTestId('custom-date-input-0')).toBeVisible();
    await expect(page.getByTestId('custom-date-input-1')).not.toBeVisible();
  });

  test('admin event list shows the recurring badge for custom-dates events', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin');
    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    await expect(page.locator('.badge--recurring').first()).toBeVisible({ timeout: 10000 });
  });
});
