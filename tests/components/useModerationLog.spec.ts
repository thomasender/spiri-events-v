import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

const fs = vi.hoisted(() => ({
  calls: [] as unknown[][],
  pages: [] as Array<Array<{ id: string; data: () => Record<string, unknown> }>>,
}));

vi.mock('../../src/lib/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, name: string) => ({ collection: name }),
  where: (...args: unknown[]) => ['where', ...args],
  orderBy: (...args: unknown[]) => ['orderBy', ...args],
  limit: (n: number) => ['limit', n],
  startAfter: (cursor: { id: string }) => ['startAfter', cursor.id],
  Timestamp: { fromDate: (d: Date) => ({ ts: d.toISOString() }) },
  query: (...parts: unknown[]) => parts,
  getDocs: async (q: unknown[]) => {
    fs.calls.push(q);
    if (q.some((part) => Array.isArray(part) && part[1] === 'bad')) {
      throw Object.assign(new Error('index missing'), { code: 'failed-precondition' });
    }
    return { docs: fs.pages.shift() ?? [] };
  },
}));

import { useModerationLog } from '../../src/hooks/useModerationLog';
import { MODERATION_LOG_PAGE_SIZE } from '../../src/utils/moderationLog';

const page = (prefix: string, n: number) =>
  Array.from({ length: n }, (_, i) => ({
    id: `${prefix}${i}`,
    data: () => ({ action: 'approved' }),
  }));

beforeEach(() => {
  fs.calls = [];
  fs.pages = [];
});

describe('useModerationLog', () => {
  it('queries newest first with the filters, pages with a cursor', async () => {
    fs.pages = [page('a', MODERATION_LOG_PAGE_SIZE), page('b', 3)];
    const start = new Date('2026-11-01T00:00:00Z');
    const spec = {
      where: [
        ['regionId', '==', 'tirol'],
        ['at', '>=', start],
      ],
      orderBy: ['at', 'desc'],
    };
    const { result } = renderHook(() => useModerationLog(spec));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.entries).toHaveLength(MODERATION_LOG_PAGE_SIZE);
    expect(result.current.hasMore).toBe(true);
    expect(fs.calls[0]).toEqual([
      { collection: 'moderation_log' },
      ['where', 'regionId', '==', 'tirol'],
      ['where', 'at', '>=', { ts: '2026-11-01T00:00:00.000Z' }],
      ['orderBy', 'at', 'desc'],
      ['limit', MODERATION_LOG_PAGE_SIZE],
    ]);

    await act(() => result.current.loadMore());
    expect(fs.calls[1]).toContainEqual(['startAfter', `a${MODERATION_LOG_PAGE_SIZE - 1}`]);
    expect(result.current.entries).toHaveLength(MODERATION_LOG_PAGE_SIZE + 3);
    expect(result.current.hasMore).toBe(false);
  });

  it('does not read when disabled', async () => {
    const { result } = renderHook(() =>
      useModerationLog({ where: [], orderBy: ['at', 'desc'] }, { enabled: false })
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(fs.calls).toHaveLength(0);
  });

  it('a failed read shows the error', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { result } = renderHook(() => useModerationLog({ where: [], orderBy: ['bad'] }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toMatchObject({ code: 'failed-precondition' });
    expect(result.current.entries).toEqual([]);
    expect(result.current.hasMore).toBe(false);
  });
});
