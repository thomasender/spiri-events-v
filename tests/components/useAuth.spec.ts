import { describe, it, expect } from 'vitest';
import { authErrorMessage } from '../../src/hooks/useAuth';

describe('authErrorMessage', () => {
  it('maps known Firebase auth error codes to German messages', () => {
    expect(authErrorMessage({ code: 'auth/wrong-password' })).toMatch(/Passwort ist falsch/);
    expect(authErrorMessage({ code: 'auth/email-already-in-use' })).toMatch(/bereits verwendet/);
    expect(authErrorMessage({ code: 'auth/requires-recent-login' })).toMatch(/erneut an/);
    expect(authErrorMessage({ code: 'auth/invalid-credential' })).toMatch(/falsch/);
    expect(authErrorMessage({ code: 'auth/user-mismatch' })).toMatch(/Anmeldung passt nicht/);
  });

  it('falls back to a generic message for unknown codes', () => {
    expect(authErrorMessage({ code: 'auth/something-new' })).toMatch(/Ein Fehler/);
  });

  it('handles null/undefined input gracefully', () => {
    expect(authErrorMessage(null)).toMatch(/Ein Fehler/);
    expect(authErrorMessage(undefined)).toMatch(/Ein Fehler/);
  });
});
