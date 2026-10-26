import { describe, it, expect, vi, beforeEach } from 'vitest';

const sdk = vi.hoisted(() => ({
  isSupported: vi.fn(),
  initializeAnalytics: vi.fn(),
  setConsent: vi.fn(),
  logEvent: vi.fn(),
  setAnalyticsCollectionEnabled: vi.fn(),
  loaded: vi.fn(),
}));

vi.mock('firebase/analytics', () => {
  sdk.loaded();
  return {
    isSupported: sdk.isSupported,
    initializeAnalytics: sdk.initializeAnalytics,
    setConsent: sdk.setConsent,
    logEvent: sdk.logEvent,
    setAnalyticsCollectionEnabled: sdk.setAnalyticsCollectionEnabled,
  };
});
vi.mock('../../src/lib/firebase', () => ({ default: { name: 'app' } }));

const pageLocation = () => `${window.location.origin}${window.location.pathname}`;

async function load() {
  vi.resetModules();
  return await import('../../src/lib/analytics');
}

beforeEach(() => {
  sdk.loaded.mockClear();
  sdk.isSupported.mockReset().mockResolvedValue(true);
  sdk.initializeAnalytics.mockReset().mockReturnValue({ id: 'ga' });
  sdk.setConsent.mockReset();
  sdk.logEvent.mockReset();
  sdk.setAnalyticsCollectionEnabled.mockReset();
  vi.stubEnv('DEV', false);
  vi.stubEnv('VITE_USE_EMULATORS', 'false');
  vi.stubEnv('VITE_ANALYTICS_ENABLED', '');
});

describe('analytics without consent', () => {
  it('never imports the SDK nor logs', async () => {
    const a = await load();
    await a.initAnalytics();
    await a.trackEvent(a.EVENTS.FAVORITE_ADD, { item_id: 'x' });
    await a.trackPageView('/events', 'Events');
    expect(sdk.loaded).not.toHaveBeenCalled();
    expect(sdk.logEvent).not.toHaveBeenCalled();
  });

  it('denying consent does not import the SDK', async () => {
    const a = await load();
    await a.setAnalyticsConsent(false);
    expect(sdk.loaded).not.toHaveBeenCalled();
  });
});

