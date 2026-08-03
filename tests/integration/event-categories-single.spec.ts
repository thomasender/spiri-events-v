import { test, expect } from '@playwright/test';
import { signInWithEmailAndPassword } from '../helpers/auth';

test.describe('Event form: single category only', () => {
  test('selecting a category replaces any previous selection', async ({ page }) => {
    test.setTimeout(90000);
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');

    await page.goto('/admin/new');
    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    const select = page.locator('.kategorie-select');
    await select.click();
    await page.waitForTimeout(400);

    await page.locator('.kategorie__menu .kategorie__option').filter({ hasText: 'Yoga' }).click();
    await page.waitForTimeout(300);

    await expect(page.locator('.kategorie__single-value')).toHaveText('Yoga');

    await select.click();
    await page.waitForTimeout(400);

    await page
      .locator('.kategorie__menu .kategorie__option')
      .filter({ hasText: 'Meditation' })
      .click();
    await page.waitForTimeout(300);

    await expect(page.locator('.kategorie__single-value')).toHaveText('Meditation');

    const chips = await page.locator('.kategorie__multi-value__label').count();
    expect(chips).toBe(0);
  });

  test('saved event has exactly one category persisted in Firestore', async ({ page }) => {
    test.setTimeout(90000);
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');

    await page.goto('/admin/new');
    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    await page.fill('input[name="title"]', 'Single Category Persistence');
    await page.fill('input[name="date"]', '2027-02-15');
    await page.fill('input[name="place"]', 'Persistence Place');
    await page.selectOption('select[name="bezirk"]', 'Bregenz');

    await page.locator('.kategorie-select').click();
    await page.waitForTimeout(400);
    await page.locator('.kategorie__menu .kategorie__option').filter({ hasText: 'Tanz' }).click();
    await page.waitForTimeout(300);

    await page
      .locator('form')
      .evaluate((form) =>
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      );

    await page.waitForURL('/admin', { timeout: 15000 });

    const firestoreUrl =
      'http://127.0.0.1:8181/v1/projects/spirieventsvbg/databases/(default)/documents/events';
    const response = await fetch(firestoreUrl, {
      headers: { Authorization: 'Bearer owner' },
    });
    const data = await response.json();
    const docs = Array.isArray(data) ? data : data.documents || [];
    const created = docs.find((doc) => {
      const fields = doc.fields;
      return fields?.title?.stringValue === 'Single Category Persistence';
    });
    expect(created).toBeTruthy();
    const categoryField = created.fields.category;
    expect(categoryField?.stringValue).toBe('Tanz');
    expect(created.fields.categories).toBeUndefined();
  });
});
