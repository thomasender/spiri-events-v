import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import ChatPage from '../../src/pages/ChatPage';
import { DEFAULT_REGION_CONTEXT, RegionContext } from '../../src/hooks/useRegion';

const state = vi.hoisted(() => ({
  user: { uid: 'me', emailVerified: true } as { uid: string; emailVerified: boolean } | null,
  role: null as string | null,
  staffRegionIds: [] as string[],
  roomIds: [] as (string | null)[],
  chatOptions: [] as ({ guestView?: boolean } | undefined)[],
  heartbeat: [] as boolean[],
  available: true,
  mode: 'all',
  access: { loading: false },
  chat: {} as Record<string, unknown>,
  online: [] as { uid: string; name: string; photoURL: string | null }[],
}));

vi.mock('../../src/hooks/useAuth', () => ({
  useAuth: () => ({
    user: state.user,
    role: state.role,
    staffRegionIds: state.staffRegionIds,
    loading: false,
  }),
}));
vi.mock('../../src/hooks/useProfile', () => ({ useProfile: () => ({ profile: null }) }));
vi.mock('../../src/hooks/useChatSettings', () => ({
  useChatAccess: () => ({
    available: state.available && Boolean(state.user),
    readable: state.available,
    mode: state.mode,
    loading: state.access.loading,
  }),
}));
vi.mock('../../src/hooks/useChatPresence', () => ({
  useChatHeartbeat: (active: boolean) => {
    state.heartbeat.push(active);
  },
  useChatPresence: (enabled: boolean) => {
    const online = enabled ? state.online : [];
    return { online, count: online.length, loading: false };
  },
}));
vi.mock('../../src/hooks/useChat', () => ({
  useChat: (roomId: string | null, options?: { guestView?: boolean }) => {
    state.roomIds.push(roomId);
    state.chatOptions.push(options);
    return state.chat;
  },
}));
const clubMembers = vi.hoisted(() => ({ uids: new Set<string>() }));
vi.mock('../../src/hooks/useClubMembers', () => ({
  useClubMembers: () => clubMembers.uids,
  useIsClubMember: (uid: string) => clubMembers.uids.has(uid),
}));
vi.mock('../../src/components/EmailVerificationModal', () => ({
  default: ({ open }: { open: boolean }) => (open ? <div data-testid="verify-modal" /> : null),
}));

const msg = (id: string, authorUid: string, text: string) => ({
  id,
  text,
  authorUid,
  authorName: authorUid === 'me' ? 'Ich' : 'Mira',
  authorPhotoURL: null,
  createdAt: Date.now(),
  pending: false,
});

function setChat(overrides: Record<string, unknown> = {}) {
  state.chat = {
    messages: [msg('1', 'other', 'Hallo Welt'), msg('2', 'me', 'Meine Nachricht')],
    loading: false,
    error: null,
    sending: false,
    ban: null,
    canLoadMore: false,
    loadOlder: vi.fn(),
    send: vi.fn(async () => {}),
    remove: vi.fn(async () => {}),
    report: vi.fn(async () => {}),
    react: vi.fn(async () => {}),
    ...overrides,
  };
}

function renderPage() {
  return render(
    <HelmetProvider>
      <MemoryRouter>
        <ChatPage />
      </MemoryRouter>
    </HelmetProvider>
  );
}

// Two active regions (Vorarlberg, Tirol); `regionId` = the place chosen in the header.
function renderRegionPage(regionId: string | null, path = '/chat') {
  const value = {
    ...DEFAULT_REGION_CONTEXT,
    regions: [
      { id: 'vorarlberg', name: 'Vorarlberg', active: true },
      { id: 'tirol', name: 'Tirol', active: true },
    ],
    placeSelection: regionId ? { label: 'Ort', lat: 47, lon: 11, radiusKm: 25, regionId } : null,
  };
  return render(
    <HelmetProvider>
      <MemoryRouter initialEntries={[path]}>
        <RegionContext.Provider value={value as typeof DEFAULT_REGION_CONTEXT}>
          <ChatPage />
        </RegionContext.Provider>
      </MemoryRouter>
    </HelmetProvider>
  );
}

beforeEach(() => {
  clubMembers.uids = new Set();
  state.user = { uid: 'me', emailVerified: true };
  state.role = null;
  state.staffRegionIds = [];
  state.roomIds = [];
  state.chatOptions = [];
  state.heartbeat = [];
  state.available = true;
  state.mode = 'all';
  state.access.loading = false;
  state.online = [];
  window.localStorage.setItem('chatRulesAccepted2', '1');
  setChat();
});

