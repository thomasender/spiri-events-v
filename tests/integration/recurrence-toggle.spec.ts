import { test, expect } from '@playwright/test';
import { signInWithEmailAndPassword, signOut } from '../helpers/auth';
import { enableRecurrence, fillStep2EventInfo, waitForWizardToLoad } from '../helpers/wizard';

test.describe.configure({ mode: 'serial' });

async function goToStep3(page) {
  await waitForWizardToLoad(page);
  await page.locator('button:has-text("Weiter")').click();
  await page.waitForTimeout(400);
  await fillStep2EventInfo(page, {
    title: 'Recurrence Toggle Event',
    description: 'Beschreibung',
  });
  await page.locator('button:has-text("Weiter")').click();
  await page.waitForTimeout(400);
}

test.describe('Recurrence toggle (Ja/Nein) on event form (NHRFTdSQ)', () => {
  test.afterEach(async ({ page }) => {
    await signOut(page);
  });

  test('wizard shows only Ja/Nein toggle for Wiederholung by default', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin/new');
    await goToStep3(page);

    await expect(page.locator('.radio-label:has-text("Nein")').first()).toBeVisible();
    await expect(page.locator('.radio-label:has-text("Ja")').first()).toBeVisible();
    await expect(page.getByTestId('recurrence-no-radio')).toBeChecked();

    const options = page.getByTestId('recurrence-options');
    await expect(options).toHaveCount(0);
  });

  test('clicking Ja reveals the Art der Wiederholung options with Wöchentlich pre-selected', async ({
    page,
  }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin/new');
    await goToStep3(page);

    await enableRecurrence(page);

    const options = page.getByTestId('recurrence-options');
    await expect(options).toBeVisible();

    await expect(page.getByTestId('recurrence-yes-radio')).toBeChecked();

    const weekly = page.locator(
      '[data-testid="recurrence-options"] input[type="radio"][value="weekly"]'
    );
    await expect(weekly).toBeChecked();
  });

  test('switching back to Nein hides the options and clears the recurrence type', async ({
    page,
  }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin/new');
    await goToStep3(page);

    await enableRecurrence(page);
    await page
      .locator('[data-testid="recurrence-options"] .radio-label:has-text("Monatlich")')
      .click();
    await page.waitForTimeout(150);

    await page.locator('.radio-label:has-text("Nein")').first().click();
    await page.waitForTimeout(150);

    await expect(page.getByTestId('recurrence-no-radio')).toBeChecked();
    await expect(page.getByTestId('recurrence-options')).toHaveCount(0);
  });
});
