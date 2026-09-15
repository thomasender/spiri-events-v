import { test, expect } from '@playwright/test';

import { waitForWizardToLoad } from '../helpers/wizard';

import { STORAGE_STATE } from '../helpers/roles';

// Signed in as `user` via the session captured once by tests/auth.setup.ts,
// instead of driving the login form in every test.
test.use({ storageState: STORAGE_STATE.user });

/**
 * The draft-storage behaviour itself (versioning, per-uid keys, corrupted
 * payloads, clearing after save) is covered by
 * tests/components/wizardDraftStorage.spec.ts — cheaply and without a browser.
 *
 * What stays here is the one thing a unit test cannot show: that a draft
 * belonging to a *different* uid, sitting in the same browser's localStorage,
 * never bleeds into the wizard of the user who is actually signed in.
 */
test.describe('Event wizard draft isolation between users', () => {
  test.afterEach(async ({ page }) => {
    await page.evaluate(() => localStorage.clear());
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

    await page.goto('/admin/new');
    await waitForWizardToLoad(page);

    await expect(page.locator('#organizer\\.firstName')).not.toHaveValue('X');
    await expect(page.locator('#title')).not.toBeVisible();
  });
});
