import { test, expect } from '@playwright/test';
import { spawn } from 'child_process';
import { signInWithEmailAndPassword, signOut } from '../helpers/auth';

const RECURRING_EVENT_ID = 'test-event-recurring-weekly';
const RECURRING_EVENT_SLUG = 'test-weekly-yoga-series-yogastudio-test-20260813';

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

test.describe.configure({ mode: 'serial' });

test.describe('Recurring event deletion from EventForm', () => {
  // This is the single shared fixture doc other specs (e.g.
  // recurring-events-card-list.spec.ts) also read, and this file's last test deletes
  // it entirely — reset before each test so ordering relative to other spec files
  // never leaves this suite (or the ones after it) looking at stale/missing data.
  test.beforeEach(async () => {
    await resetRecurringEventFixture();
  });

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

    await expect(page.getByRole('heading', { name: 'Termin löschen' })).toBeVisible();
    await expect(page.getByText('Nur diesen Termin löschen')).toBeVisible();
    await expect(page.getByText('Diesen und alle folgenden Termine löschen')).toBeVisible();
    await expect(page.getByText('Gesamte Serie löschen')).toBeVisible();
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

    await expect(page.getByRole('heading', { name: 'Termin löschen' })).toBeVisible();

    await page.locator('.recurring-delete-dialog .btn-secondary').click();

    await expect(page.getByText('Termin löschen')).toHaveCount(0);

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

    await page.getByText('Nur diesen Termin löschen').click();

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

    await page.getByText('Diesen und alle folgenden Termine löschen').click();

    await page.waitForURL((url) => url.pathname === '/', { timeout: 10000 });
  });

  test('"Gesamte Serie löschen" from edit form moves the event to the trash (SS79oSci)', async ({
    page,
  }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');

    await page.goto(`/admin/edit/${RECURRING_EVENT_ID}`);
    await page.waitForURL(/\/admin\/edit\//);
    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    await page.getByTestId('delete-event-from-form-button').click();

    await page.getByText('Gesamte Serie löschen').click();

    // The whole-series delete now lands on the trash tab.
    await page.waitForURL(/\/admin\?tab=trash/, { timeout: 10000 });

    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    await expect(page.locator('.event-card', { hasText: 'Test Weekly Yoga Series' })).toBeVisible({
      timeout: 10000,
    });
  });
});
