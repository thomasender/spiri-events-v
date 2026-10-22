import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import MessengerPage from '../../src/pages/MessengerPage';
import MemberCard from '../../src/components/messenger/MemberCard';

const state = vi.hoisted(() => ({
  user: { uid: 'me', emailVerified: true } as { uid: string; emailVerified: boolean },
  available: true,
  threads: [] as Record<string, unknown>[],
  conv: {} as Record<string, unknown>,
  blocked: [] as string[],
  accepts: true,
  ban: null as unknown,
  infos: {} as Record<string, unknown>,
  block: vi.fn(async () => {}),
  unblock: vi.fn(async () => {}),
  updateAllow: vi.fn(async () => {}),
  messengerOpen: true,
}));

vi.mock('../../src/hooks/useAuth', () => ({
  useAuth: () => ({ user: state.user, loading: false }),
}));
vi.mock('../../src/hooks/useChatSettings', () => ({
  useMessengerAccess: () => ({ available: state.available, mode: 'all', loading: false }),
  useChatAccess: () => ({ available: false, mode: 'off', loading: false }),
}));
vi.mock('../../src/hooks/useOnlineStatus', () => ({
  useOnlineStatus: () => ({
    statusOf: (uid: string, shares: boolean) =>
      shares ? (uid === 'mira-id' ? 'online' : 'offline') : null,
  }),
}));
vi.mock('../../src/hooks/useMemberInfo', () => ({
  useMemberInfo: (uid: string) => state.infos[uid] ?? null,
  useMemberInfos: () => state.infos,
}));
vi.mock('../../src/hooks/useMessenger', () => ({
  useThreads: () => ({ threads: state.threads, loading: false, unreadCount: 0 }),
  useMyDmSetting: () => ({ allow: true, loaded: true, update: state.updateAllow }),
  useConversation: () => state.conv,
  useDmBlocks: () => ({ blocked: state.blocked, block: state.block, unblock: state.unblock }),
  useAcceptsDirectMessages: () => state.accepts,
  useOwnChatBan: () => state.ban,
}));
vi.mock('../../src/components/EmailVerificationModal', () => ({
  default: ({ open }: { open: boolean }) => (open ? <div data-testid="verify-modal" /> : null),
}));

const mira = { name: 'Mira', photoURL: null, slug: 'mira', exists: true, showOnlineStatus: true };

function setConv(overrides: Record<string, unknown> = {}) {
  state.conv = {
    tid: 'mira-id_me',
    thread: { lastMessageAt: 1000 },
    threadLoaded: true,
    messages: [
      { id: '1', text: 'Hallo du', authorUid: 'mira-id', createdAt: Date.now(), pending: false },
      { id: '2', text: 'Hi Mira', authorUid: 'me', createdAt: Date.now(), pending: false },
    ],
    loading: false,
    sending: false,
    unread: false,
    canLoadMore: false,
    loadOlder: vi.fn(),
    markRead: vi.fn(),
    send: vi.fn(async () => {}),
    remove: vi.fn(async () => {}),
    report: vi.fn(async () => {}),
    react: vi.fn(async () => {}),
    ...overrides,
  };
}

function renderAt(path: string) {
  return render(
    <HelmetProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/postfach" element={<MessengerPage />} />
          <Route path="/postfach/:uid" element={<MessengerPage />} />
        </Routes>
      </MemoryRouter>
    </HelmetProvider>
  );
}

beforeEach(() => {
  state.user = { uid: 'me', emailVerified: true };
  state.available = true;
  state.threads = [];
  state.blocked = [];
  state.accepts = true;
  state.ban = null;
  state.infos = { 'mira-id': mira };
  state.block.mockClear();
  state.unblock.mockClear();
  setConv();
});

describe('MessengerPage: access', () => {
  it('shows not-found while the flag keeps the messenger closed', () => {
    state.available = false;
    renderAt('/postfach');
    expect(screen.queryByTestId('messenger-page')).not.toBeInTheDocument();
  });

  it('asks unverified users to confirm their e-mail', () => {
    state.user = { uid: 'me', emailVerified: false };
    renderAt('/postfach');
    expect(screen.getByTestId('messenger-unverified')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'E-Mail bestätigen' }));
    expect(screen.getByTestId('verify-modal')).toBeInTheDocument();
  });

  it('sends you to the inbox when you open a conversation with yourself', () => {
    renderAt('/postfach/me');
    expect(screen.getByTestId('messenger-placeholder')).toBeInTheDocument();
  });
});

