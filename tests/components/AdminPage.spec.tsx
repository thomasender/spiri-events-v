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

const mockUseHasMessages = vi.hoisted(() => ({
  hasMessages: false,
  loading: false,
}));

const mockUseUnreadFeedbackCount = vi.hoisted(() => ({
  count: 0,
  loading: false,
}));

const mockUseHasFeedback = vi.hoisted(() => ({
  hasFeedback: false,
  loading: false,
}));

const mockUseTrashedCount = vi.hoisted(() => ({
  count: 0,
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
  useHasMessages: () => mockUseHasMessages,
}));

vi.mock('../../src/hooks/useEvents', () => ({
  useEvents: () => mockUseEvents,
  usePendingEvents: () => mockUsePendingEvents,
}));
vi.mock('../../src/hooks/useEventsWithMessages', () => ({
  useEventsWithMessages: () => mockUseEventsWithMessages,
}));
vi.mock('../../src/hooks/useFeedbackList', () => ({
  useUnreadFeedbackCount: () => mockUseUnreadFeedbackCount,
  useHasFeedback: () => mockUseHasFeedback,
}));
vi.mock('../../src/hooks/useTrashedEventsCount', () => ({
  useTrashedEventsCount: () => mockUseTrashedCount,
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
  mockUseHasMessages.hasMessages = false;
  mockUseHasMessages.loading = false;
  mockUseEventsWithMessages.events = [];
  mockUseEventsWithMessages.unreadCountByEvent = {};
  mockUseEventsWithMessages.loading = false;
  mockUseUnreadFeedbackCount.count = 0;
  mockUseUnreadFeedbackCount.loading = false;
  mockUseHasFeedback.hasFeedback = false;
  mockUseHasFeedback.loading = false;
  mockUseTrashedCount.count = 0;
  mockUseTrashedCount.loading = false;
  mockUseEvents.events = [];
  mockUseEvents.loading = false;
  mockUsePendingEvents.pendingEvents = [];
  mockUsePendingEvents.loading = false;
});

describe('AdminPage tabs (zejdjTnm)', () => {
  it('renders the Events tab by default', () => {
    renderAdmin();
    expect(screen.getByTestId('admin-tab-events')).toBeInTheDocument();
  });

  it('hides the Messages tab when there are no messages', () => {
    mockUseHasMessages.hasMessages = false;
    renderAdmin();
    expect(screen.queryByTestId('admin-tab-messages')).not.toBeInTheDocument();
  });

  it('shows the Messages tab when there are messages', () => {
    mockUseHasMessages.hasMessages = true;
    renderAdmin();
    expect(screen.getByTestId('admin-tab-messages')).toBeInTheDocument();
  });

  it('shows the Events tab content by default', () => {
    renderAdmin();
    const eventsPanel = document.getElementById('admin-tab-events');
    expect(eventsPanel).not.toHaveAttribute('hidden');
  });

  it('activates the Messages tab when ?tab=messages is in the URL and there are messages', () => {
    mockUseHasMessages.hasMessages = true;
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

  it('falls back to the Events tab when ?tab=messages is requested but no messages exist', () => {
    mockUseHasMessages.hasMessages = false;
    renderAdmin(['/admin?tab=messages']);
    const eventsPanel = document.getElementById('admin-tab-events');
    expect(eventsPanel).not.toHaveAttribute('hidden');
    expect(screen.getByTestId('admin-tab-events')).toHaveAttribute('aria-selected', 'true');
  });

  it('shows a badge on the Nachrichten tab when unread count > 0', () => {
    mockUseHasMessages.hasMessages = true;
    mockUseUnread.count = 5;
    renderAdmin();
    const badge = screen.getByTestId('admin-tab-messages-badge');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent('5');
  });

  it('caps the tab badge at 9+ when unread count is very high', () => {
    mockUseHasMessages.hasMessages = true;
    mockUseUnread.count = 42;
    renderAdmin();
    expect(screen.getByTestId('admin-tab-messages-badge')).toHaveTextContent('9+');
  });

  it('does not show the tab badge when there are no unread messages', () => {
    mockUseHasMessages.hasMessages = true;
    mockUseUnread.count = 0;
    renderAdmin();
    expect(screen.queryByTestId('admin-tab-messages-badge')).not.toBeInTheDocument();
  });
});

describe('AdminPage Entwürfe tab (Bslx5TQW)', () => {
  it('hides the Entwürfe tab when there are no drafts', () => {
    mockUseEvents.events = [];
    renderAdmin();
    expect(screen.queryByTestId('admin-tab-drafts')).not.toBeInTheDocument();
  });

  it('shows the Entwürfe tab when drafts exist', () => {
    mockUseEvents.events = [{ id: 'd1', title: 'Draft 1', status: 'draft' }];
    renderAdmin();
    expect(screen.getByTestId('admin-tab-drafts')).toBeInTheDocument();
    expect(screen.getByTestId('admin-tab-drafts')).toHaveTextContent('Entwürfe');
  });

  it('activates the Entwürfe tab when ?tab=drafts is in the URL', () => {
    mockUseEvents.events = [{ id: 'd1', title: 'Draft 1', status: 'draft' }];
    renderAdmin(['/admin?tab=drafts']);
    const draftsPanel = document.getElementById('admin-tab-drafts');
    const eventsPanel = document.getElementById('admin-tab-events');
    expect(draftsPanel).not.toHaveAttribute('hidden');
    expect(eventsPanel).toHaveAttribute('hidden');
    expect(screen.getByTestId('admin-tab-drafts')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('admin-tab-events')).toHaveAttribute('aria-selected', 'false');
  });

  it('falls back to the Events tab when ?tab=drafts is requested but no drafts exist', () => {
    mockUseEvents.events = [];
    renderAdmin(['/admin?tab=drafts']);
    const eventsPanel = document.getElementById('admin-tab-events');
    expect(eventsPanel).not.toHaveAttribute('hidden');
    expect(screen.getByTestId('admin-tab-events')).toHaveAttribute('aria-selected', 'true');
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

describe('AdminPage Feedback tab (admin only)', () => {
  it('does not show the Feedback tab for non-admin users', () => {
    mockAuth.role = 'User';
    mockUseHasFeedback.hasFeedback = true;
    renderAdmin();
    expect(screen.queryByTestId('admin-tab-feedback')).not.toBeInTheDocument();
  });

  it('does not show the Feedback tab for admins when there is no feedback', () => {
    mockAuth.role = 'Admin';
    mockUseHasFeedback.hasFeedback = false;
    renderAdmin();
    expect(screen.queryByTestId('admin-tab-feedback')).not.toBeInTheDocument();
  });

  it('shows the Feedback tab for admins when there is feedback', () => {
    mockAuth.role = 'Admin';
    mockUseHasFeedback.hasFeedback = true;
    renderAdmin();
    expect(screen.getByTestId('admin-tab-feedback')).toBeInTheDocument();
    expect(screen.getByTestId('admin-tab-feedback')).toHaveTextContent('Feedback');
  });
});

describe('AdminPage Papierkorb tab', () => {
  it('hides the Papierkorb tab when there are no trashed events', () => {
    mockUseTrashedCount.count = 0;
    renderAdmin();
    expect(screen.queryByTestId('admin-tab-trash')).not.toBeInTheDocument();
  });

  it('shows the Papierkorb tab when there are trashed events', () => {
    mockUseTrashedCount.count = 2;
    renderAdmin();
    expect(screen.getByTestId('admin-tab-trash')).toBeInTheDocument();
    expect(screen.getByTestId('admin-tab-trash')).toHaveTextContent('Papierkorb');
  });
});
