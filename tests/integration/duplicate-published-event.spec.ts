import { test, expect } from '@playwright/test';
import { spawn } from 'child_process';
import { signInWithEmailAndPassword, signOut } from '../helpers/auth';

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

async function resetUserApprovedEventFixture(): Promise<void> {
  await runScript('scripts/reset-user-approved-event-fixture.mjs');
}

test.describe.configure({ mode: 'serial' });

test.describe('Duplizieren von bereits veröffentlichten Events (wgC6f0pK)', () => {
  test.beforeEach(async () => {
    await resetDraftFixtures();
    await resetUserApprovedEventFixture();
  });

  test.afterEach(async ({ page }) => {
    await signOut(page);
    await resetDraftFixtures();
    await resetUserApprovedEventFixture();
  });

  test('user can duplicate their own approved event from Meine Events', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'user@test.local', 'testpassword123');
    await page.goto('/admin');

    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    const approvedCard = page.locator('.event-card', { hasText: 'User Approved Event' });
    await expect(approvedCard).toBeVisible({ timeout: 10000 });
    await expect(approvedCard.getByTestId('duplicate-event-button')).toBeVisible();

    await approvedCard.getByTestId('duplicate-event-button').click();

    await expect(approvedCard.locator('.status-badge--approved')).toBeVisible();

    await page.getByTestId('admin-tab-drafts').click();
    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    const draftCards = page.locator('.event-card', { hasText: 'User Approved Event' });
    await expect(draftCards).toHaveCount(1, { timeout: 10000 });
    await expect(draftCards.first().locator('.status-badge--draft')).toBeVisible();
  });

  test('duplicating an approved event preserves the original (it stays approved)', async ({
    page,
  }) => {
    await signInWithEmailAndPassword(page, 'user@test.local', 'testpassword123');
    await page.goto('/admin');

    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    const approvedCard = page.locator('.event-card', { hasText: 'User Approved Event' });
    await expect(approvedCard).toBeVisible({ timeout: 10000 });
    await expect(approvedCard.locator('.status-badge--approved')).toBeVisible();

    await approvedCard.getByTestId('duplicate-event-button').click();

    await page.waitForTimeout(2000);

    await expect(approvedCard.locator('.status-badge--approved')).toBeVisible();
  });

  test('user can also duplicate their own pending event from Meine Events', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'user@test.local', 'testpassword123');
    await page.goto('/admin');

    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    const pendingCard = page.locator('.event-card', { hasText: 'User Pending Event' });
    await expect(pendingCard).toBeVisible({ timeout: 10000 });
    await expect(pendingCard.getByTestId('duplicate-event-button')).toBeVisible();

    await pendingCard.getByTestId('duplicate-event-button').click();

    await expect(pendingCard.locator('.status-badge--pending')).toBeVisible();

    await page.getByTestId('admin-tab-drafts').click();
    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    const draftCards = page.locator('.event-card', { hasText: 'User Pending Event' });
    await expect(draftCards).toHaveCount(1, { timeout: 10000 });
    await expect(draftCards.first().locator('.status-badge--draft')).toBeVisible();
  });

  test('duplicating a published event twice creates two independent drafts', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'user@test.local', 'testpassword123');
    await page.goto('/admin');

    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    const approvedCard = page.locator('.event-card', { hasText: 'User Approved Event' });
    await expect(approvedCard).toBeVisible({ timeout: 10000 });

    await approvedCard.getByTestId('duplicate-event-button').click();

    await expect(approvedCard.locator('.status-badge--approved')).toBeVisible();

    await approvedCard.getByTestId('duplicate-event-button').click();

    await expect(approvedCard.locator('.status-badge--approved')).toBeVisible();

    await page.getByTestId('admin-tab-drafts').click();
    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    await expect(page.locator('.event-card', { hasText: 'User Approved Event' })).toHaveCount(2, {
      timeout: 10000,
    });
  });
});