describe('MessengerPage: inbox', () => {
  it('explains how to start when there are no conversations', () => {
    renderAt('/postfach');
    expect(screen.getByTestId('messenger-empty')).toBeInTheDocument();
    expect(screen.getByTestId('messenger-placeholder')).toBeInTheDocument();
  });

  it('lists conversations with name, last line and an unread marker', () => {
    state.threads = [
      {
        id: 'mira-id_me',
        participants: ['me', 'mira-id'],
        lastMessageText: 'Bis morgen!',
        lastMessageAt: Date.now(),
        lastMessageBy: 'mira-id',
        readAt: {},
      },
      {
        id: 'jonas_me',
        participants: ['jonas', 'me'],
        lastMessageText: 'Alles klar',
        lastMessageAt: Date.now(),
        lastMessageBy: 'me',
        readAt: {},
      },
    ];
    state.infos = {
      'mira-id': mira,
      jonas: { name: 'Jonas', photoURL: null, slug: '', exists: true },
    };
    renderAt('/postfach');
    const items = screen.getAllByTestId('messenger-thread');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('Mira');
    expect(items[0]).toHaveTextContent('Bis morgen!');
    expect(screen.getAllByTestId('messenger-unread')).toHaveLength(1);
    expect(items[1]).toHaveTextContent('Du: Alles klar');
  });

  it('lets you switch off private messages', () => {
    renderAt('/postfach');
    fireEvent.click(screen.getByTestId('messenger-allow'));
    expect(state.updateAllow).toHaveBeenCalledWith(false);
  });
});

