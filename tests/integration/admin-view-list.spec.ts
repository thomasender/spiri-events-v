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

test.describe('Verwaltung list view (sosoEwss)', () => {
  test.beforeEach(async () => {
    await resetDraftFixtures();
  });

  test.afterEach(async ({ page }) => {
    await signOut(page);
    await resetDraftFixtures();
  });

  test('Meine Events has no card/list view toggle anymore (sosoEwss)', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin');

    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    expect(await page.getByTestId('events-view-toggle-card').count()).toBe(0);
    expect(await page.getByTestId('events-view-toggle-list').count()).toBe(0);
  });

  test('Meine Events renders events as list rows (sosoEwss)', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin');

    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    const section = page.locator('.event-list-section').last();
    await expect(section.locator('.event-list-rows')).toBeVisible();
    await expect(section.locator('.event-card-content').first()).toBeVisible();
  });

  test('list rows still show admin action buttons (sosoEwss)', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin');

    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    const firstRow = page.locator('.event-card').first();
    await expect(firstRow).toBeVisible();
    await expect(firstRow.getByRole('link', { name: /ansehen/i })).toBeVisible();
    await expect(firstRow.getByRole('link', { name: /bearbeiten/i })).toBeVisible();
    await expect(
      firstRow.getByRole('button', { name: /event löschen|serie löschen/i })
    ).toBeVisible();
  });

  test('Verwaltung rows do NOT show price / Kostenlos / Freie Spende badges (sosoEwss)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin');

    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    const rows = page.locator('.event-list-section').last().locator('.event-card');
    const count = await rows.count();
    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < count; i++) {
      const row = rows.nth(i);
      await expect(row.locator('.badge--free, .badge--donation, .badge--fee')).toHaveCount(0);
    }
  });

  test('Entwürfe tab has no card/list view toggle anymore (sosoEwss)', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin?tab=drafts');

    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    expect(await page.getByTestId('drafts-view-toggle-card').count()).toBe(0);
    expect(await page.getByTestId('drafts-view-toggle-list').count()).toBe(0);
  });

  test('Entwürfe tab renders drafts as list rows with action buttons (sosoEwss)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin?tab=drafts');

    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    const firstRow = page.locator('.event-card').first();
    await expect(firstRow).toBeVisible();
    await expect(firstRow.getByTestId('submit-draft-button')).toBeVisible();
    await expect(firstRow.getByTestId('duplicate-event-button')).toBeVisible();
    await expect(firstRow.getByRole('button', { name: /event löschen/i })).toBeVisible();
    await expect(firstRow.locator('.badge--free, .badge--donation, .badge--fee')).toHaveCount(0);
  });
});
