import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const fs = vi.hoisted(() => ({
  versionCb: null as null | ((snap: unknown) => void),
  versionErr: null as null | (() => void),
  eventsCb: null as null | ((snap: unknown) => void),
  eventListeners: 0,
}));

vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...segments: string[]) => ({ path: segments.join('/') }),
  collection: () => ({}),
  query: () => ({ kind: 'events-query' }),
  where: () => ({}),
  orderBy: () => ({}),
  onSnapshot: (
    ref: { path?: string; kind?: string },
    cb: (snap: unknown) => void,
    err?: () => void
  ) => {
    if (ref.path === 'app_settings/eventsVersion') {
      fs.versionCb = cb;
      fs.versionErr = err ?? null;
    } else {
      fs.eventListeners += 1;
      fs.eventsCb = cb;
    }
    return () => {};
  },
  addDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  serverTimestamp: vi.fn(),
  Timestamp: {},
  getFirestore: vi.fn(),
  getDocs: vi.fn(),
  arrayUnion: vi.fn(),
  getDoc: vi.fn(),
}));
vi.mock('../../src/lib/firebase', () => ({ db: {}, auth: {} }));
vi.mock('firebase/app', () => ({ getApp: vi.fn() }));
vi.mock('../../src/hooks/useAuth', () => ({ useAuth: () => ({}) }));
vi.mock('../../src/lib/slug', () => ({ findUniqueSlug: vi.fn(), resolveSlugForApproval: vi.fn() }));
vi.mock('../../src/lib/imageUpload', () => ({ deleteImageByUrl: vi.fn() }));
vi.mock('../../src/utils/ensureCategoryExists', () => ({ ensureCategoryExists: vi.fn() }));

import { EVENTS_VERSION_STORAGE_KEY, usePublicEvents } from '../../src/hooks/useEvents';
import { NETWORK_SLOW_EVENT, SLOW_LOAD_THRESHOLD_MS } from '../../src/utils/networkStatus';

const versionSnap = (version?: number) => ({
  exists: () => version !== undefined,
  data: () => ({ version }),
});

