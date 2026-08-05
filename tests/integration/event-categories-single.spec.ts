import { test, expect } from '@playwright/test';
import { signInWithEmailAndPassword } from '../helpers/auth';

test.describe('Event form: single category only', () => {
  test('selecting a category replaces any previous selection', async ({ page }) => {
    test.skip();
  });

  test('saved event has exactly one category persisted in Firestore', async ({ page }) => {
    test.skip();
  });
});
