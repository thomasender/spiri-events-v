import { test, expect } from '@playwright/test';

import {
  confirmCopyrightCheckbox,
  enableRecurrence,
  waitForWizardToLoad,
  openReviewTab,
} from '../helpers/wizard';

import { STORAGE_STATE } from '../helpers/roles';
import { deleteEventsByTitlePrefix } from '../fixtures/events';

// Signed in as `admin` via the session captured once by tests/auth.setup.ts,
// instead of driving the login form in every test.
test.use({ storageState: STORAGE_STATE.admin });

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

  await page.fill('#title', title);
  const editor = page.locator('[data-testid="description-editor"] .rte-content');
  await editor.click();
  await editor.fill('Event zum Testen der benutzerdefinierten Daten.');
  await page.locator('button:has-text("Weiter")').click();

  await page.fill('#date', initialDate);
  await page.fill('#time', '20:00');
  await page.fill('#place', 'Test Place');
  await page.selectOption('#bezirk', 'Bregenz');

  await page.click('.kategorie-select');
  await page.click('.kategorie__option:has-text("Yoga")');

  await enableRecurrence(page);
  await page.locator('.radio-label:has-text("Benutzerdefinierte Termine")').click();

  await page.getByTestId('custom-date-add-button').click();
  await page.getByTestId('custom-date-add-button').click();
  await page.getByTestId('custom-date-input-0').fill(second);
  await page.getByTestId('custom-date-input-1').fill(third);

  await page.getByRole('button', { name: 'Weiter', exact: true }).click();

  await confirmCopyrightCheckbox(page);

  await page.click(
    'button:has-text("Event erstellen"), button:has-text("Einreichen zur Genehmigung")'
  );

  // Wait for the confirm dialog rather than probing isVisible() straight after
  // the click — at that point it has not rendered yet, the probe returns false
  // and the event is never actually submitted.
  const preSubmitDialog = page
    .locator('.confirm-dialog')
    .filter({ hasText: /erstellen|Einreichen/ });
  await expect(preSubmitDialog).toBeVisible({ timeout: 10000 });
  await preSubmitDialog
    .getByRole('button', { name: /erstellen|einreichen/i })
    .first()
    .click();

  const successDialog = page.getByTestId('success-dialog');
  await expect(successDialog).toBeVisible({ timeout: 15000 });
  await successDialog.getByTestId('success-dialog-confirm').click();

  return { initialDate, second, third };
}

test.describe.configure({ mode: 'serial' });

test.describe('Custom dates series includes the initial event date (DbtucPK2) @smoke', () => {
  // The wizard specs create real events; remove them so they do not
  // accumulate in the emulator across runs.
  test.afterAll(async () => {
    await deleteEventsByTitlePrefix('Custom Dates Initial Date Event');
  });

  test('all three dates (initial + 2 custom) belong to the published series', async ({ page }) => {
    await page.goto('/admin/new');
    const { initialDate, second, third } = await createCustomDatesEvent(page, EVENT_TITLE);

    // Admin-created events start as `pending` (ticket hGxrS6gp) and pending
    // events deliberately do NOT show under "Meine Events" — see
    // admin-review-tab.spec.ts. They land in the Review tab.
    const panel = await openReviewTab(page);
    const card = panel.locator('.event-card', { hasText: EVENT_TITLE }).first();
    await expect(card).toBeVisible({ timeout: 15000 });
    await expect(card).toContainText('An einzelnen Terminen');

    // The point of this test: the date the event was created with is part of
    // the series, not silently dropped in favour of the two added dates.
    await card.locator('a').first().click();
    const datesList = page.getByTestId('event-detail-dates-list');
    await expect(datesList).toBeVisible({ timeout: 15000 });

    for (const iso of [initialDate, second, third]) {
      await expect(datesList.locator(`a[href*="occurrenceDate=${iso}"]`)).toHaveCount(1);
    }
  });

  test('editing the event shows the initial date among the custom dates', async ({ page }) => {
    // Same as above: the event created in the previous test is pending, so it
    // sits in the Review tab, not under "Meine Events".
    const panel = await openReviewTab(page);
    const card = panel.locator('.event-card', { hasText: EVENT_TITLE }).first();
    await expect(card).toBeVisible({ timeout: 15000 });
    // The admin list row exposes edit as an icon link; its accessible name is
    // "Serie bearbeiten" for a recurring event and "Bearbeiten" otherwise.
    await card
      .getByRole('link', { name: /bearbeiten/i })
      .first()
      .click();
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
