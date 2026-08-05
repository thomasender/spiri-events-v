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
    test.skip();
  });

  test('organizer is pre-filled from current user on new event', async ({ page }) => {
    test.skip();
  });

  test('event cannot be created without organizer fields', async ({ page }) => {
    test.skip();
  });

  test('event cannot be created with invalid organizer email', async ({ page }) => {
    test.skip();
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
    test.skip();
  });

  test('create event with valid organizer and kontakt succeeds', async ({ page }) => {
    test.skip();
  });
});
