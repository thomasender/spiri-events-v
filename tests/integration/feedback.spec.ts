import { test, expect, request } from '@playwright/test';
import { spawn } from 'child_process';
import { signInWithEmailAndPassword, signOut } from '../helpers/auth';

const STORAGE_EMULATOR_URL = 'http://localhost:9299';
const PROJECT_ID = 'spirieventsvbg';
const STORAGE_BUCKET = `${PROJECT_ID}.firebasestorage.app`;

interface StorageObject {
  name: string;
}

interface StorageListResponse {
  items?: StorageObject[];
}

async function resetFeedbackFixtures(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const proc = spawn('node', ['scripts/reset-feedback-fixtures.mjs'], {
      cwd: process.cwd(),
      stdio: 'ignore',
      shell: true,
    });
    proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`reset exit ${code}`))));
    proc.on('error', reject);
  });
}

test.describe('Feedback feature', () => {
  test.afterEach(async ({ page }) => {
    await signOut(page);
  });

  test('Floating feedback button is visible on every page', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('feedback-fab')).toBeVisible();

    await page.goto('/login');
    await expect(page.getByTestId('feedback-fab')).toBeVisible();
  });

  test('Floating feedback button opens modal and modal closes via overlay click', async ({
    page,
  }) => {
    await page.goto('/');

    await page.getByTestId('feedback-fab').click();
    await expect(page.getByTestId('feedback-modal')).toBeVisible();

    await page.getByTestId('feedback-modal-overlay').click({ position: { x: 10, y: 10 } });
    await expect(page.getByTestId('feedback-modal')).not.toBeVisible();
  });

  test('Submitting an empty feedback shows a validation error', async ({ page }) => {
    await page.goto('/');

    await page.getByTestId('feedback-fab').click();
    await page.getByTestId('feedback-submit').click();

    await expect(page.getByTestId('feedback-description-error')).toBeVisible();
    await expect(page.getByTestId('feedback-description-error')).toContainText(
      /beschreib|anliegen/i
    );
  });

  test('Anonymous user can submit feedback with just a description', async ({ page }) => {
    await resetFeedbackFixtures();

    await page.goto('/');
    await page.getByTestId('feedback-fab').click();

    await page
      .getByTestId('feedback-description')
      .fill('Wunderschöne Plattform, danke für eure Arbeit!');

    await expect(page.getByTestId('feedback-page-context')).toHaveCount(0);

    await page.getByTestId('feedback-submit').click();

    await expect(page.getByTestId('feedback-success')).toBeVisible({ timeout: 15000 });
  });

  test('Invalid email address shows a validation error', async ({ page }) => {
    await page.goto('/');

    await page.getByTestId('feedback-fab').click();
    await page.getByTestId('feedback-description').fill('Feedback mit ungültiger E-Mail');
    await page.getByTestId('feedback-email').fill('kein-email');
    await page.getByTestId('feedback-submit').click();

    await expect(page.getByTestId('feedback-email-error')).toBeVisible();
  });

  test('Admin sees a Feedback tab in the Verwaltung page', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin');

    await expect(page.getByTestId('admin-tab-feedback')).toBeVisible();
    await expect(page.getByTestId('admin-tab-feedback')).toContainText('Feedback');
  });

  test('Admin sees an unread badge on the Feedback tab when there is new feedback', async ({
    page,
  }) => {
    await resetFeedbackFixtures();

    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin');

    await expect(page.getByTestId('admin-tab-feedback-badge')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('admin-tab-feedback-badge')).toHaveText('3');
  });

  test('Admin sees feedback items in the Feedback tab and can navigate to it via URL', async ({
    page,
  }) => {
    await resetFeedbackFixtures();

    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin?tab=feedback');

    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    await expect(page.getByTestId('feedback-tab')).toBeVisible({ timeout: 10000 });

    const items = page.getByTestId('feedback-item');
    await expect(items).toHaveCount(3);

    const firstDescription = items.first().getByTestId('feedback-item-description');
    await expect(firstDescription).toContainText('Super Plattform');

    const secondDescription = items.nth(1).getByTestId('feedback-item-description');
    await expect(secondDescription).toContainText('Bezirks-Filter');

    const thirdDescription = items.nth(2).getByTestId('feedback-item-description');
    await expect(thirdDescription).toContainText('Filterung');
  });

  test('Admin can switch to Feedback tab via clicking and URL updates', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin');

    await page.getByTestId('admin-tab-feedback').click();

    await expect(page.getByTestId('admin-tab-feedback')).toHaveAttribute('aria-selected', 'true');
    await expect(page).toHaveURL(/tab=feedback/);
  });

  test('Switching back to Meine Events from Feedback clears the tab query param', async ({
    page,
  }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin?tab=feedback');

    await page.getByTestId('admin-tab-events').click();
    expect(page.url()).not.toContain('tab=feedback');
  });

  test('Non-admin user does not see the Feedback tab in Verwaltung', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'user@test.local', 'testpassword123');
    await page.goto('/admin');

    await expect(page.getByTestId('admin-tab-feedback')).toHaveCount(0);
  });

  test('Feedback items show user-provided name and email when present', async ({ page }) => {
    await resetFeedbackFixtures();

    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin?tab=feedback');

    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    await expect(page.getByTestId('feedback-tab')).toBeVisible({ timeout: 10000 });

    await expect(page.getByText('Peter Mathis')).toBeVisible();
    await expect(page.getByRole('link', { name: 'peter@example.com' })).toBeVisible();
  });

  test('Feedback list sanitizes URL by stripping query string and hash in link text', async ({
    page,
  }) => {
    await resetFeedbackFixtures();

    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin?tab=feedback');

    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    await expect(page.getByTestId('feedback-tab')).toBeVisible({ timeout: 10000 });

    const anna = page.getByTestId('feedback-item').filter({ hasText: 'Anna' });

    const pageLink = anna.getByRole('link', { name: 'https://events.thetribe.at/' });
    await expect(pageLink).toBeVisible();
    await expect(pageLink).toHaveAttribute('href', /foo=bar/);
    await expect(pageLink).not.toHaveText(/foo=bar/);
    await expect(pageLink).not.toHaveText(/#section/);
  });

  test('Admin can open, view and close the screenshot lightbox', async ({ page }) => {
    await resetFeedbackFixtures();

    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin?tab=feedback');

    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    await expect(page.getByTestId('feedback-tab')).toBeVisible({ timeout: 10000 });

    const annaItem = page.getByTestId('feedback-item').filter({ hasText: 'Anna' });
    await annaItem.getByTestId('feedback-screenshot-thumb').click();

    const lightbox = page.getByTestId('feedback-screenshot-lightbox');
    await expect(lightbox).toBeVisible();
    await expect(page.getByTestId('feedback-screenshot-lightbox-image')).toBeVisible();
    await expect(page.getByTestId('feedback-screenshot-download')).toBeVisible();
    await expect(page.getByTestId('feedback-screenshot-download')).toHaveAttribute(
      'href',
      /seed-feedback-screenshot\.png/
    );

    await page.getByTestId('feedback-screenshot-close').click();
    await expect(lightbox).not.toBeVisible();
  });

  test('Screenshot lightbox closes on Escape key', async ({ page }) => {
    await resetFeedbackFixtures();

    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin?tab=feedback');

    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    await expect(page.getByTestId('feedback-tab')).toBeVisible({ timeout: 10000 });

    const annaItem = page.getByTestId('feedback-item').filter({ hasText: 'Anna' });
    await annaItem.getByTestId('feedback-screenshot-thumb').click();
    await expect(page.getByTestId('feedback-screenshot-lightbox')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('feedback-screenshot-lightbox')).not.toBeVisible();
  });

  test('Feedback without a screenshot does not render a thumbnail', async ({ page }) => {
    await resetFeedbackFixtures();

    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin?tab=feedback');

    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    await expect(page.getByTestId('feedback-tab')).toBeVisible({ timeout: 10000 });

    const peter = page.getByTestId('feedback-item').filter({ hasText: 'Peter Mathis' });
    await expect(peter.getByTestId('feedback-screenshot-thumb')).toHaveCount(0);
  });

  test('Submitting feedback with a screenshot persists the URL in Firestore and Storage', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByTestId('feedback-fab').click();
    await expect(page.getByTestId('feedback-modal')).toBeVisible();

    await page.getByTestId('feedback-description').fill('Bug mit Screenshot — bitte ansehen');

    await page.evaluate(async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 32;
      canvas.height = 32;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.fillStyle = '#ff0000';
      ctx.fillRect(0, 0, 32, 32);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/jpeg', 0.9)
      );
      if (!blob) return;
      const file = new File([blob], 'test-screenshot.jpg', { type: 'image/jpeg' });
      const dt = new DataTransfer();
      dt.items.add(file);
      const input = document.querySelector(
        '[data-testid="feedback-screenshot-input"]'
      ) as HTMLInputElement;
      if (!input) throw new Error('feedback-screenshot-input not found');
      input.files = dt.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });

    await expect(page.getByTestId('feedback-screenshot-preview')).toBeVisible({ timeout: 5000 });
    await page.getByTestId('feedback-submit').click();
    await expect(page.getByTestId('feedback-success')).toBeVisible({ timeout: 20000 });

    const apiContext = await request.newContext();
    try {
      const storageListResponse = await apiContext.get(
        `${STORAGE_EMULATOR_URL}/storage/v1/b/${STORAGE_BUCKET}/o?prefix=feedback%2F`
      );
      expect(storageListResponse.ok()).toBeTruthy();
      const storage = (await storageListResponse.json()) as StorageListResponse;
      const items = storage.items ?? [];
      const testObject = items.find(
        (it) => it.name.startsWith('feedback/') && it.name.includes('test-screenshot.jpg')
      );
      expect(testObject, 'expected uploaded screenshot under feedback/*/').toBeTruthy();
    } finally {
      await apiContext.dispose();
    }

    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin?tab=feedback');
    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});
    await expect(page.getByTestId('feedback-tab')).toBeVisible({ timeout: 10000 });

    const newItem = page.getByTestId('feedback-item').filter({ hasText: 'Bug mit Screenshot' });
    await expect(newItem).toBeVisible({ timeout: 10000 });
    await expect(newItem.getByTestId('feedback-screenshot-thumb')).toBeVisible({ timeout: 10000 });
  });

  test('Feedback submitted from an event detail page captures that page as the link', async ({
    page,
  }) => {
    await page.goto('/event/yoga-heute-yogastudio-dornbirn-20260807');

    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    await page.getByTestId('feedback-fab').click();
    await expect(page.getByTestId('feedback-modal')).toBeVisible();

    await page.getByTestId('feedback-description').fill('Feedback von der Event-Detailseite');

    const linkField = page.getByTestId('feedback-link');
    await expect(linkField).toBeVisible();
    await expect(linkField).toHaveValue(/\/event\/yoga-heute-yogastudio-dornbirn-20260807/);

    await page.getByTestId('feedback-submit').click();
    await expect(page.getByTestId('feedback-success')).toBeVisible({ timeout: 15000 });

    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin?tab=feedback');
    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});
    await expect(page.getByTestId('feedback-tab')).toBeVisible({ timeout: 10000 });

    const newItem = page
      .getByTestId('feedback-item')
      .filter({ hasText: 'Feedback von der Event-Detailseite' });
    await expect(newItem).toBeVisible({ timeout: 10000 });

    const pageLinks = newItem.locator('.feedback-item-details a[href]');
    const hrefs = await pageLinks.evaluateAll((els) => els.map((el) => el.getAttribute('href')));
    const eventHref = hrefs.find((href) => href && href.includes('/event/yoga-heute'));
    expect(eventHref).toBeTruthy();
    expect(eventHref).toMatch(/\/event\/yoga-heute-yogastudio-dornbirn-20260807/);
  });

  test('Feedback submitted from /impressum stores the precise page title (not the calendar)', async ({
    page,
  }) => {
    await resetFeedbackFixtures();

    await page.goto('/impressum');

    await expect(page).toHaveTitle(/Impressum/);

    await page.getByTestId('feedback-fab').click();
    await expect(page.getByTestId('feedback-modal')).toBeVisible();

    await page
      .getByTestId('feedback-description')
      .fill('Bitte präziseren Label-Test vom Impressum');

    await page.getByTestId('feedback-submit').click();
    await expect(page.getByTestId('feedback-success')).toBeVisible({ timeout: 15000 });

    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin?tab=feedback');
    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});
    await expect(page.getByTestId('feedback-tab')).toBeVisible({ timeout: 10000 });

    const newItem = page
      .getByTestId('feedback-item')
      .filter({ hasText: 'Bitte präziseren Label-Test vom Impressum' });
    await expect(newItem).toBeVisible({ timeout: 10000 });

    const pageLink = newItem.getByRole('link', { name: /Impressum/ });
    await expect(pageLink).toBeVisible();
    await expect(pageLink).toHaveAttribute('href', /\/impressum/);
    await expect(pageLink).not.toHaveText(/Kalender/);
  });

  test('User can override the auto-captured page link in the feedback form', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('feedback-fab').click();
    await expect(page.getByTestId('feedback-modal')).toBeVisible();

    await page.getByTestId('feedback-description').fill('Manuell überschriebener Seitenlink');

    await page.getByTestId('feedback-link').fill('https://events.thetribe.at/impressum');
    await page.getByTestId('feedback-submit').click();
    await expect(page.getByTestId('feedback-success')).toBeVisible({ timeout: 15000 });

    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin?tab=feedback');
    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});
    await expect(page.getByTestId('feedback-tab')).toBeVisible({ timeout: 10000 });

    const newItem = page
      .getByTestId('feedback-item')
      .filter({ hasText: 'Manuell überschriebener Seitenlink' });
    await expect(newItem).toBeVisible({ timeout: 10000 });

    const pageLinks = newItem.locator('.feedback-item-details a[href]');
    const hrefs = await pageLinks.evaluateAll((els) => els.map((el) => el.getAttribute('href')));
    expect(hrefs).toContain('https://events.thetribe.at/impressum');
  });
});
