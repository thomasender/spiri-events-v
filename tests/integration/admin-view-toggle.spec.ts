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

test.describe('Verwaltung view toggle (sosoEwss)', () => {
  test.beforeEach(async () => {
    await resetDraftFixtures();
  });

  test.afterEach(async ({ page }) => {
    await signOut(page);
    await resetDraftFixtures();
  });

  test('Meine Events shows the Kartenansicht / Listenansicht toggle (desktop)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin');

    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    const cardBtn = page.getByTestId('events-view-toggle-card');
    const listBtn = page.getByTestId('events-view-toggle-list');
    await expect(cardBtn).toBeVisible();
    await expect(listBtn).toBeVisible();

    await expect(cardBtn).toHaveClass(/active/);
    await expect(listBtn).not.toHaveClass(/active/);
  });

  test('Meine Events defaults to card view and renders event-card elements', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin');

    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    await expect(page.locator('.event-list-section .event-list-grid').first()).toBeVisible();
    await expect(page.locator('.event-list-section .event-admin-row')).toHaveCount(0);
  });

  test('clicking Listenansicht in Meine Events switches to row layout', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin');

    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    await page.getByTestId('events-view-toggle-list').click();

    await expect(page.getByTestId('events-view-toggle-list')).toHaveClass(/active/);
    await expect(page.getByTestId('events-view-toggle-card')).not.toHaveClass(/active/);

    await expect(page.locator('.event-list-section .event-list-rows').first()).toBeVisible();
    await expect(page.locator('.event-list-section .event-admin-row').first()).toBeVisible();
  });

  test('row layout still shows admin action buttons (Duplizieren / Bearbeiten / Löschen)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin');

    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    await page.getByTestId('events-view-toggle-list').click();

    const firstRow = page.locator('.event-admin-row').first();
    await expect(firstRow).toBeVisible();
    await expect(firstRow.getByRole('link', { name: /ansehen/i })).toBeVisible();
    await expect(firstRow.getByRole('link', { name: /bearbeiten/i })).toBeVisible();
    await expect(
      firstRow.getByRole('button', { name: /event löschen|serie löschen/i })
    ).toBeVisible();
  });

  test('switching back to Kartenansicht restores the card grid', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin');

    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    await page.getByTestId('events-view-toggle-list').click();
    await expect(page.locator('.event-admin-row').first()).toBeVisible();

    await page.getByTestId('events-view-toggle-card').click();
    await expect(page.getByTestId('events-view-toggle-card')).toHaveClass(/active/);
    await expect(page.locator('.event-list-section .event-list-grid').first()).toBeVisible();
    await expect(page.locator('.event-admin-row')).toHaveCount(0);
  });

  test('Entwürfe tab also has the view toggle and defaults to Kartenansicht', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin?tab=drafts');

    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    const cardBtn = page.getByTestId('drafts-view-toggle-card');
    const listBtn = page.getByTestId('drafts-view-toggle-list');
    await expect(cardBtn).toBeVisible();
    await expect(listBtn).toBeVisible();

    await expect(cardBtn).toHaveClass(/active/);
    await expect(listBtn).not.toHaveClass(/active/);

    await expect(page.locator('.event-list-section .event-list-grid').first()).toBeVisible();
    await expect(page.locator('.event-admin-row')).toHaveCount(0);
  });

  test('Entwürfe tab: switching to Listenansicht renders drafts as rows with action buttons', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin?tab=drafts');

    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    await page.getByTestId('drafts-view-toggle-list').click();

    await expect(page.getByTestId('drafts-view-toggle-list')).toHaveClass(/active/);
    await expect(page.locator('.event-admin-row').first()).toBeVisible();

    const firstRow = page.locator('.event-admin-row').first();
    await expect(firstRow.getByTestId('submit-draft-button')).toBeVisible();
    await expect(firstRow.getByTestId('duplicate-event-button')).toBeVisible();
    await expect(firstRow.getByRole('button', { name: /event löschen/i })).toBeVisible();
  });
});
