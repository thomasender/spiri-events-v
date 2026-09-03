import { test, expect } from '@playwright/test';
import { spawn } from 'child_process';
import { signInWithEmailAndPassword, signOut } from '../helpers/auth';
import { generateSlug } from '../helpers/slug';

const ADMIN_OWNED_APPROVED_SLUG = generateSlug('Yoga heute', 'Yogastudio Dornbirn', 0);
const USER_OWNED_APPROVED_SLUG = generateSlug('User Approved Event', 'User Place Bregenz', 9);
const USER_OWNED_PENDING_SLUG = generateSlug('User Pending Event', 'Test Place Bludenz', 8);

function runScript(scriptPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn('node', [scriptPath], { cwd: process.cwd(), stdio: 'ignore', shell: true });
    proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`exit ${code}`))));
    proc.on('error', reject);
  });
}

// This file's own tests permanently delete both test-event-user-approved and
// test-event-foreign-pending as part of exercising the delete flow. Several other
// specs (event-fields, event-detail-page-access, event-draft, event-rich-description,
// event-wizard-ort-optional) also read these fixtures, so reset both before every
// test here rather than assuming the global seed from the start of the run is intact.
async function resetSharedEventFixtures(): Promise<void> {
  await Promise.all([
    runScript('scripts/reset-draft-fixtures.mjs'),
    runScript('scripts/reset-user-approved-event-fixture.mjs'),
  ]);
}

// All tests in this file share Firestore seed data and some of them mutate it
// (admin deleting user-owned events). Run the whole file serially to avoid
// races against parallel reads from other spec files.
test.describe.configure({ mode: 'serial' });

test.beforeEach(async () => {
  await resetSharedEventFixtures();
});

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

  test('canceling the trash dialog does NOT move the event to trash', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');

    await page.goto(`/event/${USER_OWNED_PENDING_SLUG}`);

    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    await expect(page.locator('.event-title')).toContainText('User Pending Event', {
      timeout: 10000,
    });

    await page.getByTestId('delete-event-button').click();

    await expect(page.getByText(/in den Papierkorb verschoben/i)).toBeVisible();

    await page.getByRole('button', { name: /abbrechen/i }).click();

    await expect(page.getByText(/in den Papierkorb verschoben/i)).toHaveCount(0);

    await page.reload();

    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    await expect(page.locator('.event-title')).toContainText('User Pending Event', {
      timeout: 10000,
    });
    await expect(page.getByTestId('delete-event-button')).toBeVisible();
  });

  test('trash confirm dialog shows a spinner while the move is in flight, not "..." text (visual regression)', async ({
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

      await expect(page.getByText(/in den Papierkorb verschoben/i)).toBeVisible();

      const confirmButton = page.getByRole('button', { name: /papierkorb/i });
      await confirmButton.click();

      const spinner = page.getByTestId('confirm-dialog-spinner');
      await expect(spinner).toBeVisible();
      await expect(confirmButton).toContainText('In Papierkorb');
      await expect(confirmButton).not.toContainText('...');
    } finally {
      await page.unroute('**/*').catch(() => {});
    }
  });

  test('admin can trash a user-owned approved event from the detail page (SS79oSci)', async ({
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

    await page.getByTestId('delete-event-button').click();

    await expect(page.getByText(/in den Papierkorb verschoben/i)).toBeVisible();

    await page
      .locator('.confirm-dialog')
      .getByRole('button', { name: /papierkorb/i })
      .click();

    // Detail-page delete just sends the user back where they came from
    // (the calendar, since we navigated directly to /event/...). The event
    // is now in the trash; visiting /admin?tab=trash confirms it.
    await page.waitForURL(/\/$|\/admin/, { timeout: 10000 });

    await page.goto('/admin?tab=trash');

    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    await expect(
      page.locator('[data-testid^="trash-event-card-"]', { hasText: 'User Approved Event' })
    ).toBeVisible({ timeout: 10000 });
  });

  test('admin editing pending event does not auto-approve it (jdfLnD7p)', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');

    await page.goto(`/admin/edit/test-event-foreign-pending`);

    await page.waitForURL(/\/admin\/edit\//);
    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    const newDescription = 'Updated description to verify edit does not auto-approve';
    const descEditor = page.locator('[data-testid="description-editor"] .rte-content');
    await descEditor.click();
    await descEditor.fill(newDescription);

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

    const emptyDescEditor = page.locator('[data-testid="description-editor"] .rte-content');
    await emptyDescEditor.click();
    await emptyDescEditor.fill('');

    await page.getByRole('button', { name: /änderungen speichern/i }).click();
    await page.waitForTimeout(500);

    const descriptionError = page.getByTestId('description-error');
    await expect(descriptionError).toBeVisible();
    await expect(descriptionError).toContainText('Beschreibung ist erforderlich');

    await expect(page).toHaveURL(/\/admin\/edit\//);
  });

  test('admin can delete a user-owned pending event from the edit form', async ({ page }) => {
    // Use a disposable, uniquely-ID'd fixture rather than the shared
    // test-event-foreign-pending doc: several other specs defensively recreate
    // that one before their own tests, which can resurrect it between this
    // test's delete action and its "not found" check under parallel execution.
    const throwawayId = `throwaway-pending-delete-${Date.now()}`;
    await runScript(`scripts/create-throwaway-pending-event.mjs ${throwawayId}`);

    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');

    await page.goto(`/admin/edit/${throwawayId}`);

    await page.waitForURL(/\/admin\/edit\//);
    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    await expect(page.getByTestId('delete-event-from-form-button')).toBeVisible();

    await page.getByTestId('delete-event-from-form-button').click();

    await expect(page.getByText(/in den Papierkorb verschoben/i)).toBeVisible();

    await page
      .locator('.confirm-dialog')
      .getByRole('button', { name: /papierkorb/i })
      .click();

    // Edit-form delete sends the user back where they came from. With no
    // explicit `from` we fall back to /admin (Meine Events).
    await page.waitForURL(/\/admin(\?|$)/, { timeout: 10000 });

    await page.goto('/admin?tab=trash');

    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    // The thrown-away event shows up in the trash list (admin sees all trashed events).
    await expect(page.getByTestId(`trash-event-card-${throwawayId}`)).toBeVisible({
      timeout: 10000,
    });
  });
});
