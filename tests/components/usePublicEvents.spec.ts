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

import { usePublicEvents } from '../../src/hooks/useEvents';

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
});