describe('ChatPage', () => {
  it('shows the not-found page while the feature flag keeps the chat closed', () => {
    state.available = false;
    renderPage();
    expect(screen.queryByTestId('chat-page')).not.toBeInTheDocument();
  });

  it('unverified users read along and are asked to confirm their e-mail to write', () => {
    state.user = { uid: 'me', emailVerified: false };
    renderPage();
    expect(screen.getAllByTestId('chat-message')).toHaveLength(2);
    expect(state.chatOptions.at(-1)).toEqual({ guestView: true });
    expect(screen.getByTestId('chat-unverified')).toBeInTheDocument();
    expect(screen.queryByTestId('chat-input')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'E-Mail bestätigen' }));
    expect(screen.getByTestId('verify-modal')).toBeInTheDocument();
  });

  it('in test mode "admins" an unverified admin reads nothing and is asked to confirm', () => {
    state.user = { uid: 'me', emailVerified: false };
    state.role = 'Admin';
    state.mode = 'admins';
    renderPage();
    expect(screen.getByTestId('chat-unverified')).toBeInTheDocument();
    expect(screen.queryByTestId('chat-list')).toBeNull();
  });

  it('renders messages as plain text, never as HTML', () => {
    setChat({ messages: [msg('1', 'other', '<img src=x onerror=alert(1)> <b>fett</b>')] });
    const { container } = renderPage();
    expect(container.querySelector('.chat-bubble img')).toBeNull();
    expect(container.querySelector('.chat-bubble b')).toBeNull();
    expect(screen.getByText(/<b>fett<\/b>/)).toBeInTheDocument();
  });

  it('turns links into safe external links', () => {
    setChat({ messages: [msg('1', 'other', 'Siehe https://thetribe.at')] });
    renderPage();
    const link = screen.getByRole('link', { name: 'https://thetribe.at' });
    expect(link).toHaveAttribute('target', '_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
  });

  it('offers "Melden" on others\' messages and "Löschen" only on own ones', () => {
    renderPage();
    const [theirs, mine] = screen.getAllByTestId('chat-message');
    expect(theirs).toHaveTextContent('Melden');
    expect(theirs).not.toHaveTextContent('Löschen');
    expect(mine).toHaveTextContent('Löschen');
    expect(mine).not.toHaveTextContent('Melden');
  });

  it('puts own messages on the right without avatar, others on the left with avatar', () => {
    renderPage();
    const [theirs, mine] = screen.getAllByTestId('chat-message');
    expect(theirs).not.toHaveClass('chat-message--own');
    expect(theirs.querySelector('.chat-avatar')).not.toBeNull();
    expect(theirs.querySelector('.reactable')).toHaveClass('reactable--start');
    expect(theirs.querySelector('.chat-bubble')).not.toHaveClass('chat-bubble--own');
    expect(mine).toHaveClass('chat-message--own');
    expect(mine.querySelector('.chat-avatar')).toBeNull();
    expect(mine.querySelector('.reactable')).toHaveClass('reactable--end');
    expect(mine.querySelector('.chat-bubble')).toHaveClass('chat-bubble--own');
  });

  it('marks authors who are Vereinsmitglieder by their uid, in messages and at the fire', () => {
    clubMembers.uids = new Set(['other']);
    state.online = [
      { uid: 'other', name: 'Mira', photoURL: null },
      { uid: 'third', name: 'Tom', photoURL: null },
    ];
    setChat({
      messages: [msg('1', 'other', 'Hallo Welt'), msg('3', 'third', 'Servus')],
    });
    renderPage();
    const [mira, tom] = screen.getAllByTestId('chat-message');
    expect(mira.querySelector('[data-testid="member-badge"]')).not.toBeNull();
    expect(tom.querySelector('[data-testid="member-badge"]')).toBeNull();
    const fire = screen.getByTestId('chat-presence');
    expect(fire.querySelectorAll('[data-testid="member-badge"]')).toHaveLength(1);
  });

  it("lets admins delete other people's messages too", () => {
    state.role = 'Admin';
    renderPage();
    const [theirs] = screen.getAllByTestId('chat-message');
    expect(theirs).toHaveTextContent('Löschen');
  });

  it('sends on Enter, keeps the line break on Shift+Enter and clears the input', async () => {
    const send = vi.fn(async () => {});
    setChat({ send });
    renderPage();
    const input = screen.getByTestId('chat-input') as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: 'Hallo 🌿' } });
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
    expect(send).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(send).toHaveBeenCalledWith('Hallo 🌿', {}));
    await waitFor(() => expect(input.value).toBe(''));
  });

  it('shows the error and keeps the draft when sending fails', async () => {
    setChat({ send: vi.fn(async () => Promise.reject(new Error('Bitte warte kurz'))) });
    renderPage();
    const input = screen.getByTestId('chat-input') as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: 'Hi' } });
    fireEvent.click(screen.getByTestId('chat-send'));
    expect(await screen.findByTestId('chat-send-error')).toHaveTextContent('Bitte warte kurz');
    expect(input.value).toBe('Hi');
  });

  it('disables sending for empty or too long text', () => {
    renderPage();
    const input = screen.getByTestId('chat-input');
    const send = screen.getByTestId('chat-send');
    expect(send).toBeDisabled();
    fireEvent.change(input, { target: { value: 'a'.repeat(501) } });
    expect(send).toBeDisabled();
    fireEvent.change(input, { target: { value: 'a'.repeat(500) } });
    expect(send).toBeEnabled();
  });

  it('inserts a picked emoji into the draft', () => {
    renderPage();
    fireEvent.click(screen.getByTestId('chat-emoji-toggle'));
    fireEvent.click(screen.getByRole('button', { name: '😀' }));
    expect((screen.getByTestId('chat-input') as HTMLTextAreaElement).value).toBe('😀');
  });

  it('searches emoji by German name in the picker', async () => {
    renderPage();
    fireEvent.click(screen.getByTestId('chat-emoji-toggle'));
    fireEvent.change(screen.getByTestId('emoji-search'), { target: { value: 'feuer' } });
    const fire = await screen.findByRole('button', { name: /🔥 Feuer/ });
    fireEvent.click(fire);
    expect((screen.getByTestId('chat-input') as HTMLTextAreaElement).value).toBe('🔥');
  });

  it('says so when the emoji search finds nothing', async () => {
    renderPage();
    fireEvent.click(screen.getByTestId('chat-emoji-toggle'));
    fireEvent.change(screen.getByTestId('emoji-search'), { target: { value: 'qqqqzzzz' } });
    expect(await screen.findByTestId('emoji-no-results')).toBeInTheDocument();
  });

  it('suggests emoji while typing :fire and inserts the chosen one', async () => {
    renderPage();
    const input = screen.getByTestId('chat-input') as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: 'Hallo :fire', selectionStart: 11 } });
    const list = await screen.findByTestId('chat-suggestions');
    expect(list).toHaveTextContent('🔥');
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(input.value).toMatch(/^Hallo \p{Extended_Pictographic}/u));
    expect(screen.queryByTestId('chat-suggestions')).not.toBeInTheDocument();
  });

  it('does not send on Enter while the suggestions are open, and Escape closes them', async () => {
    const send = vi.fn(async () => {});
    setChat({ send });
    renderPage();
    const input = screen.getByTestId('chat-input') as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: ':herz', selectionStart: 5 } });
    await screen.findByTestId('chat-suggestions');
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByTestId('chat-suggestions')).not.toBeInTheDocument();
    expect(send).not.toHaveBeenCalled();
  });

  it('turns ":fire:" with the closing colon into the emoji', async () => {
    renderPage();
    const input = screen.getByTestId('chat-input') as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: ':fire', selectionStart: 5 } });
    await screen.findByTestId('chat-suggestions');
    fireEvent.change(input, { target: { value: ':fire:', selectionStart: 6 } });
    await waitFor(() => expect(input.value).toBe('🔥'));
  });

  it('shows who sits at the fire, without naming yourself', () => {
    state.online = [
      { uid: 'me', name: 'Ich', photoURL: null },
      { uid: 'a', name: 'Mira', photoURL: null },
      { uid: 'b', name: 'Jonas', photoURL: null },
    ];
    renderPage();
    expect(screen.getByTestId('chat-presence-count')).toHaveTextContent('3');
    const strip = screen.getByTestId('chat-presence');
    expect(strip).toHaveTextContent('Am Lagerfeuer: Mira und Jonas');
    expect(strip).not.toHaveTextContent('Am Lagerfeuer: Ich');
  });

  it('tells you when you are alone at the fire', () => {
    state.online = [{ uid: 'me', name: 'Ich', photoURL: null }];
    renderPage();
    expect(screen.getByTestId('chat-presence')).toHaveTextContent('allein');
  });

  it('closes the emoji finder on Escape and on a click outside, but not on a click inside', () => {
    renderPage();
    const toggle = screen.getByTestId('chat-emoji-toggle');
    fireEvent.click(toggle);
    expect(screen.getByTestId('emoji-picker')).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByTestId('emoji-search'));
    expect(screen.getByTestId('emoji-picker')).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByTestId('emoji-picker')).not.toBeInTheDocument();

    fireEvent.click(toggle);
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(screen.queryByTestId('emoji-picker')).not.toBeInTheDocument();
  });

  it('turns ":) " into an emoji while typing and undoes it with Backspace', () => {
    renderPage();
    const input = screen.getByTestId('chat-input') as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: 'Hallo :)', selectionStart: 8 } });
    expect(input.value).toBe('Hallo :)');
    fireEvent.change(input, { target: { value: 'Hallo :) ', selectionStart: 9 } });
    expect(input.value).toBe('Hallo 🙂 ');
    input.setSelectionRange(input.value.length, input.value.length);
    fireEvent.keyDown(input, { key: 'Backspace' });
    expect(input.value).toBe('Hallo :) ');
  });

  it('sends a trailing emoticon as emoji', async () => {
    const send = vi.fn(async () => {});
    setChat({ send });
    renderPage();
    const input = screen.getByTestId('chat-input');
    fireEvent.change(input, { target: { value: 'Danke :)' } });
    fireEvent.click(screen.getByTestId('chat-send'));
    await waitFor(() => expect(send).toHaveBeenCalledWith('Danke 🙂', {}));
  });

  it('hides the input and explains the mute for banned users', () => {
    setChat({ ban: { until: { toDate: () => new Date(Date.now() + 3_600_000) } } });
    renderPage();
    expect(screen.getByTestId('chat-banned')).toHaveTextContent('stumm geschaltet');
    expect(screen.queryByTestId('chat-input')).not.toBeInTheDocument();
  });

  it('double-tapping a message reacts with a heart; muted users cannot react', () => {
    const react = vi.fn(async () => {});
    setChat({
      react,
      messages: [{ ...msg('1', 'other', 'Hallo Welt'), reactions: { x: '👍' } }],
    });
    const { unmount } = renderPage();
    const bubble = screen.getByTestId('reactable-bubble');
    fireEvent.click(bubble);
    fireEvent.click(bubble);
    expect(react).toHaveBeenCalledWith('1', '❤️');
    expect(screen.getByRole('button', { name: /Daumen hoch, 1 Reaktion/ })).toBeEnabled();
    unmount();

    setChat({
      react,
      ban: { until: { toDate: () => new Date(Date.now() + 3_600_000) } },
      messages: [{ ...msg('1', 'other', 'Hallo Welt'), reactions: { x: '👍' } }],
    });
    renderPage();
    expect(screen.getByRole('button', { name: /Daumen hoch, 1 Reaktion/ })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Mit Emoji reagieren' })).not.toBeInTheDocument();
  });

  it('shows the rules first and the input only after accepting them', () => {
    window.localStorage.removeItem('chatRulesAccepted2');
    renderPage();
    expect(screen.getByTestId('chat-rules')).toBeInTheDocument();
    expect(screen.queryByTestId('chat-input')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('chat-rules-accept'));
    expect(screen.getByTestId('chat-input')).toBeInTheDocument();
  });

  it('reports a message after confirming', async () => {
    const report = vi.fn(async () => {});
    setChat({ report });
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /melden/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Melden' }));
    await waitFor(() => expect(report).toHaveBeenCalledTimes(1));
    expect(report.mock.calls[0][0]).toMatchObject({ id: '1' });
  });
});

