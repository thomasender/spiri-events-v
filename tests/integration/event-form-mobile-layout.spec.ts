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
});
