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
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');

    await page.goto(`/event/${FOREIGN_PENDING_SLUG}`);

    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    await expect(page.locator('.event-title')).toContainText('User Pending Event', {
      timeout: 10000,
    });

    await expect(page.getByTestId('event-messages')).toBeVisible();

    const messageText = 'Bitte korrigiere die Uhrzeit auf 16:00 Uhr.';
    await page.getByTestId('event-message-input').fill(messageText);
    await page.getByTestId('event-message-send').click();

    await expect(page.getByTestId('event-message').filter({ hasText: messageText })).toBeVisible({
      timeout: 10000,
    });
    await page.waitForTimeout(3000);
  });

  test('event owner can see admin message and reply', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'user@test.local', 'testpassword123');

    await page.goto(`/event/${FOREIGN_PENDING_SLUG}`);

    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    await expect(page.getByTestId('event-messages')).toBeVisible();
    await expect(
      page
        .getByTestId('event-message')
        .filter({ hasText: 'Bitte korrigiere die Uhrzeit auf 16:00 Uhr.' })
    ).toBeVisible({ timeout: 10000 });

    const reply = `Antwort vom Veranstalter ${Date.now()}`;
    await page.getByTestId('event-message-input').fill(reply);
    await page.getByTestId('event-message-send').click();

    await expect(page.getByTestId('event-message').filter({ hasText: reply })).toBeVisible({
      timeout: 10000,
    });
  });

  test('admin sends a follow-up message that the event owner has not read yet', async ({
    page,
  }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');

    await page.goto(`/event/${FOREIGN_PENDING_SLUG}`);

    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    const message = `Bitte überarbeite das Event ${Date.now()}`;
    await page.getByTestId('event-message-input').fill(message);
    await page.getByTestId('event-message-send').click();
    await expect(page.getByTestId('event-message').filter({ hasText: message })).toBeVisible({
      timeout: 10000,
    });
    await page.waitForTimeout(2000);
  });

  test('header bell shows badge for event owner with unread admin message', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'user@test.local', 'testpassword123');

    await page.goto('/');
    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    await expect(page.locator('.nav-desktop').getByTestId('notification-bell')).toBeVisible();
    await expect(page.locator('.nav-desktop').getByTestId('notification-bell-badge')).toBeVisible();
  });

  test('header bell badge disappears after user opens the event and messages are marked as read', async ({
    page,
  }) => {
    await signInWithEmailAndPassword(page, 'user@test.local', 'testpassword123');

    await page.goto(`/event/${FOREIGN_PENDING_SLUG}`);

    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    await expect(page.getByTestId('event-messages')).toBeVisible();

    await page.waitForTimeout(2500);

    await page.goto('/');
    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    await expect(page.locator('.nav-desktop').getByTestId('notification-bell')).toBeVisible();
    await expect(page.locator('.nav-desktop').getByTestId('notification-bell-badge')).toHaveCount(
      0
    );
  });

  // Events created via /admin/new by an admin are auto-approved, so the
  // pending event used for the cleanup check below must be created by a
  // regular user; admin then messages and approves it in a separate test.
  let cleanupEventTitle;
  let cleanupEventSlug;

  test('user creates a pending event that admin can message', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'user@test.local', 'testpassword123');

    await page.goto('/admin/new');
    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    cleanupEventTitle = `Cleanup Test Event ${Date.now()}`;
    await page.fill('input[name="title"]', cleanupEventTitle);
    await page.fill('input[name="date"]', '2027-03-15');
    await page.fill('input[name="place"]', 'Test Place Cleanup');
    await page.selectOption('select[name="bezirk"]', 'Bregenz');

    await page.locator('.kategorie-select').click();
    await page.waitForTimeout(500);
    await page.locator('.kategorie__menu').locator('*').first().click();
    await page.waitForTimeout(300);

    await page
      .locator('form')
      .evaluate((form) =>
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      );

    await page.getByRole('button', { name: 'Einreichen', exact: true }).click();

    await page.waitForURL('/admin', { timeout: 15000 });
    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    const pendingCard = page.locator('.event-card').filter({ hasText: cleanupEventTitle }).first();
    await pendingCard.waitFor({ timeout: 10000 });

    const detailLink = pendingCard.locator('a[href^="/event/"]').first();
    const detailHref = await detailLink.getAttribute('href');
    cleanupEventSlug = detailHref.replace('/event/', '');
    await page.waitForTimeout(2000);
  });

  test('approving a pending event discards its message history', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');

    await page.goto(`/event/${cleanupEventSlug}`);
    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    const message = `Cleanup test ${Date.now()}`;
    await page.getByTestId('event-message-input').fill(message);
    await page.getByTestId('event-message-send').click();
    await expect(page.getByTestId('event-message').filter({ hasText: message })).toBeVisible({
      timeout: 10000,
    });
    await page.waitForTimeout(2000);

    await page.goto('/admin');
    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    const cardToApprove = page
      .locator('.event-card')
      .filter({ hasText: cleanupEventTitle })
      .first();
    await cardToApprove.waitFor({ timeout: 10000 });
    await cardToApprove.getByRole('button', { name: /genehmigen/i }).click();

    await page.waitForTimeout(2000);

    await page.goto(`/event/${cleanupEventSlug}`);

    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    await expect(page.getByTestId('event-messages')).toHaveCount(0);
    await expect(page.getByTestId('event-message').filter({ hasText: message })).toHaveCount(0);
  });
});
