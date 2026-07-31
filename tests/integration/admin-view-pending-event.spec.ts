import { test, expect } from '@playwright/test';
import { signInWithEmailAndPassword, signOut } from '../helpers/auth';
import { generateSlug } from '../helpers/slug';

const FOREIGN_PENDING_SLUG = generateSlug('User Pending Event', 'Test Place Bludenz', 8);
const OWN_PENDING_SLUG = generateSlug('Pending Event', 'Test Place', 8);
const YOGA_APPROVED_SLUG = generateSlug('Yoga heute', 'Yogastudio Dornbirn', 0);

test.describe('Admin viewing pending event of another user', () => {
  test.afterEach(async ({ page }) => {
    await signOut(page);
  });

  test('admin can view pending event owned by another user via slug URL', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');

    await page.goto(`/event/${FOREIGN_PENDING_SLUG}`);

    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    await expect(page.locator('.event-not-found')).not.toBeVisible({ timeout: 10000 });
    await expect(page.locator('.event-title')).toContainText('User Pending Event', {
      timeout: 10000,
    });
  });

  test('admin can view own pending event via slug URL', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');

    await page.goto(`/event/${OWN_PENDING_SLUG}`);

    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    await expect(page.locator('.event-not-found')).not.toBeVisible({ timeout: 10000 });
    await expect(page.locator('.event-title')).toContainText('Pending Event', {
      timeout: 10000,
    });
  });

  test('admin can view approved event directly via URL', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');

    await page.goto(`/event/${YOGA_APPROVED_SLUG}`);

    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    await expect(page.locator('.event-not-found')).not.toBeVisible({ timeout: 10000 });
    await expect(page.locator('.event-title')).toContainText('Yoga heute', { timeout: 10000 });
  });

  test('anonymous user gets Event nicht gefunden for pending event via slug URL', async ({
    page,
  }) => {
    await signOut(page);

    await page.goto(`/event/${FOREIGN_PENDING_SLUG}`);

    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    await expect(page.locator('.event-not-found')).toBeVisible({ timeout: 10000 });
  });
});
