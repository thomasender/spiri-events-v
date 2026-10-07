import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useUnpostedConsentEvents } from '../../src/hooks/useInstagramAdmin';

const state = vi.hoisted(() => ({
  docs: [] as { id: string; data: () => Record<string, unknown> }[],
  wheres: [] as unknown[][],
}));

vi.mock('../../src/lib/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, name: string) => name,
  doc: vi.fn(),
  getDoc: vi.fn(),
  orderBy: vi.fn(),
  query: (...args: unknown[]) => args,
  where: (...args: unknown[]) => {
    state.wheres.push(args);
    return args;
  },
  onSnapshot: (_q: unknown, next: (snap: unknown) => void) => {
    next({ docs: state.docs });
    return () => undefined;
  },
}));

const ev = (id: string, title: string) => ({ id, data: () => ({ title, date: '2026-10-16' }) });

describe('useUnpostedConsentEvents', () => {
  it('queries approved + consented events and drops those that already have a post', async () => {
    state.docs = [ev('a', 'Yoga'), ev('b', 'Kakao')];
    const posts = [{ eventId: 'b' }];
    const { result } = renderHook(() => useUnpostedConsentEvents(true, posts));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.events.map((e) => e.eventId)).toEqual(['a']);
    expect(state.wheres).toEqual(
      expect.arrayContaining([
        ['status', '==', 'approved'],
        ['instagramConsent', '==', true],
      ])
    );
  });
});