describe('usePublicEvents', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fs.versionCb = null;
    fs.versionErr = null;
    fs.eventsCb = null;
    fs.eventListeners = 0;
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('VITE_USE_EMULATORS', 'false');
    window.localStorage.clear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('loads the versioned JSON without opening an events listener', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => [
        { id: 'b', date: '2026-11-02', title: 'B' },
        { id: 'a', date: '2026-11-01', title: 'A' },
      ],
    });
    const { result } = renderHook(() => usePublicEvents());
    act(() => fs.versionCb?.(versionSnap(42)));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(fetchMock).toHaveBeenCalledWith('/api/events.json?v=42', expect.anything());
    expect(result.current.events.map((e: { id: string }) => e.id)).toEqual(['a', 'b']);
    expect(fs.eventListeners).toBe(0);
  });

  it('refetches when the version changes', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => [] });
    renderHook(() => usePublicEvents());
    act(() => fs.versionCb?.(versionSnap(1)));
    act(() => fs.versionCb?.(versionSnap(2)));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/events.json?v=2', expect.anything())
    );
  });

  it('falls back to reading Firestore when the version doc is missing', async () => {
    renderHook(() => usePublicEvents());
    act(() => fs.versionCb?.(versionSnap()));
    await waitFor(() => expect(fs.eventListeners).toBe(1));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('falls back to reading Firestore when the fetch fails', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });
    renderHook(() => usePublicEvents());
    act(() => fs.versionCb?.(versionSnap(7)));
    await waitFor(() => expect(fs.eventListeners).toBe(1));
  });

  describe('connection hint', () => {
    const slowListener = vi.fn();
    beforeEach(() => {
      slowListener.mockReset();
      window.addEventListener(NETWORK_SLOW_EVENT, slowListener);
    });
    afterEach(() => {
      window.removeEventListener(NETWORK_SLOW_EVENT, slowListener);
      vi.useRealTimers();
    });

    it('reports a slow list without aborting it or falling back to Firestore', () => {
      vi.useFakeTimers();
      let signal: AbortSignal | undefined;
      fetchMock.mockImplementation((_url: string, init: { signal: AbortSignal }) => {
        signal = init.signal;
        return new Promise(() => {});
      });
      renderHook(() => usePublicEvents());
      act(() => fs.versionCb?.(versionSnap(3)));
      act(() => void vi.advanceTimersByTime(SLOW_LOAD_THRESHOLD_MS));
      expect(slowListener).toHaveBeenCalledTimes(1);
      expect(signal?.aborted).toBe(false);
      expect(fs.eventListeners).toBe(0);
    });

    it('reports a network failure', async () => {
      fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
      renderHook(() => usePublicEvents());
      act(() => fs.versionCb?.(versionSnap(4)));
      await waitFor(() => expect(fs.eventListeners).toBe(1));
      expect(slowListener).toHaveBeenCalledTimes(1);
    });

    it('does not report a server answer such as 404', async () => {
      fetchMock.mockResolvedValue({ ok: false, status: 404 });
      renderHook(() => usePublicEvents());
      act(() => fs.versionCb?.(versionSnap(5)));
      await waitFor(() => expect(fs.eventListeners).toBe(1));
      expect(slowListener).not.toHaveBeenCalled();
    });

    it('stays quiet when the list arrives in time', async () => {
      fetchMock.mockResolvedValue({ ok: true, json: async () => [] });
      const { result } = renderHook(() => usePublicEvents());
      act(() => fs.versionCb?.(versionSnap(6)));
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(slowListener).not.toHaveBeenCalled();
    });
  });

  describe('with the version of the last visit remembered', () => {
    const list = (...ids: string[]) => ({
      ok: true,
      json: async () => ids.map((id) => ({ id, date: '2026-11-01', title: id })),
    });
    const ids = (r: { current: { events: { id: string }[] } }) => r.current.events.map((e) => e.id);

    it('remembers the version from the version doc', () => {
      fetchMock.mockResolvedValue(list());
      renderHook(() => usePublicEvents());
      act(() => fs.versionCb?.(versionSnap(9)));
      expect(window.localStorage.getItem(EVENTS_VERSION_STORAGE_KEY)).toBe('9');
    });

    it('asks for the list at once, without waiting for Firestore, and keeps it when the version matches', async () => {
      window.localStorage.setItem(EVENTS_VERSION_STORAGE_KEY, '5');
      fetchMock.mockResolvedValue(list('a'));
      const { result } = renderHook(() => usePublicEvents());
      expect(fetchMock).toHaveBeenCalledWith('/api/events.json?v=5', expect.anything());
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(ids(result)).toEqual(['a']);
      act(() => fs.versionCb?.(versionSnap(5)));
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('replaces the remembered list when the version doc has a newer version', async () => {
      window.localStorage.setItem(EVENTS_VERSION_STORAGE_KEY, '5');
      fetchMock.mockImplementation(async (url: string) =>
        url.endsWith('v=6') ? list('new') : list('old')
      );
      const { result } = renderHook(() => usePublicEvents());
      await waitFor(() => expect(ids(result)).toEqual(['old']));
      act(() => fs.versionCb?.(versionSnap(6)));
      await waitFor(() => expect(ids(result)).toEqual(['new']));
      expect(fetchMock).toHaveBeenLastCalledWith('/api/events.json?v=6', expect.anything());
      expect(fs.eventListeners).toBe(0);
    });

    it('a failed request for the remembered version waits for the version doc instead of falling back', async () => {
      window.localStorage.setItem(EVENTS_VERSION_STORAGE_KEY, '5');
      fetchMock.mockResolvedValueOnce({ ok: false, status: 404 }).mockResolvedValue(list('a'));
      const { result } = renderHook(() => usePublicEvents());
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
      await act(async () => {});
      expect(result.current.loading).toBe(true);
      expect(fs.eventListeners).toBe(0);
      act(() => fs.versionCb?.(versionSnap(5)));
      await waitFor(() => expect(ids(result)).toEqual(['a']));
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fs.eventListeners).toBe(0);
    });

    it('forgets the remembered version when the version doc is missing', async () => {
      window.localStorage.setItem(EVENTS_VERSION_STORAGE_KEY, '5');
      fetchMock.mockResolvedValue(list('a'));
      renderHook(() => usePublicEvents());
      act(() => fs.versionCb?.(versionSnap()));
      await waitFor(() => expect(fs.eventListeners).toBe(1));
      expect(window.localStorage.getItem(EVENTS_VERSION_STORAGE_KEY)).toBeNull();
    });
  });
});
