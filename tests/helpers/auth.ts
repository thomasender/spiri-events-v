import { test as base, Page } from '@playwright/test';

export const AUTH_EMULATOR_URL = 'http://localhost:9199';
export const STORAGE_EMULATOR_URL = 'http://localhost:9299';
export const PROJECT_ID = 'spirieventsvbg';

export async function signInWithEmailAndPassword(
  page: Page,
  email: string,
  password: string
): Promise<void> {
  await page.goto('/login');

  await page.fill('input[type="email"], input[name="email"], input[id="email"]', email);
  await page.fill('input[type="password"], input[name="password"], input[id="password"]', password);
  await page.click('button[type="submit"]');

  await page.waitForURL(/\/(?!login)/, { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(2000);
}

export async function registerWithEmailAndPassword(
  page: Page,
  email: string,
  password: string
): Promise<void> {
  await page.goto('/login');

  const toggleLink = page.locator('text=Konto erstellen');
  if (await toggleLink.isVisible()) {
    await toggleLink.click();
  }

  await page.fill('input[type="email"], input[name="email"], input[id="email"]', email);
  await page.fill('input[type="password"], input[name="password"], input[id="password"]', password);
  await page.click('button[type="submit"]');

  await page.waitForURL(/\/(?!login)/, { timeout: 10000 }).catch(() => {});
}

export async function signOut(page: Page): Promise<void> {
  await page.goto('/');
  const signOutButton = page.locator('text=Abmelden').first();
  if (await signOutButton.isVisible({ timeout: 2000 }).catch(() => false)) {
    await signOutButton.click();
  }
}

export async function createAuthenticatedUser(
  page: Page,
  email: string,
  password: string
): Promise<void> {
  const signUpToggle = page.locator('text=Konto erstellen');
  if (await signUpToggle.isVisible()) {
    await signUpToggle.click();
  }

  await page.fill('input[type="email"], input[name="email"], input[id="email"]', email);
  await page.fill('input[type="password"], input[name="password"], input[id="password"]', password);
  await page.click('button[type="submit"]');

  await page.waitForURL(/\/(?!login)/, { timeout: 10000 }).catch(() => {});
}

export async function setEmulatorAuthCookie(page: Page, uid: string): Promise<void> {
  await page.context().addCookies([
    {
      name: 'firebase-auth-container',
      value: JSON.stringify({
        uid,
        email: 'test@example.com',
      }),
      domain: 'localhost',
      path: '/',
    },
  ]);
}

export async function waitForCalendarToLoad(page: Page): Promise<void> {
  // Use 'attached' rather than the default 'visible': .calendar is intentionally
  // hidden via CSS on narrow viewports (< 900px), where the events section above
  // it already provides month navigation and an event list.
  await page.waitForSelector('.calendar', { state: 'attached', timeout: 10000 });
  await page
    .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
    .catch(() => {});
}

export async function clearEmulatorData(): Promise<void> {
  const clearFirestore = async (): Promise<void> => {
    try {
      await fetch(
        `http://localhost:8181/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`,
        {
          method: 'DELETE',
        }
      );
    } catch {
      // Ignore errors
    }
  };

  const clearAuth = async (): Promise<void> => {
    try {
      await fetch(`${AUTH_EMULATOR_URL}/emulator/v1/projects/${PROJECT_ID}/accounts`, {
        method: 'DELETE',
      });
    } catch {
      // Ignore errors
    }
  };

  await Promise.all([clearFirestore(), clearAuth()]);
}

export async function clearEmulatorStorage(): Promise<void> {
  try {
    await fetch(`${STORAGE_EMULATOR_URL}/storage/v1/b/${PROJECT_ID}.appspot.com/o?force=true`, {
      method: 'DELETE',
    });
  } catch {
    // Ignore errors
  }
}
