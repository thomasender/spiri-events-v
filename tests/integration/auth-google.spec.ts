import { test, expect } from '@playwright/test';
import { clearEmulatorStorage } from '../helpers/auth';

const LOGIN_PATH = '/login';

test.describe('Google sign-in button on auth page', () => {
  test.beforeEach(async () => {
    await clearEmulatorStorage();
  });

  test('shows the Google sign-in button on the login tab', async ({ page }) => {
    await page.goto(LOGIN_PATH);

    const googleBtn = page.getByTestId('auth-google-signin');
    await expect(googleBtn).toBeVisible();
    await expect(googleBtn).toContainText(/Mit Google anmelden/i);
  });

  test('shows the Google sign-in button on the register tab with the matching label', async ({
    page,
  }) => {
    await page.goto(LOGIN_PATH);
    await page.getByTestId('auth-tab-register').click();

    const googleBtn = page.getByTestId('auth-google-signin');
    await expect(googleBtn).toBeVisible();
    await expect(googleBtn).toContainText(/Mit Google registrieren/i);
  });

  test('shows an "oder" divider between the email/password form and the Google button', async ({
    page,
  }) => {
    await page.goto(LOGIN_PATH);

    const googleBtn = page.getByTestId('auth-google-signin');
    await expect(googleBtn).toBeVisible();
    await expect(page.getByText(/^oder$/i)).toBeVisible();
  });

  test('hides the Google button while in forgot-password mode', async ({ page }) => {
    await page.goto(LOGIN_PATH);
    await page.getByRole('button', { name: /Passwort vergessen\?/i }).click();

    await expect(page.getByTestId('auth-google-signin')).toHaveCount(0);
  });

  test('renders the Google "G" logo inside the button', async ({ page }) => {
    await page.goto(LOGIN_PATH);

    const googleBtn = page.getByTestId('auth-google-signin');
    await expect(googleBtn.locator('svg.google-icon')).toHaveCount(1);
  });

  test('clicking the Google button triggers a pending sign-in attempt (loading state)', async ({
    page,
  }) => {
    // The Firebase Auth Emulator does not support OAuth providers like Google:
    // the signInWithPopup() call either blocks or errors out without producing a
    // useful in-page state. What we CAN verify in this environment is that the
    // click is wired up — the button transitions into a loading/disabled state
    // while the popup attempt is in flight. End-to-end Google sign-in itself is
    // exercised by Firebase against the production project.
    await page.goto(LOGIN_PATH);

    const googleBtn = page.getByTestId('auth-google-signin');
    await expect(googleBtn).toBeEnabled();

    await googleBtn.click();

    // The button should enter a loading state (disabled) immediately after the
    // click while the popup/redirect attempt is in flight.
    await expect(googleBtn).toBeDisabled({ timeout: 5000 });
  });
});
