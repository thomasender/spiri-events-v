import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useRegions, refreshRegions, _resetRegionsCache } from '../../src/hooks/useRegions';

const state = vi.hoisted(() => ({
  docs: [] as Array<{ id: string; data: Record<string, unknown> }>,
  fail: false,
  loads: 0,
}));

vi.mock('../../src/lib/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  collection: () => ({}),
  getDocs: async () => {
    state.loads += 1;
    if (state.fail) throw new Error('offline');
    return { docs: state.docs.map((d) => ({ id: d.id, data: () => d.data })) };
  },
}));

const tirolActive = (hook: { current: ReturnType<typeof useRegions> }) =>
  hook.current.regions.find((r: { id: string }) => r.id === 'tirol')?.active;

afterEach(() => {
  _resetRegionsCache();
  state.docs = [];
  state.fail = false;
  state.loads = 0;
});

describe('useRegions', () => {
  it('loads once and shares the result', async () => {
    state.docs = [{ id: 'tirol', data: { active: true } }];
    const a = renderHook(() => useRegions());
    await waitFor(() => expect(a.result.current.loading).toBe(false));
    const b = renderHook(() => useRegions());
    expect(tirolActive(b.result)).toBe(true);
    expect(b.result.current.loading).toBe(false);
    expect(state.loads).toBe(1);
  });

  it('refreshRegions reloads and updates every mounted caller', async () => {
    state.docs = [{ id: 'tirol', data: { active: false } }];
    const a = renderHook(() => useRegions());
    await waitFor(() => expect(a.result.current.loading).toBe(false));
    const b = renderHook(() => useRegions());
    expect(tirolActive(a.result)).toBe(false);

    state.docs = [{ id: 'tirol', data: { active: true } }];
    await act(() => refreshRegions());
    expect(tirolActive(a.result)).toBe(true);
    expect(tirolActive(b.result)).toBe(true);
    expect(state.loads).toBe(2);
  });

  it('a failed refresh keeps the last loaded regions', async () => {
    state.docs = [{ id: 'tirol', data: { active: true } }];
    const a = renderHook(() => useRegions());
    await waitFor(() => expect(tirolActive(a.result)).toBe(true));
    state.fail = true;
    await act(() => refreshRegions());
    expect(tirolActive(a.result)).toBe(true);
  });
});
