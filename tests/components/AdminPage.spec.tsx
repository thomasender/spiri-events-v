import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
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

const mockUseEventsWithMessages = vi.hoisted(() => ({
  events: [] as Array<{ id: string; title: string; date: string; slug?: string }>,
  unreadCountByEvent: {} as Record<string, number>,
  loading: false,
}));

const mockUseEvents = vi.hoisted(() => ({
  events: [] as Array<{ id: string; title: string; status?: string }>,
  loading: false,
  deleteEvent: vi.fn(),
  updateEvent: vi.fn(),
  duplicateEvent: vi.fn(),
  submitForReview: vi.fn(),
  revertToDraft: vi.fn(),
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

vi.mock('../../src/hooks/useEventsWithMessages', () => ({
  useEventsWithMessages: () => mockUseEventsWithMessages,
}));

vi.mock('../../src/hooks/useEvents', () => ({
  useEvents: () => mockUseEvents,
  usePendingEvents: () => mockUsePendingEvents,
}));

function renderAdmin(initialEntries: string[] = ['/admin']) {
  return render(
    <HelmetProvider>
      <MemoryRouter initialEntries={initialEntries}>
        <Routes>
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/admin/new" element={<div>New Event Page</div>} />
        </Routes>
      </MemoryRouter>
    </HelmetProvider>
  );
}

beforeEach(() => {
  mockAuth.user = { uid: 'test-uid' };
  mockAuth.role = 'User';
  mockUseUnread.count = 0;
  mockUseUnread.loading = false;
  mockUseEventsWithMessages.events = [];
  mockUseEventsWithMessages.unreadCountByEvent = {};
  mockUseEventsWithMessages.loading = false;
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

  it('renders the empty messages state when there are no events with messages', () => {
    renderAdmin(['/admin?tab=messages']);
    expect(screen.getByTestId('messages-tab-empty')).toBeInTheDocument();
  });

  it('renders the list of events with messages on the Nachrichten tab', () => {
    mockUseEventsWithMessages.events = [
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

describe('AdminPage Entwürfe tab (Bslx5TQW)', () => {
  it('renders the Entwürfe tab', () => {
    renderAdmin();
    expect(screen.getByTestId('admin-tab-drafts')).toBeInTheDocument();
    expect(screen.getByTestId('admin-tab-drafts')).toHaveTextContent('Entwürfe');
  });

  it('hides the Entwürfe tab content by default', () => {
    renderAdmin();
    const draftsPanel = document.getElementById('admin-tab-drafts');
    expect(draftsPanel).toHaveAttribute('hidden');
    expect(screen.getByTestId('admin-tab-drafts')).toHaveAttribute('aria-selected', 'false');
  });

  it('activates the Entwürfe tab when ?tab=drafts is in the URL', () => {
    renderAdmin(['/admin?tab=drafts']);
    const draftsPanel = document.getElementById('admin-tab-drafts');
    const eventsPanel = document.getElementById('admin-tab-events');
    expect(draftsPanel).not.toHaveAttribute('hidden');
    expect(eventsPanel).toHaveAttribute('hidden');
    expect(screen.getByTestId('admin-tab-drafts')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('admin-tab-events')).toHaveAttribute('aria-selected', 'false');
  });

  it('shows the empty drafts state when there are no drafts', () => {
    renderAdmin(['/admin?tab=drafts']);
    expect(screen.getByTestId('drafts-empty-state')).toBeInTheDocument();
  });

  it('shows a badge with the draft count when drafts exist', () => {
    mockUseEvents.events = [
      { id: 'd1', title: 'Draft 1', status: 'draft' },
      { id: 'd2', title: 'Draft 2', status: 'draft' },
      { id: 'a1', title: 'Approved', status: 'approved' },
    ];
    renderAdmin();
    const badge = screen.getByTestId('admin-tab-drafts-badge');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent('2');
  });

  it('caps the drafts badge at 9+', () => {
    mockUseEvents.events = Array.from({ length: 12 }, (_, i) => ({
      id: `d${i}`,
      title: `Draft ${i}`,
      status: 'draft',
    }));
    renderAdmin();
    expect(screen.getByTestId('admin-tab-drafts-badge')).toHaveTextContent('9+');
  });

  it('does NOT show the drafts badge when there are no drafts', () => {
    mockUseEvents.events = [{ id: 'a1', title: 'Approved', status: 'approved' }];
    renderAdmin();
    expect(screen.queryByTestId('admin-tab-drafts-badge')).not.toBeInTheDocument();
  });
});
