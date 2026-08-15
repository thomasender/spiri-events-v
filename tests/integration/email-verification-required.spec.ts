import { test, expect } from '@playwright/test';
import { signInWithEmailAndPassword, signOut } from '../helpers/auth';

test.describe('Email verification required for event creation', () => {
  test.afterEach(async ({ page }) => {
    await signOut(page);
  });

  test('verified user sees the "Neues Event" button on /admin and can open the form', async ({
    page,
  }) => {
    await signInWithEmailAndPassword(page, 'user@test.local', 'testpassword123');
    await page.goto('/admin');

    const newEventLink = page.locator('.admin-page-header a.btn-primary', {
      hasText: 'Neues Event',
    });
    await expect(newEventLink).toBeVisible();

    await expect(page.getByTestId('email-verification-banner')).toHaveCount(0);

    await newEventLink.click();
    await page.waitForURL(/\/admin\/new/);
    await expect(page.getByTestId('event-create-blocked')).toHaveCount(0);
  });

  test('unverified user sees the verification banner and a disabled "Neues Event" on /admin', async ({
    page,
  }) => {
    await signInWithEmailAndPassword(page, 'unverified@test.local', 'testpassword123');
    await page.goto('/admin');

    await expect(page.getByTestId('email-verification-banner')).toBeVisible();
    await expect(page.getByTestId('email-verification-banner-email')).toContainText(
      'unverified@test.local'
    );

    const lockedButton = page.getByTestId('new-event-locked');
    await expect(lockedButton).toBeVisible();
    await expect(lockedButton).toHaveAttribute('aria-disabled', 'true');

    const realLink = page.locator('.admin-page-header a.btn-primary', {
      hasText: 'Neues Event',
    });
    await expect(realLink).toHaveCount(0);
  });

  test('unverified user sees a locked "Event erstellen" link in the header', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'unverified@test.local', 'testpassword123');
    await page.goto('/');

    await expect(page.getByTestId('event-create-locked').first()).toBeVisible();

    const link = page.locator('a.nav-link', { hasText: 'Event erstellen' });
    await expect(link).toHaveCount(0);
  });

  test('unverified user navigating directly to /admin/new sees the blocked screen', async ({
    page,
  }) => {
    await signInWithEmailAndPassword(page, 'unverified@test.local', 'testpassword123');
    await page.goto('/admin/new');

    await expect(page.getByTestId('event-create-blocked')).toBeVisible();
    await expect(page.getByTestId('email-verification-banner')).toBeVisible();
  });

  test('admin (exempt from email verification) can create events even without email confirmed', async ({
    page,
  }) => {
    // Use the dev@local admin without email-verified flag by simulating unverified
    // through a fresh signup, but here we rely on the existing admin role trumping
    // the email check.
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin/new');

    await expect(page.getByTestId('event-create-blocked')).toHaveCount(0);
  });

  test('unverified user can trigger the resend-verification button and sees feedback', async ({
    page,
  }) => {
    await signInWithEmailAndPassword(page, 'unverified@test.local', 'testpassword123');
    await page.goto('/admin');

    const banner = page.getByTestId('email-verification-banner');
    await expect(banner).toBeVisible();

    const resendButton = page.getByTestId('email-verification-resend');
    await expect(resendButton).toBeVisible();
    await resendButton.click();

    await expect(page.getByTestId('email-verification-banner-feedback')).toBeVisible();
  });
});
