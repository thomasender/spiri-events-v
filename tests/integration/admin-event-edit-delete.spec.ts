import { test, expect } from '@playwright/test';
import { signInWithEmailAndPassword, signOut } from '../helpers/auth';
import { generateSlug } from '../helpers/slug';

const ADMIN_OWNED_APPROVED_SLUG = generateSlug('Yoga heute', 'Yogastudio Dornbirn', 0);
const USER_OWNED_APPROVED_SLUG = generateSlug('User Approved Event', 'User Place Bregenz', 9);
const USER_OWNED_PENDING_SLUG = generateSlug('User Pending Event', 'Test Place Bludenz', 8);

// All tests in this file share Firestore seed data and some of them mutate it
// (admin deleting user-owned events). Run the whole file serially to avoid
// races against parallel reads from other spec files.
test.describe.configure({ mode: 'serial' });

test.describe('Event detail page — edit/delete button visibility (kf8i6vqj)', () => {
  test.afterEach(async ({ page }) => {
    await signOut(page);
  });

  test('guest sees no edit or delete buttons on an approved event', async ({ page }) => {
    await page.goto(`/event/${ADMIN_OWNED_APPROVED_SLUG}`);

    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    await expect(page.locator('.event-title')).toContainText('Yoga heute', { timeout: 10000 });

    await expect(page.getByRole('link', { name: /event bearbeiten/i })).toHaveCount(0);
    await expect(page.getByTestId('delete-event-button')).toHaveCount(0);
  });

  test('non-admin user sees no edit or delete buttons on an admin-owned event', async ({
    page,
  }) => {
    await signInWithEmailAndPassword(page, 'user@test.local', 'testpassword123');

    await page.goto(`/event/${ADMIN_OWNED_APPROVED_SLUG}`);

    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    await expect(page.locator('.event-title')).toContainText('Yoga heute', { timeout: 10000 });

    await expect(page.getByRole('link', { name: /event bearbeiten/i })).toHaveCount(0);
    await expect(page.getByTestId('delete-event-button')).toHaveCount(0);
  });

  test('non-admin user sees edit and delete buttons on their own approved event', async ({
    page,
  }) => {
    await signInWithEmailAndPassword(page, 'user@test.local', 'testpassword123');

    await page.goto(`/event/${USER_OWNED_APPROVED_SLUG}`);

    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    await expect(page.locator('.event-title')).toContainText('User Approved Event', {
      timeout: 10000,
    });

    const editLink = page.getByRole('link', { name: /event bearbeiten/i });
    await expect(editLink).toBeVisible();
    await expect(editLink).toHaveAttribute('href', /\/admin\/edit\//);

    await expect(page.getByTestId('delete-event-button')).toBeVisible();
  });

  test('non-admin user sees edit and delete buttons on their own pending event', async ({
    page,
  }) => {
    await signInWithEmailAndPassword(page, 'user@test.local', 'testpassword123');

    await page.goto(`/event/${USER_OWNED_PENDING_SLUG}`);

    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    await expect(page.locator('.event-title')).toContainText('User Pending Event', {
      timeout: 10000,
    });

    await expect(page.getByRole('link', { name: /event bearbeiten/i })).toBeVisible();
    await expect(page.getByTestId('delete-event-button')).toBeVisible();
  });

  test('admin sees edit and delete buttons on their own approved event', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');

    await page.goto(`/event/${ADMIN_OWNED_APPROVED_SLUG}`);

    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    await expect(page.locator('.event-title')).toContainText('Yoga heute', { timeout: 10000 });

    await expect(page.getByRole('link', { name: /event bearbeiten/i })).toBeVisible();
    await expect(page.getByTestId('delete-event-button')).toBeVisible();
  });

  test('admin sees edit and delete buttons on a user-owned approved event (ticket regression)', async ({
    page,
  }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');

    await page.goto(`/event/${USER_OWNED_APPROVED_SLUG}`);

    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    await expect(page.locator('.event-title')).toContainText('User Approved Event', {
      timeout: 10000,
    });

    await expect(page.getByRole('link', { name: /event bearbeiten/i })).toBeVisible();
    await expect(page.getByTestId('delete-event-button')).toBeVisible();
  });

  test('admin sees edit and delete buttons on a user-owned pending event (ticket regression)', async ({
    page,
  }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');

    await page.goto(`/event/${USER_OWNED_PENDING_SLUG}`);

    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    await expect(page.locator('.event-title')).toContainText('User Pending Event', {
      timeout: 10000,
    });

    await expect(page.getByRole('link', { name: /event bearbeiten/i })).toBeVisible();
    await expect(page.getByTestId('delete-event-button')).toBeVisible();
  });

  test('admin can open the edit form for a user-owned event and sees a delete button there', async ({
    page,
  }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');

    await page.goto(`/event/${USER_OWNED_APPROVED_SLUG}`);

    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    const editLink = page.getByRole('link', { name: /event bearbeiten/i });
    await expect(editLink).toBeVisible();

    const editHref = await editLink.getAttribute('href');
    await page.goto(editHref);

    await page.waitForURL(/\/admin\/edit\//);
    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    await expect(page.locator('h1')).toContainText('Event bearbeiten', { timeout: 10000 });
    await expect(page.getByTestId('delete-event-from-form-button')).toBeVisible();
  });

  test('non-admin non-owner user does NOT see a delete button on the edit form for a foreign event', async ({
    page,
  }) => {
    await signInWithEmailAndPassword(page, 'user@test.local', 'testpassword123');

    await page.goto(`/admin/edit/test-event-today`);

    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    await expect(page.getByTestId('delete-event-from-form-button')).toHaveCount(0);
  });

  test('owner sees edit and delete buttons on the edit form for their own event', async ({
    page,
  }) => {
    await signInWithEmailAndPassword(page, 'user@test.local', 'testpassword123');

    await page.goto(`/admin/edit/test-event-user-approved`);

    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    await expect(page.locator('h1')).toContainText('Event bearbeiten', { timeout: 10000 });
    await expect(page.getByTestId('delete-event-from-form-button')).toBeVisible();
  });
});

test.describe('Admin delete workflow (kf8i6vqj)', () => {
  test.afterEach(async ({ page }) => {
    await signOut(page);
  });

  test('canceling the delete dialog does NOT delete the event', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');

    await page.goto(`/event/${USER_OWNED_PENDING_SLUG}`);

    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    await expect(page.locator('.event-title')).toContainText('User Pending Event', {
      timeout: 10000,
    });

    await page.getByTestId('delete-event-button').click();

    await expect(page.getByText('Möchtest du dieses Event wirklich löschen?')).toBeVisible();

    await page.getByRole('button', { name: /abbrechen/i }).click();

    await expect(page.getByText('Möchtest du dieses Event wirklich löschen?')).toHaveCount(0);

    await page.reload();

    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    await expect(page.locator('.event-title')).toContainText('User Pending Event', {
      timeout: 10000,
    });
    await expect(page.getByTestId('delete-event-button')).toBeVisible();
  });

  test('delete confirm dialog shows a spinner while the delete is in flight, not "..." text (visual regression)', async ({
    page,
  }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');

    await page.goto(`/event/${USER_OWNED_APPROVED_SLUG}`);

    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    await expect(page.locator('.event-title')).toContainText('User Approved Event', {
      timeout: 10000,
    });

    await page.route('**/*', async (route) => {
      const url = route.request().url();
      const method = route.request().method();
      if (url.includes(':8181') && (method === 'POST' || method === 'DELETE')) {
        await new Promise((resolve) => setTimeout(resolve, 3000));
        await route.abort();
      } else {
        await route.continue();
      }
    });

    try {
      await page.getByTestId('delete-event-button').click();

      await expect(page.getByText('Möchtest du dieses Event wirklich löschen?')).toBeVisible();

      const confirmButton = page.getByRole('button', { name: /^löschen$/i });
      await confirmButton.click();

      const spinner = page.getByTestId('confirm-dialog-spinner');
      await expect(spinner).toBeVisible();
      await expect(confirmButton).toContainText('Löschen');
      await expect(confirmButton).not.toContainText('...');
    } finally {
      await page.unroute('**/*').catch(() => {});
    }
  });

  test('admin can delete a user-owned approved event from the detail page', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');

    await page.goto(`/event/${USER_OWNED_APPROVED_SLUG}`);

    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    await expect(page.locator('.event-title')).toContainText('User Approved Event', {
      timeout: 10000,
    });

    await page.getByTestId('delete-event-button').click();

    await expect(page.getByText('Möchtest du dieses Event wirklich löschen?')).toBeVisible();

    await page.getByRole('button', { name: /^löschen$/i }).click();

    await page.waitForURL((url) => !/\/event\//.test(url.pathname), { timeout: 10000 });

    // Wait a beat for the delete to fully propagate to the emulator.
    await page.waitForTimeout(2000);

    await page.goto(`/event/${USER_OWNED_APPROVED_SLUG}`);

    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    await expect(page.locator('.event-not-found')).toBeVisible({ timeout: 10000 });
  });

  test('admin editing pending event does not auto-approve it (jdfLnD7p)', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');

    await page.goto(`/admin/edit/test-event-foreign-pending`);

    await page.waitForURL(/\/admin\/edit\//);
    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    const newDescription = 'Updated description to verify edit does not auto-approve';
    await page.locator('#description').fill(newDescription);

    await page.getByRole('button', { name: /änderungen speichern/i }).click();

    await page.waitForURL('/admin', { timeout: 10000 });

    await page.goto(`/event/${USER_OWNED_PENDING_SLUG}`);

    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    await expect(page.getByTestId('event-messages')).toBeVisible();
  });

  test('edit form Beschreibung is marked required and blocks save when empty (uvquhhJS)', async ({
    page,
  }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');

    await page.goto(`/admin/edit/test-event-foreign-pending`);

    await page.waitForURL(/\/admin\/edit\//);
    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    const descriptionLabel = page.locator('label[for="description"]');
    await expect(descriptionLabel).toContainText('*');

    await page.locator('#description').fill('');

    await page.getByRole('button', { name: /änderungen speichern/i }).click();
    await page.waitForTimeout(500);

    const descriptionError = page.getByTestId('description-error');
    await expect(descriptionError).toBeVisible();
    await expect(descriptionError).toContainText('Beschreibung ist erforderlich');

    await expect(page).toHaveURL(/\/admin\/edit\//);
  });

  test('admin can delete a user-owned pending event from the edit form', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');

    await page.goto(`/admin/edit/test-event-foreign-pending`);

    await page.waitForURL(/\/admin\/edit\//);
    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    await expect(page.getByTestId('delete-event-from-form-button')).toBeVisible();

    await page.getByTestId('delete-event-from-form-button').click();

    await expect(page.getByText('Möchtest du dieses Event wirklich löschen?')).toBeVisible();

    await page.getByRole('button', { name: /^löschen$/i }).click();

    await page.waitForURL((url) => !/\/admin\/edit\//.test(url.pathname), { timeout: 10000 });

    // Wait a beat for the delete to fully propagate to the emulator.
    await page.waitForTimeout(2000);

    await page.goto(`/event/${USER_OWNED_PENDING_SLUG}`);

    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    await expect(page.locator('.event-not-found')).toBeVisible({ timeout: 10000 });
  });
});
