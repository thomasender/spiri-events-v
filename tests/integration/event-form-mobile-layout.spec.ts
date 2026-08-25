import { test, expect } from '@playwright/test';
import { signInWithEmailAndPassword } from '../helpers/auth';
import { waitForWizardToLoad, clickWeiter, fillStep2EventInfo } from '../helpers/wizard';

test.describe('Event creation form: mobile layout', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('keeps date, time and end date inputs inside the form container on mobile', async ({
    page,
  }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin/new');
    await waitForWizardToLoad(page);

    await clickWeiter(page);
    await fillStep2EventInfo(page, {
      title: 'Mobile Layout Test',
      description: 'Beschreibung für den Mobile Layout Test.',
    });
    await clickWeiter(page);

    const container = page.locator('.event-form-container');
    await expect(container).toBeVisible();

    const containerBox = await container.boundingBox();
    expect(containerBox).not.toBeNull();

    for (const id of ['#date', '#time', '#endDate']) {
      const input = page.locator(id);
      await expect(input).toBeVisible();
      const inputBox = await input.boundingBox();
      expect(inputBox).not.toBeNull();

      expect(
        inputBox!.x,
        `${id} should not overflow the container on the left`
      ).toBeGreaterThanOrEqual(containerBox!.x - 1);

      expect(
        inputBox!.x + inputBox!.width,
        `${id} should not overflow the container on the right`
      ).toBeLessThanOrEqual(containerBox!.x + containerBox!.width + 1);
    }
  });

  test('does not introduce horizontal page scroll on mobile', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin/new');
    await waitForWizardToLoad(page);

    await clickWeiter(page);
    await fillStep2EventInfo(page, {
      title: 'Horizontal Scroll Test',
      description: 'Beschreibung für den Horizontal-Scroll-Test.',
    });
    await clickWeiter(page);

    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));

    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
  });

  test('form container width does not exceed viewport minus page padding', async ({ page }) => {
    // Regression test for PPaKdZLW. On iOS Safari the native <input
    // type="date"> has a large intrinsic min-content size; a plain `1fr`
    // grid column (= minmax(auto, 1fr)) lets the form-row grow to fit the
    // input and the whole form overflows the viewport. The form-row must
    // use minmax(0, 1fr) to clamp the column to the available space.
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin/new');
    await waitForWizardToLoad(page);

    await clickWeiter(page);
    await fillStep2EventInfo(page, {
      title: 'Container Width Test',
      description: 'Beschreibung für den Container Width Test.',
    });
    await clickWeiter(page);

    const sizes = await page.evaluate(() => ({
      viewportWidth: window.innerWidth,
      containerWidth: document.querySelector('.event-form-container')?.getBoundingClientRect()
        .width,
      formRowWidth: document.querySelector('.form-row')?.getBoundingClientRect().width,
      dateInputRight: document.querySelector('#date')?.getBoundingClientRect().right,
      containerRight: document.querySelector('.event-form-container')?.getBoundingClientRect()
        .right,
    }));

    // .event-form-page has padding 48px 24px (48px horizontal) and
    // .event-form-container has padding 24px 20px (40px horizontal) on
    // mobile. The container must therefore be at most viewportWidth - 48
    // and the form-row at most viewportWidth - 88.
    expect(sizes.viewportWidth).toBe(375);
    expect(sizes.containerWidth).toBeLessThanOrEqual(sizes.viewportWidth - 48 + 1);
    expect(sizes.formRowWidth).toBeLessThanOrEqual(sizes.viewportWidth - 48 - 40 + 1);
    expect(sizes.dateInputRight).toBeLessThanOrEqual(sizes.containerRight + 1);
  });
});
