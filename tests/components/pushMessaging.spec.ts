import { describe, it, expect, vi } from 'vitest';

vi.mock('../../src/lib/firebase', () => ({ default: {}, db: {} }));

import {
  detectPushEnvironment,
  pushFeatureEnabled,
  pushSupportState,
  pushTokenHash,
} from '../../src/lib/pushMessaging';

const desktop = {
  hasServiceWorker: true,
  hasPushManager: true,
  hasNotification: true,
  permission: 'default',
  isIos: false,
  isStandalone: false,
};

describe('pushSupportState', () => {
  it('is disabled without a VAPID key, whatever the browser can do', () => {
    expect(pushSupportState({ vapidKey: '', env: desktop, enabledOnDevice: true })).toBe(
      'disabled'
    );
    expect(pushSupportState({ vapidKey: '   ', env: desktop, enabledOnDevice: false })).toBe(
      'disabled'
    );
    expect(pushSupportState({ vapidKey: undefined, env: desktop, enabledOnDevice: false })).toBe(
      'disabled'
    );
  });

  it('asks iPhone users in a Safari tab to install the app first', () => {
    const iosTab = { ...desktop, isIos: true, hasPushManager: false };
    expect(pushSupportState({ vapidKey: 'k', env: iosTab, enabledOnDevice: false })).toBe(
      'ios-tab'
    );
  });

  it('treats the installed iPhone app like any other browser', () => {
    const iosApp = { ...desktop, isIos: true, isStandalone: true };
    expect(pushSupportState({ vapidKey: 'k', env: iosApp, enabledOnDevice: false })).toBe(
      'available'
    );
  });

  it('is unsupported without service worker, PushManager or Notification', () => {
    for (const missing of ['hasServiceWorker', 'hasPushManager', 'hasNotification']) {
      expect(
        pushSupportState({
          vapidKey: 'k',
          env: { ...desktop, [missing]: false },
          enabledOnDevice: false,
        })
      ).toBe('unsupported');
    }
  });

  it('reports a blocked permission', () => {
    const denied = { ...desktop, permission: 'denied' };
    expect(pushSupportState({ vapidKey: 'k', env: denied, enabledOnDevice: true })).toBe('denied');
  });

  it('is active only with permission AND this device switched on', () => {
    const granted = { ...desktop, permission: 'granted' };
    expect(pushSupportState({ vapidKey: 'k', env: granted, enabledOnDevice: true })).toBe('active');
    expect(pushSupportState({ vapidKey: 'k', env: granted, enabledOnDevice: false })).toBe(
      'available'
    );
    expect(pushSupportState({ vapidKey: 'k', env: desktop, enabledOnDevice: true })).toBe(
      'available'
    );
  });
});

describe('pushFeatureEnabled', () => {
  it('needs a non-empty key', () => {
    expect(pushFeatureEnabled('BKey')).toBe(true);
    expect(pushFeatureEnabled('')).toBe(false);
    expect(pushFeatureEnabled('  ')).toBe(false);
  });
});

describe('detectPushEnvironment', () => {
  it('reads an iPad that reports itself as a Mac as iOS', () => {
    const win = {
      navigator: { userAgent: 'Macintosh', platform: 'MacIntel', maxTouchPoints: 5 },
      matchMedia: () => ({ matches: false }),
    };
    expect(detectPushEnvironment(win)).toMatchObject({ isIos: true, isStandalone: false });
  });

  it('recognises the installed app (standalone display mode)', () => {
    const win = {
      navigator: { userAgent: 'iPhone', serviceWorker: {} },
      PushManager: function PushManager() {},
      Notification: { permission: 'granted' },
      matchMedia: (q: string) => ({ matches: q === '(display-mode: standalone)' }),
    };
    expect(detectPushEnvironment(win)).toEqual({
      hasServiceWorker: true,
      hasPushManager: true,
      hasNotification: true,
      permission: 'granted',
      isIos: true,
      isStandalone: true,
    });
  });

  it('says "nothing supported" without a window', () => {
    expect(detectPushEnvironment(undefined)).toMatchObject({
      hasServiceWorker: false,
      hasPushManager: false,
      hasNotification: false,
      permission: 'default',
    });
  });
});

describe('pushTokenHash', () => {
  it('is the 64-character SHA-256 hex the rules expect as doc id', async () => {
    const hash = await pushTokenHash('abc');
    expect(hash).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});
