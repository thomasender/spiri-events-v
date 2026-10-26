import { describe, it, expect } from 'vitest';
// @ts-expect-error plain .mjs helper without types
import * as lib from '../../scripts/lib/instagramRegionAccount.mjs';

describe('instagram-set-region-account helpers', () => {
  it('accepts normal region ids and refuses unsafe ones and vorarlberg', () => {
    expect(lib.assertRegionId('tirol')).toBe('tirol');
    expect(() => lib.assertRegionId('a/b')).toThrow();
    expect(() => lib.assertRegionId('')).toThrow();
    expect(() => lib.assertRegionId('Tirol')).toThrow();
    expect(() => lib.assertRegionId('vorarlberg')).toThrow(/Secrets/);
  });

  it('checks the user id returned by /me', () => {
    expect(lib.parseMeResponse({ user_id: 17, username: 'x' }, '17')).toEqual({
      userId: '17',
      username: 'x',
    });
    expect(lib.parseMeResponse({ id: '5' }, '')).toMatchObject({ userId: '5' });
    expect(() => lib.parseMeResponse({ user_id: '1' }, '2')).toThrow(/gehört/);
    expect(() => lib.parseMeResponse({}, '')).toThrow();
  });

  it('computes a 60 day expiry and only sets enabled when decided', () => {
    const now = new Date('2026-10-24T00:00:00Z');
    const f = lib.buildAccountFields({ userId: '1', accessToken: 't', now });
    expect(f.expiresAt.toISOString()).toBe('2026-12-23T00:00:00.000Z');
    expect('enabled' in f).toBe(false);
    expect(
      lib.buildAccountFields({ userId: '1', accessToken: 't', now, enabled: false }).enabled
    ).toBe(false);
  });

  it('never takes the token from argv', () => {
    expect(lib.parseArgs(['tirol', '--user-id', '9', '--enable'])).toEqual({
      regionId: 'tirol',
      userId: '9',
      enable: true,
      dryRun: false,
    });
    expect(() => lib.parseArgs(['tirol', '--token', 'x'])).toThrow();
    expect(() => lib.parseArgs(['tirol', 'secrettoken'])).toThrow();
  });
});
