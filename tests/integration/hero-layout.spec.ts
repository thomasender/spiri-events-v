import { test, expect } from '@playwright/test';
import { waitForCalendarToLoad } from '../helpers/auth';

test.describe('Hero Section Layout', () => {
  test.describe('Desktop', () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto('/');
      await waitForCalendarToLoad(page);
    });

    test('hero sits outside the page grid and spans the full content width', async ({ page }) => {
      const hero = page.locator('.hero');
      const pageLayout = page.locator('.page-layout');

      await expect(hero).toBeVisible();
      await expect(pageLayout).toBeVisible();

      const heroBox = await hero.boundingBox();
      const layoutBox = await pageLayout.boundingBox();
      expect(heroBox).not.toBeNull();
      expect(layoutBox).not.toBeNull();

      // The hero must NOT be a descendant of the page-layout grid:
      // it lives as a sibling above the grid so the calendar can slide
      // up next to the filter panel.
      const heroInsideLayout = await page.evaluate(() => {
        const hero = document.querySelector('.hero');
        const layout = document.querySelector('.page-layout');
        return !!(hero && layout && layout.contains(hero));
      });
      expect(heroInsideLayout).toBe(false);

      // Hero and page-layout share roughly the same horizontal start,
      // i.e. the hero is left-aligned to the page's content edge.
      expect(Math.abs(heroBox!.x - layoutBox!.x)).toBeLessThan(2);

      // On a viewport wider than the page-layout's max-width, the hero
      // must be wider than the page-layout. The page-layout caps at
      // 1400px, so test with a 1600px viewport.
      await page.setViewportSize({ width: 1600, height: 900 });
      await page.goto('/');
      await waitForCalendarToLoad(page);
      const wideHero = await page.locator('.hero').boundingBox();
      const wideLayout = await page.locator('.page-layout').boundingBox();
      expect(wideHero!.width).toBeGreaterThan(wideLayout!.width);
    });

    test('hero sits above the page-layout so the calendar aligns with the filter panel', async ({
      page,
    }) => {
      const hero = page.locator('.hero');
      const filterPanel = page.locator('.filter-panel');
      const sidebar = page.locator('.page-sidebar');

      await expect(hero).toBeVisible();
      await expect(filterPanel).toBeVisible();
      await expect(sidebar).toBeVisible();

      const heroBox = await hero.boundingBox();
      const filterBox = await filterPanel.boundingBox();
      const sidebarBox = await sidebar.boundingBox();

      // Hero is fully above the filter panel (they don't overlap vertically).
      expect(heroBox!.y + heroBox!.height).toBeLessThanOrEqual(filterBox!.y + 1);

      // Calendar sidebar and filter panel start at the same vertical position.
      expect(Math.abs(sidebarBox!.y - filterBox!.y)).toBeLessThan(2);
    });

    test('hero text content stays in the left half of the hero', async ({ page }) => {
      const hero = page.locator('.hero');
      const heroContent = page.locator('.hero-content');

      await expect(hero).toBeVisible();
      await expect(heroContent).toBeVisible();

      const heroBox = await hero.boundingBox();
      const contentBox = await heroContent.boundingBox();

      const heroCenterX = heroBox!.x + heroBox!.width / 2;
      const contentRightEdge = contentBox!.x + contentBox!.width;

      // Content must not cross the horizontal center of the hero.
      expect(contentRightEdge).toBeLessThanOrEqual(heroCenterX + 1);
    });

    test('gradient overlay stops at 50% of the hero width', async ({ page }) => {
      // The gradient is declared on .hero-visual::after. The browser may
      // collapse redundant color stops, so the canonical form is
      // `linear-gradient(90deg, <bg> 0%, <bg> <pct>, transparent <pct>%)`
      // where the last transparent stop is at the 50% mark.
      const gradient = await page.evaluate(() => {
        const el = document.querySelector('.hero-visual');
        if (!el) return null;
        const after = window.getComputedStyle(el, '::after');
        return after.backgroundImage;
      });

      expect(gradient).not.toBeNull();
      expect(gradient).not.toBe('none');
      // The gradient line must contain a transparent stop at 50% so that
      // the right half of the hero shows the image unobstructed.
      expect(gradient).toMatch(/rgba?\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\s*\)\s+50%/);
      // And it must NOT extend any non-transparent color past 50%.
      const colorStops = gradient!.match(/\d+(?:\.\d+)?%/g) || [];
      const lastNonTransparentPct = await page.evaluate(() => {
        const el = document.querySelector('.hero-visual');
        if (!el) return null;
        const after = window.getComputedStyle(el, '::after');
        const stops = after.backgroundImage;
        // Find the position of the last color that is NOT rgba(0,0,0,0).
        const matches = [...stops.matchAll(/rgb\([^)]+\)\s+(\d+(?:\.\d+)?)%/g)];
        const last = matches[matches.length - 1];
        return last ? Number(last[1]) : null;
      });
      expect(lastNonTransparentPct).not.toBeNull();
      expect(lastNonTransparentPct!).toBeLessThanOrEqual(50);
    });
  });

  test.describe('Mobile', () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 800 });
      await page.goto('/');
      await waitForCalendarToLoad(page);
    });

    test('hero stacks vertically: image on top (1/3), text on bottom (2/3)', async ({
      page,
    }) => {
      const hero = page.locator('.hero');
      const heroVisual = page.locator('.hero-visual');
      const heroContent = page.locator('.hero-content');

      await expect(hero).toBeVisible();
      await expect(heroVisual).toBeVisible();
      await expect(heroContent).toBeVisible();

      const heroBox = await hero.boundingBox();
      const visualBox = await heroVisual.boundingBox();
      const contentBox = await heroContent.boundingBox();

      // Image must be above the text content on mobile.
      expect(visualBox!.y).toBeLessThan(contentBox!.y);

      // Image height is roughly one third of the hero height.
      const visualRatio = visualBox!.height / heroBox!.height;
      expect(visualRatio).toBeGreaterThan(0.25);
      expect(visualRatio).toBeLessThan(0.4);

      // Text content takes roughly the bottom two thirds.
      const contentRatio = contentBox!.height / heroBox!.height;
      expect(contentRatio).toBeGreaterThan(0.55);
      expect(contentRatio).toBeLessThan(0.75);
    });

    test('hero spans the full viewport width on mobile', async ({ page }) => {
      const hero = page.locator('.hero');
      await expect(hero).toBeVisible();

      const heroBox = await hero.boundingBox();
      const viewport = page.viewportSize();

      // The hero's outer box should match the viewport width.
      expect(heroBox!.x).toBeLessThanOrEqual(1);
      expect(heroBox!.x + heroBox!.width).toBeGreaterThanOrEqual(viewport!.width - 1);
    });

    test('hero gradient is hidden on mobile (text and image are stacked, not overlaid)', async ({
      page,
    }) => {
      const gradientHidden = await page.evaluate(() => {
        const el = document.querySelector('.hero-visual');
        if (!el) return null;
        return window.getComputedStyle(el, '::after').display;
      });

      // The gradient ::after pseudo is hidden on mobile because the
      // image and text are in separate areas and no longer overlap.
      expect(gradientHidden).toBe('none');
    });
  });
});
