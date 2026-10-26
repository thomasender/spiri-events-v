import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useAdminAlerts } from '../../src/hooks/useAdminAlerts';

const fs = vi.hoisted(() => ({
  listener: null as null | ((snap: unknown) => void),
  onSnapshot: vi.fn(),
  updateDoc: vi.fn(async () => {}),
}));

vi.mock('../../src/lib/firebase', () => ({ db: {} }));

vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, ...path: string[]) => ({ path: path.join('/') }),
  doc: (_db: unknown, ...path: string[]) => ({ path: path.join('/') }),
  onSnapshot: (...args: unknown[]) => fs.onSnapshot(...args),
  updateDoc: (...args: unknown[]) => fs.updateDoc(...args),
}));

const snapshot = (docs: { id: string; data: Record<string, unknown> }[]) => ({
  docs: docs.map((d) => ({ id: d.id, data: () => d.data })),
});

beforeEach(() => {
  fs.listener = null;
  fs.updateDoc.mockClear();
  fs.onSnapshot.mockReset();
  fs.onSnapshot.mockImplementation((_ref, next) => {
    fs.listener = next;
    return () => {};
  });
});

const emit = (docs: { id: string; data: Record<string, unknown> }[]) =>
  act(() => {
    fs.listener?.(snapshot(docs));
  });

describe('useAdminAlerts', () => {
  it('does not listen unless enabled (non-admins)', () => {
    const { result } = renderHook(() => useAdminAlerts('u1', false));
    expect(fs.onSnapshot).not.toHaveBeenCalled();
    expect(result.current.unreadCount).toBe(0);
  });

  it('counts only unread alerts and exposes them by event', () => {
    const { result } = renderHook(() => useAdminAlerts('u1', true));
    emit([
      { id: 'e1', data: { read: false, kind: 'edited', changeCount: 2 } },
      { id: 'e2', data: { read: true } },
      { id: 'e3', data: { read: false, kind: 'resubmitted' } },
    ]);
    expect(result.current.unreadCount).toBe(2);
    expect(Object.keys(result.current.unreadByEvent).sort()).toEqual(['e1', 'e3']);
    expect(result.current.unreadByEvent.e1.changeCount).toBe(2);
    expect(result.current.unreadByEvent.e3.kind).toBe('resubmitted');
  });

  it('marks an unread alert as read, and ignores events without one', async () => {
    const { result } = renderHook(() => useAdminAlerts('u1', true));
    emit([
      { id: 'e1', data: { read: false } },
      { id: 'e2', data: { read: true } },
    ]);
    await act(async () => {
      await result.current.markRead('e1');
      await result.current.markRead('e2');
      await result.current.markRead('unknown');
    });
    expect(fs.updateDoc).toHaveBeenCalledTimes(1);
    expect(fs.updateDoc).toHaveBeenCalledWith({ path: 'users/u1/adminAlerts/e1' }, { read: true });
  });
});
