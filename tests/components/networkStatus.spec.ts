import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  NETWORK_SLOW_EVENT,
  OFFLINE_MIN_VISIBLE_MS,
  OFFLINE_SHOW_DELAY_MS,
  RECONNECTED_VISIBLE_MS,
  SLOW_LOAD_THRESHOLD_MS,
  SLOW_NOTICE_SESSION_KEY,
  createOfflineNotice,
  isBrowserOnline,
  isSlowConnection,
  markSlowNoticeShown,
  prefersSaveData,
  readConnection,
  reportSlowLoad,
  wasSlowNoticeShown,
  watchSlowLoad,
} from '../../src/utils/networkStatus';

describe('networkStatus thresholds', () => {
  it('uses the agreed values', () => {
    expect(OFFLINE_SHOW_DELAY_MS).toBe(2000);
    expect(RECONNECTED_VISIBLE_MS).toBe(3000);
    expect(SLOW_LOAD_THRESHOLD_MS).toBe(8000);
    expect(OFFLINE_MIN_VISIBLE_MS).toBeGreaterThan(0);
  });
});

describe('connection helpers', () => {
  it('treats only an explicit onLine === false as offline', () => {
    expect(isBrowserOnline({ onLine: false } as Navigator)).toBe(false);
    expect(isBrowserOnline({ onLine: true } as Navigator)).toBe(true);
    expect(isBrowserOnline({} as Navigator)).toBe(true);
    expect(isBrowserOnline(undefined)).toBe(true);
  });

  it('reads no connection where the browser has none (Safari, Firefox)', () => {
    expect(readConnection({} as Navigator)).toBeNull();
    expect(isSlowConnection(readConnection({} as Navigator))).toBe(false);
    expect(prefersSaveData(null)).toBe(false);
  });

  it('counts only slow-2g and 2g as slow', () => {
    expect(isSlowConnection({ effectiveType: 'slow-2g' })).toBe(true);
    expect(isSlowConnection({ effectiveType: '2g' })).toBe(true);
    expect(isSlowConnection({ effectiveType: '3g' })).toBe(false);
    expect(isSlowConnection({ effectiveType: '4g' })).toBe(false);
  });

  it('reads saveData without treating it as slow', () => {
    const connection = { effectiveType: '4g', saveData: true };
    expect(prefersSaveData(connection)).toBe(true);
    expect(isSlowConnection(connection)).toBe(false);
  });

  it('remembers the slow hint per session and survives blocked storage', () => {
    const data = new Map<string, string>();
    const storage = {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
    } as unknown as Storage;
    expect(wasSlowNoticeShown(storage)).toBe(false);
    markSlowNoticeShown(storage);
    expect(data.get(SLOW_NOTICE_SESSION_KEY)).toBe('1');
    expect(wasSlowNoticeShown(storage)).toBe(true);

    const blocked = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    } as unknown as Storage;
    expect(wasSlowNoticeShown(blocked)).toBe(false);
    expect(() => markSlowNoticeShown(blocked)).not.toThrow();
  });

  it('reports a slow load as a window event', () => {
    const listener = vi.fn();
    window.addEventListener(NETWORK_SLOW_EVENT, listener);
    reportSlowLoad('events', 'timeout');
    window.removeEventListener(NETWORK_SLOW_EVENT, listener);
    expect(listener).toHaveBeenCalledTimes(1);
    expect((listener.mock.calls[0][0] as CustomEvent).detail).toEqual({
      source: 'events',
      reason: 'timeout',
    });
  });
});

describe('watchSlowLoad', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('reports once the load runs past the threshold', () => {
    const report = vi.fn();
    const watch = watchSlowLoad('events', { report });
    vi.advanceTimersByTime(SLOW_LOAD_THRESHOLD_MS - 1);
    expect(report).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(report).toHaveBeenCalledWith('events', 'timeout');
    watch.failed();
    expect(report).toHaveBeenCalledTimes(1);
  });

  it('stays quiet when the load finishes in time', () => {
    const report = vi.fn();
    watchSlowLoad('page', { report }).done();
    vi.advanceTimersByTime(SLOW_LOAD_THRESHOLD_MS * 2);
    expect(report).not.toHaveBeenCalled();
  });

  it('reports a failure at once', () => {
    const report = vi.fn();
    watchSlowLoad('events', { report }).failed();
    expect(report).toHaveBeenCalledWith('events', 'failed');
    vi.advanceTimersByTime(SLOW_LOAD_THRESHOLD_MS);
    expect(report).toHaveBeenCalledTimes(1);
  });
});

describe('createOfflineNotice', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('shows the offline hint only after the delay', () => {
    const onChange = vi.fn();
    const notice = createOfflineNotice(onChange);
    notice.offline();
    vi.advanceTimersByTime(OFFLINE_SHOW_DELAY_MS - 1);
    expect(notice.state).toBe('hidden');
    vi.advanceTimersByTime(1);
    expect(notice.state).toBe('offline');
    expect(onChange).toHaveBeenLastCalledWith('offline');
  });

  it('shows nothing for a drop shorter than the delay', () => {
    const onChange = vi.fn();
    const notice = createOfflineNotice(onChange);
    notice.offline();
    vi.advanceTimersByTime(OFFLINE_SHOW_DELAY_MS - 500);
    notice.online();
    vi.advanceTimersByTime(10_000);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('keeps the offline hint for the minimum time, then says "reconnected" and hides', () => {
    const onChange = vi.fn();
    const notice = createOfflineNotice(onChange);
    notice.offline();
    vi.advanceTimersByTime(OFFLINE_SHOW_DELAY_MS);
    vi.advanceTimersByTime(500);
    notice.online();
    vi.advanceTimersByTime(OFFLINE_MIN_VISIBLE_MS - 500 - 1);
    expect(notice.state).toBe('offline');
    vi.advanceTimersByTime(1);
    expect(notice.state).toBe('reconnected');
    vi.advanceTimersByTime(RECONNECTED_VISIBLE_MS - 1);
    expect(notice.state).toBe('reconnected');
    vi.advanceTimersByTime(1);
    expect(notice.state).toBe('hidden');
    expect(onChange.mock.calls.map((c) => c[0])).toEqual(['offline', 'reconnected', 'hidden']);
  });

  it('switches to "reconnected" at once when the hint was already up long enough', () => {
    const notice = createOfflineNotice(() => {});
    notice.offline();
    vi.advanceTimersByTime(OFFLINE_SHOW_DELAY_MS + OFFLINE_MIN_VISIBLE_MS + 5000);
    notice.online();
    vi.advanceTimersByTime(0);
    expect(notice.state).toBe('reconnected');
  });

  it('stays offline when the connection drops again before "reconnected"', () => {
    const notice = createOfflineNotice(() => {});
    notice.offline();
    vi.advanceTimersByTime(OFFLINE_SHOW_DELAY_MS);
    notice.online();
    notice.offline();
    vi.advanceTimersByTime(OFFLINE_MIN_VISIBLE_MS + RECONNECTED_VISIBLE_MS);
    expect(notice.state).toBe('offline');
  });

  it('dispose stops pending timers', () => {
    const onChange = vi.fn();
    const notice = createOfflineNotice(onChange);
    notice.offline();
    notice.dispose();
    vi.advanceTimersByTime(OFFLINE_SHOW_DELAY_MS * 2);
    expect(onChange).not.toHaveBeenCalled();
  });
});
