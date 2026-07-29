import { test, expect } from '@playwright/test';
import { signInWithEmailAndPassword, clearEmulatorStorage } from '../helpers/auth';

async function fillRequiredEventFields(page: import('@playwright/test').Page, title: string) {
  await page.fill('input[name="title"]', title);
  await page.fill('input[name="date"]', '2026-12-31');
  await page.fill('input[name="place"]', 'Test Location');
  await page.selectOption('select[name="bezirk"]', 'Bregenz');
  await page.locator('.kategorie-select').click();
  await page.waitForTimeout(500);
  await page.locator('.kategorie__menu').locator('*').first().click();
  await page.waitForTimeout(300);
  await page.fill('input[name="firstName"]', 'Maria');
  await page.fill('input[name="lastName"]', 'Mustermann');
  await page.fill('input[name="email"]', 'maria@example.com');
  await page.fill('input[name="kontakt"]', 'maria@example.com');
}

test.describe('Event image upload (Firebase Storage)', () => {
  test.beforeAll(async () => {
    await clearEmulatorStorage();
  });

  test('upload area advertises the new 15 MB limit', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin/new');
    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    await expect(page.locator('.image-upload-area')).toContainText('max. 15MB');
  });

  test('admin can upload a real generated JPEG and event ends up with a Firebase Storage imageUrl', async ({
    page,
  }) => {
    page.on('pageerror', (err) => console.log('PAGE ERROR:', err.message));

    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin/new');
    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    // Build a small but valid JPEG in the browser and attach it to the file input
    await page.evaluate(async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 100;
      canvas.height = 100;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#9b8aa6';
      ctx.fillRect(0, 0, 100, 100);
      ctx.fillStyle = '#7d9b8a';
      ctx.beginPath();
      ctx.arc(50, 50, 35, 0, Math.PI * 2);
      ctx.fill();

      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.8));
      const file = new File([blob], 'test-image.jpg', { type: 'image/jpeg' });
      const dt = new DataTransfer();
      dt.items.add(file);
      const input = document.querySelector('input[type="file"]');
      input.files = dt.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });

    await expect(page.locator('.image-preview')).toBeVisible({ timeout: 5000 });

    await fillRequiredEventFields(page, 'Image Upload Test');

    await page.getByRole('button', { name: /event erstellen/i }).click();

    await page.waitForURL('/admin', { timeout: 30000 });

    // Verify the file was uploaded to Firebase Storage at the expected path
    const storageObjects = await page.evaluate(async () => {
      const res = await fetch(
        'http://127.0.0.1:9299/storage/v1/b/spirieventsvbg.firebasestorage.app/o?prefix=events/'
      );
      const data = await res.json();
      return (data.items || []).map((o) => o.name);
    });

    expect(storageObjects.length).toBeGreaterThan(0);
    const ourUpload = storageObjects.find((name) => name.endsWith('_test-image.jpg'));
    expect(ourUpload).toBeTruthy();
    expect(ourUpload).toMatch(/^events\/[^/]+\/[^_]+_test-image\.jpg$/);

    // Verify the image is reachable through the Firebase Storage emulator URL
    const storageUrl = `http://127.0.0.1:9299/v0/b/spirieventsvbg.firebasestorage.app/o/${encodeURIComponent(
      ourUpload
    )}?alt=media`;
    const headCheck = await page.request.get(storageUrl);
    expect(headCheck.status()).toBe(200);
    const contentType = headCheck.headers()['content-type'];
    expect(contentType).toContain('image/');

    // Verify the event card shows the uploaded image
    const eventCard = page.locator('.event-card').filter({ hasText: 'Image Upload Test' }).first();
    await eventCard.waitFor({ timeout: 5000 });

    // Navigate to the event detail page. EventDetailPage renders the image as
    // <img class="event-image"> whose src is event.imageUrl. A non-empty src
    // here proves the Firestore document was successfully updated with the
    // storage download URL.
    const detailLink = eventCard.locator('a[href^="/event/"]').first();
    await detailLink.click();
    await page.waitForURL(/\/event\//, { timeout: 15000 });

    await expect(page.locator('img.event-image')).toBeVisible({ timeout: 10000 });
    const eventImageSrc = await page.locator('img.event-image').getAttribute('src');
    expect(eventImageSrc).toContain('firebasestorage');
  });
});
