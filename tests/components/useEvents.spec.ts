import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const mockStore = vi.hoisted(() => ({
  snapshotDocs: [] as Array<{ id: string; data: Record<string, unknown> }>,
  sourceDoc: null as Record<string, unknown> | null,
  addDoc: vi.fn(async () => ({ id: 'new-id' })),
}));

vi.mock('firebase/firestore', () => ({
  collection: () => ({ type: 'collection' }),
  doc: (_db: unknown, _col: string, id: string) => ({ id }),
  query: () => ({ type: 'query' }),
  where: () => ({}),
  orderBy: () => ({}),
  onSnapshot: (_q: unknown, cb: (snap: unknown) => void) => {
    cb({ docs: mockStore.snapshotDocs.map((d) => ({ id: d.id, data: () => d.data })) });
    return () => {};
  },
  addDoc: (...args: unknown[]) => mockStore.addDoc(...(args as [])),
  updateDoc: vi.fn(async () => {}),
  deleteDoc: vi.fn(async () => {}),
  getDoc: async () => ({
    exists: () => mockStore.sourceDoc !== null,
    data: () => mockStore.sourceDoc,
  }),
  getDocs: async () => ({ docs: [] }),
  getFirestore: () => ({}),
  serverTimestamp: () => 'ts',
  arrayUnion: (...v: unknown[]) => v,
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

import { useEvents } from '../../src/hooks/useEvents';

const user = { uid: 'owner' };

function lastAddPayload() {
  const calls = mockStore.addDoc.mock.calls as unknown as Array<[unknown, Record<string, unknown>]>;
  return calls[calls.length - 1][1];
}

beforeEach(() => {
  mockStore.snapshotDocs = [];
  mockStore.sourceDoc = null;
  mockStore.addDoc.mockClear();
});

describe('useEvents regionId', () => {
  it('addEvent stores the default region when the form has none', async () => {
    const { result } = renderHook(() => useEvents(user));
    await result.current.addEvent({ title: 'T', category: 'Yoga', bezirk: '', date: '2026-11-01' });
    expect(lastAddPayload().regionId).toBe('vorarlberg');
  });

  it('addEvent keeps a valid region from the form, also for online events', async () => {
    const { result } = renderHook(() => useEvents(user));
    await result.current.addEvent({ title: 'T', isOnline: true, regionId: 'tirol' });
    expect(lastAddPayload().regionId).toBe('tirol');
  });

  it('addEvent replaces an unknown region with the default', async () => {
    const { result } = renderHook(() => useEvents(user));
    await result.current.addEvent({ title: 'T', regionId: 'bayern' });
    expect(lastAddPayload().regionId).toBe('vorarlberg');
  });

  it('duplicateEvent copies the source region', async () => {
    mockStore.sourceDoc = { title: 'Src', date: '2026-11-01', regionId: 'tirol' };
    const { result } = renderHook(() => useEvents(user));
    await result.current.duplicateEvent('src');
    expect(lastAddPayload().regionId).toBe('tirol');
  });

  it('duplicateEvent of an old event without region gets the default', async () => {
    mockStore.sourceDoc = { title: 'Src', date: '2026-11-01' };
    const { result } = renderHook(() => useEvents(user));
    await result.current.duplicateEvent('src');
    expect(lastAddPayload().regionId).toBe('vorarlberg');
  });

  it('read side resolves a missing regionId to the default', async () => {
    mockStore.snapshotDocs = [
      { id: 'old', data: { title: 'Old', date: '2026-11-01' } },
      { id: 'new', data: { title: 'New', date: '2026-11-02', regionId: 'tirol' } },
    ];
    const { result } = renderHook(() => useEvents(user));
    await waitFor(() => expect(result.current.events).toHaveLength(2));
    const byId = Object.fromEntries(result.current.events.map((e) => [e.id, e.regionId]));
    expect(byId).toEqual({ old: 'vorarlberg', new: 'tirol' });
  });
});
