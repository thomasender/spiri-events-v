import { test, expect } from '@playwright/test';
import { signInWithEmailAndPassword, signOut } from '../helpers/auth';
import {
  waitForWizardToLoad,
  navigateToStep2,
  navigateToStep3,
  navigateToStep4,
  fillStep2EventInfo,
  fillStep3Details,
} from '../helpers/wizard';

function getFutureDate(daysAhead: number): string {
  const future = new Date();
  future.setDate(future.getDate() + daysAhead);
  return future.toISOString().split('T')[0];
}

async function fillRequiredStep3Fields(page: import('@playwright/test').Page, title: string) {
  const unique = title.replace(/[^a-z0-9]/gi, '').toLowerCase();
  await fillStep3Details(page, {
    date: getFutureDate(45),
    time: '10:00',
    place: `Test Place ${unique}`,
    contribution: 'fee',
    fee: '40',
  });
  await page.selectOption('#bezirk', 'Bregenz');
  await page.click('.kategorie-select');
  await page.waitForTimeout(300);
  await page.click('.kategorie__option:has-text("Yoga")');
  await page.waitForTimeout(300);
}

test.describe('Event wizard: currency selector for fee', () => {
  test.afterEach(async ({ page }) => {
    await signOut(page);
  });

  test('currency selector is hidden until "Gebühr" is selected', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin/new');
    await waitForWizardToLoad(page);

    await navigateToStep2(page);
    await fillStep2EventInfo(page, {
      title: 'Währung Default Sichtbarkeit',
      description: 'Prüft, dass die Währung erst bei Gebühr sichtbar ist.',
    });
    await navigateToStep3(page);

    await expect(page.getByTestId('price-currency-select')).toHaveCount(0);

    await page.click('.radio-label:has-text("Gebühr")');
    await expect(page.getByTestId('price-currency-select')).toBeVisible();
    await expect(page.getByTestId('price-currency-select')).toHaveValue('EUR');
  });

  test('user can pick CHF in the wizard and the summary reflects it', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin/new');
    await waitForWizardToLoad(page);

    await navigateToStep2(page);
    await fillStep2EventInfo(page, {
      title: 'CHF Event aus Wizard',
      description: 'Test, dass CHF korrekt im Formular gespeichert wird.',
    });
    await navigateToStep3(page);

    await fillRequiredStep3Fields(page, 'CHF Event aus Wizard');
    await page.getByTestId('price-currency-select').selectOption('CHF');
    await navigateToStep4(page);

    await expect(page.locator('.summary-section').filter({ hasText: 'Details' })).toContainText(
      'Gebühr: 40 CHF'
    );
  });

  test('default currency is EUR when the event is created', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin/new');
    await waitForWizardToLoad(page);

    await navigateToStep2(page);
    await fillStep2EventInfo(page, {
      title: 'EUR Default Event',
      description: 'Test, dass EUR als Default gesetzt ist.',
    });
    await navigateToStep3(page);

    await fillRequiredStep3Fields(page, 'EUR Default Event');
    await navigateToStep4(page);

    await expect(page.locator('.summary-section').filter({ hasText: 'Details' })).toContainText(
      'Gebühr: 40 €'
    );
  });
});
