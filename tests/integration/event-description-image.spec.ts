import { test, expect } from '@playwright/test';
import { spawn } from 'child_process';
import { signInWithEmailAndPassword, signOut } from '../helpers/auth';
import { waitForWizardToLoad } from '../helpers/wizard';

async function resetSharedPendingFixture(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const proc = spawn('node', ['scripts/reset-draft-fixtures.mjs'], {
      cwd: process.cwd(),
      stdio: 'ignore',
      shell: true,
    });
    proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`exit ${code}`))));
    proc.on('error', reject);
  });
}

test.describe.configure({ mode: 'serial' });

test.describe('Description image upload & title-image hint (b94MmbeY)', () => {
  test.beforeEach(async () => {
    await resetSharedPendingFixture();
  });

  test.afterEach(async ({ page }) => {
    await signOut(page);
    await resetSharedPendingFixture();
  });

  test('description editor shows the image insert button in its toolbar', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin/new');
    await waitForWizardToLoad(page);

    await page.click('button:has-text("Weiter")');
    await page.waitForTimeout(500);

    await expect(page.getByLabel('Bild einfügen')).toBeVisible();
  });

  test('title-image upload area shows the hint that text-heavy images belong in the description', async ({
    page,
  }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin/new');
    await waitForWizardToLoad(page);

    await page.click('button:has-text("Weiter")');
    await page.waitForTimeout(500);

    const hint = page.getByTestId('title-image-hint');
    await expect(hint).toBeVisible();
    await expect(hint).toContainText('Symbolfoto');
    await expect(hint).toContainText('Beschreibung');
  });

  test('uploading an image into the description inserts an <img> with a Firebase Storage URL', async ({
    page,
  }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin/edit/test-event-foreign-pending');
    await page.waitForURL(/\/admin\/edit\//);

    await page.waitForSelector('[data-testid="description-editor"] .rte-content', {
      timeout: 10000,
    });
    await page.waitForTimeout(800);

    const editor = page.locator('[data-testid="description-editor"] .rte-content');
    await editor.click();
    await editor.fill('');
    await page.waitForTimeout(200);
    await editor.type('Flyer im Anhang:');
    await page.waitForTimeout(200);

    const imageInput = page.locator('input[data-testid="description-image-input"]');
    await imageInput.setInputFiles('public/event-fallbacks/yoga.jpg');

    const insertedImg = page.locator('[data-testid="description-editor"] .rte-content img');
    await expect(insertedImg).toBeVisible({ timeout: 15000 });

    const src = await insertedImg.getAttribute('src');
    expect(src).toMatch(/(firebasestorage\.googleapis\.com|localhost:9299)/);
  });
});
