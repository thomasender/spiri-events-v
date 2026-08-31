import { test, expect } from '@playwright/test';
import { spawn } from 'child_process';
import { signInWithEmailAndPassword, signOut } from '../helpers/auth';
import { generateSlug } from '../helpers/slug';

async function resetDraftFixtures(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const proc = spawn('node', ['scripts/reset-draft-fixtures.mjs'], {
      cwd: process.cwd(),
      stdio: 'ignore',
      shell: true,
    });
    proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`reset exit ${code}`))));
    proc.on('error', reject);
  });
}

test.describe.configure({ mode: 'serial' });

test.describe('Entwürfe tab — admin (Bslx5TQW)', () => {
  test.beforeEach(async () => {
    await resetDraftFixtures();
  });

  test.afterEach(async ({ page }) => {
    await signOut(page);
    await resetDraftFixtures();
  });

  test('admin sees the Entwürfe tab next to Meine Events', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin');

    const draftsTab = page.getByTestId('admin-tab-drafts');
    await expect(draftsTab).toBeVisible();
    await expect(draftsTab).toContainText('Entwürfe');
  });

  test('draft tab is hidden by default and Meine Events tab is active', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin');

    const draftsPanel = page.locator('#admin-tab-drafts');
    const eventsPanel = page.locator('#admin-tab-events');
    await expect(eventsPanel).toBeVisible();
    await expect(draftsPanel).toBeHidden();

    await expect(page.getByTestId('admin-tab-drafts')).toHaveAttribute('aria-selected', 'false');
    await expect(page.getByTestId('admin-tab-events')).toHaveAttribute('aria-selected', 'true');
  });

  test('admin sees own drafts in the Entwürfe tab with the Entwurf badge', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin?tab=drafts');

    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    const draftCard = page.locator('.event-card', { hasText: 'Admin Draft Event' });
    await expect(draftCard).toBeVisible({ timeout: 10000 });
    await expect(draftCard.locator('.status-badge--draft')).toBeVisible();
    await expect(draftCard.getByText('Entwurf — noch nicht eingereicht')).toBeVisible();
  });

  test('admin does NOT see drafts in the Meine Events tab (regression for filter behavior)', async ({
    page,
  }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin');

    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    const adminDraft = page.locator('.event-card', { hasText: 'Admin Draft Event' });
    await expect(adminDraft).toHaveCount(0);
  });

  test('draft tab badge shows the count of drafts for the current user', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin');

    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    const badge = page.getByTestId('admin-tab-drafts-badge');
    await expect(badge).toBeVisible();
    await expect(badge).toHaveText('2');
  });

  test('clicking the Duplizieren button creates a copy of the draft as a new draft', async ({
    page,
  }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin?tab=drafts');

    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    const originalCard = page.locator('.event-card', { hasText: 'Admin Draft Event' });
    await expect(originalCard).toBeVisible({ timeout: 10000 });
    await expect(originalCard.getByTestId('duplicate-event-button')).toBeVisible();

    await originalCard.getByTestId('duplicate-event-button').click();

    await expect(page.locator('.event-card', { hasText: 'Admin Draft Event' })).toHaveCount(2, {
      timeout: 10000,
    });
  });

  test('duplicating a draft preserves the original (does not delete or modify it)', async ({
    page,
  }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin?tab=drafts');

    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    const secondDraft = page.locator('.event-card', { hasText: 'Second Admin Draft' });
    await expect(secondDraft).toBeVisible({ timeout: 10000 });

    await secondDraft.getByTestId('duplicate-event-button').click();

    await expect(page.locator('.event-card', { hasText: 'Second Admin Draft' })).toHaveCount(2, {
      timeout: 10000,
    });
  });

  test('admin can submit a draft from the Entwürfe tab and it disappears (becomes pending)', async ({
    page,
  }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin?tab=drafts');

    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    const draftCard = page.locator('.event-card', { hasText: 'Admin Draft Event' });
    await expect(draftCard).toBeVisible({ timeout: 10000 });

    await draftCard.getByTestId('submit-draft-button').click();

    const dialog = page.locator('.confirm-dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: /^einreichen$/i }).click();

    await expect(draftCard).toHaveCount(0, { timeout: 10000 });
  });

  test('admin can delete a draft from the Entwürfe tab', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin?tab=drafts');

    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    const draftCard = page.locator('.event-card', { hasText: 'Second Admin Draft' });
    await expect(draftCard).toBeVisible({ timeout: 10000 });

    await draftCard.getByRole('button', { name: /event löschen/i }).click();

    const dialog = page.locator('.confirm-dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: /^löschen$/i }).click();

    await expect(draftCard).toHaveCount(0, { timeout: 10000 });
  });

  test('switching to drafts tab via URL ?tab=drafts activates the Entwürfe tab', async ({
    page,
  }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin?tab=drafts');

    await expect(page.getByTestId('admin-tab-drafts')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('admin-tab-events')).toHaveAttribute('aria-selected', 'false');

    const draftsPanel = page.locator('#admin-tab-drafts');
    const eventsPanel = page.locator('#admin-tab-events');
    await expect(draftsPanel).toBeVisible();
    await expect(eventsPanel).toBeHidden();

    await expect(page.url()).toContain('tab=drafts');
  });
});

test.describe('Entwürfe tab — regular user (Bslx5TQW)', () => {
  test.beforeEach(async () => {
    await resetDraftFixtures();
  });

  test.afterEach(async ({ page }) => {
    await signOut(page);
    await resetDraftFixtures();
  });

  test('user sees the Entwürfe tab and their own draft', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'user@test.local', 'testpassword123');
    await page.goto('/admin?tab=drafts');

    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    const draftCard = page.locator('.event-card', { hasText: 'User Draft Event' });
    await expect(draftCard).toBeVisible({ timeout: 10000 });
    await expect(draftCard.locator('.status-badge--draft')).toBeVisible();
  });

  test('user does NOT see admin-owned drafts in their Entwürfe tab', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'user@test.local', 'testpassword123');
    await page.goto('/admin?tab=drafts');

    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    await expect(page.locator('.event-card', { hasText: 'Admin Draft Event' })).toHaveCount(0);
  });

  test('user can duplicate their own draft', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'user@test.local', 'testpassword123');
    await page.goto('/admin?tab=drafts');

    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    const draftCard = page.locator('.event-card', { hasText: 'User Draft Event' });
    await expect(draftCard).toBeVisible({ timeout: 10000 });
    await expect(draftCard.getByTestId('duplicate-event-button')).toBeVisible();

    await draftCard.getByTestId('duplicate-event-button').click();

    await expect(page.locator('.event-card', { hasText: 'User Draft Event' })).toHaveCount(2, {
      timeout: 10000,
    });
  });
});
