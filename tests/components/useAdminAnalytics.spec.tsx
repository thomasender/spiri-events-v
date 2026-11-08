import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  calls: [] as { data: Record<string, unknown>; resolve: (v: unknown) => void }[],
}));

vi.mock('../../src/lib/firebase', () => ({
  callable: () => (data: Record<string, unknown>) =>
    new Promise((resolve) => mocks.calls.push({ data, resolve })),
}));

import { useAdminAnalytics } from '../../src/hooks/useAdminAnalytics';

describe('useAdminAnalytics', () => {
  beforeEach(() => {
    mocks.calls = [];
  });

  it('asks the function to skip its cache when reloading on demand', async () => {
    const { result } = renderHook(() => useAdminAnalytics(7));
    await waitFor(() => expect(mocks.calls).toHaveLength(1));
    expect(mocks.calls[0].data).toEqual({ days: 7 });
    await act(async () => mocks.calls[0].resolve({ data: { rangeDays: 7, n: 1 } }));

    act(() => {
      result.current.reload();
    });
    await waitFor(() => expect(mocks.calls).toHaveLength(2));
    expect(mocks.calls[1].data).toEqual({ days: 7, refresh: true });
    await act(async () => mocks.calls[1].resolve({ data: { rangeDays: 7, n: 2 } }));
    expect(result.current.report).toEqual({ rangeDays: 7, n: 2 });
  });

  it('keeps the newest range when an older, slower answer arrives last', async () => {
    const { result, rerender } = renderHook(({ days }) => useAdminAnalytics(days), {
      initialProps: { days: 7 },
    });
    await waitFor(() => expect(mocks.calls).toHaveLength(1));
    rerender({ days: 30 });
    await waitFor(() => expect(mocks.calls).toHaveLength(2));

    await act(async () => mocks.calls[1].resolve({ data: { rangeDays: 30 } }));
    await act(async () => mocks.calls[0].resolve({ data: { rangeDays: 7 } }));

    expect(result.current.report).toEqual({ rangeDays: 30 });
    expect(result.current.loading).toBe(false);
  });
});
