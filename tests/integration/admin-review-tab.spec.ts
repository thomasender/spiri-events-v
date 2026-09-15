import { test, expect } from '@playwright/test';
import { spawn } from 'child_process';

import { STORAGE_STATE } from '../helpers/roles';

// Signed in as `admin` via the session captured once by tests/auth.setup.ts,
// instead of driving the login form in every test.
test.use({ storageState: STORAGE_STATE.admin });

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

async function createThrowawayPendingEvent(eventId: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const proc = spawn('node', ['scripts/create-throwaway-pending-event.mjs', eventId], {
      cwd: process.cwd(),
      stdio: 'ignore',
      shell: true,
    });
    proc.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`throwaway create exit ${code}`))
    );
    proc.on('error', reject);
  });
}

async function deleteEventById(eventId: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const proc = spawn('node', ['scripts/delete-event-by-id.mjs', eventId], {
      cwd: process.cwd(),
      stdio: 'ignore',
      shell: true,
    });
    proc.on('close', () => resolve());
    proc.on('error', reject);
  });
}

test.describe.configure({ mode: 'serial' });

const FOREIGN_PENDING_TITLE = 'User Pending Event';

test.describe('Review tab for admins (dUWoE5vu) @smoke', () => {
  test.beforeEach(async () => {
    await resetDraftFixtures();
  });

  test.afterEach(async ({ page }) => {
    await resetDraftFixtures();
  });

  test('admin sees the Review tab when pending events exist', async ({ page }) => {
    await page.goto('/admin');

    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    const reviewTab = page.getByTestId('admin-tab-review');
    await expect(reviewTab).toBeVisible();
    await expect(reviewTab).toContainText('Review');
  });

  test('Review tab shows the count of pending events on its badge', async ({ page }) => {
    await page.goto('/admin');

    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    const badge = page.getByTestId('admin-tab-review-badge');
    await expect(badge).toBeVisible();
    // The badge caps at "9+" once there are more than nine pending events, so
    // parse it as a number only when it actually is one. The cap itself is
    // covered by tests/components/AdminPage.spec.tsx.
    const label = (await badge.textContent())?.trim() ?? '';
    expect(label).toMatch(/^(\d+\+?)$/);
    if (!label.endsWith('+')) {
      expect(Number(label)).toBeGreaterThanOrEqual(1);
    }
  });

  test('pending events show up in the Review tab and NOT in Meine Events', async ({ page }) => {
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
    const throwawayId = `test-review-approve-${Date.now()}`;
    const throwawayTitle = `Throwaway Pending ${throwawayId}`;
    await createThrowawayPendingEvent(throwawayId);

    try {
      await page.goto('/admin?tab=review');

      await page
        .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
        .catch(() => {});

      const reviewPanel = page.locator('#admin-tab-review');
      const pendingCard = reviewPanel.locator('.event-card', { hasText: throwawayTitle });
      await expect(pendingCard).toBeVisible({ timeout: 10000 });
      await expect(pendingCard.locator('.status-badge--pending')).toBeVisible();

      await pendingCard.getByRole('button', { name: /genehmigen/i }).click();

      const successDialog = page.getByTestId('success-dialog');
      await expect(successDialog).toBeVisible({ timeout: 10000 });
      await expect(successDialog).toContainText('Event genehmigt');

      await successDialog.getByTestId('success-dialog-confirm').click();
      await expect(successDialog).toBeHidden();

      await expect(reviewPanel.locator('.event-card', { hasText: throwawayTitle })).toHaveCount(0, {
        timeout: 10000,
      });
    } finally {
      await deleteEventById(throwawayId);
    }
  });

  test('admin can revert a pending event to draft from the Review tab', async ({ page }) => {
    const throwawayId = `test-review-revert-${Date.now()}`;
    const throwawayTitle = `Throwaway Pending ${throwawayId}`;
    await createThrowawayPendingEvent(throwawayId);

    try {
      await page.goto('/admin?tab=review');

      await page
        .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
        .catch(() => {});

      const reviewPanel = page.locator('#admin-tab-review');
      const pendingCard = reviewPanel.locator('.event-card', { hasText: throwawayTitle });
      await expect(pendingCard).toBeVisible({ timeout: 10000 });

      await pendingCard.getByRole('button', { name: /zu entwurf/i }).click();

      const confirmDialog = page.locator('.confirm-dialog').filter({ hasText: /zu entwurf/i });
      await expect(confirmDialog).toBeVisible({ timeout: 10000 });

      const revertButton = confirmDialog.getByRole('button', { name: /^zu entwurf$/i });
      await revertButton.click();

      await expect(reviewPanel.locator('.event-card', { hasText: throwawayTitle })).toHaveCount(0, {
        timeout: 10000,
      });
    } finally {
      await deleteEventById(throwawayId);
    }
  });
});
