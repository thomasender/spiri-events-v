import { test, expect, Page } from '@playwright/test';
import { waitForCalendarToLoad } from '../helpers/auth';

const EVENT_TILE_SELECTOR = '.event-tile, .event-row';
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

async function getEventRowOrCard(page: Page, title: string) {
  return page.locator(EVENT_TILE_SELECTOR).filter({ hasText: title }).first();
}

async function navigateToMonth(page: Page, year: number, month: number): Promise<void> {
  const target = `${MONTHS_DE[month]} ${year}`;
  const header = page.locator('.events-section-month h2');
  for (let attempts = 0; attempts < 36; attempts++) {
    const current = (await header.textContent())?.trim() ?? '';
    if (current === target) return;
    const navButtons = page.locator('.events-section-month-nav button');
    const [targetMonth] = target.split(' ');
    const [currentMonth] = current.split(' ');
    const going = MONTHS_DE.indexOf(targetMonth) >= MONTHS_DE.indexOf(currentMonth);
    await navButtons.nth(going ? 1 : 0).click();
    await page.waitForTimeout(150);
  }
  throw new Error(`Failed to navigate to ${target}`);
}

test.describe('Event category fallback images', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/');
    await waitForCalendarToLoad(page);
  });

  test('event list/cards show the category fallback when no imageUrl is set', async ({ page }) => {
    const card = await getEventRowOrCard(page, 'Yoga heute');
    await expect(card).toBeVisible();

    const image = card.locator('img');
    await expect(image).toBeVisible();
    const src = await image.getAttribute('src');
    expect(src).toBe('/event-fallbacks/yoga.jpg');
  });

  test('all visible event rows/cards render an <img> (no more empty placeholder divs)', async ({
    page,
  }) => {
    const tiles = page.locator(EVENT_TILE_SELECTOR);
    const count = await tiles.count();
    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < count; i++) {
      const tile = tiles.nth(i);
      const img = tile.locator('img').first();
      await expect(img).toBeVisible();
      const src = await img.getAttribute('src');
      expect(src).toMatch(/^\/event-fallbacks\//);
    }
  });

  test('each category maps to the correct fallback image', async ({ page }) => {
    const expectations = [
      { title: 'Yoga heute', dayOffset: 0, expected: '/event-fallbacks/yoga.jpg' },
      { title: 'Meditation morgen', dayOffset: 1, expected: '/event-fallbacks/meditation.jpg' },
      { title: 'Tanzworkshop diese Woche', dayOffset: 3, expected: '/event-fallbacks/tanz.jpg' },
      { title: 'Atemtherapie', dayOffset: 10, expected: '/event-fallbacks/breathwork.jpg' },
      { title: 'Mantrasingen', dayOffset: 2, expected: '/event-fallbacks/singen.png' },
    ];

    for (const { title, dayOffset, expected } of expectations) {
      const target = new Date();
      target.setDate(target.getDate() + dayOffset);
      await navigateToMonth(page, target.getFullYear(), target.getMonth());

      const card = await getEventRowOrCard(page, title);
      await expect(card, `card for "${title}" should be visible`).toBeVisible();
      const src = await card.locator('img').first().getAttribute('src');
      expect(src, `card for "${title}" should show ${expected}`).toBe(expected);
    }
  });

  test('the actual fallback image file is served by the dev server', async ({ page }) => {
    for (const path of [
      '/event-fallbacks/yoga.jpg',
      '/event-fallbacks/breathwork.jpg',
      '/event-fallbacks/meditation.jpg',
      '/event-fallbacks/tanz.jpg',
      '/event-fallbacks/singen.png',
      '/event-fallbacks/soundhealing.jpeg',
      '/event-fallbacks/sonstiges.svg',
    ]) {
      const response = await page.request.get(path);
      expect(response.status(), `${path} should be served`).toBe(200);
    }
  });

  test('event detail page shows the category fallback as hero image', async ({ page }) => {
    const card = await getEventRowOrCard(page, 'Yoga heute');
    await expect(card).toBeVisible();

    await card.click();
    await page.waitForURL(/\/event\//, { timeout: 15000 });

    const image = page.locator('img.event-image');
    await expect(image).toBeVisible({ timeout: 10000 });
    const src = await image.getAttribute('src');
    expect(src).toBe('/event-fallbacks/yoga.jpg');
  });

  test('card view also renders the fallback image', async ({ page }) => {
    await page.locator('button:has-text("Kartenansicht")').first().click();
    await page.waitForTimeout(300);

    const card = page.locator('.event-tile').filter({ hasText: 'Yoga heute' }).first();
    await expect(card).toBeVisible();
    const src = await card.locator('img.event-tile-image').getAttribute('src');
    expect(src).toBe('/event-fallbacks/yoga.jpg');
  });
});
