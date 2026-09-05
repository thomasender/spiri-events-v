import { test, expect, Page } from '@playwright/test';
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

async function resetMessageFixtures(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const proc = spawn('node', ['scripts/reset-message-fixtures.mjs'], {
      cwd: process.cwd(),
      stdio: 'ignore',
      shell: true,
    });
    proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`reset exit ${code}`))));
    proc.on('error', reject);
  });
}

async function waitForAdminTabs(page: Page): Promise<void> {
  await page
    .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
    .catch(() => {});
}

test.describe.configure({ mode: 'serial' });

test.describe('Verwaltung lists — title picture (TnMMKIc7)', () => {
  test.beforeEach(async () => {
    await resetDraftFixtures();
    await resetMessageFixtures();
  });

  test.afterEach(async ({ page }) => {
    await signOut(page);
    await resetDraftFixtures();
    await resetMessageFixtures();
  });

  test('Meine Events: every card shows the title picture with the category fallback', async ({
    page,
  }) => {
    await signInWithEmailAndPassword(page, 'user@test.local', 'testpassword123');
    await page.goto('/admin');
    await waitForAdminTabs(page);

    const cards = page.locator('.event-card');
    const count = await cards.count();
    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < count; i++) {
      const card = cards.nth(i);
      const image = card.getByTestId('event-card-image');
      await expect(image).toBeVisible();
      const src = await image.getAttribute('src');
      expect(src).toMatch(/^\/event-fallbacks\//);
    }
  });

  test('Meine Events: pending event card shows the Sonstiges fallback image', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'user@test.local', 'testpassword123');
    await page.goto('/admin');
    await waitForAdminTabs(page);

    const card = page.locator('.event-card', { hasText: 'User Pending Event' });
    await expect(card).toBeVisible({ timeout: 10000 });

    const image = card.getByTestId('event-card-image');
    await expect(image).toBeVisible();
    await expect(image).toHaveAttribute('src', '/event-fallbacks/sonstiges.jpg');
  });

  test('Entwürfe: each draft card shows the title picture with the category fallback', async ({
    page,
  }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin?tab=drafts');
    await waitForAdminTabs(page);

    const draftCards = [
      { title: 'Admin Draft Event', fallback: '/event-fallbacks/sonstiges.jpg' },
      { title: 'Second Admin Draft', fallback: '/event-fallbacks/yoga.jpg' },
    ];

    for (const { title, fallback } of draftCards) {
      const card = page.locator('.event-card', { hasText: title });
      await expect(card).toBeVisible({ timeout: 10000 });
      const image = card.getByTestId('event-card-image');
      await expect(image).toBeVisible();
      await expect(image).toHaveAttribute('src', fallback);
    }
  });

  test('Nachrichten: each message item shows the title picture with the category fallback', async ({
    page,
  }) => {
    await signInWithEmailAndPassword(page, 'user@test.local', 'testpassword123');
    await page.goto('/admin?tab=messages');
    await waitForAdminTabs(page);

    const list = page.getByTestId('messages-tab-list');
    await expect(list).toBeVisible({ timeout: 10000 });

    const items = page.getByTestId('messages-tab-item');
    const count = await items.count();
    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < count; i++) {
      const image = items.nth(i).getByTestId('messages-tab-item-image');
      await expect(image).toBeVisible();
      const src = await image.getAttribute('src');
      expect(src).toMatch(/^\/event-fallbacks\//);
    }

    const fixtureItem = page
      .getByTestId('messages-tab-item')
      .filter({ hasText: 'Test Event With Messages' });
    await expect(fixtureItem).toBeVisible({ timeout: 10000 });
    const fixtureImage = fixtureItem.getByTestId('messages-tab-item-image');
    await expect(fixtureImage).toBeVisible();
    await expect(fixtureImage).toHaveAttribute('src', '/event-fallbacks/sonstiges.jpg');
  });

  test('Meine Events: title picture sits left of the card content, not on top (ASWJkYMY)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await signInWithEmailAndPassword(page, 'user@test.local', 'testpassword123');
    await page.goto('/admin');
    await waitForAdminTabs(page);

    const card = page.locator('.event-card').first();
    await expect(card).toBeVisible({ timeout: 10000 });
    const image = card.getByTestId('event-card-image');
    await expect(image).toBeVisible();

    const cardBox = await card.boundingBox();
    const imageBox = await image.boundingBox();
    expect(cardBox).not.toBeNull();
    expect(imageBox).not.toBeNull();

    // The picture is a left-aligned thumbnail next to the card body, not a
    // full-width hero stacked above it. It must be noticeably narrower than
    // the card so the bug from ticket ASWJkYMY (image bleeding out of the
    // container / cut off on the right) cannot return.
    expect(imageBox!.width).toBeLessThan(cardBox!.width / 2);

    // The picture sits on the left side of the card (inside the padded content
    // area), not pinned to the card's right edge.
    expect(imageBox!.x).toBeLessThan(cardBox!.x + cardBox!.width / 2);

    // The picture is much shorter than the card: the title/body text and the
    // actions bar live beside / below it, so the image should not stretch the
    // full height of the card.
    expect(imageBox!.height).toBeLessThan(cardBox!.height);
  });
});
