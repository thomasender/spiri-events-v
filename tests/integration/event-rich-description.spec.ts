import { test, expect } from '@playwright/test';
import { spawn } from 'child_process';
import { signInWithEmailAndPassword } from '../helpers/auth';
import { waitForWizardToLoad } from '../helpers/wizard';
import { generateSlug } from '../helpers/slug';

const FOREIGN_PENDING_SLUG = generateSlug('User Pending Event', 'Test Place Bludenz', 8);

// admin-event-edit-delete.spec.ts permanently deletes this shared seed fixture as
// part of its delete-flow tests; reset it here so this file passes regardless of
// file execution order.
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

// The last test in this file edits and saves the shared test-event-foreign-pending
// fixture, then reads it back; serialize so other tests' beforeEach reset can't
// race that edit-then-verify sequence.
test.describe.configure({ mode: 'serial' });

test.describe('Rich-text event description', () => {
  test.beforeEach(async () => {
    await resetSharedPendingFixture();
  });

  test('description field renders the rich-text toolbar on the create form', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin/new');
    await waitForWizardToLoad(page);

    await page.click('button:has-text("Weiter")');
    await page.waitForTimeout(500);

    await expect(page.getByLabel('Fett (Strg+B)')).toBeVisible();
    await expect(page.getByLabel('Kursiv (Strg+I)')).toBeVisible();
    await expect(page.getByLabel('Aufzählung')).toBeVisible();
    await expect(page.getByLabel('Nummerierte Liste')).toBeVisible();
    await expect(page.getByLabel('Link (Strg+K)')).toBeVisible();
  });

  test('character counter updates as the user types', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin/new');
    await waitForWizardToLoad(page);

    await page.click('button:has-text("Weiter")');
    await page.waitForTimeout(500);

    const editor = page.locator('[data-testid="description-editor"] .rte-content');
    await editor.click();
    await editor.fill('Hallo Welt');

    await expect(page.locator('[data-testid="description-editor"] .rte-counter')).toContainText(
      '10 / 5000'
    );
  });

  test('empty description triggers the required validation error', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin/new');
    await waitForWizardToLoad(page);

    await page.click('button:has-text("Weiter")');
    await page.waitForTimeout(500);

    const editor = page.locator('[data-testid="description-editor"] .rte-content');
    await editor.click();
    await editor.fill('');

    await page.click('button:has-text("Weiter")');
    await page.waitForTimeout(500);

    const descriptionError = page.getByTestId('description-error');
    await expect(descriptionError).toBeVisible();
    await expect(descriptionError).toContainText('Beschreibung ist erforderlich');
  });

  test('pressing Enter inside the description editor inserts a line break instead of advancing the wizard', async ({
    page,
  }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin/new');
    await waitForWizardToLoad(page);

    await page.click('button:has-text("Weiter")');
    await page.waitForTimeout(500);

    await page.fill('#title', 'Enter-im-Beschreibung-Test');

    const editor = page.locator('[data-testid="description-editor"] .rte-content');
    await editor.click();
    await editor.fill('Erste Zeile');

    await editor.click();
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Zweite Zeile');
    await page.waitForTimeout(300);

    await expect(page.locator('#title')).toBeVisible();
    await expect(editor).toBeVisible();
    await expect(page.locator('#date')).not.toBeVisible();
    await expect(editor).toContainText('Erste Zeile');
    await expect(editor).toContainText('Zweite Zeile');
  });

  test('formatted description (bold) roundtrips to the event detail page', async ({ page }) => {
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
    await editor.type('Mit fettem Text');
    await page.waitForTimeout(200);

    await page.evaluate(() => {
      const el = document.querySelector('[data-testid="description-editor"] .rte-content');
      const range = document.createRange();
      range.selectNodeContents(el);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    });

    await page.getByLabel('Fett (Strg+B)').click();
    await page.waitForTimeout(300);

    const htmlAfterBold = await editor.innerHTML();
    expect(htmlAfterBold).toMatch(/<(strong|b)>/i);

    await page.getByRole('button', { name: /änderungen speichern/i }).click();
    await page.waitForURL('/admin', { timeout: 10000 });

    await page.goto(`/event/${FOREIGN_PENDING_SLUG}`);
    await page.waitForSelector('.event-description', { timeout: 10000 });

    const detailDescription = page.locator('.event-description .rich-text-view');
    await expect(detailDescription).toBeVisible();
    await expect(detailDescription.locator('strong, b')).toContainText('Mit fettem Text');
  });
});
