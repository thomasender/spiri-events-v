// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../../src/hooks/useAuth', () => ({
  useAuth: vi.fn(),
}));

const sendMessageMock = vi.fn();
const markAsReadMock = vi.fn();
const editMessageMock = vi.fn();

vi.mock('../../src/hooks/useEventMessages', () => ({
  useEventMessages: vi.fn(),
}));

vi.mock('../../src/components/RichTextEditorLazy', () => ({
  default: ({ onChange, testId, value }) => (
    <div
      role="textbox"
      data-initial={value}
      data-testid={testId}
      contentEditable
      suppressContentEditableWarning
      onInput={(e) => onChange(`<p>${e.currentTarget.textContent || ''}</p>`)}
    />
  ),
}));

import EventMessages from '../../src/components/EventMessages';
import { useAuth } from '../../src/hooks/useAuth';
import { useEventMessages } from '../../src/hooks/useEventMessages';

describe('EventMessages', () => {
  beforeEach(() => {
    sendMessageMock.mockReset();
    markAsReadMock.mockReset();
    editMessageMock.mockReset();
    useAuth.mockReturnValue({
      user: { uid: 'user-1', displayName: 'Anna' },
      role: 'User',
    });
    useEventMessages.mockReturnValue({
      messages: [],
      loading: false,
      sending: false,
      sendMessage: sendMessageMock,
      markAsRead: markAsReadMock,
      editMessage: editMessageMock,
    });
  });

  it('renders the section header and an empty state', () => {
    render(<EventMessages eventId="event-1" />);
    expect(screen.getByText('Nachrichten')).toBeInTheDocument();
    expect(screen.getByText(/Noch keine Nachrichten/)).toBeInTheDocument();
  });

  it('shows a loading hint while messages are loading', () => {
    useEventMessages.mockReturnValue({
      messages: [],
      loading: true,
      sending: false,
      sendMessage: sendMessageMock,
      markAsRead: markAsReadMock,
    });
    render(<EventMessages eventId="event-1" />);
    expect(screen.getByText(/Nachrichten werden geladen/)).toBeInTheDocument();
  });

  it('renders admin messages with the Admin author label', () => {
    const ts = { toDate: () => new Date('2026-08-01T10:00:00Z') };
    useEventMessages.mockReturnValue({
      messages: [
        {
          id: 'm1',
          text: 'Bitte Ort präzisieren',
          authorUid: 'admin-1',
          authorRole: 'Admin',
          authorName: 'Test Admin',
          createdAt: ts,
          readByRecipient: false,
        },
      ],
      loading: false,
      sending: false,
      sendMessage: sendMessageMock,
      markAsRead: markAsReadMock,
    });
    render(<EventMessages eventId="event-1" />);
    expect(screen.getByText('Bitte Ort präzisieren')).toBeInTheDocument();
    expect(screen.getByText('Admin')).toBeInTheDocument();
  });

  it('sends the composed rich-text message when the user submits', async () => {
    sendMessageMock.mockResolvedValue();
    render(<EventMessages eventId="event-1" />);

    const editor = await screen.findByRole('textbox');
    fireEvent.input(editor, { target: { textContent: 'Ich überarbeite das Event 🙏' } });
    await waitFor(() => expect(screen.getByTestId('event-message-send')).not.toBeDisabled());
    fireEvent.click(screen.getByTestId('event-message-send'));

    await waitFor(() => {
      expect(sendMessageMock).toHaveBeenCalledTimes(1);
    });
    expect(sendMessageMock.mock.calls[0][0]).toContain('Ich überarbeite das Event 🙏');
  });

  it('keeps the send button disabled while the editor is empty', async () => {
    render(<EventMessages eventId="event-1" />);
    await screen.findByRole('textbox');
    expect(screen.getByTestId('event-message-send')).toBeDisabled();
    expect(sendMessageMock).not.toHaveBeenCalled();
  });

  it('renders legacy plain-text messages with line breaks and rich-text safely', () => {
    const ts = { toDate: () => new Date('2026-08-01T10:00:00Z') };
    useEventMessages.mockReturnValue({
      messages: [
        {
          id: 'm1',
          text: 'Zeile 1\nZeile 2 <b>',
          authorUid: 'a',
          authorRole: 'Admin',
          createdAt: ts,
        },
        {
          id: 'm2',
          text: '<p>Hallo <strong>fett</strong> 🙏<img src="x" onerror="alert(1)"></p>',
          authorUid: 'a',
          authorRole: 'Admin',
          createdAt: ts,
        },
      ],
      loading: false,
      sending: false,
      sendMessage: sendMessageMock,
      markAsRead: markAsReadMock,
    });
    const { container } = render(<EventMessages eventId="event-1" />);
    const texts = container.querySelectorAll('.event-message-text');
    expect(texts[0].innerHTML).toContain('<br>');
    expect(texts[0].textContent).toContain('Zeile 2 <b>');
    expect(texts[1].querySelector('strong')?.textContent).toBe('fett');
    expect(texts[1].textContent).toContain('🙏');
    expect(texts[1].innerHTML).not.toContain('onerror');
    expect(texts[1].querySelector('img')).toBeNull();
  });

  it('marks incoming messages as read once they are visible', () => {
    const ts = { toDate: () => new Date('2026-08-01T10:00:00Z') };
    useEventMessages.mockReturnValue({
      messages: [
        {
          id: 'm1',
          text: 'Bitte anpassen',
          authorUid: 'admin-1',
          authorRole: 'Admin',
          authorName: 'Test Admin',
          createdAt: ts,
          readByRecipient: false,
        },
      ],
      loading: false,
      sending: false,
      sendMessage: sendMessageMock,
      markAsRead: markAsReadMock,
    });

    render(<EventMessages eventId="event-1" />);

    expect(markAsReadMock).toHaveBeenCalledWith('m1');
  });

  it('does not mark own messages as read', () => {
    useAuth.mockReturnValue({
      user: { uid: 'admin-1', displayName: 'Test Admin' },
      role: 'Admin',
    });
    const ts = { toDate: () => new Date('2026-08-01T10:00:00Z') };
    useEventMessages.mockReturnValue({
      messages: [
        {
          id: 'm1',
          text: 'Eigene Nachricht',
          authorUid: 'admin-1',
          authorRole: 'Admin',
          authorName: 'Test Admin',
          createdAt: ts,
          readByRecipient: false,
        },
      ],
      loading: false,
      sending: false,
      sendMessage: sendMessageMock,
      markAsRead: markAsReadMock,
    });

    render(<EventMessages eventId="event-1" />);

    expect(markAsReadMock).not.toHaveBeenCalled();
  });

  describe('editing', () => {
    const ts = { toDate: () => new Date('2026-08-01T10:00:00Z') };
    const mockMessages = () =>
      useEventMessages.mockReturnValue({
        messages: [
          {
            id: 'mine',
            text: '<p>Meine</p>',
            authorUid: 'user-1',
            authorRole: 'User',
            createdAt: ts,
          },
          {
            id: 'theirs',
            text: '<p>Fremde</p>',
            authorUid: 'admin-1',
            authorRole: 'Admin',
            createdAt: ts,
            editedAt: ts,
          },
        ],
        loading: false,
        sending: false,
        sendMessage: sendMessageMock,
        editMessage: editMessageMock,
        markAsRead: markAsReadMock,
      });

    it('offers editing only on own messages', () => {
      mockMessages();
      render(<EventMessages eventId="event-1" />);
      expect(screen.getAllByTestId('event-message-edit')).toHaveLength(1);
    });

    it('lets an admin edit messages of other admins, but not of users', () => {
      useAuth.mockReturnValue({ user: { uid: 'admin-2', displayName: 'Zweiter' }, role: 'Admin' });
      mockMessages();
      render(<EventMessages eventId="event-1" />);
      // only the message written by admin-1; the user's message stays read-only
      expect(screen.getAllByTestId('event-message-edit')).toHaveLength(1);
    });

    it('shows "(bearbeitet)" for edited messages', () => {
      mockMessages();
      render(<EventMessages eventId="event-1" />);
      expect(screen.getAllByTestId('event-message-edited')).toHaveLength(1);
    });

    it('saves an edited message and closes the editor', async () => {
      editMessageMock.mockResolvedValue(undefined);
      mockMessages();
      render(<EventMessages eventId="event-1" />);
      fireEvent.click(screen.getByTestId('event-message-edit'));
      const editor = await screen.findByTestId('event-message-edit-input');
      fireEvent.input(editor, { target: { textContent: 'Neu' } });
      fireEvent.click(screen.getByTestId('event-message-edit-save'));
      await waitFor(() => expect(editMessageMock).toHaveBeenCalledWith('mine', '<p>Neu</p>'));
      await waitFor(() => expect(screen.queryByTestId('event-message-edit-input')).toBeNull());
    });

    it('cancels editing without saving', async () => {
      mockMessages();
      render(<EventMessages eventId="event-1" />);
      fireEvent.click(screen.getByTestId('event-message-edit'));
      fireEvent.click(screen.getByTestId('event-message-edit-cancel'));
      expect(screen.queryByTestId('event-message-edit-input')).toBeNull();
      expect(editMessageMock).not.toHaveBeenCalled();
    });
  });
});
