import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../../src/hooks/useAuth', () => ({
  useAuth: vi.fn(),
}));

const sendMessageMock = vi.fn();
const markAsReadMock = vi.fn();

vi.mock('../../src/hooks/useEventMessages', () => ({
  useEventMessages: vi.fn(),
}));

import EventMessages from '../../src/components/EventMessages';
import { useAuth } from '../../src/hooks/useAuth';
import { useEventMessages } from '../../src/hooks/useEventMessages';

describe('EventMessages', () => {
  beforeEach(() => {
    sendMessageMock.mockReset();
    markAsReadMock.mockReset();
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

  it('sends a message when the user submits the composer', async () => {
    sendMessageMock.mockResolvedValue();
    render(<EventMessages eventId="event-1" />);

    const input = screen.getByTestId('event-message-input');
    fireEvent.change(input, { target: { value: 'Ich überarbeite das Event.' } });
    fireEvent.click(screen.getByTestId('event-message-send'));

    await waitFor(() => {
      expect(sendMessageMock).toHaveBeenCalledWith('Ich überarbeite das Event.');
    });
  });

  it('does not call sendMessage when only whitespace is entered', async () => {
    render(<EventMessages eventId="event-1" />);

    const input = screen.getByTestId('event-message-input');
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.click(screen.getByTestId('event-message-send'));

    expect(sendMessageMock).not.toHaveBeenCalled();
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
});
