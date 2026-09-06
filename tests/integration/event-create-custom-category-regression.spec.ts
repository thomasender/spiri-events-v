import { test, expect } from '@playwright/test';
import { signInWithEmailAndPassword, signOut } from '../helpers/auth';
import { waitForWizardToLoad, confirmCopyrightCheckbox } from '../helpers/wizard';

const RUN_ID = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
const EVENT_TITLE = `Enter Bug Regression ${RUN_ID}`;
const NEW_CATEGORY = `EnterBug-${RUN_ID}`;

async function fillWizardWithCustomCategory(page) {
  const future = new Date();
  future.setDate(future.getDate() + 7);
  const futureIso = future.toISOString().split('T')[0];

  await page.fill('#organizer\\.firstName', 'Enter');
  await page.fill('#organizer\\.lastName', 'Bug');
  await page.fill('#kontakt', 'enter-bug@test.local');
  await page.locator('button:has-text("Weiter")').click();
  await page.waitForTimeout(500);

  await page.fill('#title', EVENT_TITLE);
  const editor = page.locator('[data-testid="description-editor"] .rte-content');
  await editor.click();
  await editor.fill('Regression: Enter im Kategorie-Feld darf nicht zum nächsten Step springen.');
  await page.locator('button:has-text("Weiter")').click();
  await page.waitForTimeout(500);

  await page.fill('#date', futureIso);
  await page.fill('#time', '10:00');
  await page.fill('#place', 'Enter Bug Test Place');
  await page.selectOption('#bezirk', 'Bregenz');
}

test.describe('Custom category: regression tests (fWaRFw5P follow-up)', () => {
  test.afterEach(async ({ page }) => {
    await signOut(page);
  });

  test('pressing Enter in the category field does not advance to the next step', async ({
    page,
  }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin/new');
    await waitForWizardToLoad(page);

    await fillWizardWithCustomCategory(page);

    // Sanity check: we're on step 3 (Date / Ort / Kategorie).
    await expect(page.locator('input#date')).toBeVisible();
    // The step 4 summary heading must NOT be active.
    await expect(page.locator('.wizard-step.active .wizard-step-title')).toHaveText('Details');

    // Type a new category and press Enter — Enter must commit the new category,
    // not advance the wizard.
    await page.click('.kategorie-select');
    await page.waitForTimeout(200);
    await page.fill('.kategorie-select input', NEW_CATEGORY);
    await page.waitForTimeout(200);
    await page.locator('.kategorie-select input').press('Enter');
    await page.waitForTimeout(500);

    // We must still be on step 3.
    await expect(page.locator('input#date')).toBeVisible();
    await expect(page.locator('.wizard-step.active .wizard-step-title')).toHaveText('Details');
  });

  test('after creating a new category it stays selected in the dropdown', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin/new');
    await waitForWizardToLoad(page);

    await fillWizardWithCustomCategory(page);

    await page.click('.kategorie-select');
    await page.waitForTimeout(200);
    await page.fill('.kategorie-select input', NEW_CATEGORY);
    await page.waitForTimeout(200);
    await page.click(`.kategorie__option:has-text("${NEW_CATEGORY}")`);
    await page.waitForTimeout(300);

    // The CreatableSelect control should now show the new category as selected.
    // react-select renders the selected value in an element with class
    // .kategorie__single-value inside the .kategorie__control container.
    const selectedValue = page.locator('.kategorie__single-value', { hasText: NEW_CATEGORY });
    await expect(selectedValue).toBeVisible();

    // Aborting: cancel the wizard so we don't leave a half-finished draft.
    void confirmCopyrightCheckbox;
  });
});
