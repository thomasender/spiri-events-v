import { test, expect } from '@playwright/test';
import { spawn } from 'child_process';
import { signInWithEmailAndPassword, signOut, waitForCalendarToLoad } from '../helpers/auth';
import { generateSlug } from '../helpers/slug';

const USER_DRAFT_SLUG = generateSlug('User Draft Event', 'User Draft Place Dornbirn', 20);
const USER_PENDING_SLUG = generateSlug('User Pending Event', 'Test Place Bludenz', 8);

function runScript(scriptPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn('node', [scriptPath], { cwd: process.cwd(), stdio: 'ignore', shell: true });
    proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`reset exit ${code}`))));
    proc.on('error', reject);
  });
}

async function resetDraftFixtures(): Promise<void> {
  await runScript('scripts/reset-draft-fixtures.mjs');
}

// admin-event-edit-delete.spec.ts permanently deletes this shared seed fixture as
// part of its delete-flow tests; reset it here so this file passes regardless of
// file execution order.
async function resetUserApprovedEventFixture(): Promise<void> {
  await runScript('scripts/reset-user-approved-event-fixture.mjs');
}

test.describe('Event draft status — read-only (AzGFKWfV)', () => {
  test.beforeEach(async () => {
    await resetUserApprovedEventFixture();
  });

  test.afterEach(async ({ page }) => {
    await signOut(page);
  });

  test('user can see their own draft in Meine Events with Entwurf badge', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'user@test.local', 'testpassword123');
    await page.goto('/admin');

    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    const draftTitle = page.locator('.event-card', { hasText: 'User Draft Event' });
    await expect(draftTitle).toBeVisible({ timeout: 10000 });
    await expect(draftTitle.locator('.status-badge--draft')).toBeVisible();
    await expect(draftTitle.locator('.status-badge--draft')).toBeVisible();
  });

  test('draft shows Einreichen button and does NOT show Genehmigen button', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'user@test.local', 'testpassword123');
    await page.goto('/admin');

    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    const draftCard = page.locator('.event-card', { hasText: 'User Draft Event' });
    await expect(draftCard).toBeVisible({ timeout: 10000 });

    await expect(draftCard.getByTestId('submit-draft-button')).toBeVisible();
    await expect(draftCard.getByText('Genehmigen')).toHaveCount(0);
  });

  test('admin does NOT see drafts in their Meine Events', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin');

    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    const draftTitle = page.locator('.event-card', { hasText: 'User Draft Event' });
    await expect(draftTitle).toHaveCount(0);
  });

  test('status filter shows only events with the selected status (non-admin)', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'user@test.local', 'testpassword123');
    await page.goto('/admin');

    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    await expect(page.locator('.event-card', { hasText: 'User Draft Event' })).toBeVisible({
      timeout: 10000,
    });
    await expect(page.locator('.event-card', { hasText: 'User Approved Event' })).toBeVisible();

    await page.getByTestId('status-filter').selectOption('draft');

    await expect(page.locator('.event-card', { hasText: 'User Draft Event' })).toBeVisible();
    await expect(page.locator('.event-card', { hasText: 'User Approved Event' })).toHaveCount(0);
    await expect(page.locator('.event-card', { hasText: 'User Pending Event' })).toHaveCount(0);
  });

  test('guest cannot view a draft event via slug URL', async ({ page }) => {
    await page.goto(`/event/${USER_DRAFT_SLUG}`);

    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    await expect(page.locator('.event-not-found')).toBeVisible({ timeout: 10000 });
  });

  test('user can view their own draft via slug URL', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'user@test.local', 'testpassword123');

    await page.goto(`/event/${USER_DRAFT_SLUG}`);

    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    await expect(page.locator('.event-not-found')).not.toBeVisible({ timeout: 10000 });
    await expect(page.locator('.event-title')).toContainText('User Draft Event', {
      timeout: 10000,
    });
  });

  test('draft never appears on the public events list (CalendarPage)', async ({ page }) => {
    await page.goto('/');

    await waitForCalendarToLoad(page);

    const eventCards = page.locator('.event-card-public, .event-row');
    const count = await eventCards.count();

    for (let i = 0; i < count; i += 1) {
      const text = await eventCards.nth(i).innerText();
      expect(text).not.toContain('User Draft Event');
    }
  });
});

test.describe.configure({ mode: 'serial' });

test.describe('Event draft status — state transitions (AzGFKWfV)', () => {
  test.beforeEach(async () => {
    await resetDraftFixtures();
  });

  test.afterEach(async ({ page }) => {
    await signOut(page);
    await resetDraftFixtures();
  });

  test('user can submit a draft which then becomes pending', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'user@test.local', 'testpassword123');
    await page.goto('/admin');

    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    const draftCard = page.locator('.event-card', { hasText: 'User Draft Event' });
    await expect(draftCard).toBeVisible({ timeout: 10000 });

    await draftCard.getByTestId('submit-draft-button').click();

    const dialog = page.locator('.confirm-dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: /^einreichen$/i }).click();

    await expect(draftCard.locator('.status-badge--pending')).toBeVisible({ timeout: 10000 });
    await expect(draftCard.locator('.status-badge--draft')).toHaveCount(0);
  });

  test('user can revert a pending event back to draft via Zu Entwurf button', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'user@test.local', 'testpassword123');
    await page.goto('/admin');

    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    const pendingCard = page.locator('.event-card', { hasText: 'User Pending Event' });
    await expect(pendingCard).toBeVisible({ timeout: 10000 });
    await expect(pendingCard.locator('.status-badge--pending')).toBeVisible();

    await pendingCard.getByTestId('revert-to-draft-button').click();

    const dialog = page.locator('.confirm-dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: /zu entwurf/i }).click();

    await expect(pendingCard.locator('.status-badge--draft')).toBeVisible({ timeout: 10000 });
    await expect(pendingCard.locator('.status-badge--pending')).toHaveCount(0);
  });

  test('messages on a reverted-to-draft event are preserved (owner can still see history)', async ({
    page,
  }) => {
    await signInWithEmailAndPassword(page, 'user@test.local', 'testpassword123');

    await page.goto(`/event/${USER_PENDING_SLUG}`);

    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    await expect(page.locator('.event-title')).toContainText('User Pending Event', {
      timeout: 10000,
    });

    await expect(page.getByTestId('event-messages')).toBeVisible();

    await page.goto('/admin');

    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    const pendingCard = page.locator('.event-card', { hasText: 'User Pending Event' });
    await expect(pendingCard).toBeVisible({ timeout: 10000 });

    await pendingCard.getByTestId('revert-to-draft-button').click();

    const dialog = page.locator('.confirm-dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: /zu entwurf/i }).click();

    await expect(pendingCard.locator('.status-badge--draft')).toBeVisible({ timeout: 10000 });

    await page.goto(`/event/${USER_PENDING_SLUG}`);

    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    await expect(page.locator('.event-title')).toContainText('User Pending Event', {
      timeout: 10000,
    });

    await expect(page.getByTestId('event-messages')).toBeVisible();
  });
});
