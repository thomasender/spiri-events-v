import { test, expect } from '@playwright/test';
import { spawn } from 'child_process';
import { signInWithEmailAndPassword, signOut } from '../helpers/auth';

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

    await page.getByTestId('feedback-screenshot-thumb').first().click();

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

    await page.getByTestId('feedback-screenshot-thumb').first().click();
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
});
