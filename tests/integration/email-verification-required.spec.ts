import { test, expect } from '@playwright/test';
import { signInWithEmailAndPassword } from '../helpers/auth';

test.describe('Email verification required for event creation @smoke', () => {
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

  test('unverified user sees the verification banner and a locked "Neues Event" on /admin', async ({
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
    await expect(lockedButton).toHaveAttribute(
      'title',
      'Bitte bestätige zuerst deine E-Mail-Adresse.'
    );

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

  test('clicking the locked "Event erstellen" in the header opens the verification modal', async ({
    page,
  }) => {
    await signInWithEmailAndPassword(page, 'unverified@test.local', 'testpassword123');
    await page.goto('/');

    const locked = page.getByTestId('event-create-locked').first();
    await expect(locked).toBeVisible();
    await locked.click();

    const modal = page.getByTestId('email-verification-modal');
    await expect(modal).toBeVisible();
    await expect(page.getByTestId('email-verification-modal-email')).toContainText(
      'unverified@test.local'
    );
    await expect(page.getByTestId('email-verification-modal-resend')).toBeVisible();
    await expect(page.getByTestId('email-verification-modal-refresh')).toBeVisible();
  });

  test('clicking the locked "Event erstellen" FAB on the home page opens the verification modal', async ({
    page,
  }) => {
    // The phone-only floating action button (CreateEventFab) replaces the
    // inline create-event CTA on the calendar page. Unverified users see
    // a locked button that opens the same verification modal as the
    // header's locked link.
    await page.setViewportSize({ width: 500, height: 800 });
    await signInWithEmailAndPassword(page, 'unverified@test.local', 'testpassword123');
    await page.goto('/');

    const fab = page.getByTestId('create-event-fab');
    await expect(fab).toBeVisible();
    await fab.click();

    const modal = page.getByTestId('email-verification-modal');
    await expect(modal).toBeVisible();
  });

  test('clicking the locked "Neues Event" on /admin opens the verification modal', async ({
    page,
  }) => {
    await signInWithEmailAndPassword(page, 'unverified@test.local', 'testpassword123');
    await page.goto('/admin');

    const locked = page.getByTestId('new-event-locked');
    await expect(locked).toBeVisible();
    await locked.click();

    const modal = page.getByTestId('email-verification-modal');
    await expect(modal).toBeVisible();
  });

  test('verification modal can be closed via the close button', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'unverified@test.local', 'testpassword123');
    await page.goto('/');

    await page.getByTestId('event-create-locked').first().click();
    await expect(page.getByTestId('email-verification-modal')).toBeVisible();

    await page.getByRole('button', { name: /schließen/i }).click();
    await expect(page.getByTestId('email-verification-modal')).toHaveCount(0);
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

  test('resend inside the verification modal works and shows feedback', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'unverified@test.local', 'testpassword123');
    await page.goto('/');

    await page.getByTestId('event-create-locked').first().click();
    const resendButton = page.getByTestId('email-verification-modal-resend');
    await expect(resendButton).toBeVisible();
    await resendButton.click();

    await expect(page.getByTestId('email-verification-modal-feedback')).toBeVisible();
  });

  test('forgot-password form routes through the branded sendPasswordResetEmailFn callable', async ({
    page,
  }) => {
    let sawCallable = false;
    page.on('request', (req) => {
      if (req.method() === 'POST' && req.url().includes('sendPasswordResetEmailFn')) {
        sawCallable = true;
      }
    });

    await page.goto('/login');

    await page.getByRole('button', { name: /Passwort vergessen\?/i }).click();
    await page.fill('input[type="email"]', 'admin@test.com');
    await page.getByRole('button', { name: /Link senden/i }).click();

    await expect(page.getByRole('heading', { name: 'E-Mail gesendet' })).toBeVisible();
    await expect(page.getByText(/überprüfe dein Postfach und folge dem Link/i)).toBeVisible();
    expect(sawCallable).toBe(true);
  });
});
