import { test, expect } from '@playwright/test';
import { spawn } from 'child_process';
import { signInWithEmailAndPassword, signOut } from '../helpers/auth';

async function resetTrashFixtures(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const proc = spawn('node', ['scripts/reset-trash-fixtures.mjs'], {
      cwd: process.cwd(),
      stdio: 'ignore',
      shell: true,
    });
    proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`exit ${code}`))));
    proc.on('error', reject);
  });
}

async function waitForAdminTabs(page): Promise<void> {
  await page
    .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
    .catch(() => {});
}

test.describe.configure({ mode: 'serial' });

test.describe('Papierkorb tab (SS79oSci)', () => {
  test.beforeEach(async () => {
    await resetTrashFixtures();
  });

  test.afterEach(async ({ page }) => {
    await signOut(page);
    await resetTrashFixtures();
  });

  test('Papierkorb tab is hidden when there are no trashed events', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'user@test.local', 'testpassword123');
    await page.goto('/admin');
    await waitForAdminTabs(page);

    const trashTab = page.getByTestId('admin-tab-trash');
    await expect(trashTab).toBeVisible();

    await trashTab.click();
    await page.getByTestId('trash-permanent-delete-button-test-event-user-trashed').click();
    await page
      .locator('.confirm-dialog')
      .getByRole('button', { name: /endgültig löschen/i })
      .click();

    await expect(trashTab).toBeVisible({ timeout: 5000 });

    await page.getByTestId('trash-permanent-delete-button-test-event-user-trashed-old').click();
    await page
      .locator('.confirm-dialog')
      .getByRole('button', { name: /endgültig löschen/i })
      .click();

    await expect(trashTab).toHaveCount(0, { timeout: 5000 });
  });

  test('Papierkorb tab appears when a user has a trashed event', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'user@test.local', 'testpassword123');
    await page.goto('/admin');
    await waitForAdminTabs(page);

    const trashTab = page.getByTestId('admin-tab-trash');
    await expect(trashTab).toBeVisible();
    await expect(trashTab).toContainText('Papierkorb');
  });

  test('Trashed event is listed in the Papierkorb tab with date and restore/delete actions', async ({
    page,
  }) => {
    await signInWithEmailAndPassword(page, 'user@test.local', 'testpassword123');
    await page.goto('/admin?tab=trash');
    await waitForAdminTabs(page);

    const card = page.getByTestId('trash-event-card-test-event-user-trashed');
    await expect(card).toBeVisible();
    await expect(card).toContainText('User Trashed Event');
    await expect(card.getByTestId('trash-restore-button-test-event-user-trashed')).toBeVisible();
    await expect(
      card.getByTestId('trash-permanent-delete-button-test-event-user-trashed')
    ).toBeVisible();

    await expect(page.getByTestId('trash-event-trashed-at-test-event-user-trashed')).toContainText(
      /Gelöscht am/
    );
  });

  test('Restore moves the event back to Entwürfe and removes it from Papierkorb', async ({
    page,
  }) => {
    await signInWithEmailAndPassword(page, 'user@test.local', 'testpassword123');
    await page.goto('/admin?tab=trash');
    await waitForAdminTabs(page);

    // First permanent-delete the older fixture so only user-trashed remains.
    await page.getByTestId('trash-permanent-delete-button-test-event-user-trashed-old').click();
    await page
      .locator('.confirm-dialog')
      .getByRole('button', { name: /endgültig löschen/i })
      .click();
    await expect(page.getByTestId('trash-event-card-test-event-user-trashed-old')).toHaveCount(0, {
      timeout: 5000,
    });

    const card = page.getByTestId('trash-event-card-test-event-user-trashed');
    await expect(card).toBeVisible();

    await page.getByTestId('trash-restore-button-test-event-user-trashed').click();

    await expect(page.getByText(/wieder als Entwurf/i)).toBeVisible();
    await page
      .locator('.confirm-dialog')
      .getByRole('button', { name: /wiederherstellen/i })
      .click();

    await expect(card).toHaveCount(0, { timeout: 5000 });

    await expect(page.getByTestId('admin-tab-trash')).toHaveCount(0, { timeout: 5000 });

    await page.goto('/admin?tab=drafts');
    await waitForAdminTabs(page);
    await expect(page.locator('.event-card', { hasText: 'User Trashed Event' })).toBeVisible();
  });

  test('Endgültig löschen removes the event from Firestore', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'user@test.local', 'testpassword123');
    await page.goto('/admin?tab=trash');
    await waitForAdminTabs(page);

    // First permanent-delete the older fixture so only user-trashed remains.
    await page.getByTestId('trash-permanent-delete-button-test-event-user-trashed-old').click();
    await page
      .locator('.confirm-dialog')
      .getByRole('button', { name: /endgültig löschen/i })
      .click();
    await expect(page.getByTestId('trash-event-card-test-event-user-trashed-old')).toHaveCount(0, {
      timeout: 5000,
    });

    const card = page.getByTestId('trash-event-card-test-event-user-trashed');
    await expect(card).toBeVisible();

    await page.getByTestId('trash-permanent-delete-button-test-event-user-trashed').click();
    await expect(page.getByText(/unwiderruflich/i)).toBeVisible();
    await page
      .locator('.confirm-dialog')
      .getByRole('button', { name: /endgültig löschen/i })
      .click();

    await expect(card).toHaveCount(0, { timeout: 5000 });
    await expect(page.getByTestId('admin-tab-trash')).toHaveCount(0, { timeout: 5000 });
  });

  test('Trashed events are not visible in Meine Events', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'user@test.local', 'testpassword123');
    await page.goto('/admin');
    await waitForAdminTabs(page);

    await expect(page.getByTestId('admin-tab-events')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('.event-card', { hasText: 'User Trashed Event' })).toHaveCount(0);
  });

  test('Trashed event is not visible to guests on the calendar', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.calendar, .events-section', { timeout: 15000 }).catch(() => {});

    await expect(page.locator('.event-title', { hasText: 'User Trashed Event' })).toHaveCount(0);
  });

  test('Non-admin user does NOT see other users trashed events', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'user@test.local', 'testpassword123');
    await page.goto('/admin?tab=trash');
    await waitForAdminTabs(page);

    await expect(page.getByTestId('trash-event-card-test-event-user-trashed')).toBeVisible();
    await expect(page.getByTestId('trash-event-card-test-event-admin-trashed')).toHaveCount(0);
  });

  test('Admin sees all users trashed events', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin?tab=trash');
    await waitForAdminTabs(page);

    await expect(page.getByTestId('trash-event-card-test-event-admin-trashed')).toBeVisible();
    await expect(page.getByTestId('trash-event-card-test-event-user-trashed')).toBeVisible();
  });

  test('Deleting from EventList moves the event to Papierkorb', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin');
    await waitForAdminTabs(page);

    const yogaCard = page.locator('.event-card', { hasText: 'Yoga heute' }).first();
    await expect(yogaCard).toBeVisible();
    await yogaCard.getByRole('button', { name: /event löschen/i }).click();

    await expect(page.getByText(/in den Papierkorb verschoben/i)).toBeVisible();
    await page.getByRole('button', { name: /papierkorb/i }).click();

    await expect(yogaCard).toHaveCount(0, { timeout: 5000 });

    await page.goto('/admin?tab=trash');
    await waitForAdminTabs(page);
    await expect(page.locator('.event-card', { hasText: 'Yoga heute' })).toBeVisible();
  });
});
