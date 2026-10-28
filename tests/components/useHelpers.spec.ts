import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useHelpers } from '../../src/hooks/useHelpers';
import { getStaffAccess } from '../../src/utils/staffRoles';

type Doc = Record<string, unknown> & { id: string };

const state = vi.hoisted(() => ({
  docs: [] as Doc[],
  source: null as unknown,
  writes: [] as Array<{ id: string; data: Record<string, unknown> }>,
  role: 'Admin',
  regionIds: [] as string[],
}));

vi.mock('../../src/lib/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, name: string) => ({ collection: name }),
  where: (field: string, op: string, value: unknown) => ({ field, op, value }),
  query: (col: unknown, ...filters: unknown[]) => ({ ...(col as object), filters }),
  doc: (_db: unknown, col: string, id: string) => ({ col, id }),
  serverTimestamp: () => 'TS',
  deleteDoc: vi.fn(),
  writeBatch: vi.fn(),
  setDoc: async (ref: { id: string }, data: Record<string, unknown>) => {
    state.writes.push({ id: ref.id, data });
  },
  onSnapshot: (source: unknown, next: (snap: unknown) => void) => {
    state.source = source;
    next({ docs: state.docs.map(({ id, ...data }) => ({ id, data: () => data })) });
    return () => {};
  },
}));
vi.mock('../../src/hooks/useAuth', () => ({ useAuth: () => ({ user: { uid: 'u1' } }) }));
vi.mock('../../src/hooks/useStaffRole', () => ({
  useStaffRole: () => getStaffAccess(state.role, state.regionIds),
}));

beforeEach(() => {
  state.docs = [
    { id: 'legacy', name: 'Lea', order: 100 },
    { id: 'vb', name: 'Vera', regionId: 'vorarlberg', order: 0 },
    { id: 'tirol', name: 'Toni', regionId: 'tirol', order: 0 },
  ];
  state.source = null;
  state.writes = [];
  state.role = 'Admin';
  state.regionIds = [];
});

describe('useHelpers per region', () => {
  it('Vorarlberg reads the whole collection and keeps helpers without regionId', async () => {
    const { result } = renderHook(() => useHelpers('vorarlberg'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(state.source).toEqual({ collection: 'helpers' });
    expect(result.current.helpers.map((h) => h.id)).toEqual(['vb', 'legacy']);
  });

  it('another region queries its regionId only', async () => {
    const { result } = renderHook(() => useHelpers('tirol'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(state.source).toEqual({
      collection: 'helpers',
      filters: [{ field: 'regionId', op: '==', value: 'tirol' }],
    });
    expect(result.current.helpers.map((h) => h.id)).toEqual(['tirol']);
  });

  it('a moderator writes new helpers with the regionId of her region', async () => {
    state.role = 'RegionModerator';
    state.regionIds = ['tirol'];
    const { result } = renderHook(() => useHelpers('tirol'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.canEdit).toBe(true);
    await act(() => result.current.addHelper({ name: 'Nina' }));
    expect(state.writes[0].data).toMatchObject({ name: 'Nina', regionId: 'tirol', order: 100 });
  });

  it('a moderator cannot edit a foreign region', async () => {
    state.role = 'RegionModerator';
    state.regionIds = ['tirol'];
    const { result } = renderHook(() => useHelpers('vorarlberg'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.canEdit).toBe(false);
    await expect(result.current.addHelper({ name: 'Nina' })).rejects.toThrow();
    expect(state.writes).toHaveLength(0);
  });
});
