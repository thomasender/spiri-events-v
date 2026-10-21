import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import ChatPage from '../../src/pages/ChatPage';

const state = vi.hoisted(() => ({
  user: { uid: 'me', emailVerified: true } as { uid: string; emailVerified: boolean } | null,
  role: null as string | null,
  available: true,
  access: { loading: false },
  chat: {} as Record<string, unknown>,
  online: [] as { uid: string; name: string; photoURL: string | null }[],
}));

vi.mock('../../src/hooks/useAuth', () => ({
  useAuth: () => ({ user: state.user, role: state.role, loading: false }),
}));
vi.mock('../../src/hooks/useChatSettings', () => ({
  useChatAccess: () => ({ available: state.available, mode: 'all', loading: state.access.loading }),
}));
vi.mock('../../src/hooks/useChatPresence', () => ({
  useChatHeartbeat: () => {},
  useChatPresence: () => ({ online: state.online, count: state.online.length, loading: false }),
}));
vi.mock('../../src/hooks/useChat', () => ({ useChat: () => state.chat }));
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

beforeEach(() => {
  state.user = { uid: 'me', emailVerified: true };
  state.role = null;
  state.available = true;
  state.access.loading = false;
  state.online = [];
  window.localStorage.setItem('chatRulesAccepted', '1');
  setChat();
});

describe('ChatPage', () => {
  it('shows the not-found page while the feature flag keeps the chat closed', () => {
    state.available = false;
    renderPage();
    expect(screen.queryByTestId('chat-page')).not.toBeInTheDocument();
  });

  it('asks unverified users to confirm their e-mail instead of showing the chat', () => {
    state.user = { uid: 'me', emailVerified: false };
    renderPage();
    expect(screen.getByTestId('chat-unverified')).toBeInTheDocument();
    expect(screen.queryByTestId('chat-input')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'E-Mail bestätigen' }));
    expect(screen.getByTestId('verify-modal')).toBeInTheDocument();
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
    await waitFor(() => expect(send).toHaveBeenCalledWith('Hallo 🌿'));
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
    await waitFor(() => expect(send).toHaveBeenCalledWith('Danke 🙂'));
  });

  it('hides the input and explains the mute for banned users', () => {
    setChat({ ban: { until: { toDate: () => new Date(Date.now() + 3_600_000) } } });
    renderPage();
    expect(screen.getByTestId('chat-banned')).toHaveTextContent('stumm geschaltet');
    expect(screen.queryByTestId('chat-input')).not.toBeInTheDocument();
  });

  it('shows the rules first and the input only after accepting them', () => {
    window.localStorage.removeItem('chatRulesAccepted');
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
