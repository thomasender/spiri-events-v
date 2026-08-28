import { test, expect } from '@playwright/test';
import { signInWithEmailAndPassword, signOut, waitForCalendarToLoad } from '../helpers/auth';
import { waitForWizardToLoad } from '../helpers/wizard';

const EVENT_TITLE = 'Admin Created Test Event';

async function fillWizardAndSubmit(page, title, placeName) {
  const future = new Date();
  future.setDate(future.getDate() + 30);
  const futureIso = future.toISOString().split('T')[0];

  await page.fill('#organizer\\.firstName', 'Admin');
  await page.fill('#organizer\\.lastName', 'Tester');
  await page.fill('#kontakt', 'admin@test.com');
  await page.locator('button:has-text("Weiter")').click();
  await page.waitForTimeout(500);

  await page.fill('#title', title);
  const editor = page.locator('[data-testid="description-editor"] .rte-content');
  await editor.click();
  await editor.fill('Event created by admin to verify approval workflow.');
  await page.locator('button:has-text("Weiter")').click();
  await page.waitForTimeout(500);

  await page.fill('#date', futureIso);
  await page.fill('#time', '10:00');
  await page.fill('#place', placeName);
  await page.selectOption('#bezirk', 'Bregenz');

  await page.click('.kategorie-select');
  await page.waitForTimeout(300);
  await page.click('.kategorie__option:has-text("Yoga")');
  await page.waitForTimeout(300);

  await page.locator('button:has-text("Weiter")').click();
  await page.waitForTimeout(500);

  await page.click(
    'button:has-text("Event erstellen"), button:has-text("Einreichen zur Genehmigung")'
  );
  await page.waitForTimeout(500);
}

test.describe('Admin-created events need approval (hGxrS6gp)', () => {
  test.afterEach(async ({ page }) => {
    await signOut(page);
  });

  test('admin sees confirmation modal when creating a new event', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');

    await page.goto('/admin/new');
    await waitForWizardToLoad(page);

    await fillWizardAndSubmit(page, EVENT_TITLE, 'Admin Test Place');

    const dialog = page.locator('.confirm-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('Event zur Genehmigung einreichen');
    await expect(dialog).toContainText('Einreichen');

    await page.click('button:has-text("Abbrechen")');
    await expect(dialog).not.toBeVisible();
  });

  test('admin-created event starts as pending and is not publicly visible', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');

    await page.goto('/admin/new');
    await waitForWizardToLoad(page);

    await fillWizardAndSubmit(page, EVENT_TITLE, 'Admin Test Place');

    await page.click('button:has-text("Einreichen")');
    await page.waitForTimeout(2000);

    await page.waitForURL('/admin', { timeout: 10000 }).catch(() => {});
    await page
      .getByTestId('success-dialog')
      .waitFor({ state: 'visible', timeout: 10000 })
      .catch(() => {});
    const successDialog = page.getByTestId('success-dialog');
    if (await successDialog.isVisible().catch(() => false)) {
      await successDialog.getByTestId('success-dialog-confirm').click();
    }

    await page.waitForURL('/admin', { timeout: 10000 });

    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    const pendingSection = page.locator('h2', { hasText: 'Ausstehende Genehmigungen' });
    await expect(pendingSection).toBeVisible({ timeout: 10000 });

    const pendingCard = page
      .locator('.event-list-section')
      .filter({ has: page.locator('h2', { hasText: 'Ausstehende Genehmigungen' }) })
      .locator('.event-card', { hasText: EVENT_TITLE })
      .first();
    await expect(pendingCard).toBeVisible({ timeout: 10000 });
    await expect(pendingCard.locator('.status-badge--pending')).toBeVisible();
    await expect(pendingCard.locator('.status-badge--approved')).toHaveCount(0);
    await expect(pendingCard.getByRole('button', { name: /genehmigen/i })).toBeVisible();

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
});