describe('analytics with consent', () => {
  it('initialises with privacy settings and consent mode v2', async () => {
    const a = await load();
    await a.setAnalyticsConsent(true);
    expect(sdk.initializeAnalytics).toHaveBeenCalledWith(
      { name: 'app' },
      {
        config: {
          send_page_view: false,
          allow_google_signals: false,
          allow_ad_personalization_signals: false,
        },
      }
    );
    expect(sdk.setConsent).toHaveBeenLastCalledWith({
      analytics_storage: 'granted',
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
    });
  });

  it('logs events and page views', async () => {
    const a = await load();
    await a.setAnalyticsConsent(true);
    await a.trackEvent(a.EVENTS.SHARE, { method: 'copy', item_id: 'slug' });
    expect(sdk.logEvent).toHaveBeenCalledWith({ id: 'ga' }, 'share', {
      page_location: pageLocation(),
      method: 'copy',
      item_id: 'slug',
    });
    await a.trackPageView('/auth/action?oobCode=secret#x', 'Auth');
    expect(sdk.logEvent).toHaveBeenLastCalledWith({ id: 'ga' }, 'page_view', {
      page_location: pageLocation(),
      page_path: '/auth/action',
      page_title: 'Auth',
    });
  });

  it('never sends the query string or hash in page_location', async () => {
    window.history.pushState({}, '', '/auth-action?oobCode=secret#x');
    const a = await load();
    await a.setAnalyticsConsent(true);
    await a.trackEvent('share');
    expect(sdk.logEvent.mock.calls[0][2].page_location).toBe(
      `${window.location.origin}/auth-action`
    );
    window.history.pushState({}, '', '/');
  });

  it('sends the previous page of the site as page_referrer from the second page view on', async () => {
    window.history.pushState({}, '', '/verzeichnis');
    const a = await load();
    await a.setAnalyticsConsent(true);
    await a.trackPageView('/verzeichnis', 'Verzeichnis');
    expect(sdk.logEvent.mock.calls[0][2]).not.toHaveProperty('page_referrer');
    window.history.pushState({}, '', '/event/morgen-yoga');
    await a.trackPageView('/event/morgen-yoga', 'Morgen Yoga');
    expect(sdk.logEvent.mock.calls[1][2]).toMatchObject({
      page_location: `${window.location.origin}/event/morgen-yoga`,
      page_referrer: `${window.location.origin}/verzeichnis`,
    });
    window.history.pushState({}, '', '/');
  });

  it('strips personal-data params and undefined values', async () => {
    const a = await load();
    await a.setAnalyticsConsent(true);
    await a.trackEvent('login', { method: 'google', email: 'a@b.at', userId: '1', x: undefined });
    expect(sdk.logEvent).toHaveBeenCalledWith({ id: 'ga' }, 'login', {
      page_location: pageLocation(),
      method: 'google',
    });
  });

  it('revoking consent stops logging', async () => {
    const a = await load();
    await a.setAnalyticsConsent(true);
    await a.setAnalyticsConsent(false);
    expect(sdk.setConsent).toHaveBeenLastCalledWith({
      analytics_storage: 'denied',
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
    });
    expect(sdk.setAnalyticsCollectionEnabled).toHaveBeenLastCalledWith({ id: 'ga' }, false);
    await a.trackEvent('share');
    expect(sdk.logEvent).not.toHaveBeenCalled();
  });

  it('granting again after revoke re-enables collection', async () => {
    const a = await load();
    await a.setAnalyticsConsent(true);
    await a.setAnalyticsConsent(false);
    await a.setAnalyticsConsent(true);
    await a.trackEvent('share');
    expect(sdk.initializeAnalytics).toHaveBeenCalledTimes(1);
    expect(sdk.setAnalyticsCollectionEnabled).toHaveBeenLastCalledWith({ id: 'ga' }, true);
    expect(sdk.logEvent).toHaveBeenCalledTimes(1);
  });

  it('admin users send nothing', async () => {
    const a = await load();
    await a.setAnalyticsConsent(true);
    await a.setAnalyticsAdminUser(true);
    expect(sdk.setAnalyticsCollectionEnabled).toHaveBeenLastCalledWith({ id: 'ga' }, false);
    await a.trackEvent('share');
    expect(sdk.logEvent).not.toHaveBeenCalled();
    await a.setAnalyticsAdminUser(false);
    expect(sdk.setAnalyticsCollectionEnabled).toHaveBeenLastCalledWith({ id: 'ga' }, true);
  });

  it('admin flag set before consent keeps collection off', async () => {
    const a = await load();
    await a.setAnalyticsAdminUser(true);
    await a.setAnalyticsConsent(true);
    expect(sdk.setAnalyticsCollectionEnabled).toHaveBeenLastCalledWith({ id: 'ga' }, false);
    await a.trackEvent('share');
    expect(sdk.logEvent).not.toHaveBeenCalled();
  });
});

describe('analytics no-op environments', () => {
  const cases: [string, () => void][] = [
    ['emulator', () => vi.stubEnv('VITE_USE_EMULATORS', 'true')],
    ['dev build', () => vi.stubEnv('DEV', true)],
    ['flag off', () => vi.stubEnv('VITE_ANALYTICS_ENABLED', 'false')],
    ['do not track', () => vi.stubGlobal('navigator', { doNotTrack: '1' })],
  ];
  it.each(cases)('%s', async (_n, setup) => {
    setup();
    const a = await load();
    await a.setAnalyticsConsent(true);
    await a.trackEvent('share');
    await a.trackPageView('/', 't');
    expect(sdk.loaded).not.toHaveBeenCalled();
    expect(sdk.logEvent).not.toHaveBeenCalled();
  });

  it('unsupported browser', async () => {
    sdk.isSupported.mockResolvedValue(false);
    const a = await load();
    await a.setAnalyticsConsent(true);
    await a.trackEvent('share');
    expect(sdk.initializeAnalytics).not.toHaveBeenCalled();
    expect(sdk.logEvent).not.toHaveBeenCalled();
  });
});

describe('analytics error handling', () => {
  it('never throws when the SDK fails', async () => {
    sdk.initializeAnalytics.mockImplementation(() => {
      throw new Error('boom');
    });
    const a = await load();
    await expect(a.setAnalyticsConsent(true)).resolves.not.toThrow();
    await expect(a.trackEvent('share')).resolves.not.toThrow();
  });

  it('never throws when logEvent fails', async () => {
    sdk.logEvent.mockImplementation(() => {
      throw new Error('boom');
    });
    const a = await load();
    await a.setAnalyticsConsent(true);
    await expect(a.trackEvent('share')).resolves.not.toThrow();
    await expect(a.trackPageView('/', 't')).resolves.not.toThrow();
  });
});

