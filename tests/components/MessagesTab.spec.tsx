import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import MessagesTab from '../../src/components/MessagesTab';

const mockUseEventsWithUnread = vi.hoisted(() => ({
  events: [] as Array<{ id: string; title: string; date: string; slug?: string; bezirk?: string }>,
  loading: false,
}));

vi.mock('../../src/hooks/useEventsWithUnreadMessages', () => ({
  useEventsWithUnreadMessages: () => mockUseEventsWithUnread,
}));

beforeEach(() => {
  mockUseEventsWithUnread.events = [];
  mockUseEventsWithUnread.loading = false;
});

describe('MessagesTab (zejdjTnm)', () => {
  it('shows a loading spinner while fetching', () => {
    mockUseEventsWithUnread.loading = true;
    render(
      <MemoryRouter>
        <MessagesTab />
      </MemoryRouter>
    );
    expect(screen.getByTestId('messages-tab-loading')).toBeInTheDocument();
  });

  it('shows an empty state when there are no events with unread messages', () => {
    render(
      <MemoryRouter>
        <MessagesTab />
      </MemoryRouter>
    );
    expect(screen.getByTestId('messages-tab-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('messages-tab-list')).not.toBeInTheDocument();
  });

  it('renders a list of events with unread messages', () => {
    mockUseEventsWithUnread.events = [
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
    mockUseEventsWithUnread.events = [
      { id: 'e1', title: 'Yoga Workshop', date: '2026-09-15', slug: 'yoga-workshop' },
    ];
    render(
      <MemoryRouter>
        <MessagesTab />
      </MemoryRouter>
    );
    const link = screen.getByTestId('messages-tab-item');
    expect(link).toHaveAttribute('href', '/event/yoga-workshop');
  });

  it('falls back to the event id in the URL when no slug is present', () => {
    mockUseEventsWithUnread.events = [
      { id: 'event-without-slug', title: 'Mystery Event', date: '2026-09-15' },
    ];
    render(
      <MemoryRouter>
        <MessagesTab />
      </MemoryRouter>
    );
    const link = screen.getByTestId('messages-tab-item');
    expect(link).toHaveAttribute('href', '/event/event-without-slug');
  });

  it('formats event dates in German locale', () => {
    mockUseEventsWithUnread.events = [
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
    mockUseEventsWithUnread.events = [
      { id: 'e1', title: 'Yoga Workshop', date: '2026-09-15', slug: 'yoga', bezirk: 'Bregenz' },
    ];
    render(
      <MemoryRouter>
        <MessagesTab />
      </MemoryRouter>
    );
    expect(screen.getByTestId('messages-tab-item').textContent).toContain('Bregenz');
  });
});
