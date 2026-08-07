import { test, expect } from '@playwright/test';
import { generateSlug } from '../helpers/slug';

const YOGA_APPROVED_SLUG = generateSlug('Yoga heute', 'Yogastudio Dornbirn', 0);
const USER_APPROVED_SLUG = generateSlug('User Approved Event', 'User Place Bregenz', 9);

test.describe('Event detail page: organizer profile photo (9exfBgMP)', () => {
  test('approved event shows organizer profile photo for guest visitors', async ({ page }) => {
    await page.goto(`/event/${YOGA_APPROVED_SLUG}`);

    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    await expect(page.locator('.event-title')).toContainText('Yoga heute', { timeout: 10000 });

    const organizer = page.locator('[data-testid="event-organizer"]');
    await expect(organizer).toBeVisible();
    await expect(organizer).toContainText('Anna');
    await expect(organizer).toContainText('Schmidt');

    const photo = organizer.locator('[data-testid="organizer-photo"]');
    await expect(photo).toBeVisible();
  });

  test('approved event from a different user shows organizer profile photo', async ({ page }) => {
    await page.goto(`/event/${USER_APPROVED_SLUG}`);

    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    await expect(page.locator('.event-title')).toContainText('User Approved Event', {
      timeout: 10000,
    });

    const organizer = page.locator('[data-testid="event-organizer"]');
    await expect(organizer).toBeVisible();

    const photo = organizer.locator('[data-testid="organizer-photo"]');
    await expect(photo).toBeVisible();
  });
});
