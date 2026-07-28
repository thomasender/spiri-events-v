import { test, expect } from '@playwright/test';
import { signInWithEmailAndPassword, signOut } from '../helpers/auth';

const FOREIGN_PENDING_SLUG = 'user-pending-event-test-place-bludenz-20260805';

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

    await page.goto('/event/pending-event-test-place-20260805');

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

    await page.goto('/event/yoga-heute-yogastudio-dornbirn-20260728');

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
