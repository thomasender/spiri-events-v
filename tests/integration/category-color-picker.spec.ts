import { test, expect } from '@playwright/test';
import {
  signInWithEmailAndPassword,
  signOut,
  waitForCalendarToLoad,
  clearEventsWithCategoryColor,
} from '../helpers/auth';
import {
  waitForWizardToLoad,
  confirmCopyrightCheckbox,
  pickEnabledCategoryColor,
} from '../helpers/wizard';

const RUN_ID = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
const baseCategory = (suffix) => `PickerPilates-${RUN_ID}-${suffix}`;
const baseTitle = (suffix) => `Picker Pilates Event ${RUN_ID}-${suffix}`;

// The 7 seed colors are always in use; the 8th may or may not be free
// depending on whether previous test runs already wrote a categoryColor.
const SEED_PALETTE_COLORS = [
  '#c48e6a',
  '#bf5b4e',
  '#5c6b3f',
  '#8a6d2f',
  '#9a5f38',
  '#6b568b',
  '#605e5e',
];

async function fillOrganizerAndTitle(page, title) {
  await page.fill('#organizer\\.firstName', 'Picker');
  await page.fill('#organizer\\.lastName', 'Tester');
  await page.fill('#kontakt', 'picker@test.com');
  await page.locator('button:has-text("Weiter")').click();
  await page.waitForTimeout(500);

  await page.fill('#title', title);
  const editor = page.locator('[data-testid="description-editor"] .rte-content');
  await editor.click();
  await editor.fill('Event for testing the new category color picker.');
  await page.locator('button:has-text("Weiter")').click();
  await page.waitForTimeout(500);
}

async function fillStep3Details(page, category) {
  const future = new Date();
  future.setDate(future.getDate() + 7);
  const futureIso = future.toISOString().split('T')[0];
  await page.fill('#date', futureIso);
  await page.fill('#time', '10:00');
  await page.fill('#place', 'Picker Test Place');
  await page.selectOption('#bezirk', 'Bregenz');

  await page.click('.kategorie-select');
  await page.waitForTimeout(300);
  await page.fill('.kategorie-select input', category);
  await page.waitForTimeout(300);
  await page.click(`.kategorie__option:has-text("${category}")`);
}

test.describe('Category color picker (Xv4ESAHR)', () => {
  test.beforeAll(async () => {
    // Free the palette for this file by wiping any leftover events that
    // carry a categoryColor — those are test artifacts from previous
    // picker runs. The 7 seed categories are hard-coded in CATEGORY_COLORS
    // and unaffected.
    await clearEventsWithCategoryColor();
  });

  test.afterEach(async ({ page }) => {
    await signOut(page);
  });

  test('opens the picker when creating a brand-new category and shows a prompt to choose a color', async ({
    page,
  }) => {
    const category = baseCategory('opens');
    const title = baseTitle('opens');
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin/new');
    await waitForWizardToLoad(page);

    await fillOrganizerAndTitle(page, title);
    await fillStep3Details(page, category);

    // The picker must appear with a prompt and the 8 swatches.
    const picker = page.getByTestId('category-color-picker');
    await expect(picker).toBeVisible();
    await expect(picker).toContainText('Bitte wähle eine Farbe');
    await expect(picker).toContainText(category);

    const swatches = picker.locator('.category-color-picker-swatch');
    await expect(swatches).toHaveCount(8);

    // The 7 seed colors are all marked disabled because they are already
    // used by existing categories. The 8th swatch is the only one that's
    // selectable on a clean emulator; on subsequent runs other tests may
    // have consumed additional slots, so we only assert that *some*
    // swatch is enabled.
    for (const seedColor of SEED_PALETTE_COLORS) {
      await expect(picker.locator(`[data-color="${seedColor}"]`)).toBeDisabled();
    }
    const enabled = await picker.locator('.category-color-picker-swatch:not([disabled])').count();
    expect(enabled).toBeGreaterThan(0);
  });

  test('cancelling the picker leaves the category unselected', async ({ page }) => {
    const category = baseCategory('cancel');
    const title = baseTitle('cancel');
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin/new');
    await waitForWizardToLoad(page);

    await fillOrganizerAndTitle(page, title);
    await fillStep3Details(page, category);

    const picker = page.getByTestId('category-color-picker');
    await expect(picker).toBeVisible();
    await page.getByTestId('category-color-picker-cancel').click();
    await expect(picker).toBeHidden();

    // The new category must NOT have been committed to the dropdown.
    const control = page.locator('.kategorie__control');
    await expect(control).not.toContainText(category);
  });

  test('pressing Escape closes the picker without committing', async ({ page }) => {
    const category = baseCategory('escape');
    const title = baseTitle('escape');
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin/new');
    await waitForWizardToLoad(page);

    await fillOrganizerAndTitle(page, title);
    await fillStep3Details(page, category);

    const picker = page.getByTestId('category-color-picker');
    await expect(picker).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(picker).toBeHidden();
  });

  test('picking a color commits the category and the event ends up with that color on the calendar', async ({
    page,
  }) => {
    const category = baseCategory('commit');
    const title = baseTitle('commit');
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin/new');
    await waitForWizardToLoad(page);

    await fillOrganizerAndTitle(page, title);
    await fillStep3Details(page, category);

    const picker = page.getByTestId('category-color-picker');
    await expect(picker).toBeVisible();
    const pickedColor = await pickEnabledCategoryColor(page);
    await expect(picker).toBeHidden();

    // The category should now be visible as selected in the dropdown.
    await expect(page.locator('.kategorie__single-value', { hasText: category })).toBeVisible();

    // Continue to the summary step, submit, approve, and verify on /.
    await page.locator('button:has-text("Weiter")').click();
    await page.waitForTimeout(500);
    await confirmCopyrightCheckbox(page);
    await page.click(
      'button:has-text("Event erstellen"), button:has-text("Einreichen zur Genehmigung")'
    );
    await page.waitForTimeout(500);

    // Confirm the submission dialog, then dismiss the success dialog.
    await page.click('button:has-text("Einreichen"), button:has-text("Bestätigen")');
    await page.waitForTimeout(2000);

    await page.waitForURL('/admin', { timeout: 10000 }).catch(() => {});
    const successDialog = page.getByTestId('success-dialog');
    if (await successDialog.isVisible().catch(() => false)) {
      await successDialog.getByTestId('success-dialog-confirm').click();
    }

    // Approval flow.
    await page.waitForURL('/admin', { timeout: 10000 });
    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    const pendingCard = page
      .locator('.event-card', { hasText: title })
      .filter({ has: page.locator('.status-badge--pending') })
      .first();
    const approveBtn = pendingCard.getByRole('button', { name: /genehmigen/i });
    await expect(approveBtn).toBeVisible({ timeout: 10000 });
    await approveBtn.click();
    await approveBtn.waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});

    // Public calendar must show the new category chip with the picked color.
    await page.goto('/');
    await waitForCalendarToLoad(page);

    const newChip = page.locator('.filter-chip--category', { hasText: category });
    await expect(newChip).toBeVisible({ timeout: 10000 });
    await expect(newChip).toHaveAttribute('style', new RegExp(pickedColor.replace('#', ''), 'i'));
  });
});
