import { test, expect } from '@playwright/test';
import { spawn } from 'child_process';
import { generateSlug } from '../helpers/slug';

const WEEKLY_TITLE = 'Test Weekly Yoga Series';
const WEEKLY_PLACE = 'Yogastudio Test';
const WEEKLY_SLUG = generateSlug(WEEKLY_TITLE, WEEKLY_PLACE, 7);

async function resetRecurringEventFixture(): Promise<void> {
  // Shared with recurring-event-deletion-detail-page.spec.ts and
  // recurring-event-deletion-edit-form.spec.ts, which mutate
  // recurrenceEndDate / exceptionDates. Reset before each test so the
  // recurrence is intact regardless of file-order / parallel worker.
  await new Promise<void>((resolve, reject) => {
    const proc = spawn('node', ['scripts/reset-recurring-event-fixtures.mjs'], {
      cwd: process.cwd(),
      stdio: 'ignore',
      shell: true,
    });
    proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`exit ${code}`))));
    proc.on('error', reject);
  });
}

test.describe('Event detail page lists weekly recurrence dates as clickable links (AmfbLIFQ)', () => {
  test.beforeEach(async () => {
    await resetRecurringEventFixture();
  });

  test('renders every future weekly occurrence as a link to that occurrence', async ({ page }) => {
    await page.goto(`/event/${WEEKLY_SLUG}`);
    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    await expect(page.locator('.event-title')).toContainText(WEEKLY_TITLE, { timeout: 10000 });

    const datesList = page.getByTestId('event-detail-dates-list');
    await expect(datesList).toBeVisible();

    const links = page.getByTestId('event-detail-date-link');
    const hrefs = await links.evaluateAll((els) =>
      els.map((el) => (el as HTMLAnchorElement).getAttribute('href') || '')
    );
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) {
      expect(href).toMatch(
        new RegExp(`^/event/${WEEKLY_SLUG}\\?occurrenceDate=\\d{4}-\\d{2}-\\d{2}$`)
      );
    }
  });

  test('clicking a weekly date link navigates to that occurrence', async ({ page }) => {
    await page.goto(`/event/${WEEKLY_SLUG}`);
    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    await expect(page.locator('.event-title')).toContainText(WEEKLY_TITLE, { timeout: 10000 });

    const links = page.getByTestId('event-detail-date-link');
    const firstHref = await links.first().getAttribute('href');
    expect(firstHref).not.toBeNull();

    await links.first().click();

    await expect(page).toHaveURL(
      new RegExp(`/event/${WEEKLY_SLUG}\\?occurrenceDate=\\d{4}-\\d{2}-\\d{2}$`)
    );

    await expect(page.getByTestId('event-detail-dates-list')).toHaveCount(0);
  });
});
