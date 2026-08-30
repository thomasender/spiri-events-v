import { test, expect } from '@playwright/test';
import { signInWithEmailAndPassword, signOut } from '../helpers/auth';
import {
  waitForWizardToLoad,
  navigateToStep2,
  navigateToStep3,
  fillStep2EventInfo,
} from '../helpers/wizard';

const STYLED_PROPS = [
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'borderTopWidth',
  'borderTopColor',
  'borderTopStyle',
  'borderBottomWidth',
  'borderBottomColor',
  'borderBottomStyle',
  'borderRadius',
  'backgroundColor',
  'color',
  'width',
] as const;

async function readStyles(
  locator: ReturnType<typeof import('@playwright/test').Page.prototype.locator>
) {
  return locator.evaluate((el, props) => {
    const cs = window.getComputedStyle(el);
    return (props as readonly string[]).reduce<Record<string, string>>((acc, prop) => {
      acc[prop] = (cs as unknown as Record<string, string>)[prop];
      return acc;
    }, {});
  }, STYLED_PROPS);
}

test.describe('Event wizard: fee (price) input matches the shared form input styling (X19Kz735)', () => {
  test.afterEach(async ({ page }) => {
    await signOut(page);
  });

  test('fee number input renders with the same styling as the place text input', async ({
    page,
  }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin/new');
    await waitForWizardToLoad(page);

    await navigateToStep2(page);
    await fillStep2EventInfo(page, {
      title: 'Preisfeld Formatierung Test',
      description: 'Stellt sicher, dass das Preisfeld gleich formatiert ist.',
    });
    await navigateToStep3(page);

    const place = page.locator('#place');
    const fee = page.locator('#fee');

    await expect(place).toBeVisible();

    await page.click('.radio-label:has-text("Gebühr")');
    await page.waitForTimeout(200);
    await expect(fee).toBeVisible();

    const [placeStyles, feeStyles] = await Promise.all([readStyles(place), readStyles(fee)]);

    for (const prop of STYLED_PROPS) {
      expect(feeStyles[prop], `fee.${prop} should match place.${prop}`).toBe(placeStyles[prop]);
    }
  });
});
