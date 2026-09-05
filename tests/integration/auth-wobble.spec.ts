import { test, expect } from '@playwright/test';
import { clearEmulatorStorage } from '../helpers/auth';

const LOGIN_PATH = '/login';

async function submitAndExpectWobble(page, expectedErrorText: RegExp): Promise<void> {
  const submit = page.getByTestId('auth-submit');
  await submit.click();
  await expect(page.locator('.error-text', { hasText: expectedErrorText })).toBeVisible();
  await expect(submit).toHaveClass(/btn-wobble/);
  await page.waitForTimeout(1000);
  await expect(submit).not.toHaveClass(/btn-wobble/);
}

async function checkLegalBoxes(page): Promise<void> {
  await page.getByLabel(/Datenschutzerklärung/).check();
  await page.getByLabel(/AGBs/).check();
}

test.describe('Auth form: wobble feedback on validation & auth errors (gH9D7G2H)', () => {
  test.beforeEach(async () => {
    await clearEmulatorStorage();
  });

  test('wrong password on login shows error AND wobbles the Anmelden button', async ({ page }) => {
    await page.goto(LOGIN_PATH);

    await page.getByLabel('E-Mail').fill('niemand@example.com');
    await page.getByLabel('Passwort', { exact: true }).fill('falsches-passwort');

    await submitAndExpectWobble(
      page,
      /E-Mail oder Passwort sind falsch|Kein Konto mit dieser E-Mail-Adresse gefunden|Das Passwort ist falsch/
    );
  });

  test('login error message stays visible alongside the wobble', async ({ page }) => {
    await page.goto(LOGIN_PATH);

    await page.getByLabel('E-Mail').fill('niemand@example.com');
    await page.getByLabel('Passwort', { exact: true }).fill('falsches-passwort');

    const submit = page.getByTestId('auth-submit');
    await submit.click();

    const error = page.locator('.error-text');
    await expect(error).toBeVisible();
    await expect(error).toContainText(
      /E-Mail oder Passwort sind falsch|Kein Konto mit dieser E-Mail-Adresse gefunden|Das Passwort ist falsch/
    );
    await expect(submit).toHaveClass(/btn-wobble/);
  });

  test('password mismatch on registration shows error AND wobbles the Registrieren button', async ({
    page,
  }) => {
    await page.goto(LOGIN_PATH);
    await page.getByTestId('auth-tab-register').click();

    await page.getByLabel('Name').fill('Test User');
    await page.getByLabel('E-Mail').fill(`neu-${Date.now()}@example.com`);
    await page.getByLabel('Passwort', { exact: true }).fill('passwort1');
    await page.getByLabel('Passwort bestätigen').fill('passwort2');
    await checkLegalBoxes(page);

    await submitAndExpectWobble(page, /Passwörter stimmen nicht überein/);
  });

  test('password too short on registration shows error AND wobbles the Registrieren button', async ({
    page,
  }) => {
    await page.goto(LOGIN_PATH);
    await page.getByTestId('auth-tab-register').click();

    await page.getByLabel('Name').fill('Test User');
    await page.getByLabel('E-Mail').fill(`kurz-${Date.now()}@example.com`);
    await page.getByLabel('Passwort', { exact: true }).fill('abc');
    await page.getByLabel('Passwort bestätigen').fill('abc');
    await checkLegalBoxes(page);

    await submitAndExpectWobble(page, /Passwort muss mindestens 6 Zeichen/);
  });

  test('missing datenschutz checkbox on registration shows error AND wobbles the Registrieren button', async ({
    page,
  }) => {
    await page.goto(LOGIN_PATH);
    await page.getByTestId('auth-tab-register').click();

    await page.getByLabel('Name').fill('Test User');
    await page.getByLabel('E-Mail').fill(`ds-${Date.now()}@example.com`);
    await page.getByLabel('Passwort', { exact: true }).fill('passwort1');
    await page.getByLabel('Passwort bestätigen').fill('passwort1');
    await page.getByLabel(/AGBs/).check();

    await submitAndExpectWobble(page, /akzeptiere die Datenschutzerklärung/);
  });

  test('missing AGBs checkbox on registration shows error AND wobbles the Registrieren button', async ({
    page,
  }) => {
    await page.goto(LOGIN_PATH);
    await page.getByTestId('auth-tab-register').click();

    await page.getByLabel('Name').fill('Test User');
    await page.getByLabel('E-Mail').fill(`agb-${Date.now()}@example.com`);
    await page.getByLabel('Passwort', { exact: true }).fill('passwort1');
    await page.getByLabel('Passwort bestätigen').fill('passwort1');
    await page.getByLabel(/Datenschutzerklärung/).check();

    await submitAndExpectWobble(page, /stimme den AGBs zu/);
  });

  test('wobble re-triggers when user submits with bad credentials again', async ({ page }) => {
    await page.goto(LOGIN_PATH);

    await page.getByLabel('E-Mail').fill('niemand@example.com');
    await page.getByLabel('Passwort', { exact: true }).fill('falsches-passwort');

    const submit = page.getByTestId('auth-submit');
    await submit.click();
    await expect(submit).toHaveClass(/btn-wobble/);

    await page.waitForTimeout(1000);
    await expect(submit).not.toHaveClass(/btn-wobble/);

    await page.getByLabel('Passwort', { exact: true }).fill('immernochefalsch');
    await submit.click();
    await expect(submit).toHaveClass(/btn-wobble/);
  });

  test('wobble state is cleared when switching between login and register tabs', async ({
    page,
  }) => {
    await page.goto(LOGIN_PATH);

    await page.getByTestId('auth-tab-register').click();

    await page.getByLabel('Name').fill('Test User');
    await page.getByLabel('E-Mail').fill(`switch-${Date.now()}@example.com`);
    await page.getByLabel('Passwort', { exact: true }).fill('abc');
    await page.getByLabel('Passwort bestätigen').fill('xyz');

    const submit = page.getByTestId('auth-submit');
    await submit.click();
    await expect(submit).toHaveClass(/btn-wobble/);

    await page.getByTestId('auth-tab-login').click();
    await page.waitForTimeout(100);
    await expect(submit).not.toHaveClass(/btn-wobble/);
  });
});
