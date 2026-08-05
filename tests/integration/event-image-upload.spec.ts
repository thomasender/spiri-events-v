import { test, expect } from '@playwright/test';
import { signInWithEmailAndPassword, clearEmulatorStorage } from '../helpers/auth';
import { waitForWizardToLoad, navigateToStep2, fillStep1Organizer } from '../helpers/wizard';

test.describe('Event image upload (Firebase Storage)', () => {
  test.beforeAll(async () => {
    await clearEmulatorStorage();
  });

  test('upload area advertises the new 15 MB limit', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin/new');
    await waitForWizardToLoad(page);

    await fillStep1Organizer(page, {
      firstName: 'Test',
      lastName: 'User',
      email: 'admin@test.com',
      kontakt: 'admin@test.com',
    });
    await navigateToStep2(page);

    const uploadArea = page.locator('.image-upload-area');
    await expect(uploadArea).toBeVisible();
    await expect(uploadArea).toContainText('15MB');
  });
});
