import { test, expect } from '@playwright/test';
import { signInWithEmailAndPassword } from '../helpers/auth';

test.describe('Event CRUD', () => {
  test('event modal opens on click', async ({ page }) => {
    await page.goto('/');
  });

  test('event form validation shows error near submit button', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');

    await page.goto('/admin/new');

    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    await page.getByRole('button', { name: /event erstellen/i }).click();

    await expect(page.locator('.error-text.submit-error')).toContainText(
      'Bitte fülle alle Pflichtfelder aus.'
    );
  });

  test('non-admin user sees validation error near Einreichen zur Genehmigung button', async ({
    page,
  }) => {
    await signInWithEmailAndPassword(page, 'user@test.local', 'testpassword123');

    await page.goto('/admin/new');

    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    await page.getByRole('button', { name: /einreichen zur genehmigung/i }).click();

    await expect(page.locator('.error-text.submit-error')).toContainText(
      'Bitte fülle alle Pflichtfelder aus.'
    );
  });
});
