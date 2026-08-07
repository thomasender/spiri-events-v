import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import MessagesTab from '../../src/components/MessagesTab';

const mockUseEventsWithMessages = vi.hoisted(() => ({
  events: [] as Array<{ id: string; title: string; date: string; slug?: string; bezirk?: string }>,
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

describe('MessagesTab', () => {
  it('shows a loading spinner while fetching', () => {
    mockUseEventsWithMessages.loading = true;
    render(
      <MemoryRouter>
        <MessagesTab />
      </MemoryRouter>
    );
    expect(screen.getByTestId('messages-tab-loading')).toBeInTheDocument();
  });

  it('shows an empty state when there are no events with messages', () => {
    render(
      <MemoryRouter>
        <MessagesTab />
      </MemoryRouter>
    );
    expect(screen.getByTestId('messages-tab-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('messages-tab-list')).not.toBeInTheDocument();
  });

  it('renders a list of events with messages (read or unread)', () => {
    mockUseEventsWithMessages.events = [
      {
        id: 'e1',
        title: 'Yoga Workshop',
        date: '2026-09-15',
        slug: 'yoga-workshop',
        bezirk: 'Bregenz',
      },
      { id: 'e2', title: 'Meditation Circle', date: '2026-10-01', slug: 'meditation-circle' },
    ];
    render(
      <MemoryRouter>
        <MessagesTab />
      </MemoryRouter>
    );

    const list = screen.getByTestId('messages-tab-list');
    const items = screen.getAllByTestId('messages-tab-item');
    expect(list).toBeInTheDocument();
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('Yoga Workshop');
    expect(items[1]).toHaveTextContent('Meditation Circle');
  });

  it('links each item to the corresponding event detail page', () => {
    mockUseEventsWithMessages.events = [
      { id: 'e1', title: 'Yoga Workshop', date: '2026-09-15', slug: 'yoga-workshop' },
    ];
    render(
      <MemoryRouter>
        <MessagesTab />
      </MemoryRouter>
    );
    const link = screen.getByTestId('messages-tab-item');
    expect(link).toHaveAttribute('href', '/event/yoga-workshop#event-messages');
  });

  it('falls back to the event id in the URL when no slug is present', () => {
    mockUseEventsWithMessages.events = [
      { id: 'event-without-slug', title: 'Mystery Event', date: '2026-09-15' },
    ];
    render(
      <MemoryRouter>
        <MessagesTab />
      </MemoryRouter>
    );
    const link = screen.getByTestId('messages-tab-item');
    expect(link).toHaveAttribute('href', '/event/event-without-slug#event-messages');
  });

  it('formats event dates in German locale', () => {
    mockUseEventsWithMessages.events = [
      { id: 'e1', title: 'Yoga Workshop', date: '2026-09-15', slug: 'yoga' },
    ];
    render(
      <MemoryRouter>
        <MessagesTab />
      </MemoryRouter>
    );
    const item = screen.getByTestId('messages-tab-item');
    expect(item.textContent).toMatch(/Sep/);
  });

  it('includes the bezirk in the item meta when present', () => {
    mockUseEventsWithMessages.events = [
      { id: 'e1', title: 'Yoga Workshop', date: '2026-09-15', slug: 'yoga', bezirk: 'Bregenz' },
    ];
    render(
      <MemoryRouter>
        <MessagesTab />
      </MemoryRouter>
    );
    expect(screen.getByTestId('messages-tab-item').textContent).toContain('Bregenz');
  });

  it('shows an unread badge when the event has unread messages', () => {
    mockUseEventsWithMessages.events = [
      { id: 'e1', title: 'Yoga Workshop', date: '2026-09-15', slug: 'yoga' },
    ];
    mockUseEventsWithMessages.unreadCountByEvent = { e1: 3 };
    render(
      <MemoryRouter>
        <MessagesTab />
      </MemoryRouter>
    );
    const badge = screen.getByTestId('messages-tab-item-badge');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent('3');
  });

  it('caps the unread badge at 9+ when count exceeds 9', () => {
    mockUseEventsWithMessages.events = [
      { id: 'e1', title: 'Yoga Workshop', date: '2026-09-15', slug: 'yoga' },
    ];
    mockUseEventsWithMessages.unreadCountByEvent = { e1: 15 };
    render(
      <MemoryRouter>
        <MessagesTab />
      </MemoryRouter>
    );
    expect(screen.getByTestId('messages-tab-item-badge')).toHaveTextContent('9+');
  });

  it('does not show an unread badge for events whose messages are all read', () => {
    mockUseEventsWithMessages.events = [
      { id: 'e1', title: 'Yoga Workshop', date: '2026-09-15', slug: 'yoga' },
      { id: 'e2', title: 'Meditation Circle', date: '2026-10-01', slug: 'meditation' },
    ];
    mockUseEventsWithMessages.unreadCountByEvent = { e1: 0, e2: 2 };
    render(
      <MemoryRouter>
        <MessagesTab />
      </MemoryRouter>
    );
    const badges = screen.getAllByTestId('messages-tab-item-badge');
    expect(badges).toHaveLength(1);
    expect(badges[0]).toHaveTextContent('2');
  });

  it('includes read events with no unread messages in the list', () => {
    mockUseEventsWithMessages.events = [
      { id: 'e1', title: 'Old Conversation', date: '2026-09-15', slug: 'old' },
    ];
    mockUseEventsWithMessages.unreadCountByEvent = { e1: 0 };
    render(
      <MemoryRouter>
        <MessagesTab />
      </MemoryRouter>
    );
    const items = screen.getAllByTestId('messages-tab-item');
    expect(items).toHaveLength(1);
    expect(screen.queryByTestId('messages-tab-item-badge')).not.toBeInTheDocument();
  });

  it('exposes an accessible label describing unread message count', () => {
    mockUseEventsWithMessages.events = [
      { id: 'e1', title: 'Yoga Workshop', date: '2026-09-15', slug: 'yoga' },
    ];
    mockUseEventsWithMessages.unreadCountByEvent = { e1: 1 };
    render(
      <MemoryRouter>
        <MessagesTab />
      </MemoryRouter>
    );
    expect(screen.getByLabelText('Yoga Workshop – 1 ungelesene Nachricht')).toBeInTheDocument();
  });
});
