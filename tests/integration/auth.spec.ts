import { test, expect } from '@playwright/test';
import { clearEmulatorStorage } from '../helpers/auth';

const LOGIN_PATH = '/login';

test.describe('Authentication UX', () => {
  test.beforeEach(async () => {
    await clearEmulatorStorage();
  });

  test('login page shows both login and register tabs', async ({ page }) => {
    await page.goto(LOGIN_PATH);
    await expect(page.getByTestId('auth-tab-login')).toBeVisible();
    await expect(page.getByTestId('auth-tab-register')).toBeVisible();
    await expect(page.getByTestId('auth-tab-login')).toHaveAttribute('aria-selected', 'true');
  });

  test('switching to register reveals name, confirm-password and checkboxes', async ({ page }) => {
    await page.goto(LOGIN_PATH);
    await page.getByTestId('auth-tab-register').click();

    await expect(page.getByLabel('Name')).toBeVisible();
    await expect(page.getByLabel('Passwort bestätigen')).toBeVisible();
    await expect(page.getByLabel(/Datenschutzerklärung/)).toBeVisible();
    await expect(page.getByLabel(/AGBs/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Registrieren' })).toBeVisible();
    await expect(page.getByTestId('auth-tab-register')).toHaveAttribute('aria-selected', 'true');
  });

  test('invalid login shows inline CTA to create account with the typed email', async ({
    page,
  }) => {
    await page.goto(LOGIN_PATH);
    const email = 'neu@example.com';
    await page.getByLabel('E-Mail').fill(email);
    await page.getByLabel('Passwort', { exact: true }).fill('falsches-passwort');

    await page.getByRole('button', { name: 'Anmelden' }).click();

    const cta = page.getByTestId('auth-create-cta');
    await expect(cta).toBeVisible();
    await expect(cta).toContainText(email);
  });

  test('CTA switches to register tab and prefills email', async ({ page }) => {
    await page.goto(LOGIN_PATH);
    const email = 'neu@example.com';
    await page.getByLabel('E-Mail').fill(email);
    await page.getByLabel('Passwort', { exact: true }).fill('falsches-passwort');

    await page.getByRole('button', { name: 'Anmelden' }).click();
    await page.getByTestId('auth-create-cta-button').click();

    await expect(page.getByTestId('auth-tab-register')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByLabel('E-Mail')).toHaveValue(email);
    await expect(page.getByLabel('Passwort', { exact: true })).toHaveValue('');
    await expect(page.getByLabel('Passwort bestätigen')).toBeVisible();
  });

  test('switching tabs clears password fields but keeps email', async ({ page }) => {
    await page.goto(LOGIN_PATH);
    await page.getByLabel('E-Mail').fill('user@example.com');
    await page.getByLabel('Passwort', { exact: true }).fill('geheim123');

    await page.getByTestId('auth-tab-register').click();

    await expect(page.getByLabel('E-Mail')).toHaveValue('user@example.com');
    await expect(page.getByLabel('Passwort', { exact: true })).toHaveValue('');
    await expect(page.getByLabel('Passwort bestätigen')).toHaveValue('');
  });
});
