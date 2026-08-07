import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import AdminPage from '../../src/pages/AdminPage';

const mockAuth = vi.hoisted(() => ({
  user: { uid: 'test-uid' } as { uid: string } | null,
  role: 'User',
  loading: false,
}));

const mockUseUnread = vi.hoisted(() => ({
  count: 0,
  loading: false,
}));

const mockUseEventsWithUnread = vi.hoisted(() => ({
  events: [] as Array<{ id: string; title: string; date: string; slug?: string }>,
  loading: false,
}));

const mockUseEvents = vi.hoisted(() => ({
  events: [] as Array<{ id: string; title: string }>,
  loading: false,
  deleteEvent: vi.fn(),
  updateEvent: vi.fn(),
}));

const mockUsePendingEvents = vi.hoisted(() => ({
  pendingEvents: [] as Array<{ id: string; title: string }>,
  loading: false,
  approveEvent: vi.fn(),
}));

vi.mock('../../src/hooks/useAuth', () => ({
  useAuth: () => mockAuth,
}));

vi.mock('../../src/hooks/useUnreadMessageCount', () => ({
  useUnreadMessageCount: () => mockUseUnread,
}));

vi.mock('../../src/hooks/useEventsWithUnreadMessages', () => ({
  useEventsWithUnreadMessages: () => mockUseEventsWithUnread,
}));

vi.mock('../../src/hooks/useEvents', () => ({
  useEvents: () => mockUseEvents,
  usePendingEvents: () => mockUsePendingEvents,
}));

function renderAdmin(initialEntries: string[] = ['/admin']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/admin/new" element={<div>New Event Page</div>} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  mockAuth.user = { uid: 'test-uid' };
  mockAuth.role = 'User';
  mockUseUnread.count = 0;
  mockUseUnread.loading = false;
  mockUseEventsWithUnread.events = [];
  mockUseEventsWithUnread.loading = false;
  mockUseEvents.events = [];
  mockUseEvents.loading = false;
  mockUsePendingEvents.pendingEvents = [];
  mockUsePendingEvents.loading = false;
});

describe('AdminPage tabs (zejdjTnm)', () => {
  it('renders the Events and Nachrichten tabs', () => {
    renderAdmin();
    expect(screen.getByTestId('admin-tab-events')).toBeInTheDocument();
    expect(screen.getByTestId('admin-tab-messages')).toBeInTheDocument();
  });

  it('shows the Events tab content by default and hides the Messages tab', () => {
    renderAdmin();
    const eventsPanel = document.getElementById('admin-tab-events');
    const messagesPanel = document.getElementById('admin-tab-messages');
    expect(eventsPanel).not.toHaveAttribute('hidden');
    expect(messagesPanel).toHaveAttribute('hidden');
  });

  it('activates the Messages tab when ?tab=messages is in the URL', () => {
    renderAdmin(['/admin?tab=messages']);
    const eventsPanel = document.getElementById('admin-tab-events');
    const messagesPanel = document.getElementById('admin-tab-messages');
    expect(eventsPanel).toHaveAttribute('hidden');
    expect(messagesPanel).not.toHaveAttribute('hidden');
    expect(screen.getByTestId('admin-tab-messages')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('admin-tab-events')).toHaveAttribute('aria-selected', 'false');
  });

  it('falls back to the Events tab for unknown tab values', () => {
    renderAdmin(['/admin?tab=unknown']);
    const eventsPanel = document.getElementById('admin-tab-events');
    expect(eventsPanel).not.toHaveAttribute('hidden');
    expect(screen.getByTestId('admin-tab-events')).toHaveAttribute('aria-selected', 'true');
  });

  it('renders the empty messages state when there are no events with unread messages', () => {
    renderAdmin(['/admin?tab=messages']);
    expect(screen.getByTestId('messages-tab-empty')).toBeInTheDocument();
  });

  it('renders the list of events with unread messages on the Nachrichten tab', () => {
    mockUseEventsWithUnread.events = [
      { id: 'e1', title: 'Yoga Workshop', date: '2026-09-01', slug: 'yoga-workshop' },
    ];
    renderAdmin(['/admin?tab=messages']);
    const list = screen.getByTestId('messages-tab-list');
    expect(list).toBeInTheDocument();
    expect(list).toHaveTextContent('Yoga Workshop');
  });

  it('shows a badge on the Nachrichten tab when unread count > 0', () => {
    mockUseUnread.count = 5;
    renderAdmin();
    const badge = screen.getByTestId('admin-tab-messages-badge');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent('5');
  });

  it('caps the tab badge at 9+ when unread count is very high', () => {
    mockUseUnread.count = 42;
    renderAdmin();
    expect(screen.getByTestId('admin-tab-messages-badge')).toHaveTextContent('9+');
  });

  it('does not show the tab badge when there are no unread messages', () => {
    mockUseUnread.count = 0;
    renderAdmin();
    expect(screen.queryByTestId('admin-tab-messages-badge')).not.toBeInTheDocument();
  });
});
