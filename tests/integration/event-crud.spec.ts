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

  test('link without protocol is auto-prefixed with https://', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');

    await page.goto('/admin/new');

    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    await page.fill('input[name="title"]', 'Link Normalization Test Event');
    await page.fill('input[name="date"]', '2026-08-15');
    await page.fill('input[name="place"]', 'Test Place Vienna');
    await page.selectOption('select[name="bezirk"]', 'Bregenz');

    await page.locator('.kategorie-select').click();
    await page.waitForTimeout(500);
    await page.locator('.kategorie__menu').locator('*').first().click();
    await page.waitForTimeout(300);

    await page.fill('input[name="link"]', 'www.example.com/test-event');

    await page
      .locator('form')
      .evaluate((form) =>
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      );

    await page.waitForURL('/admin', { timeout: 15000 });

    const eventCard = page
      .locator('.event-card, [data-testid="event-card"], .admin-event-item')
      .filter({ hasText: 'Link Normalization Test Event' })
      .first();
    await eventCard.waitFor({ timeout: 5000 }).catch(() => {});

    const eventLinkOnAdmin = page.locator('a[href*="example.com"]').first();
    const linkExistsOnAdmin = await eventLinkOnAdmin.isVisible().catch(() => false);
    console.log('Link visible on admin page:', linkExistsOnAdmin);

    if (linkExistsOnAdmin) {
      await expect(eventLinkOnAdmin).toHaveAttribute('href', /^https:\/\//);
    } else {
      const createdEvent = page.locator('text=Link Normalization Test Event').first();
      await createdEvent.click();
      await page.waitForTimeout(2000);

      const detailLink = page.locator('a[href*="example.com"]').first();
      await expect(detailLink).toHaveAttribute('href', /^https:\/\//);
    }
  });

  test('link with http:// is converted to https://', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');

    await page.goto('/admin/new');

    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    await page.fill('input[name="title"]', 'HTTP to HTTPS Test Event');
    await page.fill('input[name="date"]', '2026-08-16');
    await page.fill('input[name="place"]', 'Test Place Innsbruck');
    await page.selectOption('select[name="bezirk"]', 'Dornbirn');

    await page.locator('.kategorie-select').click();
    await page.waitForTimeout(500);
    await page.locator('.kategorie__menu').locator('*').first().click();
    await page.waitForTimeout(300);

    await page.fill('input[name="link"]', 'http://www.example.com/test');

    await page
      .locator('form')
      .evaluate((form) =>
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      );

    await page.waitForURL('/admin', { timeout: 15000 });

    const eventCard = page
      .locator('.event-card, [data-testid="event-card"], .admin-event-item')
      .filter({ hasText: 'HTTP to HTTPS Test Event' })
      .first();
    await eventCard.waitFor({ timeout: 5000 }).catch(() => {});

    const eventLinkOnAdmin = page.locator('a[href*="example.com"]').first();
    const eventExistsOnAdmin = await eventLinkOnAdmin.isVisible().catch(() => false);

    if (eventExistsOnAdmin) {
      await expect(eventLinkOnAdmin).toHaveAttribute('href', /^https:\/\/www\.example\.com/);
    } else {
      const createdEvent = page.locator('text=HTTP to HTTPS Test Event').first();
      await createdEvent.click();
      await page.waitForTimeout(2000);

      const detailLink = page.locator('a[href*="example.com"]').first();
      await expect(detailLink).toHaveAttribute('href', /^https:\/\/www\.example\.com/);
    }
  });

  test('all required fields are marked with asterisk', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');

    await page.goto('/admin/new');

    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    const requiredLabels = ['Titel *', 'Kategorien *', 'Datum *', 'Bezirk *', 'Ort / Adresse *'];

    for (const labelText of requiredLabels) {
      const label = page.locator('label').filter({ hasText: labelText }).first();
      await expect(label).toBeVisible();
    }
  });
});
