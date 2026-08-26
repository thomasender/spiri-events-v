import { test, expect } from '@playwright/test';
import { signInWithEmailAndPassword, signOut } from '../helpers/auth';
import { waitForWizardToLoad, clickWeiter } from '../helpers/wizard';

test.describe('Event wizard: autoscroll to top on step change (psyTNgcZ)', () => {
  test.afterEach(async ({ page }) => {
    await signOut(page);
  });

  test.use({ viewport: { width: 375, height: 700 } });

  async function getContainerOffsetTop(page) {
    return await page.evaluate(() => {
      const el = document.querySelector('.event-form-container');
      if (!el) return null;
      return el.getBoundingClientRect().top + window.scrollY;
    });
  }

  async function getScrollPosition(page) {
    return await page.evaluate(() => ({
      scrollY: window.scrollY,
      containerTop: document.querySelector('.event-form-container')?.getBoundingClientRect().top,
      viewportHeight: window.innerHeight,
    }));
  }

  test('scrolls the wizard back to the top when moving from step 1 to step 2', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin/new');
    await waitForWizardToLoad(page);

    const containerOffsetTop = await getContainerOffsetTop(page);
    expect(containerOffsetTop).not.toBeNull();

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(200);

    const scrolledAway = await page.evaluate(() => window.scrollY);
    expect(scrolledAway).toBeGreaterThan(0);

    await clickWeiter(page);

    await expect(async () => {
      const { scrollY, containerTop } = await getScrollPosition(page);
      expect(scrollY, 'page should scroll so the wizard container is near the top').toBeLessThan(
        containerOffsetTop! + 120
      );
      expect(
        containerTop!,
        'wizard container should be near the top of the viewport (below sticky header)'
      ).toBeLessThan(120);
      expect(containerTop!).toBeGreaterThanOrEqual(0);
    }).toPass({ timeout: 5000 });
  });

  test('scrolls the wizard back to the top when moving from step 2 to step 3', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin/new');
    await waitForWizardToLoad(page);

    await clickWeiter(page);
    await page.fill('#title', 'Autoscroll Test Event');
    const editor = page.locator('[data-testid="description-editor"] .rte-content');
    await editor.click();
    await editor.fill('Beschreibung für den Autoscroll-Test.');

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(200);

    const scrolledAway = await page.evaluate(() => window.scrollY);
    expect(scrolledAway).toBeGreaterThan(0);

    await clickWeiter(page);

    await expect(page.locator('label[for="date"]')).toBeVisible();

    await expect(async () => {
      const { containerTop } = await getScrollPosition(page);
      expect(
        containerTop!,
        'wizard container should be near the top of the viewport (below sticky header)'
      ).toBeLessThan(120);
      expect(containerTop!).toBeGreaterThanOrEqual(0);
    }).toPass({ timeout: 5000 });
  });

  test('does not scroll on initial mount of the wizard', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin/new');
    await waitForWizardToLoad(page);

    const { scrollY, containerTop } = await getScrollPosition(page);
    expect(scrollY, 'page should not have scrolled on initial mount').toBeLessThan(10);
    expect(
      containerTop!,
      'wizard container should be visible near the top on initial mount'
    ).toBeGreaterThanOrEqual(0);
    expect(containerTop!).toBeLessThan(200);
  });
});
