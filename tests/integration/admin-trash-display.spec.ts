import { test, expect } from '@playwright/test';
import { spawn } from 'child_process';
import { signInWithEmailAndPassword, signOut } from '../helpers/auth';

async function resetTrashFixtures(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const proc = spawn('node', ['scripts/reset-trash-fixtures.mjs'], {
      cwd: process.cwd(),
      stdio: 'ignore',
      shell: true,
    });
    proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`exit ${code}`))));
    proc.on('error', reject);
  });
}

async function resetFeedbackFixtures(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const proc = spawn('node', ['scripts/reset-feedback-fixtures.mjs'], {
      cwd: process.cwd(),
      stdio: 'ignore',
      shell: true,
    });
    proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`exit ${code}`))));
    proc.on('error', reject);
  });
}

async function waitForAdminTabs(page): Promise<void> {
  await page
    .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
    .catch(() => {});
}

test.describe.configure({ mode: 'serial' });

test.describe('Papierkorb tab — display + tab order (oSwjBKM3)', () => {
  test.beforeEach(async () => {
    await resetTrashFixtures();
    // Re-seed feedback so the "tab order" test sees the Feedback tab.
    // Other specs (feedback.spec.ts) archive / delete feedback in their own
    // beforeEach and leave nothing for us to find.
    await resetFeedbackFixtures();
  });

  test.afterEach(async ({ page }) => {
    await signOut(page);
    await resetTrashFixtures();
    await resetFeedbackFixtures();
  });

  test('Papierkorb events render with the same row layout as Meine Events (image + weekday)', async ({
    page,
  }) => {
    await signInWithEmailAndPassword(page, 'user@test.local', 'testpassword123');
    await page.goto('/admin?tab=trash');
    await waitForAdminTabs(page);

    const card = page.getByTestId('trash-event-card-test-event-user-trashed');
    await expect(card).toBeVisible();

    // Same row components as Meine Events: weekday, day, month, image, body.
    await expect(card.locator('.event-card-weekday')).toBeVisible();
    await expect(card.locator('.event-card-day')).toBeVisible();
    await expect(card.locator('.event-card-month')).toBeVisible();
    await expect(card.locator('.event-card-image-wrapper')).toBeVisible();
    await expect(card.locator('.event-card-body')).toBeVisible();

    // Trash-only actions: restore + permanent delete, no edit link.
    await expect(card.getByTestId('trash-restore-button-test-event-user-trashed')).toBeVisible();
    await expect(
      card.getByTestId('trash-permanent-delete-button-test-event-user-trashed')
    ).toBeVisible();
    await expect(card.getByRole('link', { name: /bearbeiten/i })).toHaveCount(0);

    // Gelöscht am meta still shows.
    await expect(page.getByTestId('trash-event-trashed-at-test-event-user-trashed')).toContainText(
      /Gelöscht am/
    );
  });

  test('admin tabs render in the order: Meine Events, Entwürfe, Nachrichten, Feedback, Papierkorb', async ({
    page,
  }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin');
    await waitForAdminTabs(page);

    // All five tabs are visible because the seeded data has drafts, messages,
    // feedback and at least one trashed event.
    const expectedOrder = [
      'admin-tab-events',
      'admin-tab-drafts',
      'admin-tab-messages',
      'admin-tab-feedback',
      'admin-tab-trash',
    ];
    for (const testid of expectedOrder) {
      await expect(page.getByTestId(testid)).toBeVisible();
    }

    const tabLabels = await page.locator('.admin-page-tab').allInnerTexts();
    // Trim whitespace and pick the first non-empty line per tab.
    const cleaned = tabLabels.map((label) => label.split('\n')[0].trim());
    expect(cleaned).toEqual(['Meine Events', 'Entwürfe', 'Nachrichten', 'Feedback', 'Papierkorb']);
  });
});
