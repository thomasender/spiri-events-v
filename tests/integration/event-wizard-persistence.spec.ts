import { test, expect } from '@playwright/test';
import { signInWithEmailAndPassword, signOut } from '../helpers/auth';
import { waitForWizardToLoad, navigateToStep2, navigateToStep3 } from '../helpers/wizard';

async function fillStep3RequiredFields(page) {
  await page.fill('#date', '2027-04-20');
  await page.fill('#time', '10:00');
  await page.click('.kategorie-select');
  await page.waitForTimeout(300);
  await page.click('.kategorie__option:has-text("Yoga")');
  await page.waitForTimeout(300);
  await page.selectOption('#bezirk', 'Bregenz');
  await page.waitForTimeout(500);
}

test.describe('Event wizard: persist in-progress form across navigation (tw9x8S7Q)', () => {
  test.afterEach(async ({ page }) => {
    await signOut(page);
    await page.evaluate(() => localStorage.clear()).catch(() => {});
  });

  test('restores step 1 fields after navigating away and back', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'user@test.local', 'testpassword123');
    await page.goto('/admin/new');
    await waitForWizardToLoad(page);

    await page.fill('#organizer\\.firstName', 'Persistierter');
    await page.fill('#organizer\\.lastName', 'Tester');
    await page.fill('#kontakt', 'persistenz@example.com');
    await page.waitForTimeout(500);

    await page.goto('/admin');
    await page.waitForTimeout(500);

    await page.goto('/admin/new');
    await waitForWizardToLoad(page);

    await expect(page.locator('#organizer\\.firstName')).toHaveValue('Persistierter');
    await expect(page.locator('#organizer\\.lastName')).toHaveValue('Tester');
    await expect(page.locator('#kontakt')).toHaveValue('persistenz@example.com');
  });

  test('restores step 2 and step 3 fields including current step', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'user@test.local', 'testpassword123');
    await page.goto('/admin/new');
    await waitForWizardToLoad(page);

    await page.fill('#organizer\\.firstName', 'Anna');
    await page.fill('#organizer\\.lastName', 'Weiters');
    await navigateToStep2(page);

    await page.fill('#title', 'Fortgesetztes Event');
    const editor = page.locator('[data-testid="description-editor"] .rte-content');
    await editor.click();
    await editor.fill('Beschreibung, die nicht verloren gehen darf.');
    await navigateToStep3(page);

    await page.fill('#date', '2027-03-15');
    await page.fill('#time', '18:00');
    await page.click('.kategorie-select');
    await page.waitForTimeout(300);
    await page.click('.kategorie__option:has-text("Yoga")');
    await page.waitForTimeout(300);
    await page.selectOption('#bezirk', 'Bregenz');
    await page.waitForTimeout(500);

    await page.goto('/admin');
    await page.waitForTimeout(500);

    await page.goto('/admin/new');
    await waitForWizardToLoad(page);

    await expect(page.locator('label[for="date"]')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#date')).toHaveValue('2027-03-15');
    await expect(page.locator('#time')).toHaveValue('18:00');
    await expect(page.locator('#bezirk')).toHaveValue('Bregenz');

    await page.click('.wizard-actions button:has-text("Zurück")');
    await page.waitForTimeout(500);
    await expect(page.locator('#title')).toHaveValue('Fortgesetztes Event');
  });

  test('clears the localStorage draft after the user saves the event as draft', async ({
    page,
  }) => {
    await signInWithEmailAndPassword(page, 'user@test.local', 'testpassword123');
    await page.goto('/admin/new');
    await waitForWizardToLoad(page);

    await page.fill('#organizer\\.firstName', 'Speicher');
    await page.fill('#organizer\\.lastName', 'Tester');
    await page.fill('#kontakt', 'save@example.com');
    await page.waitForTimeout(500);

    const draftKeyBefore = await page.evaluate(() => {
      const allKeys = Object.keys(localStorage);
      return allKeys.find((k) => k.startsWith('eventWizardDraft:')) || null;
    });
    expect(draftKeyBefore, 'draft should be saved to localStorage after typing').not.toBeNull();

    await navigateToStep2(page);
    await page.fill('#title', 'Entwurf-Test');
    const editor = page.locator('[data-testid="description-editor"] .rte-content');
    await editor.click();
    await editor.fill('Beschreibung.');
    await navigateToStep3(page);

    await fillStep3RequiredFields(page);
    await navigateToStep3(page);

    await page.getByTestId('rights-confirmed-checkbox').check();
    await page.waitForTimeout(500);

    await page.getByTestId('save-as-draft-button').click();

    await page.waitForURL((url) => url.pathname === '/admin', { timeout: 15000 });
    await page.waitForTimeout(500);

    const remainingKey = await page.evaluate(() => {
      const allKeys = Object.keys(localStorage);
      return allKeys.find((k) => k.startsWith('eventWizardDraft:')) || null;
    });
    expect(remainingKey, 'localStorage draft should be cleared after save').toBeNull();
  });

  test('does not leak another users draft into a fresh wizard session', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem(
        'eventWizardDraft:fake-uid-123',
        JSON.stringify({
          version: 1,
          draft: {
            formData: {
              title: 'Geheimer Titel',
              organizer: { firstName: 'X', lastName: 'Y', email: 'x@y.com' },
            },
            currentStep: 2,
            rightsConfirmed: false,
          },
        })
      );
    });

    await signInWithEmailAndPassword(page, 'user@test.local', 'testpassword123');
    await page.goto('/admin/new');
    await waitForWizardToLoad(page);

    await expect(page.locator('#organizer\\.firstName')).not.toHaveValue('X', { timeout: 3000 });
    await expect(page.locator('#title')).not.toBeVisible();
  });
});
