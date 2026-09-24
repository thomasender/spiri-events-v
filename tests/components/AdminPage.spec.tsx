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

const mockUseHelpers = vi.hoisted(() => ({
  helpers: [] as Array<{ id: string; name: string }>,
  loading: false,
  error: null as string | null,
  isAdmin: true,
  addHelper: vi.fn(),
  updateHelper: vi.fn(),
  deleteHelper: vi.fn(),
  reorderHelpers: vi.fn(),
}));

const mockUseDonors = vi.hoisted(() => ({
  donors: [] as Array<{ id: string; name?: string | null }>,
  loading: false,
  error: null as string | null,
  isAdmin: true,
  addDonor: vi.fn(),
  updateDonor: vi.fn(),
  deleteDonor: vi.fn(),
  reorderDonors: vi.fn(),
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

const mockUseEventById = vi.hoisted(() => ({
  event: null as null | {
    id: string;
    title: string;
    slug?: string | null;
    status?: string;
  },
  loading: false,
  error: null as string | null,
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
  useEventById: () => mockUseEventById,
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
vi.mock('../../src/hooks/useHelpers', () => ({
  useHelpers: () => mockUseHelpers,
}));
vi.mock('../../src/hooks/useDonors', () => ({
  useDonors: () => mockUseDonors,
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
  mockUseEventById.event = null;
  mockUseEventById.loading = false;
  mockUseEventById.error = null;
  mockUseHelpers.helpers = [];
  mockUseHelpers.loading = false;
  mockUseHelpers.error = null;
  mockUseDonors.donors = [];
  mockUseDonors.loading = false;
  mockUseDonors.error = null;
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

describe('AdminPage Helfer tab (5dlVbOmf)', () => {
  it('hides the Helfer tab for non-admin users', () => {
    mockAuth.role = 'User';
    renderAdmin();
    expect(screen.queryByTestId('admin-tab-helpers')).not.toBeInTheDocument();
  });

  it('shows the Helfer tab for admins', () => {
    mockAuth.role = 'Admin';
    renderAdmin();
    expect(screen.getByTestId('admin-tab-helpers')).toBeInTheDocument();
    expect(screen.getByTestId('admin-tab-helpers')).toHaveTextContent('Helfer');
  });

  it('activates the Helfer tab when ?tab=helpers is in the URL', () => {
    mockAuth.role = 'Admin';
    renderAdmin(['/admin?tab=helpers']);
    expect(screen.getByTestId('admin-tab-helpers')).toHaveAttribute('aria-selected', 'true');
    const eventsPanel = document.getElementById('admin-tab-events');
    expect(eventsPanel).toHaveAttribute('hidden');
  });
});

describe('AdminPage Spender tab (5dlVbOmf)', () => {
  it('hides the Spender tab for non-admin users', () => {
    mockAuth.role = 'User';
    renderAdmin();
    expect(screen.queryByTestId('admin-tab-donors')).not.toBeInTheDocument();
  });

  it('shows the Spender tab for admins', () => {
    mockAuth.role = 'Admin';
    renderAdmin();
    expect(screen.getByTestId('admin-tab-donors')).toBeInTheDocument();
    expect(screen.getByTestId('admin-tab-donors')).toHaveTextContent('Spender');
  });

  it('activates the Spender tab when ?tab=donors is in the URL', () => {
    mockAuth.role = 'Admin';
    renderAdmin(['/admin?tab=donors']);
    expect(screen.getByTestId('admin-tab-donors')).toHaveAttribute('aria-selected', 'true');
    const eventsPanel = document.getElementById('admin-tab-events');
    expect(eventsPanel).toHaveAttribute('hidden');
  });
});

describe('AdminPage Review tab (dUWoE5vu)', () => {
  it('hides the Review tab for non-admin users', () => {
    mockAuth.role = 'User';
    mockUsePendingEvents.pendingEvents = [{ id: 'p1', title: 'Pending', status: 'pending' }];
    renderAdmin();
    expect(screen.queryByTestId('admin-tab-review')).not.toBeInTheDocument();
  });

  it('hides the Review tab for admins when there are no pending events', () => {
    mockAuth.role = 'Admin';
    mockUsePendingEvents.pendingEvents = [];
    renderAdmin();
    expect(screen.queryByTestId('admin-tab-review')).not.toBeInTheDocument();
  });

  it('shows the Review tab for admins when there are pending events', () => {
    mockAuth.role = 'Admin';
    mockUsePendingEvents.pendingEvents = [{ id: 'p1', title: 'Pending One', status: 'pending' }];
    renderAdmin();
    expect(screen.getByTestId('admin-tab-review')).toBeInTheDocument();
    expect(screen.getByTestId('admin-tab-review')).toHaveTextContent('Review');
  });

  it('shows a badge with the pending count on the Review tab', () => {
    mockAuth.role = 'Admin';
    mockUsePendingEvents.pendingEvents = [
      { id: 'p1', title: 'Pending One', status: 'pending' },
      { id: 'p2', title: 'Pending Two', status: 'pending' },
    ];
    renderAdmin();
    const badge = screen.getByTestId('admin-tab-review-badge');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent('2');
  });

  it('caps the Review tab badge at 9+', () => {
    mockAuth.role = 'Admin';
    mockUsePendingEvents.pendingEvents = Array.from({ length: 15 }, (_, i) => ({
      id: `p${i}`,
      title: `Pending ${i}`,
      status: 'pending',
    }));
    renderAdmin();
    expect(screen.getByTestId('admin-tab-review-badge')).toHaveTextContent('9+');
  });

  it('activates the Review tab when ?tab=review is in the URL and pending events exist', () => {
    mockAuth.role = 'Admin';
    mockUsePendingEvents.pendingEvents = [{ id: 'p1', title: 'Pending One', status: 'pending' }];
    renderAdmin(['/admin?tab=review']);
    const reviewPanel = document.getElementById('admin-tab-review');
    const eventsPanel = document.getElementById('admin-tab-events');
    expect(reviewPanel).not.toHaveAttribute('hidden');
    expect(eventsPanel).toHaveAttribute('hidden');
    expect(screen.getByTestId('admin-tab-review')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('admin-tab-events')).toHaveAttribute('aria-selected', 'false');
  });

  it('falls back to the Events tab when ?tab=review is requested but no pending events exist', () => {
    mockAuth.role = 'Admin';
    mockUsePendingEvents.pendingEvents = [];
    renderAdmin(['/admin?tab=review']);
    const eventsPanel = document.getElementById('admin-tab-events');
    expect(eventsPanel).not.toHaveAttribute('hidden');
    expect(screen.getByTestId('admin-tab-events')).toHaveAttribute('aria-selected', 'true');
  });
});

describe('AdminPage EventStatusMismatchBanner (hehX4tTc)', () => {
  it('does not show the banner when no event id is in the URL hash', () => {
    mockAuth.role = 'Admin';
    mockUsePendingEvents.pendingEvents = [{ id: 'p1', title: 'Pending', status: 'pending' }];
    mockUseEventById.event = { id: 'p1', title: 'Pending', status: 'pending' };
    renderAdmin(['/admin?tab=review']);
    expect(screen.queryByTestId('event-status-mismatch-banner')).not.toBeInTheDocument();
  });

  it('does not show the banner when the event is still pending', () => {
    mockAuth.role = 'Admin';
    mockUsePendingEvents.pendingEvents = [{ id: 'p1', title: 'Pending', status: 'pending' }];
    mockUseEventById.event = { id: 'p1', title: 'Pending', status: 'pending' };
    renderAdmin(['/admin?tab=review#p1']);
    expect(screen.queryByTestId('event-status-mismatch-banner')).not.toBeInTheDocument();
  });

  it('shows an "approved" banner with a link to the public event page when the event was approved in the meantime', () => {
    mockAuth.role = 'Admin';
    mockUsePendingEvents.pendingEvents = [];
    mockUseEventById.event = {
      id: 'p1',
      title: 'Yoga Workshop',
      slug: 'yoga-workshop',
      status: 'approved',
    };
    renderAdmin(['/admin?tab=review#p1']);
    const banner = screen.getByTestId('event-status-mismatch-banner');
    expect(banner).toBeInTheDocument();
    expect(banner.dataset.status).toBe('approved');
    expect(banner).toHaveTextContent('bereits freigegeben');
    expect(banner).toHaveTextContent('Yoga Workshop');
    const eventLink = banner.querySelector('a[href="/event/yoga-workshop"]');
    expect(eventLink).toBeInTheDocument();
    expect(eventLink).toHaveTextContent('Event ansehen');
    expect(banner.querySelector('a[href="/admin"]')).toBeInTheDocument();
  });

  it('shows a "trashed" banner with a link to the Papierkorb tab', () => {
    mockAuth.role = 'Admin';
    mockUseTrashedCount.count = 1;
    mockUsePendingEvents.pendingEvents = [];
    mockUseEventById.event = {
      id: 'p1',
      title: 'Yoga Workshop',
      slug: 'yoga-workshop',
      status: 'trashed',
    };
    renderAdmin(['/admin?tab=review#p1']);
    const banner = screen.getByTestId('event-status-mismatch-banner');
    expect(banner).toBeInTheDocument();
    expect(banner.dataset.status).toBe('trashed');
    expect(banner).toHaveTextContent('Papierkorb');
    const papierkorbLink = banner.querySelector('a[href="/admin?tab=trash"]');
    expect(papierkorbLink).toBeInTheDocument();
    expect(papierkorbLink).toHaveTextContent('Zum Papierkorb');
  });

  it('shows a "draft" banner with a link to the Entwürfe tab when the event was reverted to draft', () => {
    mockAuth.role = 'Admin';
    mockUseEvents.events = [{ id: 'p1', title: 'Yoga Workshop', status: 'draft' }];
    mockUsePendingEvents.pendingEvents = [];
    mockUseEventById.event = {
      id: 'p1',
      title: 'Yoga Workshop',
      slug: 'yoga-workshop',
      status: 'draft',
    };
    renderAdmin(['/admin?tab=review#p1']);
    const banner = screen.getByTestId('event-status-mismatch-banner');
    expect(banner).toBeInTheDocument();
    expect(banner.dataset.status).toBe('draft');
    expect(banner).toHaveTextContent('Entwurf');
    const draftsLink = banner.querySelector('a[href="/admin?tab=drafts"]');
    expect(draftsLink).toBeInTheDocument();
    expect(draftsLink).toHaveTextContent('Zu den Entwürfen');
  });

  it('shows a "missing" banner when the event no longer exists', () => {
    mockAuth.role = 'Admin';
    mockUsePendingEvents.pendingEvents = [];
    mockUseEventById.event = null;
    renderAdmin(['/admin?tab=review#deleted-id']);
    const banner = screen.getByTestId('event-status-mismatch-banner');
    expect(banner).toBeInTheDocument();
    expect(banner.dataset.status).toBe('missing');
    expect(banner).toHaveTextContent('nicht gefunden');
    expect(banner.querySelector('a[href="/admin"]')).toBeInTheDocument();
  });

  it('does not render anything while the event lookup is still loading', () => {
    mockAuth.role = 'Admin';
    mockUsePendingEvents.pendingEvents = [];
    mockUseEventById.event = null;
    mockUseEventById.loading = true;
    renderAdmin(['/admin?tab=review#p1']);
    expect(screen.queryByTestId('event-status-mismatch-banner')).not.toBeInTheDocument();
  });

  it('hides the banner and clears the hash when the dismiss button is clicked', async () => {
    mockAuth.role = 'Admin';
    mockUsePendingEvents.pendingEvents = [];
    mockUseEventById.event = {
      id: 'p1',
      title: 'Yoga Workshop',
      slug: 'yoga-workshop',
      status: 'approved',
    };
    renderAdmin(['/admin?tab=review#p1']);
    const banner = screen.getByTestId('event-status-mismatch-banner');
    expect(banner).toBeInTheDocument();
    const dismiss = screen.getByTestId('event-status-mismatch-banner-dismiss');
    await dismiss.click();
    expect(screen.queryByTestId('event-status-mismatch-banner')).not.toBeInTheDocument();
  });
});
