import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';

// A tiny in-memory Firestore: `where` constraints are really evaluated against
// the docs, so a test sees what a region query would and would not return
// (e.g. an old event without regionId). Every query that runs is recorded.
type Constraint = [string, string, unknown];
const store = vi.hoisted(() => ({
  events: [] as Array<{ id: string; data: Record<string, unknown> }>,
  profiles: [] as Array<{ uid: string; data: Record<string, unknown> }>,
  marker: null as Record<string, unknown> | null,
  markerListeners: [] as Array<(snap: unknown) => void>,
  queries: [] as Array<{ source: string; constraints: Constraint[] }>,
  failRegionQueries: false,
}));

function matches(data: Record<string, unknown>, [field, op, value]: Constraint) {
  const v = data[field];
  if (op === '==') return v === value;
  if (op === 'in') return (value as unknown[]).includes(v);
  if (op === 'array-contains') return Array.isArray(v) && v.includes(value);
  if (op === 'array-contains-any')
    return Array.isArray(v) && (value as unknown[]).some((x) => v.includes(x));
  throw new Error(`unsupported op ${op}`);
}

vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, name: string) => ({ source: name }),
  collectionGroup: (_db: unknown, name: string) => ({ source: name }),
  doc: (_db: unknown, ...path: string[]) => ({ path: path.join('/') }),
  query: (ref: { source: string }, ...constraints: Constraint[]) => ({
    source: ref.source,
    constraints,
  }),
  where: (field: string, op: string, value: unknown) => [field, op, value],
  onSnapshot: (
    ref: { path?: string; source?: string; constraints?: Constraint[] },
    cb: (snap: unknown) => void,
    onError?: (err: Error) => void
  ) => {
    if (ref.path === 'app_settings/regionMigration') {
      const emit = () =>
        cb({ exists: () => store.marker !== null, data: () => store.marker ?? undefined });
      store.markerListeners.push(emit);
      emit();
      return () => {};
    }
    const constraints = ref.constraints ?? [];
    store.queries.push({ source: ref.source ?? '', constraints });
    const scoped = constraints.some(([f]) => f === 'regionId' || f === 'directoryRegionIds');
    if (store.failRegionQueries && scoped) {
      onError?.(new Error('FAILED_PRECONDITION: The query requires an index.'));
      return () => {};
    }
    const keep = (data: Record<string, unknown>) => constraints.every((c) => matches(data, c));
    if (ref.source === 'publicProfile') {
      cb({
        docs: store.profiles
          .filter((p) => keep(p.data))
          .map((p) => ({ ref: { parent: { parent: { id: p.uid } } }, data: () => p.data })),
      });
    } else {
      cb({
        docs: store.events
          .filter((e) => keep(e.data))
          .map((e) => ({ id: e.id, data: () => e.data })),
      });
    }
    return () => {};
  },
  getDocs: async () => ({ docs: [] }),
  updateDoc: vi.fn(async () => {}),
  addDoc: vi.fn(async () => ({ id: 'x' })),
  deleteDoc: vi.fn(async () => {}),
  getDoc: async () => ({ exists: () => false, data: () => undefined }),
  getFirestore: () => ({}),
  serverTimestamp: () => 'ts',
  arrayUnion: (...v: unknown[]) => v,
  orderBy: () => ({}),
  Timestamp: {},
}));

vi.mock('firebase/app', () => ({ getApp: () => ({}) }));
vi.mock('../../src/lib/firebase', () => ({ db: {}, auth: { currentUser: null } }));
vi.mock('../../src/lib/slug', () => ({
  findUniqueSlug: vi.fn(async () => 'slug'),
  resolveSlugForApproval: vi.fn(async () => 'slug'),
}));
vi.mock('../../src/lib/imageUpload', () => ({ deleteImageByUrl: vi.fn(async () => {}) }));
vi.mock('../../src/hooks/useAuth', () => ({ useAuth: () => ({ user: null, role: null }) }));
vi.mock('../../src/utils/ensureCategoryExists', () => ({ ensureCategoryExists: vi.fn() }));

import { useAllEvents } from '../../src/hooks/useEvents';
import { useDirectory } from '../../src/hooks/useDirectory';
import { _resetRegionMigrationMarker } from '../../src/hooks/useRegionMigrationMarker';
import { DEFAULT_REGION_CONTEXT, RegionContext } from '../../src/hooks/useRegion';
import { STATIC_REGIONS } from '../../src/utils/regions.js';

