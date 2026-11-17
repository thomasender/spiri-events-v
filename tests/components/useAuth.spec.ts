import { describe, it, expect, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import {
  authErrorMessage,
  isGoogleProviderUser,
  isPasswordProviderUser,
  useAuth,
  verificationEmailErrorMessage,
} from '../../src/hooks/useAuth';

const callableMock = vi.hoisted(() => vi.fn());

// A fake Firebase auth: one signed-in user and the two listener kinds.
const fakeAuth = vi.hoisted(() => {
  const state = {
    currentUser: null as null | { uid: string; email: string; emailVerified: boolean },
    authListeners: new Set<(u: unknown) => void>(),
    tokenListeners: new Set<(u: unknown) => void>(),
  };
  return state;
});

vi.mock('../../src/lib/firebase', () => ({
  auth: fakeAuth,
  db: {},
  callable: callableMock,
  getStorageInstance: vi.fn(),
}));

vi.mock('firebase/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('firebase/auth')>()),
  onAuthStateChanged: (_auth: unknown, cb: (u: unknown) => void) => {
    fakeAuth.authListeners.add(cb);
    cb(fakeAuth.currentUser);
    return () => fakeAuth.authListeners.delete(cb);
  },
  onIdTokenChanged: (_auth: unknown, cb: (u: unknown) => void) => {
    fakeAuth.tokenListeners.add(cb);
    cb(fakeAuth.currentUser);
    return () => fakeAuth.tokenListeners.delete(cb);
  },
  getIdTokenResult: async () => ({ claims: {} }),
  createUserWithEmailAndPassword: async (_auth: unknown, email: string) => ({
    user: { uid: 'new-user', email, emailVerified: false, displayName: null },
  }),
  updateProfile: async () => {},
}));

vi.mock('firebase/firestore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('firebase/firestore')>()),
  doc: () => ({}),
  getDoc: async () => ({ exists: () => false }),
}));

describe('useAuth canCreateEvents', () => {
  it('unlocks event creation in every mounted instance once the e-mail is confirmed', async () => {
    fakeAuth.currentUser = { uid: 'new-user', email: 'new@test.local', emailVerified: false };
    // The "Event erstellen" page holds its own useAuth instance; the banner's
    // "erneut prüfen" reloads the same user object, which Firebase reports to
    // token listeners only (onAuthStateChanged stays silent for the same uid).
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.canCreateEvents).toBe(false);

    act(() => {
      fakeAuth.currentUser!.emailVerified = true;
      fakeAuth.tokenListeners.forEach((cb) => cb(fakeAuth.currentUser));
    });

    expect(result.current.canCreateEvents).toBe(true);
  });
});

describe('verificationEmailErrorMessage', () => {
  it('explains a failed verification email send in German instead of the generic error', () => {
    expect(verificationEmailErrorMessage({ code: 'functions/resource-exhausted' })).toMatch(
      /zu viele E-Mails/
    );
    expect(verificationEmailErrorMessage({ code: 'functions/unavailable' })).toMatch(
      /Bestätigungs-E-Mail konnte gerade nicht verschickt/
    );
    expect(verificationEmailErrorMessage({ code: 'functions/internal' })).toMatch(
      /Bestätigungs-E-Mail konnte gerade nicht verschickt/
    );
  });

  it('falls back to the auth error messages for auth codes', () => {
    expect(verificationEmailErrorMessage({ code: 'auth/network-request-failed' })).toMatch(
      /Netzwerk/
    );
  });
});

