import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  checkRateLimit,
  recordRateLimitAttempt,
  clearRateLimit,
  formatRetryAfter,
  rateLimitBucket,
  RATE_LIMIT_PRESETS,
} from '../../src/utils/rateLimit';

describe('rateLimit', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('checkRateLimit', () => {
    it('allows the first attempt within the window', () => {
      const result = checkRateLimit({
        bucket: 'login:test@example.com',
        maxAttempts: 3,
        windowMs: 60_000,
      });
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(3);
    });

    it('blocks attempts beyond maxAttempts within the window', () => {
      const bucket = 'login:test@example.com';
      const now = 1_000_000;
      for (let i = 0; i < 3; i++) {
        recordRateLimitAttempt({ bucket, maxAttempts: 3, windowMs: 60_000, now: now + i });
      }
      const result = checkRateLimit({
        bucket,
        maxAttempts: 3,
        windowMs: 60_000,
        now: now + 10,
      });
      expect(result.allowed).toBe(false);
      expect(result.retryAfterMs).toBeGreaterThan(0);
      expect(result.remaining).toBe(0);
    });

    it('allows new attempts after the window has passed', () => {
      const bucket = 'login:test@example.com';
      const start = 1_000_000;
      for (let i = 0; i < 3; i++) {
        recordRateLimitAttempt({ bucket, maxAttempts: 3, windowMs: 60_000, now: start + i });
      }
      const blocked = checkRateLimit({
        bucket,
        maxAttempts: 3,
        windowMs: 60_000,
        now: start + 30_000,
      });
      expect(blocked.allowed).toBe(false);

      const after = checkRateLimit({
        bucket,
        maxAttempts: 3,
        windowMs: 60_000,
        now: start + 61_000,
      });
      expect(after.allowed).toBe(true);
      expect(after.remaining).toBe(3);
    });

    it('does not crash when localStorage is unavailable', () => {
      const originalGetItem = window.localStorage.getItem;
      window.localStorage.getItem = vi.fn(() => {
        throw new Error('disabled');
      });
      const result = checkRateLimit({ bucket: 'x', maxAttempts: 3, windowMs: 60_000 });
      expect(result.allowed).toBe(true);
      window.localStorage.getItem = originalGetItem;
    });

    it('ignores corrupted entries in localStorage', () => {
      window.localStorage.setItem('rl:login:bad', 'not-json');
      const result = checkRateLimit({
        bucket: 'login:bad',
        maxAttempts: 3,
        windowMs: 60_000,
      });
      expect(result.allowed).toBe(true);
    });

    it('ignores non-array or mixed-type entries in localStorage', () => {
      window.localStorage.setItem('rl:login:bad', JSON.stringify({ foo: 1 }));
      const result = checkRateLimit({
        bucket: 'login:bad',
        maxAttempts: 3,
        windowMs: 60_000,
      });
      expect(result.allowed).toBe(true);
    });

    it('counts down remaining as attempts are recorded', () => {
      const bucket = 'login:count';
      recordRateLimitAttempt({ bucket, maxAttempts: 5, windowMs: 60_000, now: 1 });
      recordRateLimitAttempt({ bucket, maxAttempts: 5, windowMs: 60_000, now: 2 });
      const result = checkRateLimit({
        bucket,
        maxAttempts: 5,
        windowMs: 60_000,
        now: 3,
      });
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(3);
    });
  });

  describe('recordRateLimitAttempt', () => {
    it('persists timestamps so subsequent calls see them', () => {
      const bucket = 'feedback:me';
      recordRateLimitAttempt({ bucket, maxAttempts: 2, windowMs: 60_000, now: 10 });
      recordRateLimitAttempt({ bucket, maxAttempts: 2, windowMs: 60_000, now: 20 });
      const result = checkRateLimit({
        bucket,
        maxAttempts: 2,
        windowMs: 60_000,
        now: 30,
      });
      expect(result.allowed).toBe(false);
    });

    it('caps storage at maxAttempts entries to prevent unbounded growth', () => {
      const bucket = 'feedback:bounded';
      for (let i = 0; i < 50; i++) {
        recordRateLimitAttempt({ bucket, maxAttempts: 3, windowMs: 60_000, now: i });
      }
      const stored = JSON.parse(window.localStorage.getItem('rl:feedback:bounded'));
      expect(stored.length).toBeLessThanOrEqual(10);
    });

    it('survives localStorage write failures without throwing', () => {
      const originalSetItem = window.localStorage.setItem;
      window.localStorage.setItem = vi.fn(() => {
        throw new Error('quota');
      });
      expect(() =>
        recordRateLimitAttempt({ bucket: 'x', maxAttempts: 3, windowMs: 60_000 })
      ).not.toThrow();
      window.localStorage.setItem = originalSetItem;
    });
  });

  describe('clearRateLimit', () => {
    it('removes the bucket entry', () => {
      const bucket = 'register:me';
      recordRateLimitAttempt({ bucket, maxAttempts: 1, windowMs: 60_000, now: 1 });
      clearRateLimit(bucket);
      const result = checkRateLimit({
        bucket,
        maxAttempts: 1,
        windowMs: 60_000,
        now: 2,
      });
      expect(result.allowed).toBe(true);
    });

    it('does nothing when localStorage is unavailable', () => {
      const originalRemoveItem = window.localStorage.removeItem;
      window.localStorage.removeItem = vi.fn(() => {
        throw new Error('disabled');
      });
      expect(() => clearRateLimit('x')).not.toThrow();
      window.localStorage.removeItem = originalRemoveItem;
    });
  });

  describe('formatRetryAfter', () => {
    it('formats sub-minute waits in seconds', () => {
      expect(formatRetryAfter(5_000)).toBe('Bitte warte 5 Sekunden.');
      expect(formatRetryAfter(1_000)).toBe('Bitte warte 1 Sekunde.');
    });

    it('formats minute waits', () => {
      expect(formatRetryAfter(60_000)).toBe('Bitte warte 1 Minute.');
      expect(formatRetryAfter(120_000)).toBe('Bitte warte 2 Minuten.');
    });
  });

  describe('rateLimitBucket', () => {
    it('lowercases and trims the identifier', () => {
      expect(rateLimitBucket('login', '  Foo@Bar.com  ')).toBe('login:foo@bar.com');
    });

    it('falls back to "anon" for empty identifiers', () => {
      expect(rateLimitBucket('donation', '')).toBe('donation:anon');
      expect(rateLimitBucket('donation', undefined)).toBe('donation:anon');
    });
  });

  describe('RATE_LIMIT_PRESETS', () => {
    it('exposes sane defaults for the actions we protect', () => {
      expect(RATE_LIMIT_PRESETS.login).toEqual({ maxAttempts: 5, windowMs: 5 * 60 * 1000 });
      expect(RATE_LIMIT_PRESETS.register).toEqual({ maxAttempts: 3, windowMs: 15 * 60 * 1000 });
      expect(RATE_LIMIT_PRESETS.passwordReset).toEqual({
        maxAttempts: 3,
        windowMs: 15 * 60 * 1000,
      });
      expect(RATE_LIMIT_PRESETS.feedback).toEqual({ maxAttempts: 3, windowMs: 10 * 60 * 1000 });
      expect(RATE_LIMIT_PRESETS.donation).toEqual({ maxAttempts: 5, windowMs: 10 * 60 * 1000 });
    });
  });
});