const active = (...ids: string[]) =>
  STATIC_REGIONS.filter((r) => ids.includes(r.id)).map((r) => ({ ...r, active: true }));

function wrapper(ctx: Partial<typeof DEFAULT_REGION_CONTEXT>) {
  const value = { ...DEFAULT_REGION_CONTEXT, ...ctx };
  return ({ children }: { children: ReactNode }) =>
    createElement(RegionContext.Provider, { value }, children);
}

const VBG = { regionId: 'vorarlberg', regions: active('vorarlberg', 'tirol') };
const TIROL = { regionId: 'tirol', regions: active('vorarlberg', 'tirol') };
const NATIONAL = {
  regionId: 'vorarlberg',
  isNational: true,
  regions: active('vorarlberg', 'tirol'),
  combinedRegions: active('vorarlberg', 'tirol'),
};

const ids = (events: Array<{ id: string }>) => events.map((e) => e.id).sort();

beforeEach(() => {
  _resetRegionMigrationMarker();
  window.localStorage.clear();
  store.marker = null;
  store.markerListeners = [];
  store.queries = [];
  store.failRegionQueries = false;
  store.events = [
    // written before the migration: no regionId, counts as Vorarlberg
    { id: 'legacy', data: { status: 'approved', date: '2026-11-01' } },
    { id: 'vbg', data: { status: 'approved', date: '2026-11-02', regionId: 'vorarlberg' } },
    { id: 'tirol', data: { status: 'approved', date: '2026-11-03', regionId: 'tirol' } },
    {
      id: 'online-tirol',
      data: { status: 'approved', date: '2026-11-04', regionId: 'tirol', isOnline: true },
    },
    { id: 'wien', data: { status: 'approved', date: '2026-11-05', regionId: 'wien' } },
    { id: 'pending', data: { status: 'pending', date: '2026-11-06', regionId: 'vorarlberg' } },
  ];
  store.profiles = [
    {
      uid: 'legacy',
      data: {
        listedInDirectory: true,
        displayName: 'Alt',
        slug: 'alt',
        directoryCategories: ['Yoga'],
      },
    },
    {
      uid: 'tirolp',
      data: {
        listedInDirectory: true,
        displayName: 'Tirol',
        slug: 'tirol-p',
        directoryRegionIds: ['tirol'],
        directoryCategories: ['Yoga'],
      },
    },
  ];
});

afterEach(() => {
  window.localStorage.clear();
});

