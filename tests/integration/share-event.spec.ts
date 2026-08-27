import { test, expect } from '@playwright/test';
import { generateSlug } from '../helpers/slug';

const YOGA_APPROVED_SLUG = generateSlug('Yoga heute', 'Yogastudio Dornbirn', 0);

test.describe('Share Event Feature (u0fvkYae)', () => {
  test('share button is visible on the event detail page header', async ({ page }) => {
    await page.goto(`/event/${YOGA_APPROVED_SLUG}`);

    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    await expect(page.locator('.event-title')).toContainText('Yoga heute', { timeout: 10000 });

    const shareButton = page.locator('[data-testid="share-event-button"]');
    await expect(shareButton).toBeVisible();
  });

  test('share button is positioned right of the event title', async ({ page }) => {
    await page.goto(`/event/${YOGA_APPROVED_SLUG}`);

    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    await expect(page.locator('.event-title')).toContainText('Yoga heute', { timeout: 10000 });

    const titleBox = await page.locator('.event-title').boundingBox();
    const shareBox = await page.locator('[data-testid="share-event-button"]').boundingBox();

    expect(titleBox).not.toBeNull();
    expect(shareBox).not.toBeNull();
    expect(shareBox.x).toBeGreaterThan(titleBox.x + titleBox.width - 1);
  });

  test('clicking the share button opens the share overlay', async ({ page }) => {
    await page.goto(`/event/${YOGA_APPROVED_SLUG}`);

    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    await expect(page.locator('.event-title')).toContainText('Yoga heute', { timeout: 10000 });

    await page.locator('[data-testid="share-event-button"]').click();

    const dialog = page.locator('.share-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('Event teilen');
  });

  test('share overlay exposes every requested channel plus copy link', async ({ page }) => {
    await page.goto(`/event/${YOGA_APPROVED_SLUG}`);

    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    await expect(page.locator('.event-title')).toContainText('Yoga heute', { timeout: 10000 });

    await page.locator('[data-testid="share-event-button"]').click();

    for (const channel of ['facebook', 'instagram', 'whatsapp', 'telegram', 'signal']) {
      await expect(page.locator(`[data-testid="share-channel-${channel}"]`)).toBeVisible();
    }

    await expect(page.locator('[data-testid="share-copy-link"]')).toBeVisible();
  });

  test('Facebook button opens the Facebook sharer with the event URL', async ({
    page,
    context,
  }) => {
    await page.goto(`/event/${YOGA_APPROVED_SLUG}`);

    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    await expect(page.locator('.event-title')).toContainText('Yoga heute', { timeout: 10000 });

    await page.locator('[data-testid="share-event-button"]').click();

    const popupPromise = context.waitForEvent('page');
    await page.locator('[data-testid="share-channel-facebook"]').click();
    const popup = await popupPromise;

    expect(popup.url()).toContain('facebook.com/sharer/sharer.php');
    expect(popup.url()).toContain(encodeURIComponent(`/event/${YOGA_APPROVED_SLUG}`));

    await popup.close();
  });

  test('WhatsApp button opens the WhatsApp share endpoint with the event URL', async ({
    page,
    context,
  }) => {
    await page.goto(`/event/${YOGA_APPROVED_SLUG}`);

    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    await expect(page.locator('.event-title')).toContainText('Yoga heute', { timeout: 10000 });

    await page.locator('[data-testid="share-event-button"]').click();

    const popupPromise = context.waitForEvent('page');
    await page.locator('[data-testid="share-channel-whatsapp"]').click();
    const popup = await popupPromise;

    expect(popup.url()).toContain('whatsapp.com');
    expect(popup.url()).toContain(encodeURIComponent(`/event/${YOGA_APPROVED_SLUG}`));

    await popup.close();
  });

  test('Telegram button opens the Telegram share endpoint with the event URL', async ({
    page,
    context,
  }) => {
    await page.goto(`/event/${YOGA_APPROVED_SLUG}`);

    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    await expect(page.locator('.event-title')).toContainText('Yoga heute', { timeout: 10000 });

    await page.locator('[data-testid="share-event-button"]').click();

    const popupPromise = context.waitForEvent('page');
    await page.locator('[data-testid="share-channel-telegram"]').click();
    const popup = await popupPromise;

    expect(popup.url()).toContain('t.me/share/url');
    expect(popup.url()).toContain(encodeURIComponent(`/event/${YOGA_APPROVED_SLUG}`));

    await popup.close();
  });

  test('copy link button copies the event URL to the clipboard', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);

    await page.goto(`/event/${YOGA_APPROVED_SLUG}`);

    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    await expect(page.locator('.event-title')).toContainText('Yoga heute', { timeout: 10000 });

    await page.locator('[data-testid="share-event-button"]').click();
    await page.locator('[data-testid="share-copy-link"]').click();

    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboardText).toContain(`/event/${YOGA_APPROVED_SLUG}`);

    await expect(page.locator('[data-testid="share-copy-link"]')).toContainText('Kopiert!');
  });

  test('share overlay closes when clicking the backdrop', async ({ page }) => {
    await page.goto(`/event/${YOGA_APPROVED_SLUG}`);

    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    await expect(page.locator('.event-title')).toContainText('Yoga heute', { timeout: 10000 });

    await page.locator('[data-testid="share-event-button"]').click();
    await expect(page.locator('.share-dialog')).toBeVisible();

    await page.locator('.share-overlay').click({ position: { x: 5, y: 5 } });
    await expect(page.locator('.share-dialog')).toBeHidden();
  });

  test('share overlay closes when pressing Escape', async ({ page }) => {
    await page.goto(`/event/${YOGA_APPROVED_SLUG}`);

    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    await expect(page.locator('.event-title')).toContainText('Yoga heute', { timeout: 10000 });

    await page.locator('[data-testid="share-event-button"]').click();
    await expect(page.locator('.share-dialog')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.locator('.share-dialog')).toBeHidden();
  });
});
