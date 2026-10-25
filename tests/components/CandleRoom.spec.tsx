import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import CandleRoom from '../../src/components/chat/CandleRoom';
import {
  candleNewsIds,
  canReadCandleRoom,
  canWriteCandleRoom,
  hasNewForeignMessages,
  markCandleRoomSeen,
  readCandleRoomSeen,
} from '../../src/utils/candleRoom';

const state = vi.hoisted(() => ({
  user: null as { uid: string; emailVerified: boolean } | null,
  role: null as string | null,
  mode: 'all',
  room: {} as Record<string, unknown>,
}));

vi.mock('../../src/hooks/useAuth', () => ({
  useAuth: () => ({ user: state.user, role: state.role, loading: false }),
}));
vi.mock('../../src/hooks/useChatSettings', () => ({
  useChatSettings: () => ({ mode: state.mode, loading: false }),
}));
vi.mock('../../src/hooks/useCandleRoom', () => ({ useCandleRoom: () => state.room }));

const msg = (id: string, authorUid: string, createdAt: number) => ({
  id,
  text: `Nachricht ${id}`,
  authorUid,
  authorName: authorUid,
  authorPhotoURL: null,
  createdAt,
  reactions: {},
  pending: false,
});

function setRoom(overrides: Record<string, unknown> = {}) {
  state.room = {
    messages: [msg('1', 'mira', 1000)],
    loading: false,
    error: null,
    sending: false,
    ban: null,
    send: vi.fn(async () => {}),
    remove: vi.fn(async () => {}),
    ...overrides,
  };
}

const renderRoom = (open = true, initialEntry = '/event/ev1') => {
  const result = render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <CandleRoom eventId="ev1" />
    </MemoryRouter>
  );
  if (open) fireEvent.click(screen.getByTestId('candle-room-toggle'));
  return result;
};

beforeEach(() => {
  state.user = null;
  state.role = null;
  state.mode = 'all';
  window.localStorage.clear();
  setRoom();
});

describe('Kerzenraum helpers', () => {
  it('reads like the flag: everyone when open for all, admins in test mode, nobody when off', () => {
    expect(canReadCandleRoom({ mode: 'all', isAdmin: false })).toBe(true);
    expect(canReadCandleRoom({ mode: 'admins', isAdmin: false })).toBe(false);
    expect(canReadCandleRoom({ mode: 'admins', isAdmin: true })).toBe(true);
    expect(canReadCandleRoom({ mode: 'off', isAdmin: true })).toBe(false);
  });

  it('writing needs a verified login', () => {
    expect(canWriteCandleRoom({ mode: 'all', isAdmin: false, user: null })).toBe(false);
    expect(
      canWriteCandleRoom({ mode: 'all', isAdmin: false, user: { emailVerified: false } })
    ).toBe(false);
    expect(canWriteCandleRoom({ mode: 'all', isAdmin: false, user: { emailVerified: true } })).toBe(
      true
    );
  });

  it('remembers the last seen message per event and only moves forward', () => {
    expect(readCandleRoomSeen('ev1')).toBe(0);
    markCandleRoomSeen('ev1', 500);
    markCandleRoomSeen('ev1', 300);
    expect(readCandleRoomSeen('ev1')).toBe(500);
    expect(readCandleRoomSeen('ev2')).toBe(0);
  });

  it('lists rooms with messages newer than the last visit', () => {
    markCandleRoomSeen('seen', 2000);
    markCandleRoomSeen('old', 1000);
    const ids = candleNewsIds({ seen: 2000, old: 1500, never: 10 });
    expect([...ids].sort()).toEqual(['never', 'old']);
  });

  it('counts only other people’s messages as new inside the room', () => {
    const messages = [msg('1', 'me', 5000), msg('2', 'mira', 1000)];
    expect(hasNewForeignMessages(messages, 'me', 2000)).toBe(false);
    expect(hasNewForeignMessages(messages, 'me', 500)).toBe(true);
  });
});

describe('CandleRoom', () => {
  it('is a collapsed "Event Chat" bar that opens the chat inline on click', () => {
    state.role = 'Admin';
    state.mode = 'admins';
    renderRoom(false);
    expect(screen.getByTestId('candle-room-toggle')).toHaveTextContent('Event Chat');
    expect(screen.queryByTestId('candle-room')).toBeNull();
    fireEvent.click(screen.getByTestId('candle-room-toggle'));
    expect(screen.getByRole('heading', { name: /Event Chat/ })).toBeInTheDocument();
    expect(screen.getByText('Nachricht 1')).toBeInTheDocument();
  });

  it('opens straight away when a mention link points at a message', () => {
    renderRoom(false, '/event/ev1#msg-1');
    expect(screen.getByTestId('candle-room')).toBeInTheDocument();
  });

  it('shows no toggle for non-admins in admin test mode', () => {
    state.mode = 'admins';
    renderRoom(false);
    expect(screen.queryByTestId('candle-room-toggle')).toBeNull();
  });

  it('stays hidden for non-admins while the chat is in admin test mode', () => {
    state.mode = 'admins';
    state.user = { uid: 'me', emailVerified: true };
    renderRoom(false);
    expect(screen.queryByTestId('candle-room')).toBeNull();
  });

  it('shows the history to admins in admin test mode', () => {
    state.mode = 'admins';
    state.role = 'Admin';
    state.user = { uid: 'boss', emailVerified: true };
    renderRoom();
    expect(screen.getByText('Nachricht 1')).toBeInTheDocument();
  });

  it('lets visitors without login read but not write', () => {
    renderRoom();
    expect(screen.getByText('Nachricht 1')).toBeInTheDocument();
    expect(screen.getByTestId('candle-room-login')).toBeInTheDocument();
    expect(screen.queryByTestId('candle-room-input')).toBeNull();
  });

  it('asks unverified members to confirm their e-mail first', () => {
    state.user = { uid: 'me', emailVerified: false };
    renderRoom();
    expect(screen.getByTestId('candle-room-unverified')).toBeInTheDocument();
    expect(screen.queryByTestId('candle-room-input')).toBeNull();
  });

  it('shows the rules once, then the message field', () => {
    state.user = { uid: 'me', emailVerified: true };
    renderRoom();
    fireEvent.click(screen.getByTestId('candle-room-rules-accept'));
    expect(screen.getByTestId('candle-room-input')).toBeInTheDocument();
  });

  it('lights the candle for news since the last visit and remembers the visit', () => {
    markCandleRoomSeen('ev1', 500);
    const { unmount } = renderRoom();
    expect(screen.getByTestId('candle-room-new')).toBeInTheDocument();
    expect(readCandleRoomSeen('ev1')).toBe(1000);
    unmount();
    renderRoom();
    expect(screen.queryByTestId('candle-room-new')).toBeNull();
  });
});
