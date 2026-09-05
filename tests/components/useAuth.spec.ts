import { describe, it, expect } from 'vitest';
import {
  authErrorMessage,
  isGoogleProviderUser,
  isPasswordProviderUser,
} from '../../src/hooks/useAuth';

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
