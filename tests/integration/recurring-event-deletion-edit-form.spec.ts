import { test, expect } from '@playwright/test';
import { signInWithEmailAndPassword, signOut } from '../helpers/auth';

const RECURRING_EVENT_ID = 'test-event-recurring-weekly';
const RECURRING_EVENT_SLUG = 'test-weekly-yoga-series-yogastudio-test-20260813';

test.describe.configure({ mode: 'serial' });

test.describe('Recurring event deletion from EventForm', () => {
  test.afterEach(async ({ page }) => {
    await signOut(page);
  });

  test('delete button shows RecurringDeleteDialog for recurring event in edit form', async ({
    page,
  }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');

    await page.goto(`/admin/edit/${RECURRING_EVENT_ID}`);
    await page.waitForURL(/\/admin\/edit\//);
    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    await expect(page.getByTestId('delete-event-from-form-button')).toBeVisible();

    await page.getByTestId('delete-event-from-form-button').click();

    await expect(page.getByText('Wiederholendes Event löschen')).toBeVisible();
    await expect(page.getByText('Nur dieses Event')).toBeVisible();
    await expect(page.getByText('Dieses und alle zukünftigen Events')).toBeVisible();
    await expect(page.getByText('Ganze Serie löschen')).toBeVisible();
  });

  test('canceling RecurringDeleteDialog from edit form does NOT delete the event', async ({
    page,
  }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');

    await page.goto(`/admin/edit/${RECURRING_EVENT_ID}`);
    await page.waitForURL(/\/admin\/edit\//);
    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    await expect(page.getByTestId('delete-event-from-form-button')).toBeVisible();

    await page.getByTestId('delete-event-from-form-button').click();

    await expect(page.getByText('Wiederholendes Event löschen')).toBeVisible();

    await page.locator('.recurring-delete-dialog .btn-secondary').click();

    await expect(page.getByText('Wiederholendes Event löschen')).toHaveCount(0);

    await page.reload();
    await page.waitForURL(/\/admin\/edit\//);
    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    await expect(page.locator('h1')).toContainText('Event bearbeiten', { timeout: 10000 });
  });

  test('"Nur dieses Event" from edit form adds date to exceptionDates', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');

    await page.goto(`/admin/edit/${RECURRING_EVENT_ID}`);
    await page.waitForURL(/\/admin\/edit\//);
    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    await page.getByTestId('delete-event-from-form-button').click();

    await page.getByText('Nur dieses Event').click();

    await page.waitForURL((url) => url.pathname === '/', { timeout: 10000 });
  });

  test('"Dieses und alle zukünftigen Events" from edit form sets recurrenceEndDate', async ({
    page,
  }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');

    await page.goto(`/admin/edit/${RECURRING_EVENT_ID}`);
    await page.waitForURL(/\/admin\/edit\//);
    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    await page.getByTestId('delete-event-from-form-button').click();

    await page.getByText('Dieses und alle zukünftigen Events').click();

    await page.waitForURL((url) => url.pathname === '/', { timeout: 10000 });
  });

  test('"Ganze Serie löschen" from edit form deletes entire event document', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');

    await page.goto(`/admin/edit/${RECURRING_EVENT_ID}`);
    await page.waitForURL(/\/admin\/edit\//);
    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    await page.getByTestId('delete-event-from-form-button').click();

    await page.getByText('Ganze Serie löschen').click();

    await page.waitForURL((url) => url.pathname === '/', { timeout: 10000 });

    await page.goto(`/event/${RECURRING_EVENT_SLUG}`);
    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    await expect(page.locator('.event-not-found')).toBeVisible({ timeout: 10000 });
  });
});
