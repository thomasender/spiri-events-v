import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { initializeAppCheck, getToken } from 'firebase/app-check';
import { setupAppCheck, APP_CHECK_FAILED_EVENT } from '../../src/lib/appCheck';

const app = {} as never;
const prod = { VITE_RECAPTCHA_SITE_KEY: 'site-key', DEV: false };

describe('setupAppCheck', () => {
  beforeEach(() => {
    vi.mocked(initializeAppCheck)
      .mockClear()
      .mockReturnValue({} as never);
    vi.mocked(getToken)
      .mockReset()
      .mockResolvedValue({ token: 'x' } as never);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    delete (self as { FIREBASE_APPCHECK_DEBUG_TOKEN?: unknown }).FIREBASE_APPCHECK_DEBUG_TOKEN;
  });

  it('stays inert without a site key', () => {
    expect(setupAppCheck(app, { DEV: false })).toBeNull();
    expect(setupAppCheck(app, { VITE_RECAPTCHA_SITE_KEY: '   ', DEV: false })).toBeNull();
    expect(initializeAppCheck).not.toHaveBeenCalled();
  });

  it('never runs against the emulators', () => {
    expect(setupAppCheck(app, { ...prod, VITE_USE_EMULATORS: 'true' })).toBeNull();
    expect(initializeAppCheck).not.toHaveBeenCalled();
  });

  it('initialises once with token auto refresh when a site key is set', () => {
    expect(setupAppCheck(app, prod)).not.toBeNull();
    expect(initializeAppCheck).toHaveBeenCalledTimes(1);
    expect(vi.mocked(initializeAppCheck).mock.calls[0][1]).toMatchObject({
      isTokenAutoRefreshEnabled: true,
    });
  });

  it('stays inert in plain dev builds and only uses a debug token in DEV', () => {
    expect(setupAppCheck(app, { ...prod, DEV: true })).toBeNull();
    expect(initializeAppCheck).not.toHaveBeenCalled();

    expect(
      setupAppCheck(app, { ...prod, DEV: true, VITE_APPCHECK_DEBUG_TOKEN: 'dbg' })
    ).not.toBeNull();
    expect(
      (self as { FIREBASE_APPCHECK_DEBUG_TOKEN?: unknown }).FIREBASE_APPCHECK_DEBUG_TOKEN
    ).toBe('dbg');
  });

  it('ignores a debug token in production builds', () => {
    setupAppCheck(app, { ...prod, VITE_APPCHECK_DEBUG_TOKEN: 'dbg' });
    expect(
      (self as { FIREBASE_APPCHECK_DEBUG_TOKEN?: unknown }).FIREBASE_APPCHECK_DEBUG_TOKEN
    ).toBeUndefined();
  });

  it('does not throw and announces the failure when initialising fails', () => {
    vi.mocked(initializeAppCheck).mockImplementation(() => {
      throw new Error('boom');
    });
    const failed = vi.fn();
    window.addEventListener(APP_CHECK_FAILED_EVENT, failed);

    expect(() => setupAppCheck(app, prod)).not.toThrow();
    expect(failed).toHaveBeenCalledTimes(1);
    window.removeEventListener(APP_CHECK_FAILED_EVENT, failed);
  });

  it('announces a failure when the first token cannot be fetched', async () => {
    vi.mocked(getToken).mockRejectedValue(Object.assign(new Error('blocked'), { code: 'x' }));
    const failed = vi.fn();
    window.addEventListener(APP_CHECK_FAILED_EVENT, failed);

    setupAppCheck(app, prod);
    await vi.waitFor(() => expect(failed).toHaveBeenCalledTimes(1));
    window.removeEventListener(APP_CHECK_FAILED_EVENT, failed);
  });
});
