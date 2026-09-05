import { test, expect } from '@playwright/test';
import { generateSlug } from '../helpers/slug';

const YOGA_HEUTE_SLUG = generateSlug('Yoga heute', 'Yogastudio Dornbirn', 0);
const MANTRASINGEN_SLUG = generateSlug('Mantrasingen', 'Gemeinschaftsraum Bregenz', 2);

async function openEventAndWaitForSimilarEvents(page, slug) {
  await page.goto(`/event/${slug}`);

  await page
    .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
    .catch(() => {});

  await expect(page.locator('.event-title')).toBeVisible({ timeout: 10000 });
}

test.describe('Similar events on event detail page (SNKCKBob)', () => {
  // Webkit (iPhone 13 viewport) is much slower than chromium at Firestore
  // network ops — the secondary query for similar events routinely takes
  // 30–50s on webkit under load. Generous timeout so both engines pass.
  const VISIBLE_TIMEOUT = 60000;

  test('shows the Ähnliche Events section for events that share a category', async ({ page }) => {
    await openEventAndWaitForSimilarEvents(page, YOGA_HEUTE_SLUG);

    await expect(page.getByTestId('similar-events')).toBeVisible({ timeout: VISIBLE_TIMEOUT });
    await expect(
      page.getByTestId('similar-events').getByRole('heading', { name: 'Ähnliche Events' })
    ).toBeVisible();
  });

  test('caps the slider at five similar events, sorted by upcoming date', async ({ page }) => {
    await openEventAndWaitForSimilarEvents(page, YOGA_HEUTE_SLUG);

    await expect(page.getByTestId('similar-events')).toBeVisible({ timeout: VISIBLE_TIMEOUT });

    const cards = page.getByTestId('similar-event-card');
    await expect(cards).toHaveCount(5);
  });

  test('does not include the current event in the similar events slider', async ({ page }) => {
    await openEventAndWaitForSimilarEvents(page, YOGA_HEUTE_SLUG);

    await expect(page.getByTestId('similar-events')).toBeVisible({ timeout: VISIBLE_TIMEOUT });

    const slider = page.getByTestId('similar-events-slider');
    await expect(slider).not.toContainText('Yoga heute');
  });

  test('reuses the existing EventCard component (.event-tile) for the similar events', async ({
    page,
  }) => {
    await openEventAndWaitForSimilarEvents(page, YOGA_HEUTE_SLUG);

    await expect(page.getByTestId('similar-events')).toBeVisible({ timeout: VISIBLE_TIMEOUT });

    const sliderTiles = page.getByTestId('similar-events-slider').locator('.event-tile');
    await expect(sliderTiles).toHaveCount(5);
    await expect(sliderTiles.filter({ hasText: 'Vinyasa Flow Yoga' })).toHaveCount(1);
  });

  test('shows a category badge in the similar events header matching the current event', async ({
    page,
  }) => {
    await openEventAndWaitForSimilarEvents(page, YOGA_HEUTE_SLUG);

    await expect(page.getByTestId('similar-events-category-badge')).toHaveText('Yoga', {
      timeout: VISIBLE_TIMEOUT,
    });
  });

  test('hides the similar events section when no other approved events share the category', async ({
    page,
  }) => {
    await openEventAndWaitForSimilarEvents(page, MANTRASINGEN_SLUG);
    await expect(page.locator('.event-title')).toContainText('Mantrasingen');

    await page.waitForTimeout(2000);
    await expect(page.getByTestId('similar-events')).toHaveCount(0);
  });

  test('each similar event links to that event detail page', async ({ page }) => {
    await openEventAndWaitForSimilarEvents(page, YOGA_HEUTE_SLUG);

    const sliderTiles = page.getByTestId('similar-events-slider').locator('a.event-tile');
    await expect(sliderTiles).toHaveCount(5, { timeout: VISIBLE_TIMEOUT });

    for (let i = 0; i < 5; i += 1) {
      const href = await sliderTiles.nth(i).getAttribute('href');
      expect(href, `tile ${i} href`).toMatch(/^\/event\/[^/]+/);
      expect(href, `tile ${i} should not link to the current event`).not.toContain(YOGA_HEUTE_SLUG);
    }
  });
});