describe('useAllEvents({ regionScoped }) — marker missing (dark launch)', () => {
  it('runs the old full query and returns every approved event, legacy ones included', async () => {
    const { result } = renderHook(() => useAllEvents({ regionScoped: true }), {
      wrapper: wrapper(VBG),
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(store.queries).toEqual([
      { source: 'events', constraints: [['status', '==', 'approved']] },
    ]);
    expect(ids(result.current.events)).toEqual(['legacy', 'online-tirol', 'tirol', 'vbg', 'wien']);
  });

  it('a marker without complete: true changes nothing', async () => {
    store.marker = { complete: false };
    const { result } = renderHook(() => useAllEvents({ regionScoped: true }), {
      wrapper: wrapper(TIROL),
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(store.queries).toHaveLength(1);
    expect(store.queries[0].constraints).toEqual([['status', '==', 'approved']]);
  });

  it('admin callers (no options) never read the marker', async () => {
    store.marker = { complete: true };
    const { result } = renderHook(() => useAllEvents(), { wrapper: wrapper(TIROL) });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(store.markerListeners).toHaveLength(0);
    expect(store.queries[0].constraints).toEqual([['status', '==', 'approved']]);
  });
});

describe('useAllEvents({ regionScoped }) — marker complete', () => {
  beforeEach(() => {
    store.marker = { complete: true, completedAt: 1 };
  });

  it('region view: the region query plus the online query, merged', async () => {
    const { result } = renderHook(() => useAllEvents({ regionScoped: true }), {
      wrapper: wrapper(VBG),
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(store.queries.map((q) => q.constraints)).toEqual([
      [
        ['status', '==', 'approved'],
        ['regionId', '==', 'vorarlberg'],
      ],
      [
        ['status', '==', 'approved'],
        ['isOnline', '==', true],
      ],
    ]);
    // Online events of other regions arrive; the client filter decides later.
    expect(ids(result.current.events)).toEqual(['online-tirol', 'vbg']);
  });

  it('combined view / favourites: one `in` over the active regions', async () => {
    const { result } = renderHook(() => useAllEvents({ regionScoped: true, allActive: true }), {
      wrapper: wrapper(VBG),
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(store.queries.map((q) => q.constraints)).toEqual([
      [
        ['status', '==', 'approved'],
        ['regionId', 'in', ['vorarlberg', 'tirol']],
      ],
    ]);
    expect(ids(result.current.events)).toEqual(['online-tirol', 'tirol', 'vbg']);

    const national = renderHook(() => useAllEvents({ regionScoped: true }), {
      wrapper: wrapper(NATIONAL),
    });
    await waitFor(() => expect(national.result.current.loading).toBe(false));
    expect(ids(national.result.current.events)).toEqual(['online-tirol', 'tirol', 'vbg']);
  });

  it('waits for the region register before querying', async () => {
    const { result, rerender } = renderHook(() => useAllEvents({ regionScoped: true }), {
      wrapper: wrapper({ ...TIROL, loading: true }),
    });
    expect(result.current.loading).toBe(true);
    expect(store.queries).toHaveLength(0);
    rerender();
    expect(store.queries).toHaveLength(0);
  });

  it('switches back to the full query live when the marker is deleted (revert)', async () => {
    const { result } = renderHook(() => useAllEvents({ regionScoped: true }), {
      wrapper: wrapper(VBG),
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(ids(result.current.events)).not.toContain('legacy');

    store.marker = null;
    act(() => store.markerListeners.forEach((emit) => emit()));
    await waitFor(() => expect(ids(result.current.events)).toContain('legacy'));
    expect(store.queries.at(-1)?.constraints).toEqual([['status', '==', 'approved']]);
  });

  it('a failing region query (index still building) falls back to the full query', async () => {
    store.failRegionQueries = true;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { result } = renderHook(() => useAllEvents({ regionScoped: true }), {
      wrapper: wrapper(VBG),
    });
    await waitFor(() => expect(ids(result.current.events)).toContain('legacy'));
    expect(result.current.error).toBe(null);
    expect(warn).toHaveBeenCalled();
  });

  it('remembers the marker so the next page load does not wait for it', async () => {
    const { result } = renderHook(() => useAllEvents({ regionScoped: true }), {
      wrapper: wrapper(VBG),
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(window.localStorage.getItem('tribe:regionMigrationComplete')).toBe('true');
  });
});

describe('useDirectory({ regionScoped })', () => {
  it('marker missing: every listed profile, legacy ones included', async () => {
    const { result } = renderHook(() => useDirectory({ regionScoped: true }), {
      wrapper: wrapper(TIROL),
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(store.queries).toEqual([
      { source: 'publicProfile', constraints: [['listedInDirectory', '==', true]] },
    ]);
    expect(result.current.entries.map((e: { uid: string }) => e.uid).sort()).toEqual([
      'legacy',
      'tirolp',
    ]);
  });

  it('marker complete: array-contains the region, array-contains-any in the combined view', async () => {
    store.marker = { complete: true };
    const region = renderHook(() => useDirectory({ regionScoped: true }), {
      wrapper: wrapper(TIROL),
    });
    await waitFor(() => expect(region.result.current.loading).toBe(false));
    expect(region.result.current.entries.map((e: { uid: string }) => e.uid)).toEqual(['tirolp']);

    const national = renderHook(() => useDirectory({ regionScoped: true }), {
      wrapper: wrapper(NATIONAL),
    });
    await waitFor(() => expect(national.result.current.loading).toBe(false));
    expect(store.queries.map((q) => q.constraints)).toEqual([
      [
        ['listedInDirectory', '==', true],
        ['directoryRegionIds', 'array-contains', 'tirol'],
      ],
      [
        ['listedInDirectory', '==', true],
        ['directoryRegionIds', 'array-contains-any', ['vorarlberg', 'tirol']],
      ],
    ]);
  });
});
