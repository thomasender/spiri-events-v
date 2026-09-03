import { test, expect } from '@playwright/test';
import { signInWithEmailAndPassword } from '../helpers/auth';
import { waitForWizardToLoad, clickWeiter, fillStep2EventInfo } from '../helpers/wizard';

// Three viewports covering Peter Mathis' report: he tested on his iPhone,
// which never went below 375px wide. The 320px case catches older
// devices and the iPhone SE 1st gen.
const MOBILE_VIEWPORTS = [
  { width: 320, height: 568 },
  { width: 375, height: 667 },
  { width: 390, height: 844 },
];

async function measureWizardStep3Layout(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const container = document.querySelector('.event-form-container');
    if (!container) return null;
    const containerRect = container.getBoundingClientRect();

    const measure = (el: Element) => {
      const rect = el.getBoundingClientRect();
      return { x: rect.x, right: rect.right, width: rect.width };
    };

    const inputs = (['#date', '#time', '#endDate'] as const)
      .map((id) => document.querySelector(id))
      .filter((el): el is HTMLElement => el instanceof HTMLElement)
      .map((el) => ({ id: el.id, rect: measure(el) }));

    const labelRows = Array.from(document.querySelectorAll('.input-label-row')).map((row) => {
      const labelText = row.querySelector('label')?.textContent?.trim() ?? '';
      return { label: labelText.slice(0, 24), rect: measure(row) };
    });

    return {
      container: measure(container),
      inputs,
      labelRows,
      viewport: { width: window.innerWidth },
      htmlScrollWidth: document.documentElement.scrollWidth,
    };
  });
}

test.describe('Event wizard: mobile layout (PPaKdZLW)', () => {
  MOBILE_VIEWPORTS.forEach((viewport) => {
    test(`step-3 inputs stay inside the form container at ${viewport.width}x${viewport.height}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
      await page.goto('/admin/new');
      await waitForWizardToLoad(page);

      await clickWeiter(page);
      await fillStep2EventInfo(page, {
        title: 'PPaKdZLW Mobile Layout',
        description: 'Beschreibung für den PPaKdZLW Mobile Layout Test.',
      });
      await clickWeiter(page);

      const layout = await measureWizardStep3Layout(page);
      expect(layout).not.toBeNull();

      const { x: containerX, right: containerRight } = layout!.container;

      for (const input of layout!.inputs) {
        expect(
          input.rect.x,
          `#${input.id} should not start outside the container's left edge`
        ).toBeGreaterThanOrEqual(containerX - 1);
        expect(
          input.rect.right,
          `#${input.id} should not overflow the container on the right`
        ).toBeLessThanOrEqual(containerRight + 1);
      }
    });

    test(`step-3 label rows do not overflow the container at ${viewport.width}x${viewport.height}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
      await page.goto('/admin/new');
      await waitForWizardToLoad(page);

      await clickWeiter(page);
      await fillStep2EventInfo(page, {
        title: 'PPaKdZLW Label Row',
        description: 'Beschreibung für den Label-Row-Test.',
      });
      await clickWeiter(page);

      const layout = await measureWizardStep3Layout(page);
      expect(layout).not.toBeNull();

      for (const row of layout!.labelRows) {
        expect(
          row.rect.right,
          `.input-label-row (${row.label}) should not overflow the container`
        ).toBeLessThanOrEqual(layout!.container.right + 1);
      }
    });

    test(`step-3 does not introduce horizontal page scroll at ${viewport.width}x${viewport.height}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
      await page.goto('/admin/new');
      await waitForWizardToLoad(page);

      await clickWeiter(page);
      await fillStep2EventInfo(page, {
        title: 'PPaKdZLW No H-Scroll',
        description: 'Beschreibung für den Horizontal-Scroll-Test.',
      });
      await clickWeiter(page);

      const layout = await measureWizardStep3Layout(page);
      expect(layout).not.toBeNull();

      expect(
        layout!.htmlScrollWidth,
        'document scrollWidth should not exceed the viewport width'
      ).toBeLessThanOrEqual(layout!.viewport.width + 1);
    });
  });
});
