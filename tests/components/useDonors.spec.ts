import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useDonors } from '../../src/hooks/useDonors';

type Doc = Record<string, unknown> & { id: string };

const state = vi.hoisted(() => ({
  docs: [] as Doc[],
  source: null as unknown,
  writes: [] as Array<{ id: string; data: Record<string, unknown> }>,
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
vi.mock('../../src/hooks/useAuth', () => ({
  useAuth: () => ({ user: { uid: 'u1' }, role: 'Admin' }),
}));

beforeEach(() => {
  state.docs = [
    { id: 'legacy', name: 'Lea', order: 100 },
    { id: 'vb', name: 'Vera', regionId: 'vorarlberg', order: 0 },
    { id: 'tirol', name: 'Toni', regionId: 'tirol', order: 0 },
  ];
  state.source = null;
  state.writes = [];
});

describe('useDonors per region', () => {
  it('Vorarlberg reads the whole collection and keeps donors without regionId', async () => {
    const { result } = renderHook(() => useDonors());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(state.source).toEqual({ collection: 'donors' });
    expect(result.current.donors.map((d) => d.id)).toEqual(['vb', 'legacy']);
  });

  it('another region queries its regionId only', async () => {
    const { result } = renderHook(() => useDonors('tirol'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(state.source).toEqual({
      collection: 'donors',
      filters: [{ field: 'regionId', op: '==', value: 'tirol' }],
    });
    expect(result.current.donors.map((d) => d.id)).toEqual(['tirol']);
  });

  it('writes new donors with the region of the hook unless another one is chosen', async () => {
    const { result } = renderHook(() => useDonors('tirol'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(() => result.current.addDonor({ name: 'Nina' }));
    await act(() => result.current.addDonor({ name: 'Wim', regionId: 'wien' }));
    expect(state.writes[0].data).toMatchObject({ name: 'Nina', regionId: 'tirol' });
    expect(state.writes[1].data).toMatchObject({ name: 'Wim', regionId: 'wien' });
  });

  it('rejects an unknown region', async () => {
    const { result } = renderHook(() => useDonors());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await expect(result.current.updateDonor('vb', { regionId: 'atlantis' })).rejects.toThrow(
      /gültige Region/
    );
    expect(state.writes).toHaveLength(0);
  });
});
