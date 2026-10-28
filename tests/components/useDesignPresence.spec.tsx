import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

type Snap = { docs: { data: () => Record<string, unknown> }[] };
let emit: (snap: Snap) => void = () => {};
const setDoc = vi.fn(() => Promise.resolve());
const deleteDoc = vi.fn(() => Promise.resolve());

vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, name: string) => ({ name }),
  doc: (_db: unknown, ...path: string[]) => ({ path: path.join('/') }),
  serverTimestamp: () => 'SERVER_TS',
  setDoc: (...args: unknown[]) => (setDoc as (...a: unknown[]) => unknown)(...args),
  deleteDoc: (...args: unknown[]) => (deleteDoc as (...a: unknown[]) => unknown)(...args),
  onSnapshot: (_ref: unknown, next: (snap: Snap) => void) => {
    emit = next;
    return () => {};
  },
}));
vi.mock('../../src/lib/firebase', () => ({ db: {} }));

import { STALE_MS, useDesignPresence } from '../../src/hooks/useDesignPresence';

const session = (uid: string, name: string, ageMs: number) => {
  const at = Date.now() - ageMs;
  return { data: () => ({ uid, name, lastSeen: { toMillis: () => at } }) };
};

beforeEach(() => {
  vi.useFakeTimers();
  setDoc.mockClear();
  deleteDoc.mockClear();
});
afterEach(() => vi.useRealTimers());

describe('useDesignPresence', () => {
  const user = { uid: 'me', displayName: 'Ich' };

  it('announces the own session and removes it on unmount', () => {
    const { unmount } = renderHook(() => useDesignPresence(user));
    expect(setDoc).toHaveBeenCalledWith(
      { path: 'design_sessions/me' },
      { uid: 'me', name: 'Ich', lastSeen: 'SERVER_TS' }
    );
    unmount();
    expect(deleteDoc).toHaveBeenCalledWith({ path: 'design_sessions/me' });
  });

  it('lists other fresh sessions by name, ignoring myself and stale ones', () => {
    const { result } = renderHook(() => useDesignPresence(user));
    act(() =>
      emit({
        docs: [
          session('me', 'Ich', 0),
          session('a', 'Jana', 10_000),
          session('b', 'Peter', STALE_MS + 1000),
        ],
      })
    );
    expect(result.current).toEqual(['Jana']);
  });

  it('drops a session that stops sending heartbeats', () => {
    const { result } = renderHook(() => useDesignPresence(user));
    act(() => emit({ docs: [session('a', 'Jana', 0)] }));
    expect(result.current).toEqual(['Jana']);
    act(() => {
      vi.advanceTimersByTime(STALE_MS + 30_000);
    });
    expect(result.current).toEqual([]);
  });
});