describe('EVENTS', () => {
  it('uses snake_case values', async () => {
    const a = await load();
    for (const v of Object.values(a.EVENTS)) expect(v).toMatch(/^[a-z]+(_[a-z]+)*$/);
    expect(a.EVENTS.SELECT_CONTENT).toBe('select_content');
  });
});

describe('region parameter', () => {
  it('is added to every event once set, never overrides an explicit one', async () => {
    const a = await load();
    await a.setAnalyticsConsent(true);
    a.setAnalyticsRegion('steiermark');
    await a.trackEvent(a.EVENTS.SHARE, { method: 'copy' });
    expect(sdk.logEvent).toHaveBeenLastCalledWith({ id: 'ga' }, 'share', {
      page_location: pageLocation(),
      method: 'copy',
      region: 'steiermark',
    });
    await a.trackPageView('/steiermark?x=1', 'T');
    expect(sdk.logEvent).toHaveBeenLastCalledWith({ id: 'ga' }, 'page_view', {
      page_location: pageLocation(),
      page_path: '/steiermark',
      page_title: 'T',
      region: 'steiermark',
    });
    await a.trackEvent('filter_apply', { region: 'tirol' });
    expect(sdk.logEvent).toHaveBeenLastCalledWith({ id: 'ga' }, 'filter_apply', {
      page_location: pageLocation(),
      region: 'tirol',
    });
  });

  it('adds nothing when unset, cleared or malformed (payload as before)', async () => {
    const a = await load();
    await a.setAnalyticsConsent(true);
    await a.trackEvent('share', {
      page_location: pageLocation(),
      method: 'copy',
    });
    expect(sdk.logEvent).toHaveBeenLastCalledWith({ id: 'ga' }, 'share', {
      page_location: pageLocation(),
      method: 'copy',
    });
    a.setAnalyticsRegion('steiermark');
    a.setAnalyticsRegion(null);
    await a.trackEvent('share', {
      page_location: pageLocation(),
      method: 'copy',
    });
    expect(sdk.logEvent).toHaveBeenLastCalledWith({ id: 'ga' }, 'share', {
      page_location: pageLocation(),
      method: 'copy',
    });
    a.setAnalyticsRegion('a@b.at');
    await a.trackEvent('share', {
      page_location: pageLocation(),
      method: 'copy',
    });
    expect(sdk.logEvent).toHaveBeenLastCalledWith({ id: 'ga' }, 'share', {
      page_location: pageLocation(),
      method: 'copy',
    });
  });

  it('is never sent for admins and keeps stripping PII', async () => {
    const a = await load();
    await a.setAnalyticsConsent(true);
    a.setAnalyticsRegion('steiermark');
    await a.trackEvent('login', { method: 'google', email: 'a@b.at' });
    expect(sdk.logEvent).toHaveBeenLastCalledWith({ id: 'ga' }, 'login', {
      page_location: pageLocation(),
      method: 'google',
      region: 'steiermark',
    });
    sdk.logEvent.mockClear();
    await a.setAnalyticsAdminUser(true);
    await a.trackEvent('login', { method: 'google' });
    expect(sdk.logEvent).not.toHaveBeenCalled();
  });
});

describe('analyticsRegionLabel', () => {
  it('is null with fewer than two active regions (dark launch)', async () => {
    const { analyticsRegionLabel } = await import('../../src/lib/analyticsEvents');
    expect(analyticsRegionLabel()).toBeNull();
    expect(
      analyticsRegionLabel({ regions: [{ id: 'vorarlberg' }], regionId: 'vorarlberg' })
    ).toBeNull();
  });

  it('uses the region, or the combined view slug, with two or more', async () => {
    const { analyticsRegionLabel } = await import('../../src/lib/analyticsEvents');
    const regions = [{ id: 'vorarlberg' }, { id: 'steiermark' }];
    expect(analyticsRegionLabel({ regions, regionId: 'steiermark', combinedView: null })).toBe(
      'steiermark'
    );
    expect(
      analyticsRegionLabel({
        regions,
        regionId: 'steiermark',
        combinedView: { slug: 'oesterreich' },
      })
    ).toBe('oesterreich');
  });
});
