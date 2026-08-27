import { test, expect } from '@playwright/test';
import { spawn } from 'child_process';
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
const YOGA_HEUTE_SLUG = generateSlug('Yoga heute', 'Yogastudio Dornbirn', 0);

// admin-event-edit-delete.spec.ts permanently deletes this shared seed fixture as
// part of its delete-flow tests; reset it here so this file passes regardless of
// file execution order.
async function resetUserApprovedEventFixture(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const proc = spawn('node', ['scripts/reset-user-approved-event-fixture.mjs'], {
      cwd: process.cwd(),
      stdio: 'ignore',
      shell: true,
    });
    proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`exit ${code}`))));
    proc.on('error', reject);
  });
}

test.describe('Event fields: Veranstalter & Kontakt', () => {
  test.beforeEach(async () => {
    await resetUserApprovedEventFixture();
  });

  test('organizer and kontakt fields are required and visible on form', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin/new');

    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    // The create wizard only collects firstName/lastName + a combined "Kontakt"
    // field; organizer.email is derived from the logged-in user internally
    // (see EventFormWizard.jsx) and has no visible input of its own here — unlike
    // the edit form (EventForm.jsx), which does show a locked organizer-email field.
    await expect(page.locator('label[for="organizer.firstName"]')).toBeVisible({
      timeout: 10000,
    });
    await expect(page.locator('label[for="organizer.lastName"]')).toBeVisible();
    await expect(page.locator('label[for="kontakt"]')).toBeVisible();

    await expect(page.locator('input[name="firstName"]')).toBeVisible();
    await expect(page.locator('input[name="lastName"]')).toBeVisible();
    await expect(page.locator('input[name="kontakt"]')).toBeVisible();
  });

  test('kontakt is pre-filled from current user on new event', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin/new');
    await waitForWizardToLoad(page);

    await expect(page.locator('#kontakt')).toHaveValue('admin@test.com', { timeout: 10000 });
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

    // Navigate to the known admin-owned fixture directly by slug rather than
    // clicking the first card in "Meine Events" — that list accumulates events
    // created by other wizard-driven specs across test runs, so "first" is not
    // a stable way to reach a specific fixture.
    await page.goto(`/event/${YOGA_HEUTE_SLUG}`);

    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});
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
