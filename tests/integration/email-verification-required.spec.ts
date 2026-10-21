import { test, expect } from '@playwright/test';
import { signInWithEmailAndPassword } from '../helpers/auth';
import { STORAGE_STATE } from '../helpers/roles';

const CHAT_FLAG_URL =
  'http://127.0.0.1:8181/v1/projects/spirieventsvbg/databases/(default)/documents/app_settings/chat';

const FIRESTORE_DOCS =
  'http://127.0.0.1:8181/v1/projects/spirieventsvbg/databases/(default)/documents';
const OWNER = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };

async function setMessengerMode(mode: 'off' | 'all'): Promise<void> {
  const res = await fetch(`${FIRESTORE_DOCS}/app_settings/messenger`, {
    method: 'PATCH',
    headers: OWNER,
    body: JSON.stringify({ fields: { mode: { stringValue: mode } } }),
  });
  expect(res.ok).toBe(true);
}

async function listDocs(path: string): Promise<string[]> {
  // showMissing also lists threads whose own doc is gone but that still hold messages.
  const res = await fetch(`${FIRESTORE_DOCS}/${path}?pageSize=300&showMissing=true`, {
    headers: OWNER,
  });
  const json = (await res.json()) as { documents?: { name: string }[] };
  return (json.documents ?? []).map((d) => d.name);
}

// Start every messenger run from an empty inbox (emulator data only).
async function resetMessenger(): Promise<void> {
  for (const thread of await listDocs('dm_threads')) {
    for (const message of await listDocs(`${thread.split('/documents/')[1]}/messages`)) {
      await fetch(`http://127.0.0.1:8181/v1/${message}`, { method: 'DELETE', headers: OWNER });
    }
    await fetch(`http://127.0.0.1:8181/v1/${thread}`, { method: 'DELETE', headers: OWNER });
  }
  for (const col of ['dm_starters', 'dm_blocks', 'dm_settings']) {
    for (const name of await listDocs(col)) {
      await fetch(`http://127.0.0.1:8181/v1/${name}`, { method: 'DELETE', headers: OWNER });
    }
  }
}

async function setChatMode(mode: 'off' | 'all'): Promise<void> {
  const res = await fetch(CHAT_FLAG_URL, {
    method: 'PATCH',
    headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: { mode: { stringValue: mode } } }),
  });
  expect(res.ok).toBe(true);
}

test.describe('Email verification required for event creation', () => {
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

  test(
    'unverified user sees the verification banner and a locked "Neues Event" on /admin',
    { tag: '@smoke' },
    async ({ page }) => {
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
    }
  );

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

  // Both tests switch the global chat flags on and off again, so they must not overlap.
  test.describe('Chat and messenger', () => {
    test.describe.configure({ mode: 'serial' });

    test('Lagerfeuer chat: verified members chat live, unverified users are asked to verify', async ({
      browser,
      baseURL,
    }) => {
      await setChatMode('all');
      const open = async (role: 'user' | 'admin' | 'unverified') => {
        const context = await browser.newContext({ baseURL, storageState: STORAGE_STATE[role] });
        const page = await context.newPage();
        await page.goto('/chat');
        return { context, page };
      };
      const member = await open('user');
      const other = await open('admin');
      const locked = await open('unverified');
      try {
        await expect(locked.page.getByTestId('chat-unverified')).toBeVisible();
        await expect(locked.page.getByTestId('chat-input')).toHaveCount(0);

        for (const { page } of [member, other]) {
          const accept = page.getByTestId('chat-rules-accept');
          await accept.click();
        }

        // On desktop the cursor is already in the message field.
        await expect(member.page.getByTestId('chat-input')).toBeFocused();

        // Both members see each other at the fire (presence) in real time.
        await expect(member.page.getByTestId('chat-presence-count')).toHaveText('2');
        await expect(other.page.getByTestId('chat-presence-count')).toHaveText('2');

        const text = `Hallo vom Lagerfeuer ${Date.now()} 🌿`;
        await member.page.getByTestId('chat-input').fill(text);
        await member.page.getByTestId('chat-send').click();

        // The second member sees it without reloading.
        await expect(
          other.page.getByTestId('chat-message').filter({ hasText: text })
        ).toBeVisible();
        await expect(member.page.getByTestId('chat-input')).toHaveValue('');
      } finally {
        await setChatMode('off');
        await Promise.all([member, other, locked].map(({ context }) => context.close()));
      }
    });

    test('Postfach: a member opens a private chat from the Lagerfeuer and the other sees the unread bubble', async ({
      browser,
      baseURL,
    }) => {
      await setChatMode('all');
      await setMessengerMode('all');
      await resetMessenger();
      const open = async (role: 'user' | 'admin', path: string) => {
        const context = await browser.newContext({ baseURL, storageState: STORAGE_STATE[role] });
        const page = await context.newPage();
        await page.goto(path);
        return { context, page };
      };
      const sender = await open('user', '/chat');
      const receiver = await open('admin', '/chat');
      try {
        for (const { page } of [sender, receiver]) {
          await page.getByTestId('chat-rules-accept').click();
        }
        await expect(sender.page.getByTestId('chat-presence-count')).toHaveText('2');

        // Click the other person in the "who is here" strip, then "Nachricht senden".
        await sender.page.getByTestId('chat-presence').getByRole('button').first().click();
        await sender.page.getByTestId('member-card-message').click();
        await expect(sender.page).toHaveURL(/\/postfach\/.+/);

        const text = `Privat ${Date.now()} 🌿`;
        await sender.page.getByTestId('dm-input').fill(text);
        await sender.page.getByTestId('dm-send').click();
        await expect(sender.page.getByTestId('dm-message').filter({ hasText: text })).toBeVisible();

        // The receiver sees the red bubble in the menu without reloading.
        await expect(receiver.page.getByTestId('messenger-unread-badge').first()).toHaveText('1');
        await receiver.page.getByTestId('nav-messenger').first().click();
        await receiver.page.getByTestId('messenger-thread').first().click();
        await expect(
          receiver.page.getByTestId('dm-message').filter({ hasText: text })
        ).toBeVisible();
        await expect(receiver.page.getByTestId('messenger-unread-badge')).toHaveCount(0);

        // And answers; the sender gets it live.
        const answer = `Antwort ${Date.now()}`;
        await receiver.page.getByTestId('dm-input').fill(answer);
        await receiver.page.getByTestId('dm-send').click();
        await expect(
          sender.page.getByTestId('dm-message').filter({ hasText: answer })
        ).toBeVisible();
      } finally {
        await setChatMode('off');
        await setMessengerMode('off');
        await Promise.all([sender, receiver].map(({ context }) => context.close()));
      }
    });
  });
});
