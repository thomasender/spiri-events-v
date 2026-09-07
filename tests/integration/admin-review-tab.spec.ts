import { test, expect } from '@playwright/test';
import { spawn } from 'child_process';
import { signInWithEmailAndPassword, signOut } from '../helpers/auth';

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

const FOREIGN_PENDING_TITLE = 'User Pending Event';

test.describe('Review tab for admins (dUWoE5vu)', () => {
  test.beforeEach(async () => {
    await resetDraftFixtures();
  });

  test.afterEach(async ({ page }) => {
    await signOut(page);
    await resetDraftFixtures();
  });

  test('admin sees the Review tab when pending events exist', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin');

    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    const reviewTab = page.getByTestId('admin-tab-review');
    await expect(reviewTab).toBeVisible();
    await expect(reviewTab).toContainText('Review');
  });

  test('Review tab shows the count of pending events on its badge', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin');

    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    const badge = page.getByTestId('admin-tab-review-badge');
    await expect(badge).toBeVisible();
    const count = Number(await badge.textContent());
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('pending events show up in the Review tab and NOT in Meine Events', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin');

    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    const reviewTab = page.getByTestId('admin-tab-review');
    await reviewTab.click();

    const reviewPanel = page.locator('#admin-tab-review');
    await expect(reviewPanel).toBeVisible();

    const reviewCard = reviewPanel.locator('.event-card', { hasText: FOREIGN_PENDING_TITLE });
    await expect(reviewCard).toBeVisible({ timeout: 10000 });
    await expect(reviewCard.locator('.status-badge--pending')).toBeVisible();
    await expect(reviewCard.getByRole('button', { name: /genehmigen/i })).toBeVisible();

    const eventsTab = page.getByTestId('admin-tab-events');
    await eventsTab.click();

    const eventsPanel = page.locator('#admin-tab-events');
    await expect(eventsPanel).toBeVisible();

    const pendingCardInEvents = eventsPanel.locator('.event-card', {
      hasText: FOREIGN_PENDING_TITLE,
    });
    await expect(pendingCardInEvents).toHaveCount(0);

    const pendingHeader = page.locator('h2', { hasText: 'Ausstehende Genehmigungen' });
    await expect(pendingHeader).toHaveCount(0);
  });

  test('admin can approve a pending event from the Review tab', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin?tab=review');

    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    const reviewPanel = page.locator('#admin-tab-review');
    const pendingCard = reviewPanel.locator('.event-card', {
      hasText: FOREIGN_PENDING_TITLE,
    });
    await expect(pendingCard).toBeVisible({ timeout: 10000 });

    const initialBadgeText = await page.getByTestId('admin-tab-review-badge').textContent();
    const initialCount = Number(initialBadgeText);

    await pendingCard.getByRole('button', { name: /genehmigen/i }).click();

    const successDialog = page.getByTestId('success-dialog');
    await expect(successDialog).toBeVisible({ timeout: 10000 });
    await expect(successDialog).toContainText('Event genehmigt');

    await successDialog.getByTestId('success-dialog-confirm').click();
    await expect(successDialog).toBeHidden();

    await expect(
      reviewPanel.locator('.event-card', { hasText: FOREIGN_PENDING_TITLE })
    ).toHaveCount(0, { timeout: 10000 });

    if (initialCount === 1) {
      await expect(page.getByTestId('admin-tab-review')).toHaveCount(0, { timeout: 10000 });
      await expect(page.getByTestId('admin-tab-review-badge')).toHaveCount(0);
    } else {
      const newBadge = page.getByTestId('admin-tab-review-badge');
      await expect(newBadge).toBeVisible();
      const newCount = Number(await newBadge.textContent());
      expect(newCount).toBe(initialCount - 1);
    }
  });

  test('admin can revert a pending event to draft from the Review tab', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin?tab=review');

    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    const reviewPanel = page.locator('#admin-tab-review');
    const pendingCard = reviewPanel.locator('.event-card', {
      hasText: FOREIGN_PENDING_TITLE,
    });
    await expect(pendingCard).toBeVisible({ timeout: 10000 });

    const initialBadgeText = await page.getByTestId('admin-tab-review-badge').textContent();
    const initialCount = Number(initialBadgeText);

    await pendingCard.getByRole('button', { name: /zu entwurf/i }).click();

    const confirmDialog = page.locator('.confirm-dialog').filter({ hasText: /zu entwurf/i });
    await expect(confirmDialog).toBeVisible({ timeout: 10000 });

    const revertButton = confirmDialog.getByRole('button', { name: /^zu entwurf$/i });
    await revertButton.click();

    await expect(
      reviewPanel.locator('.event-card', { hasText: FOREIGN_PENDING_TITLE })
    ).toHaveCount(0, { timeout: 10000 });

    if (initialCount === 1) {
      await expect(page.getByTestId('admin-tab-review')).toHaveCount(0, { timeout: 10000 });
      await expect(page.getByTestId('admin-tab-review-badge')).toHaveCount(0);
    } else {
      const newBadge = page.getByTestId('admin-tab-review-badge');
      await expect(newBadge).toBeVisible();
      const newCount = Number(await newBadge.textContent());
      expect(newCount).toBe(initialCount - 1);
    }
  });
});
