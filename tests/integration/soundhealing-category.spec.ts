import { test, expect, Page } from '@playwright/test';
import { waitForCalendarToLoad } from '../helpers/auth';

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

function soundhealingEventMonthInfo(): { year: number; month: number } {
  const target = new Date();
  target.setDate(target.getDate() + 11);
  return { year: target.getFullYear(), month: target.getMonth() };
}

test.describe('Soundhealing category', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    await waitForCalendarToLoad(page);
  });

  test('Soundhealing chip is visible in the filter panel', async ({ page }) => {
    const chip = page.locator('.filter-chip--category[data-category="Soundhealing"]');
    await expect(chip).toBeVisible();
    await expect(chip).toContainText('Soundhealing');
  });

  test('Soundhealing chip carries its own --category-color CSS variable', async ({ page }) => {
    const chip = page.locator('.filter-chip--category[data-category="Soundhealing"]');
    const categoryColor = await chip.evaluate((el) =>
      window.getComputedStyle(el).getPropertyValue('--category-color').trim()
    );
    expect(categoryColor).not.toBe('');
    expect(categoryColor).not.toBe('initial');
  });

  test('Soundhealing chip can be toggled on and off', async ({ page }) => {
    const chip = page.locator('.filter-chip--category[data-category="Soundhealing"]');
    await expect(chip).toHaveAttribute('aria-pressed', 'true');
    await chip.click();
    await expect(chip).toHaveAttribute('aria-pressed', 'false');
    await chip.click();
    await expect(chip).toHaveAttribute('aria-pressed', 'true');
  });

  test('seeded Soundhealing event renders with category fallback image', async ({ page }) => {
    const { year, month } = soundhealingEventMonthInfo();
    await navigateToMonth(page, year, month);

    const card = page
      .locator('.event-tile, .event-row')
      .filter({ hasText: 'Klangreise mit Bowls' })
      .first();
    await expect(card).toBeVisible();
    const src = await card.locator('img').first().getAttribute('src');
    expect(src).toBe('/event-fallbacks/soundhealing.jpg');
  });
});
