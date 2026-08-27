import { test, expect } from '@playwright/test';
import { signInWithEmailAndPassword, signOut } from '../helpers/auth';

test.describe('Event edit form: "Ort / Adresse" is optional (8BzdB9xp)', () => {
  test.afterEach(async ({ page }) => {
    await signOut(page);
  });

  test('"Ort / Adresse" label is not marked with an asterisk in the edit form', async ({
    page,
  }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');

    await page.goto('/admin/edit/test-event-foreign-pending');

    await page.waitForURL(/\/admin\/edit\//);
    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    const placeLabel = page.locator('label[for="place"]');
    await expect(placeLabel).toBeVisible();
    await expect(placeLabel).toContainText('Ort / Adresse');
    await expect(placeLabel).not.toContainText('*');
  });

  test('edit form allows saving with an empty "Ort / Adresse" field', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');

    await page.goto('/admin/edit/test-event-foreign-pending');

    await page.waitForURL(/\/admin\/edit\//);
    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    await page.fill('#place', '');

    await page.getByRole('button', { name: /änderungen speichern/i }).click();

    await page.waitForURL('/admin', { timeout: 10000 });

    const placeError = page.locator('.error-text', { hasText: 'Ort ist erforderlich' });
    await expect(placeError).toHaveCount(0);

    await expect(page).toHaveURL(/\/admin$/);
  });
});