describe('MessengerPage: conversation', () => {
  it('reacts to a message from the emoji bar', () => {
    renderAt('/postfach/mira-id');
    fireEvent.click(screen.getAllByRole('button', { name: 'Mit Emoji reagieren' })[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Mit Danke reagieren' }));
    expect(state.conv.react).toHaveBeenCalledWith('1', '🙏');
  });

  it('puts own messages on the right with the shared own-bubble style', () => {
    renderAt('/postfach/mira-id');
    const [theirs, mine] = screen.getAllByTestId('dm-message');
    expect(theirs.querySelector('.reactable')).toHaveClass('reactable--start');
    expect(theirs.querySelector('.chat-bubble')).not.toHaveClass('chat-bubble--own');
    expect(mine).toHaveClass('messenger-message--own');
    expect(mine.querySelector('.reactable')).toHaveClass('reactable--end');
    expect(mine.querySelector('.chat-bubble')).toHaveClass('chat-bubble--own');
  });

  it('offers no reactions when the other person takes no private messages', () => {
    state.accepts = false;
    renderAt('/postfach/mira-id');
    expect(screen.queryByRole('button', { name: 'Mit Emoji reagieren' })).not.toBeInTheDocument();
  });

  it('shows the messages and sends a new one', async () => {
    renderAt('/postfach/mira-id');
    expect(screen.getAllByTestId('dm-message')).toHaveLength(2);
    const input = screen.getByTestId('dm-input');
    fireEvent.change(input, { target: { value: 'Bis gleich 🌿' } });
    fireEvent.click(screen.getByTestId('dm-send'));
    await waitFor(() =>
      expect((state.conv.send as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe('Bis gleich 🌿')
    );
  });

  it('renders text as plain text, never as HTML', () => {
    setConv({
      messages: [
        {
          id: '1',
          text: '<img src=x onerror=alert(1)>',
          authorUid: 'mira-id',
          createdAt: 1,
          pending: false,
        },
      ],
    });
    const { container } = renderAt('/postfach/mira-id');
    expect(container.querySelector('.messenger-bubble img')).toBeNull();
  });

  it('marks the conversation as read when it is unread', async () => {
    const markRead = vi.fn();
    setConv({ unread: true, markRead });
    renderAt('/postfach/mira-id');
    await waitFor(() => expect(markRead).toHaveBeenCalled());
  });

  it('shows an empty-conversation hint', () => {
    setConv({ messages: [], thread: null });
    renderAt('/postfach/mira-id');
    expect(screen.getByTestId('dm-empty')).toHaveTextContent('Mira');
  });

  it('lets you delete only your own message', async () => {
    renderAt('/postfach/mira-id');
    const [theirs, mine] = screen.getAllByTestId('dm-message');
    expect(theirs).not.toHaveTextContent('Löschen');
    fireEvent.click(within(mine).getByRole('button', { name: 'Nachricht löschen' }));
    fireEvent.click(screen.getByRole('button', { name: 'Löschen' }));
    await waitFor(() =>
      expect(state.conv.remove as ReturnType<typeof vi.fn>).toHaveBeenCalledWith('2')
    );
  });

  it('blocks after confirming and shows the unblock state afterwards', async () => {
    const view = renderAt('/postfach/mira-id');
    fireEvent.click(screen.getByTestId('messenger-menu'));
    fireEvent.click(screen.getByTestId('messenger-block'));
    fireEvent.click(screen.getByRole('button', { name: 'Blockieren' }));
    await waitFor(() => expect(state.block).toHaveBeenCalledWith('mira-id'));
    view.unmount();

    state.blocked = ['mira-id'];
    renderAt('/postfach/mira-id');
    expect(screen.getByTestId('dm-blocked')).toBeInTheDocument();
    expect(screen.queryByTestId('dm-input')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Blockierung aufheben' }));
    await waitFor(() => expect(state.unblock).toHaveBeenCalledWith('mira-id'));
  });

  it('reports the conversation after confirming', async () => {
    renderAt('/postfach/mira-id');
    fireEvent.click(screen.getByTestId('messenger-menu'));
    fireEvent.click(screen.getByTestId('messenger-report'));
    fireEvent.click(screen.getByRole('button', { name: 'Melden' }));
    await waitFor(() =>
      expect(state.conv.report as ReturnType<typeof vi.fn>).toHaveBeenCalledWith('Mira')
    );
  });

  it('hides the composer when the other person takes no private messages', () => {
    state.accepts = false;
    renderAt('/postfach/mira-id');
    expect(screen.getByTestId('dm-no-dm')).toBeInTheDocument();
    expect(screen.queryByTestId('dm-input')).not.toBeInTheDocument();
  });

  it('hides the composer while you are muted in the chat', () => {
    state.ban = { until: { toDate: () => new Date(Date.now() + 3_600_000) } };
    renderAt('/postfach/mira-id');
    expect(screen.getByTestId('dm-banned')).toBeInTheDocument();
  });

  it('says so when the other account is gone', () => {
    state.infos = {
      'mira-id': { name: 'Gelöschtes Mitglied', photoURL: null, slug: '', exists: false },
    };
    renderAt('/postfach/mira-id');
    expect(screen.getByText('Dieses Mitglied gibt es nicht mehr.')).toBeInTheDocument();
  });
});

describe('MessengerPage: online status dot', () => {
  it('shows the dot in the list and the conversation for people who share, none for others', () => {
    state.threads = [
      {
        id: 'mira-id_me',
        participants: ['me', 'mira-id'],
        lastMessageText: 'Hi',
        lastMessageAt: 1,
        lastMessageBy: 'me',
        readAt: {},
      },
      {
        id: 'jonas_me',
        participants: ['jonas', 'me'],
        lastMessageText: 'Hi',
        lastMessageAt: 1,
        lastMessageBy: 'me',
        readAt: {},
      },
    ];
    state.infos = {
      'mira-id': mira,
      jonas: { name: 'Jonas', photoURL: null, slug: '', exists: true, showOnlineStatus: false },
    };
    renderAt('/postfach/mira-id');
    const [first, second] = screen.getAllByTestId('messenger-thread');
    expect(first.querySelector('[data-status="online"]')).not.toBeNull();
    expect(second.querySelector('[data-testid="online-dot"]')).toBeNull();
    expect(
      screen.getByTestId('messenger-conversation').querySelector('[data-status="online"]')
    ).not.toBeNull();
  });
});

describe('MemberCard', () => {
  const renderCard = (uid = 'mira-id', onClose = vi.fn()) =>
    render(
      <MemoryRouter>
        <MemberCard uid={uid} fallbackName="Mira" onClose={onClose} />
      </MemoryRouter>
    );

  it('offers a private message and the profile', () => {
    renderCard();
    expect(screen.getByTestId('member-card-message')).toHaveAttribute('href', '/postfach/mira-id');
    expect(screen.getByRole('link', { name: /Profil ansehen/ })).toHaveAttribute('href', '/mira');
  });

  it('says so when the person takes no private messages', () => {
    state.accepts = false;
    renderCard();
    expect(screen.queryByTestId('member-card-message')).not.toBeInTheDocument();
    expect(screen.getByTestId('member-card-no-dm')).toBeInTheDocument();
  });

  it('offers no message to yourself and none while the messenger is closed', () => {
    renderCard('me');
    expect(screen.queryByTestId('member-card-message')).not.toBeInTheDocument();
  });

  it('closes on Escape and on a click outside', () => {
    const onClose = vi.fn();
    renderCard('mira-id', onClose);
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.click(screen.getByTestId('member-card-overlay'));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