describe('ChatPage: guests read along (read-only)', () => {
  beforeEach(() => {
    state.user = null;
    clubMembers.uids = new Set();
  });

  it('shows the messages meant for guests, with a login link instead of the input', () => {
    renderPage();
    expect(state.chatOptions.at(-1)).toEqual({ guestView: true });
    expect(screen.getAllByTestId('chat-message')).toHaveLength(2);
    expect(screen.getByText('Hallo Welt')).toBeInTheDocument();
    expect(screen.queryByTestId('chat-input')).toBeNull();
    expect(screen.queryByTestId('chat-rules')).toBeNull();
    const hint = screen.getByTestId('chat-login');
    expect(hint).toHaveTextContent('Melde dich an, um im Lagerfeuer mitzuschreiben.');
    expect(screen.getByRole('link', { name: 'Melde dich an' })).toHaveAttribute('href', '/login');
  });

  it('no presence, member card, reactions, reports or deleting for guests', () => {
    state.online = [{ uid: 'other', name: 'Mira', photoURL: null }];
    setChat({ messages: [{ ...msg('1', 'other', 'Hallo Welt'), reactions: { x: '👍' } }] });
    renderPage();
    expect(screen.queryByTestId('chat-presence')).toBeNull();
    expect(state.heartbeat.every((active) => active === false)).toBe(true);
    const [message] = screen.getAllByTestId('chat-message');
    expect(message).not.toHaveTextContent('Melden');
    expect(message).not.toHaveTextContent('Löschen');
    expect(screen.queryByRole('button', { name: 'Mira ansehen' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Mit Emoji reagieren' })).toBeNull();
    expect(screen.getByRole('button', { name: /Daumen hoch, 1 Reaktion/ })).toBeDisabled();
  });

  it('says that everyone can read along, and members confirm the rules with that audience', () => {
    const { unmount } = renderPage();
    expect(screen.getByTestId('chat-page')).toHaveTextContent('mitlesen können alle');
    unmount();
    state.user = { uid: 'me', emailVerified: true };
    window.localStorage.removeItem('chatRulesAccepted2');
    renderPage();
    expect(state.chatOptions.at(-1)).toEqual({ guestView: false });
    expect(screen.getByTestId('chat-rules')).toHaveTextContent(
      'auch alle Besucher:innen der Website'
    );
  });

  it('members keep presence and the full room', () => {
    state.user = { uid: 'me', emailVerified: true };
    state.online = [{ uid: 'other', name: 'Mira', photoURL: null }];
    renderPage();
    expect(screen.getByTestId('chat-presence')).toBeInTheDocument();
    expect(state.heartbeat.at(-1)).toBe(true);
  });
});

describe('ChatPage: one Lagerfeuer per region', () => {
  it('dark launch: the room "lagerfeuer", title without region, no chooser', () => {
    renderPage();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/^Lagerfeuer$/);
    expect(screen.queryByTestId('chat-fire-chooser')).toBeNull();
    expect(state.roomIds.every((id) => id === 'lagerfeuer')).toBe(true);
  });

  it('opens the fire of the region in the header, plainly named, with no chooser', () => {
    renderRegionPage('tirol');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/^Lagerfeuer$/);
    expect(state.roomIds.at(-1)).toBe('tirol');
    expect(screen.queryByTestId('chat-fire-chooser')).toBeNull();
  });

  it('?raum= does not take a normal member to another fire', () => {
    renderRegionPage('tirol', '/chat?raum=lagerfeuer');
    expect(state.roomIds.at(-1)).toBe('tirol');
  });

  it('Admins can open another open fire via ?raum= and the chooser', () => {
    state.role = 'Admin';
    renderRegionPage('tirol', '/chat?raum=lagerfeuer');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Lagerfeuer Vorarlberg');
    expect(state.roomIds.at(-1)).toBe('lagerfeuer');
    fireEvent.change(screen.getByLabelText('Anderes Feuer:'), { target: { value: 'tirol' } });
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Lagerfeuer Tirol');
  });

  it('own region not open yet: a hint, no chat, no chooser', () => {
    renderRegionPage('wien');
    expect(screen.getByTestId('chat-no-room')).toHaveTextContent(
      'Das Lagerfeuer deiner Region startet, sobald die Region online geht'
    );
    expect(screen.queryByTestId('chat-list')).toBeNull();
    expect(screen.queryByTestId('chat-fire-chooser')).toBeNull();
  });

  it("no region known: Vorarlberg's fire", () => {
    renderRegionPage(null);
    expect(state.roomIds.at(-1)).toBe('lagerfeuer');
  });

  it("a Regions-Moderator:in deletes others' messages only in her region's fire", () => {
    state.role = 'RegionModerator';
    state.staffRegionIds = ['tirol'];
    const { unmount } = renderRegionPage('tirol');
    expect(screen.getAllByTestId('chat-message')[0]).toHaveTextContent('Löschen');
    unmount();
    renderRegionPage('vorarlberg');
    expect(screen.getAllByTestId('chat-message')[0]).not.toHaveTextContent('Löschen');
  });
});
