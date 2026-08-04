import { test, expect } from '@playwright/test';
import { signInWithEmailAndPassword } from '../helpers/auth';

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

  test('form sections are in expected order: Veranstalter > Event-Details > Optional', async ({
    page,
  }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin/new');

    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    const sectionTitles = page.locator('.form-section-title');
    await expect(sectionTitles).toHaveCount(3);
    await expect(sectionTitles.nth(0)).toHaveText('Veranstalter & Kontakt');
    await expect(sectionTitles.nth(1)).toHaveText('Event-Details');
    await expect(sectionTitles.nth(2)).toHaveText('Optionale Angaben');

    const firstNameBox = await page.locator('input[name="firstName"]').boundingBox();
    const titleBox = await page.locator('input[name="title"]').boundingBox();
    const descriptionBox = await page.locator('textarea[name="description"]').boundingBox();

    expect(firstNameBox.y).toBeLessThan(titleBox.y);
    expect(titleBox.y).toBeLessThan(descriptionBox.y);
  });

  test('organizer is pre-filled from current user on new event', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin/new');

    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    await expect(page.locator('input[name="email"]')).toHaveValue('admin@test.com');
    await expect(page.locator('input[name="firstName"]')).not.toHaveValue('');
  });

  test('event cannot be created without organizer fields', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin/new');

    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    await page.fill('input[name="title"]', 'Missing Organizer Test');
    await page.fill('input[name="date"]', '2026-09-10');
    await page.fill('input[name="place"]', 'Test Place');
    await page.selectOption('select[name="bezirk"]', 'Bregenz');

    await page.locator('.kategorie-select').click();
    await page.waitForTimeout(500);
    await page.locator('.kategorie__menu .kategorie__option').first().click();
    await page.waitForTimeout(300);

    await page.fill('input[name="firstName"]', '');
    await page.fill('input[name="lastName"]', '');
    await page.fill('input[name="email"]', '');
    await page.fill('input[name="kontakt"]', '');

    await page.getByRole('button', { name: /event erstellen/i }).click();

    await expect(page.locator('.error-text.submit-error')).toContainText(
      'Bitte fülle alle Pflichtfelder aus.'
    );
  });

  test('event cannot be created with invalid organizer email', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin/new');

    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    await page.fill('input[name="title"]', 'Invalid Email Test');
    await page.fill('input[name="date"]', '2026-09-11');
    await page.fill('input[name="place"]', 'Test Place');
    await page.selectOption('select[name="bezirk"]', 'Dornbirn');

    await page.locator('.kategorie-select').click();
    await page.waitForTimeout(500);
    await page.locator('.kategorie__menu .kategorie__option').first().click();
    await page.waitForTimeout(300);

    await page.fill('input[name="firstName"]', 'Max');
    await page.fill('input[name="lastName"]', 'Mustermann');
    await page.fill('input[name="email"]', 'not-an-email');
    await page.fill('input[name="kontakt"]', 'kontakt@example.com');

    await page.getByRole('button', { name: /event erstellen/i }).click();

    await expect(page.locator('.error-text').filter({ hasText: /gültige E-Mail/i })).toBeVisible();
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

  test('organizer and kontakt are editable on event edit view', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin/edit/test-event-today');

    await page.waitForSelector('input[name="firstName"]', { timeout: 15000 });
    await page.waitForTimeout(500);

    const firstName = page.locator('input[name="firstName"]');
    const lastName = page.locator('input[name="lastName"]');
    const email = page.locator('input[name="email"]');
    const kontakt = page.locator('input[name="kontakt"]');

    await expect(firstName).toBeVisible();
    await expect(lastName).toBeVisible();
    await expect(email).toBeVisible();
    await expect(kontakt).toBeVisible();

    await expect(firstName).toHaveValue('Anna');
    await expect(lastName).toHaveValue('Schmidt');
    await expect(email).toHaveValue('admin@test.com');
    await expect(kontakt).toHaveValue('0676 1234567');

    await firstName.fill('EditMax');
    await lastName.fill('EditMustermann');
    await email.fill('edit.max@example.com');
    await kontakt.fill('0699 9999999');

    await page.getByRole('button', { name: /änderungen speichern/i }).click();

    await page.waitForURL('/admin', { timeout: 15000 });
    await page.waitForTimeout(1000);

    await page.goto('/admin/edit/test-event-today');
    await page.waitForSelector('input[name="firstName"]', { timeout: 15000 });
    await page.waitForTimeout(500);

    await expect(page.locator('input[name="firstName"]')).toHaveValue('EditMax');
    await expect(page.locator('input[name="lastName"]')).toHaveValue('EditMustermann');
    await expect(page.locator('input[name="email"]')).toHaveValue('edit.max@example.com');
    await expect(page.locator('input[name="kontakt"]')).toHaveValue('0699 9999999');
  });

  test('create event with valid organizer and kontakt succeeds', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin/new');

    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    await page.fill('input[name="title"]', 'Organizer Kontakt Success Event');
    await page.fill('input[name="date"]', '2026-09-15');
    await page.fill('input[name="place"]', 'Test Place 123');
    await page.selectOption('select[name="bezirk"]', 'Feldkirch');

    await page.locator('.kategorie-select').click();
    await page.waitForTimeout(500);
    await page.locator('.kategorie__menu .kategorie__option').first().click();
    await page.waitForTimeout(300);

    await page.fill('input[name="firstName"]', 'Maria');
    await page.fill('input[name="lastName"]', 'Musterfrau');
    await page.fill('input[name="email"]', 'maria@example.com');
    await page.fill('input[name="kontakt"]', '0676 5554444');

    await page
      .locator('form')
      .evaluate((form) =>
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      );

    await page.waitForURL('/admin', { timeout: 15000 });
    await page.waitForTimeout(1500);

    const eventCard = page
      .locator('.event-card')
      .filter({ hasText: 'Organizer Kontakt Success Event' })
      .first();
    await eventCard.waitFor({ timeout: 5000 });
    await expect(eventCard.locator('[data-testid="event-owner-email"]')).toContainText(
      'maria@example.com'
    );
  });
});
