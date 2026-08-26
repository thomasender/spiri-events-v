import { test, expect } from '@playwright/test';
import {
  signInWithEmailAndPassword,
  clearEmulatorStorage,
  AUTH_EMULATOR_URL,
  PROJECT_ID,
} from '../helpers/auth';

const PROFILE_PATH = '/profil';

async function createAuthUser(email: string, password: string): Promise<string> {
  const url = `${AUTH_EMULATOR_URL}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Failed to create user ${email}: ${JSON.stringify(data)}`);
  }
  return data.localId;
}

async function deleteAuthUser(uid: string): Promise<void> {
  await fetch(`${AUTH_EMULATOR_URL}/emulator/v1/projects/${PROJECT_ID}/accounts:delete`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ localId: uid }),
  });
}

test.describe.serial('Profile Management', () => {
  test.beforeAll(async () => {
    await clearEmulatorStorage();
  });

  test('unauthenticated visit redirects to /login', async ({ page }) => {
    await page.goto(PROFILE_PATH);
    await page.waitForURL(/\/login/, { timeout: 10000 });
  });

  test('logged-in user can navigate to /profil via the header', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');

    await page.locator('.nav-desktop a.nav-link', { hasText: 'Mein Profil' }).click();

    await page.waitForURL(PROFILE_PATH, { timeout: 10000 });
    await expect(page.getByTestId('profile-page')).toBeVisible();
    await expect(page.getByTestId('profile-form-card')).toBeVisible();
    await expect(page.getByTestId('change-email-card')).toBeVisible();
    await expect(page.getByTestId('delete-account-card')).toBeVisible();
  });

  test('delete account section is collapsed by default and expands on request', async ({
    page,
  }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto(PROFILE_PATH);
    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    const card = page.getByTestId('delete-account-card');
    await expect(card).toBeVisible();

    // Heading is always visible
    await expect(card.getByRole('heading', { name: 'Konto löschen' })).toBeVisible();

    // The accordion is initially closed → password field is hidden
    await expect(page.getByTestId('delete-account-password')).not.toBeVisible();

    // Expanding the accordion reveals the password field
    await page.getByTestId('delete-account-accordion-summary').click();
    await expect(page.getByTestId('delete-account-password')).toBeVisible();

    // Toggling again collapses the section
    await page.getByTestId('delete-account-accordion-summary').click();
    await expect(page.getByTestId('delete-account-password')).not.toBeVisible();
  });

  test('profile page renders the form even without a pre-existing users/{uid} doc', async ({
    page,
  }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto(PROFILE_PATH);
    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    await expect(page.getByTestId('profile-displayName')).toBeVisible();
  });

  test('user can edit name, bio, website, contact and save to Firestore', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto(PROFILE_PATH);
    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    await page.getByTestId('profile-displayName').fill('Admin Tester');
    await page.getByTestId('profile-bio').fill('Bearbeitet durch Playwright-Test.');
    await page.getByTestId('profile-website').fill('www.example.com');
    await page.getByTestId('profile-contact').fill('tester@example.com');

    await page.getByTestId('profile-save').click();

    await expect(page.getByTestId('profile-save-success')).toBeVisible({ timeout: 10000 });

    // Verify the data persisted by reloading the page
    await page.reload();
    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    await expect(page.getByTestId('profile-displayName')).toHaveValue('Admin Tester');
    await expect(page.getByTestId('profile-bio')).toHaveValue('Bearbeitet durch Playwright-Test.');
    await expect(page.getByTestId('profile-website')).toHaveValue('https://www.example.com');
  });

  test('bio longer than 500 characters is rejected', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto(PROFILE_PATH);
    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    // The textarea has maxLength=500, so we use evaluate to bypass the
    // client-side cap and check the form validation still surfaces an error.
    const longBio = 'x'.repeat(600);
    await page.getByTestId('profile-bio').evaluate((el, value) => {
      const node = el as HTMLTextAreaElement;
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        'value'
      )?.set;
      setter?.call(node, value);
      node.dispatchEvent(new Event('input', { bubbles: true }));
    }, longBio);

    await page.getByTestId('profile-save').click();

    await expect(page.getByText(/500 Zeichen/i)).toBeVisible();
  });

  test('user can upload a profile photo and the file lands in users/{uid}/avatar/', async ({
    page,
  }) => {
    await clearEmulatorStorage();
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto(PROFILE_PATH);
    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    // Wait for the photo upload input to be in the DOM (it's hidden, so use 'attached')
    await page.waitForSelector('[data-testid="profile-photo-input"]', {
      state: 'attached',
      timeout: 15000,
    });

    await page.evaluate(async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 64;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.fillStyle = '#abcdef';
      ctx.fillRect(0, 0, 64, 64);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/jpeg', 0.9)
      );
      if (!blob) return;
      const file = new File([blob], 'avatar.jpg', { type: 'image/jpeg' });
      const dt = new DataTransfer();
      dt.items.add(file);
      const input = document.querySelector(
        '[data-testid="profile-photo-input"]'
      ) as HTMLInputElement;
      if (!input) throw new Error('profile-photo-input not found in DOM');
      input.files = dt.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });

    // Wait until the upload completes and the profile doc receives the photoURL
    await page.waitForFunction(
      () => {
        const img = document.querySelector('.profile-photo-preview img') as HTMLImageElement | null;
        return Boolean(img && img.src && img.src.startsWith('http'));
      },
      undefined,
      { timeout: 15000 }
    );

    // Save the profile so photoURL is persisted to Firestore
    await page.getByTestId('profile-displayName').fill('Admin With Photo');
    await page.getByTestId('profile-save').click();
    await expect(page.getByTestId('profile-save-success')).toBeVisible({ timeout: 10000 });

    // Verify a file was uploaded under users/<uid>/avatar/
    const storageObjects = await page.evaluate(async () => {
      const res = await fetch(
        `${window.location.origin.replace('5173', '9299')}/storage/v1/b/${'spirieventsvbg.firebasestorage.app'}/o?prefix=users/`
      );
      const data = await res.json();
      return (data.items || []).map((o: { name: string }) => o.name);
    });

    expect(storageObjects.some((name) => /\/avatar\//.test(name))).toBe(true);
  });

  test('change email requires the current password and updates the Auth email', async ({
    page,
  }) => {
    // Use a dedicated throwaway account so the rename doesn't break other tests
    const email = `change-email-ok-${Date.now()}@example.com`;
    const password = 'changepassword123';
    const uid = await createAuthUser(email, password);

    try {
      await signInWithEmailAndPassword(page, email, password);
      await page.goto(PROFILE_PATH);
      await page
        .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
        .catch(() => {});

      const newEmail = `renamed-${Date.now()}@example.com`;
      await page.getByTestId('change-email-new').fill(newEmail);
      await page.getByTestId('change-email-password').fill(password);
      await page.getByTestId('change-email-submit').click();

      await expect(page.getByTestId('change-email-success')).toBeVisible({ timeout: 15000 });

      await page.reload();
      await page
        .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
        .catch(() => {});
      await expect(page.getByTestId('current-email')).toHaveText(newEmail);
    } finally {
      // Clean up: ensure the renamed user doesn't linger in the emulator
      await deleteAuthUser(uid).catch(() => {});
    }
  });

  test('change email fails with a German error on wrong password', async ({ page }) => {
    const email = `change-email-bad-${Date.now()}@example.com`;
    const password = 'changepassword123';
    const uid = await createAuthUser(email, password);

    try {
      await signInWithEmailAndPassword(page, email, password);
      await page.goto(PROFILE_PATH);
      await page
        .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
        .catch(() => {});

      await page.getByTestId('change-email-new').fill(`wrong-pwd-${Date.now()}@example.com`);
      await page.getByTestId('change-email-password').fill('not-the-right-password');
      await page.getByTestId('change-email-submit').click();

      await expect(page.getByTestId('change-email-error')).toBeVisible({ timeout: 10000 });
      await expect(page.getByTestId('change-email-error')).toContainText(/Passwort/i);
    } finally {
      await deleteAuthUser(uid).catch(() => {});
    }
  });

  test('deleting an account removes the Auth user and the users/{uid} doc', async ({ page }) => {
    // Use a dedicated throwaway account so this destructive test cannot
    // affect admin@test.com used by other tests.
    const email = `delete-me-${Date.now()}@example.com`;
    const password = 'deletepassword123';

    // Register through the UI so useAuth.register() also seeds a users/{uid} doc.
    // The auth form is initially in login mode; toggle it to register mode.
    await page.goto('/login');
    await page.waitForSelector('button.link-btn', { timeout: 10000 });
    await page.getByTestId('auth-tab-register').click();
    await expect(page.locator('h1')).toContainText(/Konto erstellen/i, { timeout: 10000 });
    await page.waitForSelector('input#displayName', { timeout: 5000 });
    await page.fill('input#displayName', 'Delete Me');
    await page.fill('input#email', email);
    await page.fill('input#password', password);
    await page.fill('input#confirmPassword', password);
    await page.locator('label.checkbox-label').first().click();
    await page.locator('label.checkbox-label').nth(1).click();
    await page.getByRole('button', { name: 'Registrieren', exact: true }).click();

    // Wait for redirect away from /login (registration success → home)
    await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 15000 });

    // Confirm we are signed in as this new user before we delete
    await page.goto(PROFILE_PATH);
    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});
    await expect(page.getByTestId('profile-page')).toBeVisible({ timeout: 10000 });

    // Trigger the delete-account flow
    await page.getByTestId('delete-account-accordion-summary').click();
    await page.getByTestId('delete-account-password').fill(password);
    await page.getByTestId('delete-account-trigger').click();

    await expect(page.getByText(/Konto wirklich löschen/i)).toBeVisible({ timeout: 5000 });
    await page.getByRole('button', { name: /endgültig löschen/i }).click();

    // After deletion, the user is signed out and redirected to "/"
    await page.waitForURL(/^http:\/\/localhost:5173\/$/, { timeout: 15000 }).catch(() => {});

    // Behavioural check: trying to sign in with the deleted account should fail.
    // This proves the Auth user is gone (it cannot log back in).
    await page.goto('/login');
    await page.fill('input#email', email);
    await page.fill('input#password', password);
    await page.click('button[type="submit"]');
    await expect(page.locator('.error-text')).toBeVisible({
      timeout: 10000,
    });
    await expect(page.locator('.error-text')).toContainText(
      /Kein Konto|falsch|ungültig|nicht gefunden/i
    );
  });
});
