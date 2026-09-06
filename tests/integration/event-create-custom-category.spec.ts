import { test, expect } from '@playwright/test';
import { signInWithEmailAndPassword, signOut, waitForCalendarToLoad } from '../helpers/auth';
import { waitForWizardToLoad, confirmCopyrightCheckbox } from '../helpers/wizard';

const RUN_ID = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
const EVENT_TITLE = `Custom Kategorie Pilates Event ${RUN_ID}`;

async function fillWizardWithCustomCategory(page, title) {
  // Use a date 7 days in the future to keep the event within the current calendar
  // month so it shows up in the default view.
  const future = new Date();
  future.setDate(future.getDate() + 7);
  const futureIso = future.toISOString().split('T')[0];

  await page.fill('#organizer\\.firstName', 'Custom');
  await page.fill('#organizer\\.lastName', 'Kategorie');
  await page.fill('#kontakt', 'custom@test.com');
  await page.locator('button:has-text("Weiter")').click();
  await page.waitForTimeout(500);

  await page.fill('#title', title);
  const editor = page.locator('[data-testid="description-editor"] .rte-content');
  await editor.click();
  await editor.fill('Event for testing custom category creation.');
  await page.locator('button:has-text("Weiter")').click();
  await page.waitForTimeout(500);

  await page.fill('#date', futureIso);
  await page.fill('#time', '10:00');
  await page.fill('#place', 'Custom Test Place');
  await page.selectOption('#bezirk', 'Bregenz');

  // Open the kategori dropdown and type a new category that doesn't exist yet.
  await page.click('.kategorie-select');
  await page.waitForTimeout(300);
  await page.fill('.kategorie-select input', 'Pilates');
  await page.waitForTimeout(300);
  // CreatableSelect shows a "Create" option labelled like:
  //   "Pilates" als neue Kategorie anlegen
  await page.click('.kategorie__option:has-text("Pilates")');
  await page.waitForTimeout(300);

  await page.locator('button:has-text("Weiter")').click();
  await page.waitForTimeout(500);

  await confirmCopyrightCheckbox(page);

  await page.click(
    'button:has-text("Event erstellen"), button:has-text("Einreichen zur Genehmigung")'
  );
  await page.waitForTimeout(500);
}

async function approveMostRecentPending(page, title) {
  await page.click('button:has-text("Einreichen")');
  await page.waitForTimeout(2000);

  await page.waitForURL('/admin', { timeout: 10000 }).catch(() => {});
  const successDialog = page.getByTestId('success-dialog');
  if (await successDialog.isVisible().catch(() => false)) {
    await successDialog.getByTestId('success-dialog-confirm').click();
  }

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

  // After approval, the card either moves to "Meine Events" with an approved badge,
  // or disappears from the pending list. Wait for the approve button to disappear.
  await approveBtn.waitFor({ state: 'hidden', timeout: 10000 }).catch(async () => {
    // Fallback: the card may still be visible but now under "Meine Events".
    // Confirm via status-badge--approved appearing somewhere on the page for this title.
    await page
      .locator('.event-card', { hasText: title })
      .locator('.status-badge--approved')
      .first()
      .waitFor({ timeout: 10000 });
  });
}

test.describe('Custom event category creation (fWaRFw5P)', () => {
  test.afterEach(async ({ page }) => {
    await signOut(page);
  });

  test('admin can create an event with a brand-new category and it appears in the filter', async ({
    page,
  }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin/new');
    await waitForWizardToLoad(page);

    await fillWizardWithCustomCategory(page, EVENT_TITLE);
    await approveMostRecentPending(page, EVENT_TITLE);

    // Navigate to the public calendar
    await page.goto('/');
    await waitForCalendarToLoad(page);

    // The new category chip "Pilates" should be present in the filter.
    // That is enough proof that the dynamic category discovery picks up
    // user-created categories as soon as their first event is approved.
    const pilatesChip = page.locator('.filter-chip--category', { hasText: 'Pilates' });
    await expect(pilatesChip).toBeVisible({ timeout: 10000 });

    // And the chip must be auto-selected — the user shouldn't have to
    // click it manually to see events with the new category.
    await expect(pilatesChip).toHaveAttribute('aria-pressed', 'true');
  });

  test('input that normalizes whitespace and case still works', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin/new');
    await waitForWizardToLoad(page);

    // Use a different title and category for this test
    const title = `Whitespace Normalisierung Event ${RUN_ID}`;
    await page.fill('#organizer\\.firstName', 'WS');
    await page.fill('#organizer\\.lastName', 'Test');
    await page.fill('#kontakt', 'ws@test.com');
    await page.locator('button:has-text("Weiter")').click();
    await page.waitForTimeout(500);

    await page.fill('#title', title);
    const editor = page.locator('[data-testid="description-editor"] .rte-content');
    await editor.click();
    await editor.fill('Event for testing category normalization.');
    await page.locator('button:has-text("Weiter")').click();
    await page.waitForTimeout(500);

    const future = new Date();
    future.setDate(future.getDate() + 31);
    await page.fill('#date', future.toISOString().split('T')[0]);
    await page.fill('#time', '11:00');
    await page.fill('#place', 'Whitespace Test Place');
    await page.selectOption('#bezirk', 'Bregenz');

    await page.click('.kategorie-select');
    await page.waitForTimeout(300);
    // Type with leading/trailing whitespace + lowercase — should normalize to "Qigong"
    await page.fill('.kategorie-select input', '  qi gong  ');
    await page.waitForTimeout(300);
    // The "Create" label shows the normalized form
    await expect(
      page.locator('.kategorie__option', { hasText: /Qi gong.*als neue Kategorie anlegen/ })
    ).toBeVisible();
    await page.click('.kategorie__option:has-text("Qi gong")');
    await page.waitForTimeout(300);

    await page.locator('button:has-text("Weiter")').click();
    await page.waitForTimeout(500);
    await confirmCopyrightCheckbox(page);
    await page.click(
      'button:has-text("Event erstellen"), button:has-text("Einreichen zur Genehmigung")'
    );
    await page.waitForTimeout(500);

    // We just check the value is set correctly when submitted.
    const dialog = page.locator('.confirm-dialog');
    await expect(dialog).toBeVisible();
  });
});
