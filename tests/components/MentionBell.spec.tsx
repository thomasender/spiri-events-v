import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import MentionBell from '../../src/components/MentionBell';

const state = vi.hoisted(() => ({
  items: [] as Record<string, unknown>[],
  markRead: vi.fn(async () => {}),
  markAllRead: vi.fn(async () => {}),
}));

vi.mock('../../src/hooks/useMentionNotifications', () => ({
  useMentionNotifications: () => ({
    items: state.items,
    unreadCount: state.items.filter((m) => !m.read).length,
    markRead: state.markRead,
    markAllRead: state.markAllRead,
  }),
}));

const lagerfeuer = {
  id: 'm1',
  kind: 'lagerfeuer',
  messageId: 'm1',
  fromName: 'Anna',
  excerpt: 'Hallo @Ich',
  read: false,
  createdAt: Date.now(),
};
const kerzenraum = {
  id: 'm2',
  kind: 'event',
  eventId: 'ev1',
  eventSlug: 'kakao-2026',
  eventTitle: 'Kakao-Zeremonie',
  messageId: 'm2',
  fromName: 'Bob',
  excerpt: 'Wer fährt mit?',
  read: true,
  createdAt: Date.now(),
};

function renderBell() {
  return render(
    <MemoryRouter>
      <MentionBell uid="me" />
    </MemoryRouter>
  );
}

beforeEach(() => {
  state.items = [];
  state.markRead.mockClear();
  state.markAllRead.mockClear();
});

describe('MentionBell', () => {
  it('shows no badge and an empty note when nobody mentioned me', () => {
    renderBell();
    expect(screen.queryByTestId('mention-unread-badge')).toBeNull();
    fireEvent.click(screen.getByTestId('mention-bell'));
    expect(screen.getByTestId('mention-empty')).toBeInTheDocument();
  });

  it('counts unread mentions in the badge and the accessible name', () => {
    state.items = [lagerfeuer, kerzenraum];
    renderBell();
    expect(screen.getByTestId('mention-unread-badge')).toHaveTextContent('1');
    expect(screen.getByTestId('mention-bell')).toHaveAccessibleName('Erwähnungen (1 ungelesen)');
  });

  it('links to the message and marks an unread mention as read on click', () => {
    state.items = [lagerfeuer, kerzenraum];
    renderBell();
    fireEvent.click(screen.getByTestId('mention-bell'));
    const [first, second] = screen.getAllByTestId('mention-item');
    expect(first).toHaveAttribute('href', '/chat#msg-m1');
    expect(first).toHaveTextContent('Anna hat dich im Lagerfeuer erwähnt');
    expect(second).toHaveAttribute('href', '/event/kakao-2026#msg-m2');
    expect(second).toHaveTextContent('Bob hat dich im');
    expect(second).toHaveTextContent('Kakao-Zeremonie');

    fireEvent.click(second);
    expect(state.markRead).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('mention-bell'));
    fireEvent.click(screen.getAllByTestId('mention-item')[0]);
    expect(state.markRead).toHaveBeenCalledWith('m1');
  });

  it('marks everything read and closes on Escape', () => {
    state.items = [lagerfeuer];
    renderBell();
    fireEvent.click(screen.getByTestId('mention-bell'));
    fireEvent.click(screen.getByTestId('mention-read-all'));
    expect(state.markAllRead).toHaveBeenCalled();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByTestId('mention-panel')).toBeNull();
  });
});
