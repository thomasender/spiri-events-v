import { test, expect } from '@playwright/test';
import { spawn } from 'child_process';
import { signInWithEmailAndPassword, signOut } from '../helpers/auth';
import { generateSlug } from '../helpers/slug';

const FOREIGN_PENDING_SLUG = generateSlug('Test Event With Messages', 'Test Place', 8);

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

// Every test's beforeEach re-seeds shared messages on the same fixture event
// (test-event-with-messages). Without serial mode, one test's reset can
// resurrect unread messages while another test in this file is mid-way through
// marking them read and checking the resulting badge/indicator state.
test.describe.configure({ mode: 'serial' });

test.describe('Messages tab — read messages & auto-scroll & event indicator', () => {
  test.beforeEach(async () => {
    await resetMessageFixtures();
  });

  test.afterEach(async ({ page }) => {
    await signOut(page);
  });

  test('Messages tab shows events with messages even after they are all read', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'user@test.local', 'testpassword123');
    await page.goto('/admin?tab=messages');

    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    const list = page.getByTestId('messages-tab-list');
    await expect(list).toBeVisible({ timeout: 10000 });

    const item = page.getByTestId('messages-tab-item').first();
    await expect(item).toContainText('Test Event With Messages');

    const badge = item.getByTestId('messages-tab-item-badge');
    await expect(badge).toBeVisible();
    await expect(badge).toHaveText('2');

    await item.click();

    await page.waitForURL(/\/event\//, { timeout: 10000 });
    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    await expect(page.getByTestId('event-messages')).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(1500);

    await page.goto('/admin?tab=messages');
    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    await expect(page.getByTestId('messages-tab-list')).toBeVisible({ timeout: 10000 });
    const itemAfter = page.getByTestId('messages-tab-item').first();
    await expect(itemAfter).toContainText('Test Event With Messages');
    await expect(itemAfter.getByTestId('messages-tab-item-badge')).toHaveCount(0);
  });

  test('Message item links include #event-messages hash', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'user@test.local', 'testpassword123');
    await page.goto('/admin?tab=messages');

    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    const link = page.getByTestId('messages-tab-item').first();
    await expect(link).toHaveAttribute('href', /#event-messages$/);
  });

  test('Event card in Meine Events shows red unread indicator while messages are unread', async ({
    page,
  }) => {
    await signInWithEmailAndPassword(page, 'user@test.local', 'testpassword123');
    await page.goto('/admin');

    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    const pendingCard = page.locator('.event-card', { hasText: 'Test Event With Messages' });
    await expect(pendingCard).toBeVisible({ timeout: 10000 });
    await expect(pendingCard.getByTestId('event-card-unread-indicator')).toBeVisible();
  });

  test('Visiting a different event page does NOT auto-scroll (no hash)', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'user@test.local', 'testpassword123');
    await page.goto(`/event/${FOREIGN_PENDING_SLUG}`);

    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    await expect(page.locator('.event-title')).toContainText('Test Event With Messages', {
      timeout: 10000,
    });

    const messagesSection = page.getByTestId('event-messages');
    await expect(messagesSection).toBeVisible();

    await page.waitForTimeout(500);

    const isInViewport = await messagesSection.evaluate((el) => {
      const rect = el.getBoundingClientRect();
      return (
        rect.top >= 0 &&
        rect.bottom <= (window.innerHeight || document.documentElement.clientHeight)
      );
    });
    expect(isInViewport).toBe(false);
  });

  test('Clicking a message item auto-scrolls to the #event-messages anchor', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'user@test.local', 'testpassword123');
    await page.goto('/admin?tab=messages');

    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    const list = page.getByTestId('messages-tab-list');
    await expect(list).toBeVisible({ timeout: 10000 });

    const item = page.getByTestId('messages-tab-item').first();
    await item.click();

    await page.waitForURL(/#event-messages$/, { timeout: 10000 });
    await page.waitForSelector('[data-testid="event-message"]', { timeout: 10000 });
    await page.waitForTimeout(1500);

    const measurement = await page.evaluate(() => {
      const node = document.getElementById('event-messages');
      const rect = node ? node.getBoundingClientRect() : { top: -1, bottom: -1 };
      return {
        scrollY: window.scrollY,
        maxScroll: document.documentElement.scrollHeight - window.innerHeight,
        sectionTop: rect.top,
        viewportH: window.innerHeight,
      };
    });

    expect(measurement.scrollY, 'page should have scrolled').toBeGreaterThan(0);
    expect(
      measurement.sectionTop,
      'event-messages section should land in the viewport (not below it)'
    ).toBeLessThan(measurement.viewportH);
    expect(measurement.scrollY, 'page should scroll to max so the section is fully visible').toBe(
      measurement.maxScroll
    );
  });

  test('Direct navigation to /event/{slug}#event-messages also scrolls to the anchor', async ({
    page,
  }) => {
    await signInWithEmailAndPassword(page, 'user@test.local', 'testpassword123');
    await page.goto('/admin?tab=messages');
    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});
    const href = await page.getByTestId('messages-tab-item').first().getAttribute('href');
    expect(href).toBeTruthy();

    await page.goto(href!);

    await page.waitForSelector('[data-testid="event-message"]', { timeout: 10000 });
    await page.waitForTimeout(1500);

    const measurement = await page.evaluate(() => {
      const node = document.getElementById('event-messages');
      const rect = node ? node.getBoundingClientRect() : { top: -1, bottom: -1 };
      return {
        scrollY: window.scrollY,
        maxScroll: document.documentElement.scrollHeight - window.innerHeight,
        sectionTop: rect.top,
        viewportH: window.innerHeight,
      };
    });

    expect(measurement.scrollY, 'page should have scrolled').toBeGreaterThan(0);
    expect(
      measurement.sectionTop,
      'event-messages section should land in the viewport (not below it)'
    ).toBeLessThan(measurement.viewportH);
    expect(measurement.scrollY, 'page should scroll to max so the section is fully visible').toBe(
      measurement.maxScroll
    );
  });
});
