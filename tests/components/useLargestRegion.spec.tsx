import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  regions: [
    { id: 'vorarlberg', name: 'Vorarlberg' },
    { id: 'tirol', name: 'Tirol' },
  ],
  counts: { vorarlberg: 170, tirol: 12 } as Record<string, number>,
  getCount: vi.fn(),
}));

vi.mock('../../src/hooks/useRegion', () => ({ useRegion: () => ({ regions: mocks.regions }) }));
vi.mock('../../src/lib/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  collection: () => ({}),
  where: (_f: string, _o: string, v: string) => ({ v }),
  query: (_c: unknown, ...wheres: { v: string }[]) => ({ id: wheres[1].v }),
  getCountFromServer: (q: { id: string }) => {
    mocks.getCount(q.id);
    return Promise.resolve({ data: () => ({ count: mocks.counts[q.id] }) });
  },
}));

import { useLargestRegion } from '../../src/hooks/useLargestRegion';

beforeEach(() => {
  window.localStorage.clear();
  mocks.getCount.mockClear();
  mocks.counts = { vorarlberg: 170, tirol: 12 };
});

describe('useLargestRegion', () => {
  it('picks the region with the most events and reads each count once per day', async () => {
    const first = renderHook(() => useLargestRegion());
    await waitFor(() => expect(first.result.current?.region.id).toBe('vorarlberg'));
    expect(first.result.current?.count).toBe(170);
    expect(mocks.getCount).toHaveBeenCalledTimes(2);

    // Same day, even though the data changed: the cached value is used, no new reads.
    mocks.counts = { vorarlberg: 1, tirol: 500 };
    const second = renderHook(() => useLargestRegion());
    await waitFor(() => expect(second.result.current?.count).toBe(170));
    expect(mocks.getCount).toHaveBeenCalledTimes(2);
  });

  it('reads the counts again once the cache is older than a day', async () => {
    const first = renderHook(() => useLargestRegion());
    await waitFor(() => expect(first.result.current).not.toBeNull());
    const cached = JSON.parse(window.localStorage.getItem('tribe:largestRegion')!);
    cached.at -= 25 * 60 * 60 * 1000;
    window.localStorage.setItem('tribe:largestRegion', JSON.stringify(cached));

    mocks.counts = { vorarlberg: 1, tirol: 500 };
    const second = renderHook(() => useLargestRegion());
    await waitFor(() => expect(second.result.current?.region.id).toBe('tirol'));
    expect(second.result.current?.count).toBe(500);
  });
});
