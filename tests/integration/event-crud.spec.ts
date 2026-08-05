import { test, expect } from '@playwright/test';
import { signInWithEmailAndPassword } from '../helpers/auth';
import { waitForWizardToLoad } from '../helpers/wizard';

test.describe('Event CRUD', () => {
  test('event modal opens on click', async ({ page }) => {
    await page.goto('/');
  });

  test('event form validation prevents advancing from Step 1 without required fields', async ({
    page,
  }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin/new');
    await waitForWizardToLoad(page);

    const firstNameInput = page.locator('#organizer\\.firstName');
    const lastNameInput = page.locator('#organizer\\.lastName');
    const emailInput = page.locator('#organizer\\.email');
    const kontaktInput = page.locator('#kontakt');

    await expect(firstNameInput).toBeVisible();
    await expect(lastNameInput).toBeVisible();
    await expect(emailInput).toBeVisible();
    await expect(kontaktInput).toBeVisible();

    await firstNameInput.fill('Test');
    await lastNameInput.fill('User');
    await emailInput.fill('test@test.com');
    await kontaktInput.fill('test@test.com');

    const weiterButton = page.locator('button:has-text("Weiter")');
    await expect(weiterButton).toBeVisible();
    await expect(weiterButton).toBeEnabled();
  });

  test('all required fields are marked with asterisk', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin/new');
    await waitForWizardToLoad(page);

    const firstNameLabel = page.locator('label:has-text("Vorname")');
    const lastNameLabel = page.locator('label:has-text("Nachname")');
    const emailLabel = page.locator('label:has-text("E-Mail Veranstalter")');
    const kontaktLabel = page.locator('label:has-text("Kontakt für Teilnehmer:innen")');

    await expect(firstNameLabel).toContainText('*');
    await expect(lastNameLabel).toContainText('*');
    await expect(emailLabel).toContainText('*');
    await expect(kontaktLabel).toContainText('*');
  });
});
