import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
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
  activity: {} as Record<string, number>,
}));

vi.mock('../../src/hooks/useAuth', () => ({
  useAuth: () => ({ user: state.user, role: state.role, loading: false }),
}));
vi.mock('../../src/hooks/useChatSettings', () => ({
  useChatSettings: () => ({ mode: state.mode, loading: false }),
}));
vi.mock('../../src/components/messenger/MemberCard', () => ({
  default: ({ uid }: { uid: string }) => <div data-testid="member-card">{uid}</div>,
}));
vi.mock('../../src/hooks/useCandleRoom', () => ({
  useCandleRoom: () => state.room,
  useCandleRoomActivity: () => state.activity,
}));

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
    report: vi.fn(async () => {}),
    react: vi.fn(async () => {}),
    canLoadMore: false,
    loadOlder: vi.fn(),
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
  state.activity = {};
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
  it('is a collapsed "Event Chat" bar that opens and closes the chat inline', () => {
    state.role = 'Admin';
    state.mode = 'admins';
    renderRoom(false);
    const toggle = screen.getByTestId('candle-room-toggle');
    expect(toggle).toHaveTextContent('Event Chat');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('candle-room')).toBeNull();
    fireEvent.click(toggle);
    expect(screen.getByTestId('candle-room-toggle')).toBe(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('candle-room')).toBeVisible();
    expect(screen.getByText('Nachricht 1')).toBeInTheDocument();
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByTestId('candle-room')).not.toBeVisible();
  });

  it('flags unread messages on the closed bar', () => {
    state.activity = { ev1: 2000 };
    markCandleRoomSeen('ev1', 1000);
    renderRoom(false);
    expect(screen.getByTestId('candle-room-toggle-new')).toHaveTextContent('Neue Nachrichten');
  });

  it('shows no unread hint when everything was seen', () => {
    state.activity = { ev1: 2000 };
    markCandleRoomSeen('ev1', 2000);
    renderRoom(false);
    expect(screen.queryByTestId('candle-room-toggle-new')).toBeNull();
  });

  it('focuses the message field when opened by click', () => {
    state.user = { uid: 'me', emailVerified: true };
    window.localStorage.setItem('candleRoomRulesAccepted', '1');
    renderRoom(true);
    expect(screen.getByTestId('candle-room-input')).toHaveFocus();
  });

  it('focuses the rules button when the rules are still to accept', () => {
    state.user = { uid: 'me', emailVerified: true };
    renderRoom(true);
    expect(screen.getByTestId('candle-room-rules-accept')).toHaveFocus();
  });

  it('does not move focus when opened by a mention link', () => {
    state.user = { uid: 'me', emailVerified: true };
    window.localStorage.setItem('candleRoomRulesAccepted', '1');
    renderRoom(false, '/event/ev1#msg-1');
    expect(screen.getByTestId('candle-room')).toBeVisible();
    expect(screen.getByTestId('candle-room-input')).not.toHaveFocus();
  });

  it('opens when the hash changes to a message later on', () => {
    let navigate: (to: string) => void = () => {};
    function Nav() {
      navigate = useNavigate();
      return null;
    }
    render(
      <MemoryRouter initialEntries={['/event/ev1']}>
        <Nav />
        <CandleRoom eventId="ev1" />
      </MemoryRouter>
    );
    expect(screen.getByTestId('candle-room-toggle')).toHaveAttribute('aria-expanded', 'false');
    act(() => navigate('/event/ev1#msg-1'));
    expect(screen.getByTestId('candle-room-toggle')).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('candle-room')).toBeVisible();
  });

  it('does not read the room before it is opened first', () => {
    renderRoom(false);
    expect(screen.queryByTestId('candle-room')).toBeNull();
    expect(screen.queryByText('Nachricht 1')).toBeNull();
  });

  it('opens straight away when a mention link points at a message', () => {
    renderRoom(false, '/event/ev1#msg-1');
    expect(screen.getByTestId('candle-room')).toBeVisible();
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

describe('CandleRoom: parity with the Lagerfeuer', () => {
  const login = () => {
    state.user = { uid: 'me', emailVerified: true };
    window.localStorage.setItem('candleRoomRulesAccepted', '1');
  };

  it('double-tap reacts with a heart; muted members and visitors cannot react', () => {
    login();
    const react = vi.fn(async () => {});
    setRoom({ react });
    const { unmount } = renderRoom();
    const bubble = screen.getByTestId('reactable-bubble');
    fireEvent.click(bubble);
    fireEvent.click(bubble);
    expect(react).toHaveBeenCalledWith('1', '❤️');
    unmount();

    setRoom({ react, ban: { until: { toDate: () => new Date(Date.now() + 3_600_000) } } });
    const second = renderRoom();
    expect(screen.queryByRole('button', { name: 'Mit Emoji reagieren' })).toBeNull();
    second.unmount();

    state.user = null;
    renderRoom();
    expect(screen.queryByRole('button', { name: 'Mit Emoji reagieren' })).toBeNull();
  });

  it('shows reactions of others as pills', () => {
    login();
    setRoom({ messages: [{ ...msg('1', 'mira', 1000), reactions: { x: '👍' } }] });
    renderRoom();
    expect(screen.getByRole('button', { name: /Daumen hoch, 1 Reaktion/ })).toBeInTheDocument();
  });

  it('reports a foreign message after confirming, never an own one', async () => {
    login();
    const report = vi.fn(async () => {});
    setRoom({ report, messages: [msg('1', 'mira', 1000), msg('2', 'me', 2000)] });
    renderRoom();
    expect(screen.getAllByRole('button', { name: /melden/i })).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: /melden/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Melden' }));
    await waitFor(() => expect(report).toHaveBeenCalledTimes(1));
    expect(report.mock.calls[0][0]).toMatchObject({ id: '1' });
  });

  it('offers no report to visitors and unverified members', () => {
    renderRoom();
    expect(screen.queryByRole('button', { name: /melden/i })).toBeNull();
  });

  it('lets admins delete any message, others only their own', () => {
    state.user = { uid: 'me', emailVerified: true };
    setRoom({ messages: [msg('1', 'mira', 1000), msg('2', 'me', 2000)] });
    const { unmount } = renderRoom();
    expect(screen.getAllByRole('button', { name: 'Nachricht löschen' })).toHaveLength(1);
    unmount();
    state.role = 'Admin';
    renderRoom();
    expect(screen.getAllByRole('button', { name: 'Nachricht löschen' })).toHaveLength(2);
  });

  it('opens the member card from the author name', () => {
    login();
    renderRoom();
    fireEvent.click(screen.getByRole('button', { name: 'mira' }));
    expect(screen.getByTestId('member-card')).toHaveTextContent('mira');
  });

  it('loads older messages on request', () => {
    const loadOlder = vi.fn();
    setRoom({ canLoadMore: true, loadOlder });
    renderRoom();
    fireEvent.click(screen.getByTestId('candle-room-older'));
    expect(loadOlder).toHaveBeenCalledTimes(1);
  });

  it('hides the older button when everything is loaded', () => {
    renderRoom();
    expect(screen.queryByTestId('candle-room-older')).toBeNull();
  });

  it('highlights mentions and marks messages that mention me', () => {
    login();
    setRoom({
      messages: [
        { ...msg('1', 'mira', 1000), text: 'Hi @Ich und @Fremd', mentions: { me: 'Ich' } },
      ],
    });
    renderRoom();
    const marks = screen.getAllByTestId('chat-mention');
    expect(marks).toHaveLength(1);
    expect(marks[0]).toHaveTextContent('@Ich');
    expect(marks[0]).toHaveClass('chat-mention--me');
    expect(screen.getByTestId('chat-message')).toHaveClass('chat-message--mentions-me');
  });
});
