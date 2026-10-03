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

async function createThrowawayApprovedEvent(eventId: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const proc = spawn('node', ['scripts/create-throwaway-approved-event.mjs', eventId], {
      cwd: process.cwd(),
      stdio: 'ignore',
      shell: true,
    });
    proc.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`throwaway approved create exit ${code}`))
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

test.describe('Review tab for admins', () => {
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

  test(
    'admin can approve a pending event from the Review tab',
    { tag: '@smoke' },
    async ({ page }) => {
      const throwawayId = `test-review-approve-${Date.now()}`;
      const throwawayTitle = `Throwaway Pending ${throwawayId}`;
      await createThrowawayPendingEvent(throwawayId);

      try {
        await page.goto('/admin?tab=review');

        await page
          .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
          .catch(() => {});

        const reviewPanel = page.locator('#admin-tab-review');
        const pendingSection = reviewPanel.getByTestId('review-section-pending');
        const pendingCard = pendingSection.locator('.event-card', { hasText: throwawayTitle });
        await expect(pendingCard).toBeVisible({ timeout: 10000 });
        await expect(pendingCard.locator('.status-badge--pending')).toBeVisible();

        await pendingCard.getByRole('button', { name: /genehmigen/i }).click();

        const successDialog = page.getByTestId('success-dialog');
        await expect(successDialog).toBeVisible({ timeout: 10000 });
        await expect(successDialog).toContainText('Event genehmigt');

        await successDialog.getByTestId('success-dialog-confirm').click();
        await expect(successDialog).toBeHidden();

        // After approval the event leaves the pending section (its card may now
        // appear in the "Genehmigt in den letzten 7 Tagen" section below, since
        // approvedAt was just stamped — that's the new design).
        await expect(
          pendingSection.locator('.event-card', { hasText: throwawayTitle })
        ).toHaveCount(0, { timeout: 10000 });
      } finally {
        await deleteEventById(throwawayId);
      }
    }
  );

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

  test('admin sees three labelled sections on the Review tab (j67qz6b2) @smoke', async ({
    page,
  }) => {
    const throwawayId = `test-review-sections-${Date.now()}`;
    const throwawayTitle = `Throwaway Approved ${throwawayId}`;
    await createThrowawayApprovedEvent(throwawayId);

    try {
      await page.goto('/admin?tab=review');

      await page
        .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
        .catch(() => {});

      // The seeded test-event-foreign-pending event (and any throwaways) make
      // the "Wartend auf Genehmigung" section visible. Our just-created
      // throwaway approved event makes the "Genehmigt in den letzten 7 Tagen"
      // section visible. The "In Klärung" subsection only shows up when an
      // admin has asked the creator for changes — covered in the next test.
      const reviewPanel = page.locator('#admin-tab-review');
      await expect(reviewPanel).toBeVisible();

      await expect(reviewPanel.getByTestId('review-section-pending')).toBeVisible();
      await expect(reviewPanel.getByTestId('review-section-pending')).toContainText(
        'Wartend auf Genehmigung'
      );
      await expect(reviewPanel.getByTestId('review-subsection-neu')).toBeVisible();
      await expect(reviewPanel.getByTestId('review-subsection-neu')).toContainText(
        'Neu eingereicht'
      );

      await expect(reviewPanel.getByTestId('review-section-approved')).toBeVisible();
      await expect(reviewPanel.getByTestId('review-section-approved')).toContainText(
        'Genehmigt in den letzten 7 Tagen'
      );

      // The approved section starts collapsed; open it first.
      await reviewPanel.getByTestId('review-toggle-approved').click();

      // The throwaway approved event must appear inside the approved section
      // and surface the new "Genehmigt von" meta line.
      const approvedCard = reviewPanel
        .getByTestId('review-section-approved')
        .locator('.event-card', { hasText: throwawayTitle });
      await expect(approvedCard).toBeVisible({ timeout: 10000 });
      const approvedByLine = approvedCard.getByTestId(`event-card-approved-by-${throwawayId}`);
      await expect(approvedByLine).toBeVisible();
      await expect(approvedByLine).toContainText(/Genehmigt von/);
    } finally {
      await deleteEventById(throwawayId);
    }
  });

  test('In Klärung subsection appears once the creator has a message from an admin (j67qz6b2) @smoke', async ({
    page,
  }) => {
    // scripts/reset-message-fixtures.mjs seeds test-event-with-messages with
    // an admin-authored message; the messages subcollection is what the
    // "In Klärung" detection reads.
    await new Promise<void>((resolve, reject) => {
      const proc = spawn('node', ['scripts/reset-message-fixtures.mjs'], {
        cwd: process.cwd(),
        stdio: 'ignore',
        shell: true,
      });
      proc.on('close', (code) =>
        code === 0 ? resolve() : reject(new Error(`reset exit ${code}`))
      );
      proc.on('error', reject);
    });

    try {
      await page.goto('/admin?tab=review');

      await page
        .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
        .catch(() => {});

      const reviewPanel = page.locator('#admin-tab-review');
      await expect(reviewPanel).toBeVisible();
      await expect(reviewPanel.getByTestId('review-subsection-klaerung')).toBeVisible({
        timeout: 10000,
      });

      const clarificationCard = reviewPanel.locator('.event-card', {
        hasText: 'Test Event With Messages',
      });
      await expect(clarificationCard).toBeVisible({ timeout: 10000 });

      // The new full-width "KLÄRUNG LÄUFT" ribbon must be present.
      await expect(clarificationCard.getByTestId('event-card-clarification-ribbon')).toBeVisible();

      // And the rich "In Klärung mit …" meta line, with the admin's display name.
      const inKlaerungLine = clarificationCard.getByTestId(
        'event-card-in-klaerung-by-test-event-with-messages'
      );
      await expect(inKlaerungLine).toBeVisible();
      await expect(inKlaerungLine).toContainText(/In Klärung mit Test Admin/);
    } finally {
      // Restore the pending event to a clean state so other specs don't trip
      // over leftover admin messages.
      await new Promise<void>((resolve, reject) => {
        const proc = spawn('node', ['scripts/reset-message-fixtures.mjs'], {
          cwd: process.cwd(),
          stdio: 'ignore',
          shell: true,
        });
        proc.on('close', () => resolve());
        proc.on('error', reject);
      });
    }
  });
});
