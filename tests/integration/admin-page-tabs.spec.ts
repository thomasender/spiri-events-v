import { test, expect } from '@playwright/test';
import { signInWithEmailAndPassword, signOut } from '../helpers/auth';

test.describe('Admin Page tabs (zejdjTnm)', () => {
  test.afterEach(async ({ page }) => {
    await signOut(page);
  });

  test('shows the Meine Events and Nachrichten tabs in the Verwaltung page', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin');

    await expect(page.getByTestId('admin-tab-events')).toBeVisible();
    await expect(page.getByTestId('admin-tab-messages')).toBeVisible();
    await expect(page.getByTestId('admin-tab-events')).toContainText('Meine Events');
    await expect(page.getByTestId('admin-tab-messages')).toContainText('Nachrichten');
  });

  test('Meine Events is the default active tab on /admin', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin');

    await expect(page.getByTestId('admin-tab-events')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('admin-tab-messages')).toHaveAttribute('aria-selected', 'false');

    const eventsPanel = page.locator('#admin-tab-events');
    const messagesPanel = page.locator('#admin-tab-messages');
    await expect(eventsPanel).toBeVisible();
    await expect(messagesPanel).toBeHidden();
  });

  test('clicking the Nachrichten tab activates it and shows the empty state', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin');

    await page.getByTestId('admin-tab-messages').click();

    await expect(page.getByTestId('admin-tab-messages')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('admin-tab-events')).toHaveAttribute('aria-selected', 'false');

    const eventsPanel = page.locator('#admin-tab-events');
    const messagesPanel = page.locator('#admin-tab-messages');
    await expect(eventsPanel).toBeHidden();
    await expect(messagesPanel).toBeVisible();

    await expect(page.getByTestId('messages-tab-empty')).toBeVisible();
    await expect(page.url()).toContain('tab=messages');
  });

  test('switching back to Meine Events clears the tab query param', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin?tab=messages');

    await expect(page.getByTestId('messages-tab-empty')).toBeVisible();

    await page.getByTestId('admin-tab-events').click();

    await expect(page.getByTestId('admin-tab-events')).toHaveAttribute('aria-selected', 'true');
    expect(page.url()).not.toContain('tab=messages');
  });

  test('Verwaltung nav link has no unread badge when there are no unread messages', async ({
    page,
  }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin');

    await expect(page.getByTestId('verwaltung-unread-badge')).toHaveCount(0);
  });

  test('header no longer has a Nachrichten nav link', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin');

    const bell = page.getByTestId('notification-bell');
    await expect(bell).toHaveCount(0);

    const navLinks = page.locator('.nav-link');
    const labels = await navLinks.allInnerTexts();
    expect(labels.join(' ')).not.toContain('Nachrichten');
  });
});
