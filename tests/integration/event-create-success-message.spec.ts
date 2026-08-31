import { test, expect } from '@playwright/test';
import { signInWithEmailAndPassword, signOut, waitForCalendarToLoad } from '../helpers/auth';
import { confirmCopyrightCheckbox, waitForWizardToLoad } from '../helpers/wizard';

const EVENT_TITLE = 'Success Dialog Test Event';

async function confirmPreSubmitDialog(page) {
  const preSubmitDialog = page.locator('.confirm-dialog').filter({ hasText: 'Einreichen' });
  await expect(preSubmitDialog).toBeVisible({ timeout: 10000 });
  await preSubmitDialog.getByRole('button', { name: /^einreichen$/i }).click();
}

async function fillWizardAndSubmit(page, title) {
  const future = new Date();
  future.setDate(future.getDate() + 30);
  const futureIso = future.toISOString().split('T')[0];

  await page.fill('#organizer\\.firstName', 'Test');
  await page.fill('#organizer\\.lastName', 'User');
  await page.fill('#kontakt', 'test@example.com');
  await page.locator('button:has-text("Weiter")').click();
  await page.waitForTimeout(500);

  await page.fill('#title', title);
  const editor = page.locator('[data-testid="description-editor"] .rte-content');
  await editor.click();
  await editor.fill('Event created to verify the post-submit success dialog.');
  await page.locator('button:has-text("Weiter")').click();
  await page.waitForTimeout(500);

  await page.fill('#date', futureIso);
  await page.fill('#time', '10:00');
  await page.fill('#place', 'Test Place');
  await page.selectOption('#bezirk', 'Bregenz');

  await page.click('.kategorie-select');
  await page.waitForTimeout(300);
  await page.click('.kategorie__option:has-text("Yoga")');
  await page.waitForTimeout(300);

  await page.locator('button:has-text("Weiter")').click();
  await page.waitForTimeout(500);

  await confirmCopyrightCheckbox(page);

  await page.click(
    'button:has-text("Event erstellen"), button:has-text("Einreichen zur Genehmigung")'
  );
  await page.waitForTimeout(500);
}

test.describe('Event erstellen success message more obvious (NyC8Ui2W)', () => {
  test.afterEach(async ({ page }) => {
    await signOut(page);
  });

  test('shows a success dialog after submitting an event for approval', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'user@test.local', 'testpassword123');

    await page.goto('/admin/new');
    await waitForWizardToLoad(page);

    await fillWizardAndSubmit(page, EVENT_TITLE);

    await confirmPreSubmitDialog(page);

    const successDialog = page.getByTestId('success-dialog');
    await expect(successDialog).toBeVisible({ timeout: 10000 });

    await expect(successDialog.getByTestId('success-dialog-icon')).toBeVisible();
    await expect(successDialog.locator('h2')).toContainText('Vielen Dank!');

    await expect(successDialog).toContainText(EVENT_TITLE);
    await expect(successDialog).toContainText(/admin/i);

    const details = successDialog.getByTestId('success-dialog-details');
    await expect(details).toBeVisible();
    await expect(details).toContainText(/Prüfung/);
    await expect(details).toContainText(/Person/);
  });

  test('success dialog confirm button navigates to /admin and shows pending event', async ({
    page,
  }) => {
    await signInWithEmailAndPassword(page, 'user@test.local', 'testpassword123');

    await page.goto('/admin/new');
    await waitForWizardToLoad(page);

    await fillWizardAndSubmit(page, EVENT_TITLE);

    await confirmPreSubmitDialog(page);

    const successDialog = page.getByTestId('success-dialog');
    await expect(successDialog).toBeVisible({ timeout: 10000 });

    await successDialog.getByTestId('success-dialog-confirm').click();

    await page.waitForURL('/admin', { timeout: 10000 });

    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    const newCard = page.locator('.event-card', { hasText: EVENT_TITLE }).first();
    await expect(newCard).toBeVisible({ timeout: 10000 });
    await expect(newCard.locator('.status-badge--pending')).toBeVisible();
  });

  test('submitted event is NOT publicly visible until admin approval', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'user@test.local', 'testpassword123');

    await page.goto('/admin/new');
    await waitForWizardToLoad(page);

    await fillWizardAndSubmit(page, EVENT_TITLE);

    await confirmPreSubmitDialog(page);

    const successDialog = page.getByTestId('success-dialog');
    await expect(successDialog).toBeVisible({ timeout: 10000 });
    await successDialog.getByTestId('success-dialog-confirm').click();

    await page.waitForURL('/admin', { timeout: 10000 });

    await signOut(page);

    await page.goto('/');
    await waitForCalendarToLoad(page);

    const eventCards = page.locator('.event-card-public, .event-row');
    const count = await eventCards.count();
    for (let i = 0; i < count; i += 1) {
      const text = await eventCards.nth(i).innerText();
      expect(text).not.toContain(EVENT_TITLE);
    }
  });

  test('success dialog can be dismissed by clicking the overlay', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'user@test.local', 'testpassword123');

    await page.goto('/admin/new');
    await waitForWizardToLoad(page);

    await fillWizardAndSubmit(page, EVENT_TITLE);

    await confirmPreSubmitDialog(page);

    const successDialog = page.getByTestId('success-dialog');
    await expect(successDialog).toBeVisible({ timeout: 10000 });

    await page.locator('.confirm-overlay').click({ position: { x: 10, y: 10 } });

    await page.waitForURL('/admin', { timeout: 10000 });
  });
});
