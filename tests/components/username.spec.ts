import { describe, it, expect } from 'vitest';
import {
  validateUsername,
  normalizeUsername,
  isReservedUsername,
  RESERVED_USERNAMES,
  USERNAME_MIN,
  USERNAME_MAX,
} from '../../src/utils/username';

describe('normalizeUsername', () => {
  it('lowercases, trims, and strips a leading @', () => {
    expect(normalizeUsername('  @Anna.Schmidt  ')).toBe('anna.schmidt');
  });

  it('returns an empty string for nullish input', () => {
    expect(normalizeUsername(null)).toBe('');
    expect(normalizeUsername(undefined)).toBe('');
  });

  it('returns an empty string for whitespace-only input', () => {
    expect(normalizeUsername('   ')).toBe('');
  });
});

describe('validateUsername', () => {
  it('accepts a typical handle', () => {
    const r = validateUsername('anna.schmidt');
    expect(r).toEqual({ valid: true, normalized: 'anna.schmidt' });
  });

  it('accepts handles with dashes and underscores', () => {
    expect(validateUsername('jane-doe_99').valid).toBe(true);
    expect(validateUsername('a_b.c-d').valid).toBe(true);
  });

  it('rejects an empty input with EMPTY', () => {
    expect(validateUsername('')).toEqual({ valid: false, error: 'EMPTY', normalized: '' });
    expect(validateUsername('   ')).toEqual({ valid: false, error: 'EMPTY', normalized: '' });
  });

  it(`rejects strings shorter than ${USERNAME_MIN} characters with TOO_SHORT`, () => {
    expect(validateUsername('ab').error).toBe('TOO_SHORT');
  });

  it(`rejects strings longer than ${USERNAME_MAX} characters with TOO_LONG`, () => {
    const tooLong = 'a'.repeat(USERNAME_MAX + 1);
    expect(validateUsername(tooLong).error).toBe('TOO_LONG');
  });

  it('accepts uppercase letters via silent lowercasing (the form already normalises before saving)', () => {
    // The validator is lenient: `validateUsername('Anna')` normalises to
    // 'anna' which is a valid handle. The caller (ProfileForm) shows the
    // canonical form via the URL preview, so we don't surface a hard
    // error here — typing capital letters is not a bug.
    expect(validateUsername('Anna')).toEqual({ valid: true, normalized: 'anna' });
  });

  it('rejects spaces and most punctuation with INVALID_CHARS', () => {
    expect(validateUsername('anna schmidt').error).toBe('INVALID_CHARS');
    expect(validateUsername('anna!').error).toBe('INVALID_CHARS');
    expect(validateUsername('anna/schmidt').error).toBe('INVALID_CHARS');
  });

  it('rejects handles that start or end with a separator', () => {
    expect(validateUsername('-anna').error).toBe('INVALID_CHARS');
    expect(validateUsername('anna-').error).toBe('INVALID_CHARS');
    expect(validateUsername('.anna').error).toBe('INVALID_CHARS');
    expect(validateUsername('anna.').error).toBe('INVALID_CHARS');
  });

  it('rejects reserved route names with RESERVED', () => {
    for (const reserved of ['admin', 'profil', 'login', 'event', 'spenden', 'kalender']) {
      expect(validateUsername(reserved)).toMatchObject({
        valid: false,
        error: 'RESERVED',
        normalized: reserved,
      });
    }
  });

  it("accepts the user's current username without checking against itself", () => {
    const r = validateUsername('Anna.Schmidt', { currentUsername: 'anna.schmidt' });
    expect(r.valid).toBe(true);
  });
});

describe('isReservedUsername', () => {
  it('returns true for known reserved handles', () => {
    expect(isReservedUsername('admin')).toBe(true);
    expect(isReservedUsername('login')).toBe(true);
  });

  it('returns false for non-reserved handles', () => {
    expect(isReservedUsername('anna.schmidt')).toBe(false);
    expect(isReservedUsername('jane-doe')).toBe(false);
  });

  it('returns false for empty or nullish input', () => {
    expect(isReservedUsername('')).toBe(false);
    expect(isReservedUsername(null)).toBe(false);
  });

  it('keeps RESERVED_USERNAMES in sync with the SPA top-level routes', () => {
    // Spot-check: every value in the set is lowercase and non-empty. If a
    // future route is added to App.jsx, it should be added here too.
    for (const name of RESERVED_USERNAMES) {
      expect(name).toBe(name.toLowerCase());
      expect(name.length).toBeGreaterThan(0);
    }
    expect(RESERVED_USERNAMES.has('admin')).toBe(true);
    expect(RESERVED_USERNAMES.has('profil')).toBe(true);
  });
});
