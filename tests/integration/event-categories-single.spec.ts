import { test, expect } from '@playwright/test';
import { signInWithEmailAndPassword } from '../helpers/auth';
import { waitForWizardToLoad, navigateToStep2, fillStep1Organizer } from '../helpers/wizard';

test.describe('Event form: single category only', () => {
  test.skip('selecting a category replaces any previous selection', async ({ page }) => {
    test.skip();
  });

  test.skip('saved event has exactly one category persisted in Firestore', async ({ page }) => {
    test.skip();
  });
});
