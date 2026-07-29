import { test, expect } from '@playwright/test';
import { signInWithEmailAndPassword, signOut } from '../helpers/auth';

test.describe('Event detail page access (hSONxMKJ)', () => {
  test.afterEach(async ({ page }) => {
    await signOut(page);
  });

  test('guest can view an approved event via slug URL', async ({ page }) => {
    await page.goto('/event/yoga-heute-yogastudio-dornbirn-20260729');

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

    await page.goto('/event/user-approved-event-user-place-bregenz-20260807');

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

    await page.goto('/event/user-pending-event-test-place-bludenz-20260806');

    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    await expect(page.locator('.event-not-found')).not.toBeVisible({ timeout: 10000 });
    await expect(page.locator('.event-title')).toContainText('User Pending Event', {
      timeout: 10000,
    });
  });

  test('guest sees Event nicht gefunden for another users pending event', async ({ page }) => {
    await page.goto('/event/user-pending-event-test-place-bludenz-20260806');

    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    await expect(page.locator('.event-not-found')).toBeVisible({ timeout: 10000 });
  });
});
