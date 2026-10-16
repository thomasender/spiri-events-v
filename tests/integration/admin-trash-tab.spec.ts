import { test, expect, type Page } from '@playwright/test';
import { spawn } from 'child_process';
import { STORAGE_STATE } from '../helpers/roles';
import { createApprovedEvent, deleteEventById } from '../fixtures/events';

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

async function openAdmin(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await expect(page.getByRole('tablist', { name: 'Verwaltungs-Bereiche' })).toBeVisible({
    timeout: 15000,
  });
}

/**
 * Clicks the confirm button of the open ConfirmDialog and waits until the
 * dialog has closed.
 *
 * The list updates optimistically (Firestore latency compensation), so the
 * card vanishes long before the server has the write. The dialog, however,
 * only closes once updateDoc/deleteDoc has resolved, i.e. the emulator has
 * acknowledged the write. Navigating away before that point drops the write
 * with the page — which is exactly what made this spec flaky.
 */
async function confirmAndWaitForWrite(page: Page, name: RegExp): Promise<void> {
  const dialog = page.locator('.confirm-dialog');
  await dialog.getByRole('button', { name }).click();
  await expect(dialog).toHaveCount(0, { timeout: 10000 });
}

test.describe.configure({ mode: 'serial' });

test.describe('Papierkorb tab', () => {
  test.beforeEach(async () => {
    await resetTrashFixtures();
  });

  test.afterEach(async () => {
    await resetTrashFixtures();
  });

  test.describe('as the owner', () => {
    test.use({ storageState: STORAGE_STATE.user });

    test('Papierkorb tab is hidden when there are no trashed events', async ({ page }) => {
      await openAdmin(page, '/admin');

      const trashTab = page.getByTestId('admin-tab-trash');
      await expect(trashTab).toBeVisible();

      await trashTab.click();
      await page.getByTestId('trash-permanent-delete-button-test-event-user-trashed').click();
      await confirmAndWaitForWrite(page, /endgültig löschen/i);

      await expect(trashTab).toBeVisible();

      await page.getByTestId('trash-permanent-delete-button-test-event-user-trashed-old').click();
      await confirmAndWaitForWrite(page, /endgültig löschen/i);

      await expect(trashTab).toHaveCount(0);
    });

    test('Papierkorb tab appears when a user has a trashed event', async ({ page }) => {
      await openAdmin(page, '/admin');

      const trashTab = page.getByTestId('admin-tab-trash');
      await expect(trashTab).toBeVisible();
      await expect(trashTab).toContainText('Papierkorb');
    });

    test('Trashed event is listed in the Papierkorb tab with date and restore/delete actions', async ({
      page,
    }) => {
      await openAdmin(page, '/admin?tab=trash');

      const card = page.getByTestId('trash-event-card-test-event-user-trashed');
      await expect(card).toBeVisible();
      await expect(card).toContainText('User Trashed Event');
      await expect(card.getByTestId('trash-restore-button-test-event-user-trashed')).toBeVisible();
      await expect(
        card.getByTestId('trash-permanent-delete-button-test-event-user-trashed')
      ).toBeVisible();

      await expect(
        page.getByTestId('trash-event-trashed-at-test-event-user-trashed')
      ).toContainText(/Gelöscht am/);
    });

    test(
      'Restore moves the event back to Entwürfe and removes it from Papierkorb',
      { tag: '@smoke' },
      async ({ page }) => {
        await openAdmin(page, '/admin?tab=trash');

        // First permanent-delete the older fixture so only user-trashed remains.
        await page.getByTestId('trash-permanent-delete-button-test-event-user-trashed-old').click();
        await confirmAndWaitForWrite(page, /endgültig löschen/i);
        await expect(page.getByTestId('trash-event-card-test-event-user-trashed-old')).toHaveCount(
          0
        );

        const card = page.getByTestId('trash-event-card-test-event-user-trashed');
        await expect(card).toBeVisible();

        await page.getByTestId('trash-restore-button-test-event-user-trashed').click();
        await expect(page.getByText(/wieder als Entwurf/i)).toBeVisible();
        await confirmAndWaitForWrite(page, /wiederherstellen/i);

        await expect(card).toHaveCount(0);
        await expect(page.getByTestId('admin-tab-trash')).toHaveCount(0);

        // The restore is acknowledged by the server (dialog closed), so a
        // fresh page load must see it.
        await openAdmin(page, '/admin?tab=drafts');
        await expect(page.locator('.event-card', { hasText: 'User Trashed Event' })).toBeVisible();
      }
    );

    test('Endgültig löschen removes the event from Firestore', async ({ page }) => {
      await openAdmin(page, '/admin?tab=trash');

      // First permanent-delete the older fixture so only user-trashed remains.
      await page.getByTestId('trash-permanent-delete-button-test-event-user-trashed-old').click();
      await confirmAndWaitForWrite(page, /endgültig löschen/i);
      await expect(page.getByTestId('trash-event-card-test-event-user-trashed-old')).toHaveCount(0);

      const card = page.getByTestId('trash-event-card-test-event-user-trashed');
      await expect(card).toBeVisible();

      await page.getByTestId('trash-permanent-delete-button-test-event-user-trashed').click();
      await expect(page.getByText(/unwiderruflich/i)).toBeVisible();
      await confirmAndWaitForWrite(page, /endgültig löschen/i);

      await expect(card).toHaveCount(0);
      await expect(page.getByTestId('admin-tab-trash')).toHaveCount(0);
    });

    test('Trashed events are not visible in Meine Events', async ({ page }) => {
      await openAdmin(page, '/admin');

      await expect(page.getByTestId('admin-tab-events')).toHaveAttribute('aria-selected', 'true');
      // Wait for the list itself, otherwise "0 cards" also passes on a page
      // that has not loaded its events yet.
      await expect(page.locator('.event-card').first()).toBeVisible();
      await expect(page.locator('.event-card', { hasText: 'User Trashed Event' })).toHaveCount(0);
    });

    test('Non-admin user does NOT see other users trashed events', async ({ page }) => {
      await openAdmin(page, '/admin?tab=trash');

      await expect(page.getByTestId('trash-event-card-test-event-user-trashed')).toBeVisible();
      await expect(page.getByTestId('trash-event-card-test-event-admin-trashed')).toHaveCount(0);
    });
  });

  test('Trashed event is not visible to guests on the calendar', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.calendar, .events-section').first()).toBeVisible({
      timeout: 15000,
    });

    await expect(page.locator('.event-title', { hasText: 'User Trashed Event' })).toHaveCount(0);
  });

  test.describe('as Super-Admin', () => {
    test.use({ storageState: STORAGE_STATE.admin });

    test('Admin sees all users trashed events', async ({ page }) => {
      await openAdmin(page, '/admin?tab=trash');

      await expect(page.getByTestId('trash-event-card-test-event-admin-trashed')).toBeVisible();
      await expect(page.getByTestId('trash-event-card-test-event-user-trashed')).toBeVisible();
    });

    // Uses its own event rather than the seeded "Yoga heute". That event is read
    // concurrently by share-event, similar-events and admin-event-edit-delete via
    // its slug; trashing it mid-run made all of those 404.
    const DELETE_FIXTURE_ID = 'test-event-trash-from-list';
    const DELETE_FIXTURE_TITLE = 'Trash From List Fixture';

    test(
      'Deleting from EventList moves the event to Papierkorb',
      { tag: '@smoke' },
      async ({ page }) => {
        await createApprovedEvent({
          id: DELETE_FIXTURE_ID,
          title: DELETE_FIXTURE_TITLE,
          ownerEmail: 'admin@test.com',
        });

        try {
          await openAdmin(page, '/admin');

          const card = page.locator('.event-card', { hasText: DELETE_FIXTURE_TITLE });
          await expect(card).toBeVisible();
          await card.getByRole('button', { name: /event löschen/i }).click();

          await expect(page.getByText(/in den Papierkorb verschoben/i)).toBeVisible();
          await confirmAndWaitForWrite(page, /papierkorb/i);
          await expect(card).toHaveCount(0);

          // The move to the trash is acknowledged (dialog closed), so one
          // fresh load of the Papierkorb must show it.
          await openAdmin(page, '/admin?tab=trash');
          await expect(page.getByTestId(`trash-event-card-${DELETE_FIXTURE_ID}`)).toContainText(
            DELETE_FIXTURE_TITLE
          );
        } finally {
          await deleteEventById(DELETE_FIXTURE_ID);
        }
      }
    );
  });
});