describe('authErrorMessage', () => {
  it('maps known Firebase auth error codes to German messages', () => {
    expect(authErrorMessage({ code: 'auth/wrong-password' })).toMatch(/Passwort ist falsch/);
    expect(authErrorMessage({ code: 'auth/email-already-in-use' })).toMatch(/bereits verwendet/);
    expect(authErrorMessage({ code: 'auth/requires-recent-login' })).toMatch(/erneut an/);
    expect(authErrorMessage({ code: 'auth/invalid-credential' })).toMatch(/falsch/);
    expect(authErrorMessage({ code: 'auth/user-mismatch' })).toMatch(/Anmeldung passt nicht/);
    expect(authErrorMessage({ code: 'auth/too-many-requests' })).toMatch(/warte/);
    expect(authErrorMessage({ code: 'auth/network-request-failed' })).toMatch(/Netzwerk/);
    expect(authErrorMessage({ code: 'auth/user-disabled' })).toMatch(/deaktiviert/);
    expect(authErrorMessage({ code: 'auth/user-token-expired' })).toMatch(/Sitzung/);
  });

  it('maps Google-specific auth error codes to German messages', () => {
    expect(authErrorMessage({ code: 'auth/popup-closed-by-user' })).toMatch(/abgebrochen/);
    expect(authErrorMessage({ code: 'auth/popup-blocked' })).toMatch(/Pop-up/);
    expect(authErrorMessage({ code: 'auth/cancelled-popup-request' })).toMatch(/abgebrochen/);
    expect(authErrorMessage({ code: 'auth/account-exists-with-different-credential' })).toMatch(
      /andere Anmeldemethode/
    );
    expect(authErrorMessage({ code: 'auth/unauthorized-domain' })).toMatch(/Domain.*freigegeben/);
    expect(authErrorMessage({ code: 'auth/operation-not-allowed' })).toMatch(/nicht verfügbar/);
    expect(authErrorMessage({ code: 'auth/internal-error' })).toMatch(/interner Fehler/);
    expect(authErrorMessage({ code: 'auth/app-not-authorized' })).toMatch(/autorisiert/);
    expect(authErrorMessage({ code: 'auth/invalid-api-key' })).toMatch(/Konfigurationsproblem/);
    expect(authErrorMessage({ code: 'auth/invalid-oauth-client-id' })).toMatch(
      /Konfigurationsproblem/
    );
  });

  it('falls back to a generic message for unknown codes', () => {
    expect(authErrorMessage({ code: 'auth/something-new' })).toMatch(/Ein Fehler/);
  });

  it('handles null/undefined input gracefully', () => {
    expect(authErrorMessage(null)).toMatch(/Ein Fehler/);
    expect(authErrorMessage(undefined)).toMatch(/Ein Fehler/);
  });
});

describe('isGoogleProviderUser', () => {
  it('returns true when providerData includes google.com', () => {
    expect(
      isGoogleProviderUser({
        providerData: [{ providerId: 'google.com', uid: 'x' }],
      })
    ).toBe(true);
  });

  it('returns false when providerData only has password', () => {
    expect(
      isGoogleProviderUser({
        providerData: [{ providerId: 'password', uid: 'x' }],
      })
    ).toBe(false);
  });

  it('returns false when providerData is missing', () => {
    expect(isGoogleProviderUser(null)).toBe(false);
    expect(isGoogleProviderUser({})).toBe(false);
  });
});

describe('isPasswordProviderUser', () => {
  it('returns true when providerData includes password', () => {
    expect(
      isPasswordProviderUser({
        providerData: [{ providerId: 'password', uid: 'x' }],
      })
    ).toBe(true);
  });

  it('returns false when providerData only has google.com', () => {
    expect(
      isPasswordProviderUser({
        providerData: [{ providerId: 'google.com', uid: 'x' }],
      })
    ).toBe(false);
  });

  it('returns true for legacy users without providerData when email is set', () => {
    expect(isPasswordProviderUser({ email: 'a@b.com' })).toBe(true);
  });
});

describe('useAuth register: confirmation link back to the event wizard', () => {
  async function registerAndGetMailRequest() {
    const send = vi.fn(async () => ({ data: { sent: true } }));
    callableMock.mockImplementation(() => send);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    fakeAuth.currentUser = null;
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.register('neu@test.local', 'geheim1234', 'Neu');
    });
    expect(callableMock).toHaveBeenCalledWith('sendVerificationEmail');
    return send.mock.calls[0][0];
  }

  it('asks for the link back to the wizard while a guest draft waits', async () => {
    localStorage.setItem(
      'eventWizardDraft:guest',
      JSON.stringify({
        version: 1,
        savedAt: Date.now(),
        draft: { formData: { title: 'Gast' }, currentStep: 4 },
      })
    );
    expect(await registerAndGetMailRequest()).toEqual({
      userId: 'new-user',
      afterVerify: 'createEvent',
    });
  });

  it('sends the plain request without a guest draft', async () => {
    expect(await registerAndGetMailRequest()).toEqual({ userId: 'new-user' });
  });
});
