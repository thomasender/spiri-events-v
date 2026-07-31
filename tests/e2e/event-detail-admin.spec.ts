import { test, expect } from '@playwright/test';
import { signInWithEmailAndPassword, signOut } from '../helpers/auth';
import { generateSlug } from '../helpers/slug';

const PENDING_EVENT_SLUG = generateSlug('Pending Event', 'Test Place', 8);
const APPROVED_EVENT_SLUG = generateSlug('Yoga heute', 'Yogastudio Dornbirn', 0);

test.describe('Event Detail Page - Admin', () => {
  test.afterEach(async ({ page }) => {
    await signOut(page);
  });

  test('admin can view pending event directly via URL', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');

    await page.goto(`/event/${PENDING_EVENT_SLUG}`);

    await page.waitForURL(/\/event\//);
    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});
    await expect(page.locator('.event-not-found')).not.toBeVisible({ timeout: 10000 });
    await expect(page.locator('.event-title')).toContainText('Pending Event', { timeout: 10000 });
  });

  test('admin can view approved event directly via URL', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');

    await page.goto(`/event/${APPROVED_EVENT_SLUG}`);

    await page.waitForURL(/\/event\//);
    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});
    await expect(page.locator('.event-not-found')).not.toBeVisible({ timeout: 10000 });
    await expect(page.locator('.event-title')).toContainText('Yoga heute', { timeout: 10000 });
  });
});
