import { test, expect } from '@playwright/test';
import { spawn } from 'child_process';
import { signInWithEmailAndPassword, signOut } from '../helpers/auth';

async function clearMessageFixtures(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const proc = spawn('node', ['scripts/clear-message-fixtures.mjs'], {
      cwd: process.cwd(),
      stdio: 'ignore',
      shell: true,
    });
    proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`exit ${code}`))));
    proc.on('error', reject);
  });
}

async function seedMessageFixtures(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const proc = spawn('node', ['scripts/reset-message-fixtures.mjs'], {
      cwd: process.cwd(),
      stdio: 'ignore',
      shell: true,
    });
    proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`exit ${code}`))));
    proc.on('error', reject);
  });
}

test.describe('Admin Page tabs (zejdjTnm)', () => {
  test.afterEach(async ({ page }) => {
    await signOut(page);
  });

  test.describe('without messages', () => {
    test.beforeEach(async () => {
      await clearMessageFixtures();
    });

    test('hides the Nachrichten tab when there are no messages', async ({ page }) => {
      await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
      await page.goto('/admin');

      await expect(page.getByTestId('admin-tab-events')).toBeVisible();
      await expect(page.getByTestId('admin-tab-messages')).toHaveCount(0);
    });

    test('falls back to Meine Events when ?tab=messages is requested with no messages', async ({
      page,
    }) => {
      await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
      await page.goto('/admin?tab=messages');

      await expect(page.getByTestId('admin-tab-events')).toHaveAttribute('aria-selected', 'true');
    });

    test('Meine Events is the default active tab on /admin', async ({ page }) => {
      await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
      await page.goto('/admin');

      await expect(page.getByTestId('admin-tab-events')).toHaveAttribute('aria-selected', 'true');
      const eventsPanel = page.locator('#admin-tab-events');
      await expect(eventsPanel).toBeVisible();
    });

    test('switching to Meine Events from a different tab clears the tab query param', async ({
      page,
    }) => {
      await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
      await page.goto('/admin?tab=messages');

      // With no messages, the messages tab is hidden and Meine Events is active.
      await expect(page.getByTestId('admin-tab-events')).toBeVisible();
      expect(page.url()).toContain('tab=messages');

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

  test.describe('with messages', () => {
    test.beforeEach(async () => {
      await seedMessageFixtures();
    });

    test('shows the Meine Events and Nachrichten tabs in the Verwaltung page', async ({ page }) => {
      await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
      await page.goto('/admin');

      await expect(page.getByTestId('admin-tab-events')).toBeVisible();
      await expect(page.getByTestId('admin-tab-messages')).toBeVisible();
      await expect(page.getByTestId('admin-tab-events')).toContainText('Meine Events');
      await expect(page.getByTestId('admin-tab-messages')).toContainText('Nachrichten');
    });

    test('clicking the Nachrichten tab activates it and shows the list', async ({ page }) => {
      await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
      await page.goto('/admin');

      await page.getByTestId('admin-tab-messages').click();

      await expect(page.getByTestId('admin-tab-messages')).toHaveAttribute('aria-selected', 'true');
      await expect(page.getByTestId('admin-tab-events')).toHaveAttribute('aria-selected', 'false');

      const eventsPanel = page.locator('#admin-tab-events');
      const messagesPanel = page.locator('#admin-tab-messages');
      await expect(eventsPanel).toBeHidden();
      await expect(messagesPanel).toBeVisible();

      await expect(page.getByTestId('messages-tab-list')).toBeVisible();
      await expect(page.url()).toContain('tab=messages');
    });
  });
});
