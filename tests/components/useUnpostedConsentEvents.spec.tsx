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

const ev = (id: string, date: string, endDate?: string) => ({
  id,
  data: () => ({ title: id, date, endDate }),
});
const NOW = new Date('2026-10-07T10:00:00Z');
const ids = (r: { current: { events: { eventId: string }[] } }) =>
  r.current.events.map((e) => e.eventId);

describe('useUnpostedConsentEvents', () => {
  it('queries approved + consented events', async () => {
    state.docs = [ev('a', '2026-10-16')];
    const { result } = renderHook(() => useUnpostedConsentEvents(true, [], NOW));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(state.wheres).toEqual(
      expect.arrayContaining([
        ['status', '==', 'approved'],
        ['instagramConsent', '==', true],
      ])
    );
  });

  it('keeps upcoming events that have no post, a failed post or a skipped post', async () => {
    state.docs = [
      ev('none', '2026-10-16'),
      ev('failed', '2026-10-16'),
      ev('skipped', '2026-10-16'),
    ];
    const posts = [
      { eventId: 'failed', status: 'failed' },
      { eventId: 'skipped', status: 'skipped' },
    ];
    const { result } = renderHook(() => useUnpostedConsentEvents(true, posts, NOW));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(ids(result)).toEqual(['none', 'failed', 'skipped']);
    expect(result.current.events.map((e) => e.postStatus)).toEqual([null, 'failed', 'skipped']);
  });

  it('drops published and in-flight posts', async () => {
    state.docs = [ev('pub', '2026-10-16'), ev('busy', '2026-10-16')];
    const posts = [
      { eventId: 'pub', status: 'published' },
      { eventId: 'busy', status: 'publishing' },
    ];
    const { result } = renderHook(() => useUnpostedConsentEvents(true, posts, NOW));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(ids(result)).toEqual([]);
  });

  it('drops past events but keeps today and multi-day events still running', async () => {
    state.docs = [
      ev('past', '2026-10-06'),
      ev('today', '2026-10-07'),
      ev('running', '2026-10-05', '2026-10-09'),
      ev('over', '2026-10-01', '2026-10-06'),
    ];
    const { result } = renderHook(() => useUnpostedConsentEvents(true, [], NOW));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(ids(result)).toEqual(['today', 'running']);
  });
});
