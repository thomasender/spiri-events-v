import { test, expect } from '@playwright/test';

test.describe('Hero feature slider', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('renders exactly one active slide at a time', async ({ page }) => {
    const slider = page.locator('section.hero [data-testid="hero-features-slider"]');
    await expect(slider).toBeVisible();

    const slides = page.locator('section.hero [data-testid="hero-feature-slide"]');
    await expect(slides).toHaveCount(4);

    // Exactly one slide should be marked active and visible on first render.
    const activeSlides = page.locator('section.hero [data-testid="hero-feature-slide"].is-active');
    await expect(activeSlides).toHaveCount(1);

    const visibleSlides = page.locator(
      'section.hero [data-testid="hero-feature-slide"][aria-hidden="false"]'
    );
    await expect(visibleSlides).toHaveCount(1);
  });

  test('uses the waldgrün background and light text for contrast', async ({ page }) => {
    const slider = page.locator('section.hero [data-testid="hero-features-slider"]');
    await expect(slider).toBeVisible();

    const styles = await slider.evaluate((el) => {
      const computed = window.getComputedStyle(el);
      return {
        backgroundColor: computed.backgroundColor,
        color: computed.color,
      };
    });

    // #5C6B3F waldgrün
    expect(styles.backgroundColor).toBe('rgb(92, 107, 63)');
    // Light text/icon color comes from --bg-primary (#f4f2f0)
    expect(styles.color).toBe('rgb(244, 242, 240)');
  });

  test('auto-advances to the next slide every 4 seconds', async ({ page }) => {
    const slides = page.locator('section.hero [data-testid="hero-feature-slide"]');
    await expect(slides).toHaveCount(4);

    // Wait long enough for the auto-rotate to fire (4s interval + a small
    // buffer for the React state update + transition).
    // Poll for a change in the active index rather than asserting at a
    // fixed wall-clock time — keeps the test stable across slow CI machines.
    await expect
      .poll(async () => (await slides.nth(1).getAttribute('class'))?.includes('is-active'), {
        message: 'slide 1 should become active within ~5s',
        timeout: 6000,
        intervals: [200, 400, 800, 1000],
      })
      .toBe(true);

    // Once slide 1 is active, slide 0 should no longer be active.
    await expect(slides.nth(0)).not.toHaveClass(/is-active/);
    await expect(slides.nth(1)).toHaveClass(/is-active/);
  });

  test('does not expose user controls — users cannot swipe or click through', async ({ page }) => {
    const slider = page.locator('section.hero [data-testid="hero-features-slider"]');
    await expect(slider).toBeVisible();

    // No buttons, links, or inputs should be inside the slider that would
    // let a user manually navigate between slides.
    const interactiveControls = slider.locator('button, a, input, [role="button"]');
    await expect(interactiveControls).toHaveCount(0);

    // Tapping the slider must not change the active slide. We use a mouse
    // click here (which works on both desktop Chromium and mobile WebKit)
    // rather than a touch tap, because the desktop Chromium project runs
    // without `hasTouch` and would reject `page.touchscreen.*` calls.
    const activeBefore = await page
      .locator('section.hero [data-testid="hero-feature-slide"].is-active')
      .first()
      .getAttribute('data-slide-index');

    const box = await slider.boundingBox();
    expect(box).not.toBeNull();

    await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);

    // Allow a brief window for any rogue handler to react; the active slide
    // index should not change in response to a click.
    await page.waitForTimeout(500);

    const activeAfter = await page
      .locator('section.hero [data-testid="hero-feature-slide"].is-active')
      .first()
      .getAttribute('data-slide-index');

    expect(activeAfter).toBe(activeBefore);
  });

  test('page-layout uses width 100% with max-width 85vw', async ({ page }) => {
    const pageLayout = page.locator('.page-layout').first();
    await expect(pageLayout).toBeVisible();

    const styles = await pageLayout.evaluate((el) => {
      const computed = window.getComputedStyle(el);
      return {
        width: computed.width,
        maxWidth: computed.maxWidth,
      };
    });

    // max-width: 85vw — assert it matches 85% of the viewport width.
    const viewportWidth = page.viewportSize()!.width;
    const expectedMaxWidth = Math.round(viewportWidth * 0.85);
    expect(Math.round(parseFloat(styles.maxWidth))).toBe(expectedMaxWidth);
    // width: 100% — should resolve to the full available width of the parent
    // (which on desktop is the full viewport width since the layout has no
    // outer wrapper with a constrained width).
    expect(parseFloat(styles.width)).toBeGreaterThanOrEqual(expectedMaxWidth - 1);
  });
});
