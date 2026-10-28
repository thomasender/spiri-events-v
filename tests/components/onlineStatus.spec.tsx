import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, renderHook } from '@testing-library/react';
import {
  ONLINE_BEAT_MS,
  ONLINE_WINDOW_MS,
  onlineStatusOf,
  onlineUidsFrom,
} from '../../src/utils/onlineStatus';
import OnlineDot from '../../src/components/OnlineDot';
import { useOnlineBeacon } from '../../src/hooks/useOnlineStatus';

const fs = vi.hoisted(() => ({
  setDoc: vi.fn(async () => {}),
  deleteDoc: vi.fn(async () => {}),
}));
const state = vi.hoisted(() => ({
  user: { uid: 'me' } as { uid: string } | null,
  shares: true,
  flagOpen: true,
}));

vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, ...path: string[]) => ({ path: path.join('/') }),
  onSnapshot: () => () => {},
  doc: (_db: unknown, ...path: string[]) => ({ path: path.join('/') }),
  setDoc: fs.setDoc,
  deleteDoc: fs.deleteDoc,
  serverTimestamp: () => 'SERVER_TS',
}));
vi.mock('../../src/lib/firebase', () => ({ db: {} }));
vi.mock('../../src/hooks/useAuth', () => ({ useAuth: () => ({ user: state.user }) }));
vi.mock('../../src/hooks/useChatSettings', () => ({
  useOnlineStatusAccess: () => ({ available: state.flagOpen, mode: 'all', loading: false }),
}));
vi.mock('../../src/hooks/useProfile', () => ({
  useProfile: () => ({ profile: { showOnlineStatus: state.shares } }),
}));

describe('onlineUidsFrom', () => {
  const now = 1_000_000;
  it('counts heartbeats younger than two minutes', () => {
    const set = onlineUidsFrom(
      [
        { uid: 'fresh', lastSeenMs: now - 1000 },
        { uid: 'edge', lastSeenMs: now - ONLINE_WINDOW_MS + 1 },
        { uid: 'old', lastSeenMs: now - ONLINE_WINDOW_MS },
        { uid: 'pending', lastSeenMs: null },
      ],
      now
    );
    expect([...set].sort()).toEqual(['edge', 'fresh']);
  });
});

describe('onlineStatusOf', () => {
  const onlineUids = new Set(['a']);
  it('is green for an online person who shares, red for an offline one', () => {
    expect(onlineStatusOf({ uid: 'a', shares: true, onlineUids, viewerCanSee: true })).toBe(
      'online'
    );
    expect(onlineStatusOf({ uid: 'b', shares: true, onlineUids, viewerCanSee: true })).toBe(
      'offline'
    );
  });
  it('shows no dot when the person does not share (the default)', () => {
    expect(onlineStatusOf({ uid: 'a', shares: false, onlineUids, viewerCanSee: true })).toBeNull();
    expect(
      onlineStatusOf({ uid: 'a', shares: undefined, onlineUids, viewerCanSee: true })
    ).toBeNull();
  });
  it('shows no dot, not even a red one, when the viewer may not see statuses', () => {
    expect(onlineStatusOf({ uid: 'b', shares: true, onlineUids, viewerCanSee: false })).toBeNull();
  });
});

describe('OnlineDot', () => {
  it('renders green with an accessible name, nothing for offline or null', () => {
    const { rerender } = render(<OnlineDot status="online" />);
    expect(screen.getByRole('img', { name: 'Online' })).toHaveAttribute('data-status', 'online');
    rerender(<OnlineDot status="offline" />);
    expect(screen.queryByTestId('online-dot')).toBeNull();
    rerender(<OnlineDot status={null} />);
    expect(screen.queryByTestId('online-dot')).toBeNull();
  });
});

describe('useOnlineBeacon', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    fs.setDoc.mockClear();
    fs.deleteDoc.mockClear();
    state.flagOpen = true;
    state.user = { uid: 'me' };
    state.shares = true;
    state.flagOpen = true;
  });
  afterEach(() => vi.useRealTimers());

  it('beats right away and then every minute while the person shares', () => {
    renderHook(() => useOnlineBeacon());
    expect(fs.setDoc).toHaveBeenCalledTimes(1);
    expect(fs.setDoc.mock.calls[0][0]).toEqual({ path: 'presence/me' });
    expect(fs.setDoc.mock.calls[0][1]).toEqual({ lastSeen: 'SERVER_TS' });
    vi.advanceTimersByTime(ONLINE_BEAT_MS);
    expect(fs.setDoc).toHaveBeenCalledTimes(2);
  });

  it('never writes anything when the person does not share (default) or is logged out', () => {
    state.shares = false;
    renderHook(() => useOnlineBeacon());
    state.shares = true;
    state.user = null;
    renderHook(() => useOnlineBeacon());
    vi.advanceTimersByTime(ONLINE_BEAT_MS * 3);
    expect(fs.setDoc).not.toHaveBeenCalled();
  });

  it('never writes while the feature flag keeps the status closed for this person', () => {
    state.flagOpen = false;
    renderHook(() => useOnlineBeacon());
    vi.advanceTimersByTime(ONLINE_BEAT_MS * 2);
    expect(fs.setDoc).not.toHaveBeenCalled();
  });

  it('removes the heartbeat on leaving (logout, opt-out, closing the app)', () => {
    const { unmount } = renderHook(() => useOnlineBeacon());
    unmount();
    expect(fs.deleteDoc).toHaveBeenCalledWith({ path: 'presence/me' });
  });

  it('does not beat while the tab is hidden', () => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    renderHook(() => useOnlineBeacon());
    vi.advanceTimersByTime(ONLINE_BEAT_MS * 2);
    expect(fs.setDoc).not.toHaveBeenCalled();
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  });
});
