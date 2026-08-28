import { test, expect } from '@playwright/test';
import { spawn } from 'child_process';
import { signInWithEmailAndPassword, signOut } from '../helpers/auth';

const EVENT_ID = 'test-event-today';

const EXISTING_IMAGE_URL =
  'https://firebasestorage.googleapis.com/v0/b/spirieventsvbg.appspot.com/o/events%2Ftest-event-today%2Foriginal-event-picture.jpg?alt=media';

function runFixtureScript(action: 'set' | 'clear'): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn('node', ['scripts/reset-event-picture-fixture.mjs', action], {
      cwd: process.cwd(),
      stdio: 'ignore',
      shell: true,
    });
    proc.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`fixture-script ${action} exited ${code}`))
    );
    proc.on('error', reject);
  });
}

test.describe.configure({ mode: 'serial' });

test.describe('Editing an event preserves the existing title picture (6bs5MvXI)', () => {
  test.beforeEach(async () => {
    await runFixtureScript('set');
  });

  test.afterEach(async ({ page }) => {
    await runFixtureScript('clear');
    await signOut(page);
  });

  test('opening the edit form for an event with a title picture shows the existing image in the preview', async ({
    page,
  }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');

    await page.goto(`/admin/edit/${EVENT_ID}`);
    await page.waitForURL(/\/admin\/edit\//);
    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    await expect(page.locator('h1')).toContainText('Event bearbeiten', { timeout: 10000 });

    const imagePreview = page.locator('img.image-preview');
    await expect(imagePreview).toBeVisible();
    await expect(imagePreview).toHaveAttribute('src', EXISTING_IMAGE_URL);
  });

  test('editing and saving without touching the image keeps the existing imageUrl', async ({
    page,
  }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');

    await page.goto(`/admin/edit/${EVENT_ID}`);
    await page.waitForURL(/\/admin\/edit\//);
    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    await expect(page.locator('h1')).toContainText('Event bearbeiten', { timeout: 10000 });

    const titleInput = page.locator('#title');
    await expect(titleInput).toBeVisible();
    await titleInput.fill('Yoga heute (bearbeitet)');

    await page.getByRole('button', { name: /änderungen speichern/i }).click();

    await page.waitForURL(/\/admin(?:\?|$)/, { timeout: 15000 });

    const res = await fetch(
      `http://127.0.0.1:8181/v1/projects/spirieventsvbg/databases/(default)/documents/events/${EVENT_ID}`
    );
    const doc = (await res.json()) as {
      fields?: Record<string, { stringValue?: string; nullValue?: null }>;
    };

    expect(doc.fields?.imageUrl?.stringValue).toBe(EXISTING_IMAGE_URL);
    expect(doc.fields?.title?.stringValue).toBe('Yoga heute (bearbeitet)');
  });
});
