import { describe, it, expect } from 'vitest';
// @ts-expect-error plain .mjs helper without types
import * as lib from '../../scripts/lib/instagramRegionAccount.mjs';
// @ts-expect-error plain .mjs helper without types
import * as launch from '../../scripts/lib/instagramRegionLaunch.mjs';

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

describe('instagram-region-launch helpers', () => {
  it('parses set/show/clear and refuses unknown options and vorarlberg', () => {
    expect(
      launch.parseLaunchArgs([
        'bodensee',
        '--set',
        '--start',
        '2026-11-25T12:00+01:00',
        '--window',
        '09:00-19:00',
        '--dry-run',
      ])
    ).toMatchObject({
      regionId: 'bodensee',
      action: 'set',
      start: '2026-11-25T12:00+01:00',
      days: 3,
      windowStart: '09:00',
      windowEnd: '19:00',
      timezone: 'Europe/Berlin',
      dryRun: true,
    });
    expect(launch.parseLaunchArgs(['bodensee']).action).toBe('show');
    expect(() => launch.parseLaunchArgs(['bodensee', '--set', '--clear'])).toThrow();
    expect(() => launch.parseLaunchArgs(['bodensee', '--token', 'x'])).toThrow();
    expect(() => launch.parseLaunchArgs(['vorarlberg', '--show'])).toThrow(/Secrets/);
  });

  it('builds the Bodensee plan and rejects a start without zone', () => {
    const args = launch.parseLaunchArgs(['bodensee', '--set', '--start', '2026-11-25T12:00+01:00']);
    const fields = launch.buildLaunchPlanFields(args);
    expect(fields.launchStartAt.toISOString()).toBe('2026-11-25T11:00:00.000Z');
    expect(fields).toMatchObject({
      launchDays: 3,
      launchWindowStart: '08:00',
      launchWindowEnd: '20:00',
      launchTimezone: 'Europe/Berlin',
    });
    expect(() => launch.buildLaunchPlanFields({ ...args, start: '2026-11-25T12:00' })).toThrow();
    expect(() => launch.buildLaunchPlanFields({ ...args, days: 0 })).toThrow();
    expect(() => launch.buildLaunchPlanFields({ ...args, timezone: 'Mars/Base' })).toThrow();
    expect(() =>
      launch.buildLaunchPlanFields({ ...args, windowStart: '20:00', windowEnd: '08:00' })
    ).toThrow();
  });

  it('shows plan and progress, never the token', () => {
    const text = launch.describeLaunch('bodensee', {
      enabled: true,
      accessToken: 'SECRET_TOKEN',
      launchStartAt: new Date('2026-11-25T11:00:00Z'),
      launchStartedAt: new Date('2026-11-25T11:30:00Z'),
      launchTotal: 40,
      launchCursor: 12,
      launchPosted: 11,
      launchRemaining: 28,
    });
    expect(text).toContain('Backlog: 40');
    expect(text).toContain('offen: 28');
    expect(text).not.toContain('SECRET_TOKEN');
    expect(launch.describeLaunch('bodensee', { enabled: false })).toContain('Kein Launch-Plan');
    expect(launch.LAUNCH_FIELDS).toContain('launchLeaseUntil');
  });
});
