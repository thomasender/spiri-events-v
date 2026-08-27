import { test, expect } from '@playwright/test';
import { spawn } from 'child_process';
import { signInWithEmailAndPassword, signOut } from '../helpers/auth';
import { generateSlug } from '../helpers/slug';

const RECURRING_EVENT_SLUG = generateSlug('Test Weekly Yoga Series', 'Yogastudio Test', 7);

async function resetRecurringEventFixture(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const proc = spawn('node', ['scripts/reset-recurring-event-fixtures.mjs'], {
      cwd: process.cwd(),
      stdio: 'ignore',
      shell: true,
    });
    proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`exit ${code}`))));
    proc.on('error', reject);
  });
}

test.describe('Recurring event deletion from EventDetailPage', () => {
  // recurring-event-deletion-edit-form.spec.ts deletes this same shared fixture doc
  // in its last test; reset it here so this file passes regardless of file order.
  test.beforeEach(async () => {
    await resetRecurringEventFixture();
  });

  test.afterEach(async ({ page }) => {
    await signOut(page);
  });

  test('delete button opens RecurringDeleteDialog with all three delete modes', async ({
    page,
  }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');

    await page.goto(`/event/${RECURRING_EVENT_SLUG}`);
    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    await expect(page.locator('.event-title')).toContainText('Test Weekly Yoga Series', {
      timeout: 10000,
    });

    await page.getByTestId('delete-event-button').click();

    // EventDetailPage first asks which occurrence to delete before showing the
    // delete-mode dialog (EventForm's edit-form entry point skips this step).
    await expect(page.getByRole('heading', { name: 'Termin auswählen' })).toBeVisible();
    await page.locator('.occurrence-option').first().click();
    await page.getByRole('button', { name: /weiter/i }).click();

    await expect(page.getByRole('heading', { name: 'Termin löschen' })).toBeVisible();
    await expect(page.getByText('Nur diesen Termin löschen')).toBeVisible();
    await expect(page.getByText('Diesen und alle folgenden Termine löschen')).toBeVisible();
    await expect(page.getByText('Gesamte Serie löschen')).toBeVisible();

    await page.getByRole('button', { name: /abbrechen/i }).click();
    await expect(page.getByText('Termin löschen')).toHaveCount(0);
  });
});
