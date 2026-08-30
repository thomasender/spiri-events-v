import { test, expect } from '@playwright/test';
import { signInWithEmailAndPassword, signOut } from '../helpers/auth';

const RECURRING_CUSTOM_EVENT_ID = 'test-event-recurring-custom';

test.describe.configure({ mode: 'serial' });

test.describe('Editing a custom-dates (series) event shows the custom dates (4HFcGPTf)', () => {
  test.afterEach(async ({ page }) => {
    await signOut(page);
  });

  test('edit form has "Benutzerdefinierte Termine" radio selected for a custom-recurrence event', async ({
    page,
  }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');

    await page.goto(`/admin/edit/${RECURRING_CUSTOM_EVENT_ID}`);
    await page.waitForURL(/\/admin\/edit\//);
    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    await expect(page.locator('h1')).toContainText('Event bearbeiten', { timeout: 10000 });

    const customRadio = page.locator(
      '.radio-label:has-text("Benutzerdefinierte Termine") input[type="radio"]'
    );
    await expect(customRadio).toBeChecked();
  });

  test('edit form renders the existing custom dates for a custom-recurrence event', async ({
    page,
  }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');

    await page.goto(`/admin/edit/${RECURRING_CUSTOM_EVENT_ID}`);
    await page.waitForURL(/\/admin\/edit\//);
    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    await expect(page.getByTestId('custom-dates-list')).toBeAttached();

    const inputs = page.locator('[data-testid^="custom-date-input-"]');
    await expect(inputs).toHaveCount(4);

    const values = await inputs.evaluateAll((els) => els.map((el) => el.value));
    expect(values).toEqual(values.slice().sort());
    expect(values[0]).not.toBe('');
  });

  test('Wiederholung bis field is hidden when editing a custom-recurrence event', async ({
    page,
  }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');

    await page.goto(`/admin/edit/${RECURRING_CUSTOM_EVENT_ID}`);
    await page.waitForURL(/\/admin\/edit\//);
    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    await expect(page.locator('#recurrenceEndDate')).not.toBeVisible();
  });
});
