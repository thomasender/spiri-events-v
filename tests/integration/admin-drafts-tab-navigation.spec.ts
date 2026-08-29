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

test.describe('Entwurf Tab navigation (wFCSgPls)', () => {
  test.beforeEach(async () => {
    await resetDraftFixtures();
  });

  test.afterEach(async ({ page }) => {
    await signOut(page);
    await resetDraftFixtures();
  });

  test('Zurück button on edit form returns to Entwürfe tab when entered from drafts tab', async ({
    page,
  }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin?tab=drafts');

    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    const draftCard = page.locator('.event-card', { hasText: 'Admin Draft Event' });
    await expect(draftCard).toBeVisible({ timeout: 10000 });

    await draftCard.getByRole('link', { name: /bearbeiten/i }).click();
    await page.waitForURL(/\/admin\/edit\//);
    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    await page.getByRole('button', { name: /^zurück$/i }).click();

    await page.waitForURL(/\/admin\?tab=drafts/, { timeout: 10000 });
    await expect(page.getByTestId('admin-tab-drafts')).toHaveAttribute('aria-selected', 'true');
  });

  test('Abbrechen button on edit form returns to Entwürfe tab when entered from drafts tab', async ({
    page,
  }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin?tab=drafts');

    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    const draftCard = page.locator('.event-card', { hasText: 'Admin Draft Event' });
    await expect(draftCard).toBeVisible({ timeout: 10000 });

    await draftCard.getByRole('link', { name: /bearbeiten/i }).click();
    await page.waitForURL(/\/admin\/edit\//);
    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    await page.getByRole('button', { name: /^abbrechen$/i }).click();

    await page.waitForURL(/\/admin\?tab=drafts/, { timeout: 10000 });
    await expect(page.getByTestId('admin-tab-drafts')).toHaveAttribute('aria-selected', 'true');
  });

  test('Änderungen speichern on edit form returns to Entwürfe tab when entered from drafts tab', async ({
    page,
  }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin?tab=drafts');

    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    const draftCard = page.locator('.event-card', { hasText: 'Admin Draft Event' });
    await expect(draftCard).toBeVisible({ timeout: 10000 });

    await draftCard.getByRole('link', { name: /bearbeiten/i }).click();
    await page.waitForURL(/\/admin\/edit\//);
    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    await page.getByRole('button', { name: /änderungen speichern/i }).click();

    await page.waitForURL(/\/admin\?tab=drafts/, { timeout: 10000 });
    await expect(page.getByTestId('admin-tab-drafts')).toHaveAttribute('aria-selected', 'true');
  });

  test('Als Entwurf speichern on edit form returns to Entwürfe tab when entered from drafts tab', async ({
    page,
  }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin?tab=drafts');

    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    const draftCard = page.locator('.event-card', { hasText: 'Admin Draft Event' });
    await expect(draftCard).toBeVisible({ timeout: 10000 });

    await draftCard.getByRole('link', { name: /bearbeiten/i }).click();
    await page.waitForURL(/\/admin\/edit\//);
    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    await page.getByTestId('save-as-draft-button').click();

    await page.waitForURL(/\/admin\?tab=drafts/, { timeout: 10000 });
    await expect(page.getByTestId('admin-tab-drafts')).toHaveAttribute('aria-selected', 'true');
  });

  test('Zurück button on edit form returns to Meine Events tab when entered from default /admin', async ({
    page,
  }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin');

    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    const eventCard = page.locator('.event-card').first();
    await expect(eventCard).toBeVisible({ timeout: 10000 });

    await eventCard.getByRole('link', { name: /bearbeiten/i }).click();
    await page.waitForURL(/\/admin\/edit\//);
    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    await page.getByRole('button', { name: /^zurück$/i }).click();

    await page.waitForURL(/\/admin(\?|$)/, { timeout: 10000 });
    await expect(page.getByTestId('admin-tab-events')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('admin-tab-drafts')).toHaveAttribute('aria-selected', 'false');
  });
});
