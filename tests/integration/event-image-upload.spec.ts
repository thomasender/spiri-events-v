import { test, expect } from '@playwright/test';
import { signInWithEmailAndPassword, clearEmulatorStorage } from '../helpers/auth';

test.describe('Event image upload (Firebase Storage)', () => {
  test.beforeAll(async () => {
    await clearEmulatorStorage();
  });

  test('upload area advertises the new 15 MB limit', async ({ page }) => {
    test.skip();
  });

  test('admin can upload a real generated JPEG and event ends up with a Firebase Storage imageUrl', async ({
    page,
  }) => {
    test.skip();
  });
});
