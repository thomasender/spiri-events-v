import { test, expect } from '@playwright/test';
import { signInWithEmailAndPassword, signOut } from '../helpers/auth';
import { waitForWizardToLoad } from '../helpers/wizard';

const EVENT_TITLE = `Custom Dates Initial Date Event ${Date.now()}`;

// Pick 3 consecutive days inside next month so no month boundary is crossed.
function seriesDates(): string[] {
  const base = new Date();
  const first = new Date(base.getFullYear(), base.getMonth() + 1, 10);
  return [0, 1, 2].map((offset) => {
    const d = new Date(first);
    d.setDate(d.getDate() + offset);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
}

async function createCustomDatesEvent(page, title: string) {
  const [initialDate, second, third] = seriesDates();

  await waitForWizardToLoad(page);
  await page.locator('button:has-text("Weiter")').click();
  await page.waitForTimeout(400);

  await page.fill('#title', title);
  const editor = page.locator('[data-testid="description-editor"] .rte-content');
  await editor.click();
  await editor.fill('Event zum Testen der benutzerdefinierten Daten.');
  await page.locator('button:has-text("Weiter")').click();
  await page.waitForTimeout(400);

  await page.fill('#date', initialDate);
  await page.fill('#time', '20:00');
  await page.fill('#place', 'Test Place');
  await page.selectOption('#bezirk', 'Bregenz');

  await page.click('.kategorie-select');
  await page.waitForTimeout(300);
  await page.click('.kategorie__option:has-text("Yoga")');
  await page.waitForTimeout(300);

  await page.locator('.radio-label:has-text("Benutzerdefinierte Daten")').click();
  await page.waitForTimeout(200);

  await page.getByTestId('custom-date-add-button').click();
  await page.waitForTimeout(150);
  await page.getByTestId('custom-date-add-button').click();
  await page.waitForTimeout(150);
  await page.getByTestId('custom-date-input-0').fill(second);
  await page.getByTestId('custom-date-input-1').fill(third);

  await page.getByRole('button', { name: 'Weiter', exact: true }).click();
  await page.waitForTimeout(400);

  await page.click(
    'button:has-text("Event erstellen"), button:has-text("Einreichen zur Genehmigung")'
  );
  await page.waitForTimeout(500);

  const preSubmitDialog = page
    .locator('.confirm-dialog')
    .filter({ hasText: /erstellen|Einreichen/ });
  if (await preSubmitDialog.isVisible().catch(() => false)) {
    await preSubmitDialog
      .getByRole('button', { name: /erstellen|einreichen/i })
      .first()
      .click();
    await page.waitForTimeout(500);
  }

  const successDialog = page.getByTestId('success-dialog');
  if (await successDialog.isVisible().catch(() => false)) {
    await successDialog.getByTestId('success-dialog-confirm').click();
  }

  return { initialDate, second, third };
}

test.describe.configure({ mode: 'serial' });

test.describe('Custom dates series includes the initial event date (DbtucPK2)', () => {
  test.afterEach(async ({ page }) => {
    await signOut(page);
  });

  test('all three dates (initial + 2 custom) belong to the published series', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');

    await page.goto('/admin/new');
    await createCustomDatesEvent(page, EVENT_TITLE);

    await page.goto('/admin');
    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    const card = page.locator('.event-card', { hasText: EVENT_TITLE }).first();
    await expect(card).toBeVisible({ timeout: 10000 });
    await expect(card).toContainText('3 Termine');
  });

  test('editing the event shows the initial date among the custom dates', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');

    await page.goto('/admin');
    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    const card = page.locator('.event-card', { hasText: EVENT_TITLE }).first();
    await expect(card).toBeVisible({ timeout: 10000 });
    await card.locator('a:has-text("Bearbeiten"), button:has-text("Bearbeiten")').first().click();
    await page.waitForURL(/\/admin\/edit\//, { timeout: 10000 });
    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    const inputs = page.locator('[data-testid^="custom-date-input-"]');
    await expect(inputs).toHaveCount(3);

    const [initialDate] = seriesDates();
    const values = await inputs.evaluateAll((els) =>
      els.map((el) => (el as HTMLInputElement).value)
    );
    expect(values).toContain(initialDate);
  });
});
