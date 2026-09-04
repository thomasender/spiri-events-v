import { test, expect } from '@playwright/test';

test.describe('Hero layout', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('does not render the hero image', async ({ page }) => {
    await expect(page.locator('section.hero .hero-visual')).toHaveCount(0);
    await expect(page.locator('img.hero-visual-image')).toHaveCount(0);

    const heroImageRequest = await page
      .waitForResponse(
        (response) => response.url().endsWith('/hero.jpeg') && response.status() === 200,
        { timeout: 1000 }
      )
      .catch(() => null);
    expect(heroImageRequest, 'no /hero.jpeg request should be made').toBeNull();
  });

  test('still renders the hero title, subtitle and feature list', async ({ page }) => {
    await expect(page.locator('section.hero .hero-title')).toBeVisible();
    await expect(page.locator('section.hero .hero-title')).toContainText('Finde Events');
    await expect(page.locator('section.hero .hero-title')).toContainText('Finde');
    await expect(page.locator('section.hero .hero-title em')).toContainText('Menschen');

    await expect(page.locator('section.hero .hero-subtitle')).toBeVisible();

    const features = page.locator('section.hero .hero-features li');
    await expect(features).toHaveCount(4);
    await expect(features.first()).toBeVisible();
  });

  test('hero section is compact on desktop (no full-bleed image)', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });

    const hero = page.locator('section.hero');
    await expect(hero).toBeVisible();

    const heroBox = await hero.boundingBox();
    expect(heroBox).not.toBeNull();

    // With the image removed the hero is text-only. Even on a tall viewport
    // it should comfortably stay under 600px so the calendar/filters above
    // the fold is immediately reachable (which was the whole point of the
    // change in ticket TIU9978A).
    expect(heroBox!.height).toBeLessThan(600);
  });

  test('hero content is wider than 50% of the hero (no longer cramped)', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });

    const hero = page.locator('section.hero');
    const heroContent = page.locator('section.hero .hero-content');
    await expect(hero).toBeVisible();
    await expect(heroContent).toBeVisible();

    const heroBox = await hero.boundingBox();
    const heroContentBox = await heroContent.boundingBox();
    expect(heroBox).not.toBeNull();
    expect(heroContentBox).not.toBeNull();

    // Before the change the content was capped at 50% because the right
    // half was the hero image. After removing the image the content is
    // allowed to fill the hero (capped only by a readability max-width).
    expect(heroContentBox!.width).toBeGreaterThan(heroBox!.width * 0.55);
  });

  test('hero section is compact on mobile too', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });

    const hero = page.locator('section.hero');
    await expect(hero).toBeVisible();

    const heroBox = await hero.boundingBox();
    expect(heroBox).not.toBeNull();

    // On mobile there used to be a stacked image above the text content
    // (25% height + min 130px). Without the image, the hero shrinks to
    // roughly the natural text height — keep a generous ceiling so the
    // test is stable across font/feature-list variations.
    expect(heroBox!.height).toBeLessThan(700);
  });
});
