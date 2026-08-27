import { test, expect, Page } from '@playwright/test';
import { spawn } from 'child_process';
import { waitForCalendarToLoad } from '../helpers/auth';

async function resetRecurringEventFixture(): Promise<void> {
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

const MONTHS_DE = [
  'Januar',
  'Februar',
  'März',
  'April',
  'Mai',
  'Juni',
  'Juli',
  'August',
  'September',
  'Oktober',
  'November',
  'Dezember',
];

const RECURRING_EVENT_TITLE = 'Test Weekly Yoga Series';

function nextMonthInfo(): { year: number; month: number } {
  const today = new Date();
  const next = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  return { year: next.getFullYear(), month: next.getMonth() };
}

function startMonthInfo(): { year: number; month: number } {
  const today = new Date();
  today.setDate(today.getDate() + 7);
  return { year: today.getFullYear(), month: today.getMonth() };
}

async function navigateToMonth(page: Page, year: number, month: number): Promise<void> {
  const target = `${MONTHS_DE[month]} ${year}`;
  const header = page.locator('.events-section-month h2');

  for (let attempts = 0; attempts < 24; attempts++) {
    const current = (await header.textContent())?.trim() ?? '';
    if (current === target) return;
    await page.locator('.events-section-month-nav button').nth(1).click();
    await page.waitForTimeout(150);
  }
  throw new Error(`Failed to navigate to ${target}`);
}

test.describe('Card and List view recurring events (TEgXPOfN)', () => {
  const start = startMonthInfo();
  const future = nextMonthInfo();

  // recurring-event-deletion-edit-form.spec.ts deletes this same shared fixture doc
  // in its last test; reset it here so this file passes regardless of file order.
  test.beforeEach(async ({ page }) => {
    await resetRecurringEventFixture();
    await page.goto('/');
    await waitForCalendarToLoad(page);
  });

  for (const month of [
    { name: 'starting', ...start },
    { name: 'future', ...future },
  ]) {
    test(`list and card view show recurring event in its ${month.name} month`, async ({ page }) => {
      await navigateToMonth(page, month.year, month.month);
      await expect(
        page.locator('.event-row', { hasText: RECURRING_EVENT_TITLE }).first()
      ).toBeVisible();

      await page.locator('button:has-text("Kartenansicht")').first().click();
      await expect(
        page.locator('.event-tile', { hasText: RECURRING_EVENT_TITLE }).first()
      ).toBeVisible();
    });
  }
});
