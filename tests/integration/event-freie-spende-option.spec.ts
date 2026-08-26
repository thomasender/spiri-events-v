import { test, expect } from '@playwright/test';
import { signInWithEmailAndPassword } from '../helpers/auth';
import { waitForWizardToLoad, clickWeiter, fillStep2EventInfo } from '../helpers/wizard';

test.describe('Event wizard: Freie Spende Option', () => {
  test('contribution radio group offers a "Freie Spende" option on Step 3', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin/new');
    await waitForWizardToLoad(page);

    await clickWeiter(page);
    await fillStep2EventInfo(page, {
      title: 'Freie Spende Sichtbarkeit',
      description: 'Testet, dass die neue Option sichtbar ist.',
    });
    await clickWeiter(page);

    const kostenlos = page.locator('.radio-label:has-text("Kostenlos")');
    const gebuehr = page.locator('.radio-label:has-text("Gebühr")');
    const freieSpende = page.locator('.radio-label:has-text("Freie Spende")');

    await expect(kostenlos).toBeVisible();
    await expect(gebuehr).toBeVisible();
    await expect(freieSpende).toBeVisible();
  });

  test('selecting "Freie Spende" hides the fee input', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin/new');
    await waitForWizardToLoad(page);

    await clickWeiter(page);
    await fillStep2EventInfo(page, {
      title: 'Spende Test Event',
      description: 'Beschreibung für den Spende-Test.',
    });
    await clickWeiter(page);

    await expect(page.locator('input[name="fee"]')).toHaveCount(0);

    await page.click('.radio-label:has-text("Freie Spende")');
    await expect(page.locator('input[name="fee"]')).toHaveCount(0);
  });

  test('user can switch between "Gebühr" and "Freie Spende" without leaving required fields', async ({
    page,
  }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin/new');
    await waitForWizardToLoad(page);

    await clickWeiter(page);
    await fillStep2EventInfo(page, {
      title: 'Wechsel Test Event',
      description: 'Beschreibung für den Wechsel-Test.',
    });
    await clickWeiter(page);

    await page.click('.radio-label:has-text("Gebühr")');
    await expect(page.locator('#fee')).toBeVisible();

    await page.click('.radio-label:has-text("Freie Spende")');
    await expect(page.locator('input[name="fee"]')).toHaveCount(0);

    await page.click('.radio-label:has-text("Kostenlos")');
    await expect(page.locator('input[name="fee"]')).toHaveCount(0);
  });

  test('switching from "Freie Spende" to "Gebühr" reveals the fee input again', async ({
    page,
  }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin/new');
    await waitForWizardToLoad(page);

    await clickWeiter(page);
    await fillStep2EventInfo(page, {
      title: 'Zurueck zu Gebuehr',
      description: 'Beschreibung für den Rück-zu-Gebühr-Test.',
    });
    await clickWeiter(page);

    await page.click('.radio-label:has-text("Freie Spende")');
    await expect(page.locator('input[name="fee"]')).toHaveCount(0);

    await page.click('.radio-label:has-text("Gebühr")');
    await expect(page.locator('#fee')).toBeVisible();
  });
});
