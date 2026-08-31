import { test, expect } from '@playwright/test';
import { spawn } from 'child_process';
import { signInWithEmailAndPassword, signOut } from '../helpers/auth';

function runScript(scriptPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn('node', [scriptPath], {
      cwd: process.cwd(),
      stdio: 'ignore',
      shell: true,
    });
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

test.describe('Erfolgsmeldung nach Duplikation (YGBHPBdZ)', () => {
  test.beforeEach(async () => {
    await resetDraftFixtures();
    await resetUserApprovedEventFixture();
  });

  test.afterEach(async ({ page }) => {
    await signOut(page);
    await resetDraftFixtures();
    await resetUserApprovedEventFixture();
  });

  test('shows a success dialog after duplicating an approved event from Meine Events', async ({
    page,
  }) => {
    await signInWithEmailAndPassword(page, 'user@test.local', 'testpassword123');
    await page.goto('/admin');

    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    const approvedCard = page
      .locator('.event-card', { hasText: 'User Approved Event' })
      .filter({ has: page.locator('.status-badge--approved') });
    await expect(approvedCard).toBeVisible({ timeout: 10000 });

    await approvedCard.getByTestId('duplicate-event-button').click();

    const successDialog = page.getByTestId('success-dialog');
    await expect(successDialog).toBeVisible({ timeout: 10000 });
    await expect(successDialog.getByTestId('success-dialog-icon')).toBeVisible();
    await expect(successDialog.locator('h2')).toContainText('Duplikat erstellt');
    await expect(successDialog).toContainText('User Approved Event');

    const details = successDialog.getByTestId('success-dialog-details');
    await expect(details).toBeVisible();
    await expect(details).toContainText(/Entwürfen/i);
  });

  test('success dialog confirm button navigates to the Entwürfe tab', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'user@test.local', 'testpassword123');
    await page.goto('/admin');

    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    const approvedCard = page
      .locator('.event-card', { hasText: 'User Approved Event' })
      .filter({ has: page.locator('.status-badge--approved') });
    await expect(approvedCard).toBeVisible({ timeout: 10000 });

    await approvedCard.getByTestId('duplicate-event-button').click();

    const successDialog = page.getByTestId('success-dialog');
    await expect(successDialog).toBeVisible({ timeout: 10000 });

    await successDialog.getByTestId('success-dialog-confirm').click();

    await page.waitForURL(/\/admin\?tab=drafts/, { timeout: 10000 });

    await expect(page.getByTestId('admin-tab-drafts')).toHaveAttribute('aria-selected', 'true');

    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    const draftsPanel = page.locator('#admin-tab-drafts');
    const newDraftCard = draftsPanel
      .locator('.event-card', { hasText: 'User Approved Event' })
      .filter({ has: page.locator('.status-badge--draft') });
    await expect(newDraftCard).toBeVisible({ timeout: 10000 });
  });

  test('success dialog can be dismissed by clicking the overlay', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'user@test.local', 'testpassword123');
    await page.goto('/admin');

    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    const approvedCard = page
      .locator('.event-card', { hasText: 'User Approved Event' })
      .filter({ has: page.locator('.status-badge--approved') });
    await expect(approvedCard).toBeVisible({ timeout: 10000 });

    await approvedCard.getByTestId('duplicate-event-button').click();

    const successDialog = page.getByTestId('success-dialog');
    await expect(successDialog).toBeVisible({ timeout: 10000 });

    await page.locator('.confirm-overlay').click({ position: { x: 10, y: 10 } });

    await expect(successDialog).toBeHidden({ timeout: 5000 });
  });

  test('shows a success dialog after duplicating a draft from the Entwürfe tab', async ({
    page,
  }) => {
    await signInWithEmailAndPassword(page, 'user@test.local', 'testpassword123');
    await page.goto('/admin?tab=drafts');

    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    const draftCard = page.locator('.event-card', { hasText: 'User Draft Event' });
    await expect(draftCard).toBeVisible({ timeout: 10000 });
    await expect(draftCard.getByTestId('duplicate-event-button')).toBeVisible();

    await draftCard.getByTestId('duplicate-event-button').click();

    const successDialog = page.getByTestId('success-dialog');
    await expect(successDialog).toBeVisible({ timeout: 10000 });
    await expect(successDialog.getByTestId('success-dialog-icon')).toBeVisible();
    await expect(successDialog.locator('h2')).toContainText('Duplikat erstellt');
    await expect(successDialog).toContainText('User Draft Event');

    const details = successDialog.getByTestId('success-dialog-details');
    await expect(details).toBeVisible();
    await expect(details).toContainText(/Entwürfen/i);

    await expect(page.locator('.event-card', { hasText: 'User Draft Event' })).toHaveCount(2, {
      timeout: 10000,
    });
  });
});
