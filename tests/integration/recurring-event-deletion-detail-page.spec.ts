import { test, expect } from '@playwright/test';
import { signInWithEmailAndPassword, signOut } from '../helpers/auth';
import { generateSlug } from '../helpers/slug';

const RECURRING_EVENT_SLUG = generateSlug('Test Weekly Yoga Series', 'Yogastudio Test', 7);

test.describe.configure({ mode: 'serial' });

test.describe('Recurring event deletion from EventDetailPage', () => {
  test.afterEach(async ({ page }) => {
    await signOut(page);
  });

  test('delete button shows RecurringDeleteDialog for recurring event', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');

    await page.goto(`/event/${RECURRING_EVENT_SLUG}`);
    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    await expect(page.locator('.event-title')).toContainText('Test Weekly Yoga Series', {
      timeout: 10000,
    });

    await page.getByTestId('delete-event-button').click();

    await expect(page.getByRole('heading', { name: 'Termin löschen' })).toBeVisible();
    await expect(page.getByText('Nur diesen Termin löschen')).toBeVisible();
    await expect(page.getByText('Diesen und alle folgenden Termine löschen')).toBeVisible();
    await expect(page.getByText('Gesamte Serie löschen')).toBeVisible();
  });

  test('canceling RecurringDeleteDialog does NOT delete the event', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');

    await page.goto(`/event/${RECURRING_EVENT_SLUG}`);
    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    await expect(page.locator('.event-title')).toContainText('Test Weekly Yoga Series', {
      timeout: 10000,
    });

    await page.getByTestId('delete-event-button').click();

    await expect(page.getByRole('heading', { name: 'Termin löschen' })).toBeVisible();

    await page.getByRole('button', { name: /abbrechen/i }).click();

    await expect(page.getByText('Termin löschen')).toHaveCount(0);

    await page.reload();
    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    await expect(page.locator('.event-title')).toContainText('Test Weekly Yoga Series', {
      timeout: 10000,
    });
  });

  test('"Nur dieses Event" adds date to exceptionDates and navigates home', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');

    await page.goto(`/event/${RECURRING_EVENT_SLUG}`);
    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    await expect(page.locator('.event-title')).toContainText('Test Weekly Yoga Series', {
      timeout: 10000,
    });

    await page.getByTestId('delete-event-button').click();

    await page.getByText('Nur diesen Termin löschen').click();

    await page.waitForURL((url) => url.pathname === '/', { timeout: 10000 });
  });

  test('"Dieses und alle zukünftigen Events" sets recurrenceEndDate and navigates home', async ({
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

    await page.getByText('Diesen und alle folgenden Termine löschen').click();

    await page.waitForURL((url) => url.pathname === '/', { timeout: 10000 });
  });

  test('"Gesamte Serie löschen" deletes entire event document', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');

    await page.goto(`/event/${RECURRING_EVENT_SLUG}`);
    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    await expect(page.locator('.event-title')).toContainText('Test Weekly Yoga Series', {
      timeout: 10000,
    });

    await page.getByTestId('delete-event-button').click();

    await page.getByText('Gesamte Serie löschen').click();

    await page.waitForURL((url) => !/\/event\//.test(url.pathname), { timeout: 10000 });

    await page.goto(`/event/${RECURRING_EVENT_SLUG}`);
    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    await expect(page.locator('.event-not-found')).toBeVisible({ timeout: 10000 });
  });
});
