import { test, expect } from '@playwright/test';
import { signInWithEmailAndPassword } from '../helpers/auth';
import {
  waitForWizardToLoad,
  navigateToStep2,
  navigateToStep3,
  navigateToStep4,
  fillStep1Organizer,
  fillStep2EventInfo,
  fillStep3Details,
} from '../helpers/wizard';

test.describe('Event fields: Veranstalter & Kontakt', () => {
  test('organizer and kontakt fields are required and visible on form', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin/new');

    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    await expect(page.locator('label[for="organizer.firstName"]')).toBeVisible();
    await expect(page.locator('label[for="organizer.lastName"]')).toBeVisible();
    await expect(page.locator('label[for="organizer.email"]')).toBeVisible();
    await expect(page.locator('label[for="kontakt"]')).toBeVisible();

    await expect(page.locator('input[name="firstName"]')).toBeVisible();
    await expect(page.locator('input[name="lastName"]')).toBeVisible();
    await expect(page.locator('input[name="email"]')).toBeVisible();
    await expect(page.locator('input[name="kontakt"]')).toBeVisible();
  });

  test('organizer is pre-filled from current user on new event', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin/new');
    await waitForWizardToLoad(page);

    await expect(page.locator('#organizer\\.email')).toHaveValue('admin@test.com');
    await expect(page.locator('#kontakt')).toHaveValue('admin@test.com');
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

  test('event cannot be created without organizer fields', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin/new');
    await waitForWizardToLoad(page);

    await page.locator('#organizer\\.firstName').fill('');
    await page.locator('#organizer\\.lastName').fill('');
    await page.locator('#organizer\\.email').fill('');
    await page.locator('#kontakt').fill('');

    await page.locator('button:has-text("Weiter")').click();
    await page.waitForTimeout(500);

    const errorTexts = page.locator('.error-text');
    const count = await errorTexts.count();
    expect(count).toBeGreaterThan(0);
  });

  test('event cannot be created with invalid organizer email', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin/new');
    await waitForWizardToLoad(page);

    await page.locator('#organizer\\.email').fill('not-an-email');
    await page.locator('button:has-text("Weiter")').click();
    await page.waitForTimeout(500);

    const errorText = page.locator('.error-text');
    await expect(errorText.first()).toBeVisible();
  });

  test('event detail page shows organizer and kontakt for approved event', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin');

    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});
    await page.waitForTimeout(1500);

    await page.locator('.event-card-content').first().click();

    await page.waitForSelector('.event-title', { timeout: 20000 });

    const organizer = page.locator('[data-testid="event-organizer"]');
    await expect(organizer).toBeVisible();
    await expect(organizer).toContainText('Anna');
    await expect(organizer).toContainText('Schmidt');

    const kontakt = page.locator('[data-testid="event-kontakt"]');
    await expect(kontakt).toBeVisible();

    const ownerEmail = page.locator('[data-testid="event-owner-email"]');
    await expect(ownerEmail).toBeVisible();
    await expect(ownerEmail).toContainText('@');
  });

  test('manage cards in Verwalten section show organizer email', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin');

    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});
    await page.waitForTimeout(1500);

    const ownerEmails = page.locator('[data-testid="event-owner-email"]');
    await expect(ownerEmails.first()).toBeVisible();
    await expect(ownerEmails.first()).toContainText('@');
  });
});
