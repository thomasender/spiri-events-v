import { test, expect } from '@playwright/test';
import { signInWithEmailAndPassword, signOut } from '../helpers/auth';

test.describe('Event erstellen for non-logged-in users', () => {
  test('mobile menu shows "Event erstellen" link when logged out, pointing to /login', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 500, height: 800 });
    await page.goto('/');

    await expect(page.locator('.nav-desktop')).toBeHidden();
    await page.locator('.menu-toggle').click();

    const mobileMenu = page.locator('#mobile-menu');
    const createEventLink = mobileMenu.getByTestId('event-create-cta');
    await expect(createEventLink).toBeVisible();
    await expect(createEventLink).toContainText('Event erstellen');
    await expect(createEventLink).toHaveAttribute('href', '/login');
  });

  test('desktop nav shows "Event erstellen" link when logged out, pointing to /login', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');

    const createEventLink = page.locator('.nav-desktop').getByTestId('event-create-cta');
    await expect(createEventLink).toBeVisible();
    await expect(createEventLink).toContainText('Event erstellen');
    await expect(createEventLink).toHaveAttribute('href', '/login');
  });

  test('clicking "Event erstellen" in the mobile menu as logged-out user routes to /login', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 500, height: 800 });
    await page.goto('/');

    await page.locator('.menu-toggle').click();
    await page.locator('#mobile-menu').getByTestId('event-create-cta').click();

    await page.waitForURL(/\/login/);
    await expect(page.getByRole('heading', { name: /Willkommen|Konto/ })).toBeVisible();
  });

  test('mobile calendar page exposes a visible "Event erstellen" CTA for logged-out users', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 500, height: 800 });
    await page.goto('/');

    const cta = page.getByTestId('create-event-cta');
    await expect(cta).toBeVisible();

    const ctaButton = cta.getByTestId('create-event-cta-button');
    await expect(ctaButton).toBeVisible();
    await expect(ctaButton).toContainText('Event erstellen');
    await expect(ctaButton).toHaveAttribute('href', '/login');
  });

  test('clicking the mobile calendar CTA as a logged-out user routes to /login', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 500, height: 800 });
    await page.goto('/');

    await page.getByTestId('create-event-cta-button').click();

    await page.waitForURL(/\/login/);
    await expect(page.getByRole('heading', { name: /Willkommen|Konto/ })).toBeVisible();
  });

  test('desktop calendar page hides the in-page CTA (the nav link already exposes it)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');

    const cta = page.getByTestId('create-event-cta');
    await expect(cta).toBeHidden();
  });

  test('verified user sees an active "Event erstellen" CTA in the mobile nav and on the page', async ({
    page,
  }) => {
    await signInWithEmailAndPassword(page, 'user@test.local', 'testpassword123');
    await page.setViewportSize({ width: 500, height: 800 });
    await page.goto('/');

    const cta = page.getByTestId('create-event-cta');
    await expect(cta).toBeVisible();
    const ctaButton = cta.getByTestId('create-event-cta-button');
    await expect(ctaButton).toHaveAttribute('href', '/admin/new');

    await page.locator('.menu-toggle').click();
    const navLink = page.locator('#mobile-menu a.nav-link', { hasText: 'Event erstellen' });
    await expect(navLink).toBeVisible();
    await expect(navLink).toHaveAttribute('href', '/admin/new');

    await signOut(page);
  });

  test('unverified user sees a locked CTA on the page and a locked link in the mobile nav', async ({
    page,
  }) => {
    await signInWithEmailAndPassword(page, 'unverified@test.local', 'testpassword123');
    await page.setViewportSize({ width: 500, height: 800 });
    await page.goto('/');

    const lockedCta = page.getByTestId('create-event-cta-locked');
    await expect(lockedCta).toBeVisible();
    await expect(lockedCta).toHaveAttribute('aria-disabled', 'true');

    await page.locator('.menu-toggle').click();
    const lockedNav = page.locator('#mobile-menu').getByTestId('event-create-locked');
    await expect(lockedNav).toBeVisible();

    await signOut(page);
  });
});
