import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useUnreadMessageCount } from '../../src/hooks/useUnreadMessageCount';

const mockUseEventsWithMessages = vi.hoisted(() => ({
  events: [],
  unreadCountByEvent: {} as Record<string, number>,
  loading: false,
}));

vi.mock('../../src/hooks/useEventsWithMessages', () => ({
  useEventsWithMessages: () => mockUseEventsWithMessages,
}));

beforeEach(() => {
  mockUseEventsWithMessages.events = [];
  mockUseEventsWithMessages.unreadCountByEvent = {};
  mockUseEventsWithMessages.loading = false;
});

describe('useUnreadMessageCount', () => {
  it('returns 0 when there are no unread messages', () => {
    mockUseEventsWithMessages.unreadCountByEvent = { e1: 0, e2: 0 };
    const { result } = renderHook(() => useUnreadMessageCount());
    expect(result.current.count).toBe(0);
  });

  it('sums the unread counts across all events', () => {
    mockUseEventsWithMessages.unreadCountByEvent = { e1: 2, e2: 5, e3: 1 };
    const { result } = renderHook(() => useUnreadMessageCount());
    expect(result.current.count).toBe(8);
  });

  it('returns 0 when the unreadCountByEvent map is empty', () => {
    const { result } = renderHook(() => useUnreadMessageCount());
    expect(result.current.count).toBe(0);
  });

  it('exposes the loading state from the underlying hook', () => {
    mockUseEventsWithMessages.loading = true;
    const { result } = renderHook(() => useUnreadMessageCount());
    expect(result.current.loading).toBe(true);
  });
});
