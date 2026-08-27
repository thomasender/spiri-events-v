import { test, expect } from '@playwright/test';
import { signInWithEmailAndPassword, signOut } from '../helpers/auth';
import { generateSlug } from '../helpers/slug';

const YOGA_APPROVED_SLUG = generateSlug('Yoga heute', 'Yogastudio Dornbirn', 0);
const USER_APPROVED_SLUG = generateSlug('User Approved Event', 'User Place Bregenz', 9);
const USER_PENDING_SLUG = generateSlug('User Pending Event', 'Test Place Bludenz', 8);

test.describe('Event detail page access (hSONxMKJ)', () => {
  test.afterEach(async ({ page }) => {
    await signOut(page);
  });

  test('guest can view an approved event via slug URL', async ({ page }) => {
    await page.goto(`/event/${YOGA_APPROVED_SLUG}`);

    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    await expect(page.locator('.event-not-found')).not.toBeVisible({ timeout: 10000 });
    await expect(page.locator('.event-title')).toContainText('Yoga heute', { timeout: 10000 });
  });

  test('guest sees Event nicht gefunden for a non-existent slug', async ({ page }) => {
    await page.goto('/event/this-slug-does-not-exist-20991231');

    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    await expect(page.locator('.event-not-found')).toBeVisible({ timeout: 10000 });
  });

  test('logged-in user can view their own approved event via slug URL', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'user@test.local', 'testpassword123');

    await page.goto(`/event/${USER_APPROVED_SLUG}`);

    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    await expect(page.locator('.event-not-found')).not.toBeVisible({ timeout: 10000 });
    await expect(page.locator('.event-title')).toContainText('User Approved Event', {
      timeout: 10000,
    });
  });

  test('logged-in user can view their own pending event via slug URL', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'user@test.local', 'testpassword123');

    await page.goto(`/event/${USER_PENDING_SLUG}`);

    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    await expect(page.locator('.event-not-found')).not.toBeVisible({ timeout: 10000 });
    await expect(page.locator('.event-title')).toContainText('User Pending Event', {
      timeout: 10000,
    });
  });

  test('guest sees Event nicht gefunden for another users pending event', async ({ page }) => {
    await page.goto(`/event/${USER_PENDING_SLUG}`);

    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    await expect(page.locator('.event-not-found')).toBeVisible({ timeout: 10000 });
  });
});

test.describe('Admin access to pending events of other users', () => {
  test.afterEach(async ({ page }) => {
    await signOut(page);
  });

  test('admin can view pending event owned by another user via slug URL', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');

    await page.goto(`/event/${USER_PENDING_SLUG}`);

    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    await expect(page.locator('.event-not-found')).not.toBeVisible({ timeout: 10000 });
    await expect(page.locator('.event-title')).toContainText('User Pending Event', {
      timeout: 10000,
    });
  });
});
