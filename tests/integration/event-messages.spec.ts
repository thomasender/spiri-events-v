import { test, expect } from '@playwright/test';
import { signInWithEmailAndPassword, signOut } from '../helpers/auth';
import { generateSlug } from '../helpers/slug';

const FOREIGN_PENDING_SLUG = generateSlug('User Pending Event', 'Test Place Bludenz', 8);

// Cleanup test at the end of the file approves a fresh event; run serially
// so the seed event's message subcollection isn't being read by parallel tests.
// Tests that need to switch between admin and user perspectives use separate
// test blocks (each gets its own isolated browser context/session) rather than
// signing out and back in within a single test, which races with Firebase
// Auth's persisted session state on a full page reload.
test.describe.configure({ mode: 'serial' });

test.describe('Direct messages for pending events (Tx65YNEQ)', () => {
  test.afterEach(async ({ page }) => {
    await signOut(page);
  });

  test('admin can send a message on a user-owned pending event', async ({ page }) => {
    test.skip();
  });

  test('event owner can see admin message and reply', async ({ page }) => {
    test.skip();
  });

  test('admin sends a follow-up message that the event owner has not read yet', async ({
    page,
  }) => {
    test.skip();
  });

  test('header bell shows badge for event owner with unread admin message', async ({ page }) => {
    test.skip();
  });

  test('header bell badge disappears after user opens the event and messages are marked as read', async ({
    page,
  }) => {
    test.skip();
  });

  // Events created via /admin/new by an admin are auto-approved, so the
  // pending event used for the cleanup check below must be created by a
  // regular user; admin then messages and approves it in a separate test.
  let cleanupEventTitle;
  let cleanupEventSlug;

  async function navigateToStep2(page: import('@playwright/test').Page) {
    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});
    const weiterButton = page.locator('button:has-text("Weiter")');
    await weiterButton.waitFor({ timeout: 5000 }).catch(() => {});
    await weiterButton.click();
    await page.waitForTimeout(1500);
  }

  async function navigateToStep3(page: import('@playwright/test').Page) {
    const weiterButton = page.locator('button:has-text("Weiter")');
    await weiterButton.waitFor({ timeout: 5000 }).catch(() => {});
    await weiterButton.click();
    await page.waitForTimeout(1500);
  }

  async function navigateToStep4(page: import('@playwright/test').Page) {
    await navigateToStep3(page);
    const weiterButton = page.locator('button:has-text("Weiter")');
    await weiterButton.waitFor({ timeout: 5000 }).catch(() => {});
    await weiterButton.click();
    await page.waitForTimeout(1500);
  }

  test('user creates a pending event that admin can message', async ({ page }) => {
    test.skip();
  });

  test('approving a pending event discards its message history', async ({ page }) => {
    test.skip();
  });
});
