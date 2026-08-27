import { test, expect } from '@playwright/test';
import { signInWithEmailAndPassword } from '../helpers/auth';
import { generateSlug } from '../helpers/slug';
import {
  waitForWizardToLoad,
  navigateToStep2,
  navigateToStep3,
  navigateToStep4,
  fillStep1Organizer,
  fillStep2EventInfo,
  fillStep3Details,
} from '../helpers/wizard';

const USER_APPROVED_SLUG = generateSlug('User Approved Event', 'User Place Bregenz', 9);

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
    const kontaktLabel = page.locator('label:has-text("Kontakt für Teilnehmer:innen")');

    await expect(firstNameLabel).toContainText('*');
    await expect(lastNameLabel).toContainText('*');
    await expect(kontaktLabel).toContainText('*');
  });

  test('event cannot be created without organizer fields', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin/new');
    await waitForWizardToLoad(page);

    await page.locator('#organizer\\.firstName').fill('');
    await page.locator('#organizer\\.lastName').fill('');
    await page.locator('#kontakt').fill('');

    await page.locator('button:has-text("Weiter")').click();
    await page.waitForTimeout(500);

    const errorTexts = page.locator('.error-text');
    const count = await errorTexts.count();
    expect(count).toBeGreaterThan(0);
  });

  test('Beschreibung field is marked as required with asterisk on step 2', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin/new');
    await waitForWizardToLoad(page);

    await navigateToStep2(page);

    const descriptionLabel = page.locator('label[for="description"]');
    await expect(descriptionLabel).toBeVisible();
    await expect(descriptionLabel).toContainText('*');
    await expect(descriptionLabel).toContainText('Beschreibung');
  });

  test('cannot advance from step 2 without filling description', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin/new');
    await waitForWizardToLoad(page);

    await navigateToStep2(page);

    await page.locator('#title').fill('Event ohne Beschreibung');

    await page.locator('button:has-text("Weiter")').click();
    await page.waitForTimeout(500);

    const descriptionError = page.getByTestId('description-error');
    await expect(descriptionError).toBeVisible();
    await expect(descriptionError).toContainText('Beschreibung ist erforderlich');

    await expect(page.locator('#title')).toBeVisible();
  });

  test('filling description allows advancing past step 2', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin/new');
    await waitForWizardToLoad(page);

    await navigateToStep2(page);

    await fillStep2EventInfo(page, {
      title: 'Event mit Beschreibung',
      description: 'Eine ausführliche Beschreibung des Events.',
    });

    await page.locator('button:has-text("Weiter")').click();
    await page.waitForTimeout(500);

    await expect(page.locator('#date')).toBeVisible();
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
    await expect(organizer.locator('[data-testid="organizer-photo"]')).toBeVisible();

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

  test("guest visiting another user's approved event via slug sees organizer photo", async ({
    page,
  }) => {
    await page.goto(`/event/${USER_APPROVED_SLUG}`);

    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    await expect(page.locator('.event-title')).toContainText('User Approved Event', {
      timeout: 10000,
    });

    const organizer = page.locator('[data-testid="event-organizer"]');
    await expect(organizer).toBeVisible();
    await expect(organizer.locator('[data-testid="organizer-photo"]')).toBeVisible();
  });
});
