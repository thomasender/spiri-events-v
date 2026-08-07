import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import EventList from '../../src/components/EventList';

const mockDeleteEvent = vi.hoisted(() => vi.fn());
const mockUpdateEvent = vi.hoisted(() => vi.fn());
const mockApproveEvent = vi.hoisted(() => vi.fn());
const mockSubmitForReview = vi.hoisted(() => vi.fn());
const mockRevertToDraft = vi.hoisted(() => vi.fn());

const mockAuth = vi.hoisted(() => ({
  user: { uid: 'test-uid' },
  role: null,
  loading: false,
}));

const mockUseEvents = vi.hoisted(() => ({
  events: [],
  loading: false,
  deleteEvent: mockDeleteEvent,
  updateEvent: mockUpdateEvent,
  submitForReview: mockSubmitForReview,
  revertToDraft: mockRevertToDraft,
}));

const mockUsePendingEvents = vi.hoisted(() => ({
  pendingEvents: [],
  loading: false,
  approveEvent: mockApproveEvent,
}));

const mockUseEventsWithMessages = vi.hoisted(() => ({
  events: [] as Array<{ id: string }>,
  unreadCountByEvent: {} as Record<string, number>,
  loading: false,
}));

const mockGetNextUpcomingOccurrence = vi.hoisted(() => vi.fn());
const mockGetOccurrenceCount = vi.hoisted(() => vi.fn());
const mockGetRecurrenceLabel = vi.hoisted(() => vi.fn());
const mockGetEventOccurrences = vi.hoisted(() => vi.fn());

vi.mock('../../src/hooks/useAuth', () => ({
  useAuth: () => mockAuth,
}));

vi.mock('../../src/hooks/useEvents', () => ({
  useEvents: () => mockUseEvents,
  usePendingEvents: () => mockUsePendingEvents,
}));

vi.mock('../../src/hooks/useEventsWithMessages', () => ({
  useEventsWithMessages: () => mockUseEventsWithMessages,
}));

vi.mock('../../src/utils/eventOccurrences', () => ({
  getNextUpcomingOccurrence: (...args) => mockGetNextUpcomingOccurrence(...args),
  getOccurrenceCount: (...args) => mockGetOccurrenceCount(...args),
  getRecurrenceLabel: (...args) => mockGetRecurrenceLabel(...args),
  getEventOccurrences: (...args) => mockGetEventOccurrences(...args),
}));

const today = new Date();
today.setHours(12, 0, 0, 0);
const todayStr = today.toISOString().split('T')[0];

const singleEvent = {
  id: 'single-1',
  title: 'Single Yoga Class',
  date: todayStr,
  time: '10:00',
  place: 'Studio A',
  bezirk: 'Bregenz',
  status: 'approved',
  contribution: 'free',
  recurrence: 'none',
};

const recurringEvent = {
  id: 'recurring-1',
  title: 'Weekly Yoga Series',
  date: todayStr,
  time: '10:00',
  place: 'Studio A',
  bezirk: 'Bregenz',
  status: 'approved',
  contribution: 'free',
  recurrence: 'weekly',
  recurrenceEndDate: '2027-12-31',
};

const draftEvent = {
  id: 'draft-1',
  title: 'Draft Yoga Class',
  date: todayStr,
  time: '10:00',
  place: 'Studio A',
  bezirk: 'Bregenz',
  status: 'draft',
  contribution: 'free',
  recurrence: 'none',
};

const pendingEvent = {
  id: 'pending-1',
  title: 'Pending Yoga Class',
  date: todayStr,
  time: '10:00',
  place: 'Studio A',
  bezirk: 'Bregenz',
  status: 'pending',
  contribution: 'free',
  recurrence: 'none',
};

describe('EventList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetNextUpcomingOccurrence.mockReturnValue(todayStr);
    mockGetOccurrenceCount.mockReturnValue(12);
    mockGetRecurrenceLabel.mockReturnValue('Jeden Donnerstag');
    mockUseEvents.events = [];
    mockUseEvents.loading = false;
    mockUseEventsWithMessages.events = [];
    mockUseEventsWithMessages.unreadCountByEvent = {};
    mockUseEventsWithMessages.loading = false;
  });

  it('renders empty state when no events', () => {
    render(
      <MemoryRouter>
        <EventList />
      </MemoryRouter>
    );
    expect(screen.getByText(/noch keine events/i)).toBeInTheDocument();
  });

  it('shows recurring badge for recurring events', () => {
    mockUseEvents.events = [recurringEvent];

    render(
      <MemoryRouter>
        <EventList />
      </MemoryRouter>
    );

    expect(screen.getByText('Serie')).toBeInTheDocument();
  });

  it('does not show recurring badge for non-recurring events', () => {
    mockUseEvents.events = [singleEvent];

    render(
      <MemoryRouter>
        <EventList />
      </MemoryRouter>
    );

    expect(screen.queryByText('Serie')).not.toBeInTheDocument();
  });

  it('shows Serie bearbeiten button for recurring events', () => {
    mockUseEvents.events = [recurringEvent];

    render(
      <MemoryRouter>
        <EventList />
      </MemoryRouter>
    );

    expect(screen.getByText('Serie bearbeiten')).toBeInTheDocument();
  });

  it('shows Bearbeiten button for non-recurring events', () => {
    mockUseEvents.events = [singleEvent];

    render(
      <MemoryRouter>
        <EventList />
      </MemoryRouter>
    );

    expect(screen.getByText('Bearbeiten')).toBeInTheDocument();
  });

  it('Ansehen link contains occurrenceDate for recurring events', () => {
    mockUseEvents.events = [recurringEvent];

    render(
      <MemoryRouter>
        <EventList />
      </MemoryRouter>
    );

    const ansehenLink = screen.getByRole('link', { name: /ansehen/i });
    expect(ansehenLink.href).toContain('occurrenceDate=');
  });

  it('Ansehen link does not contain occurrenceDate for non-recurring events', () => {
    mockUseEvents.events = [singleEvent];

    render(
      <MemoryRouter>
        <EventList />
      </MemoryRouter>
    );

    const ansehenLink = screen.getByRole('link', { name: /ansehen/i });
    expect(ansehenLink.href).not.toContain('occurrenceDate=');
  });

  it('renders Entwurf status badge and Einreichen button for a draft event', () => {
    mockUseEvents.events = [draftEvent];

    render(
      <MemoryRouter>
        <EventList />
      </MemoryRouter>
    );

    expect(screen.getByText('Entwurf')).toBeInTheDocument();
    expect(screen.getByTestId('submit-draft-button')).toBeInTheDocument();
  });

  it('renders Zu Entwurf button for a pending event owned by current user (non-admin)', () => {
    mockAuth.role = null;
    mockUseEvents.events = [pendingEvent];

    render(
      <MemoryRouter>
        <EventList />
      </MemoryRouter>
    );

    expect(screen.getByTestId('revert-to-draft-button')).toBeInTheDocument();
  });

  it('admin does NOT see drafts in their Meine Events list', () => {
    mockAuth.role = 'Admin';
    mockAuth.user = { uid: 'admin-uid' };
    mockUseEvents.events = [{ ...draftEvent, createdBy: 'admin-uid' }];

    render(
      <MemoryRouter>
        <EventList />
      </MemoryRouter>
    );

    expect(screen.queryByText('Draft Yoga Class')).not.toBeInTheDocument();
    expect(screen.queryByTestId('submit-draft-button')).not.toBeInTheDocument();

    mockAuth.role = null;
    mockAuth.user = { uid: 'test-uid' };
  });

  it('shows status filter dropdown for non-admin user', () => {
    mockAuth.role = null;
    mockUseEvents.events = [singleEvent];

    render(
      <MemoryRouter>
        <EventList />
      </MemoryRouter>
    );

    expect(screen.getByTestId('status-filter')).toBeInTheDocument();
    const options = screen.getAllByRole('option').map((opt) => opt.textContent);
    expect(options).toEqual(
      expect.arrayContaining(['Alle', 'Entwürfe', 'Ausstehend', 'Genehmigt'])
    );
  });

  it('status filter dropdown does NOT include Entwürfe option for admin', () => {
    mockAuth.role = 'Admin';
    mockAuth.user = { uid: 'admin-uid' };
    mockUseEvents.events = [];

    render(
      <MemoryRouter>
        <EventList />
      </MemoryRouter>
    );

    const statusFilter = screen.queryByTestId('status-filter');
    if (statusFilter) {
      const options = screen.getAllByRole('option').map((opt) => opt.textContent);
      expect(options).not.toContain('Entwürfe');
    }

    mockAuth.role = null;
    mockAuth.user = { uid: 'test-uid' };
  });

  it('clicking submit-draft-button opens the submit confirmation dialog', () => {
    mockUseEvents.events = [draftEvent];

    render(
      <MemoryRouter>
        <EventList />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByTestId('submit-draft-button'));

    expect(screen.getByText('Event einreichen')).toBeInTheDocument();
  });

  it('shows an unread indicator on an event card when it has unread messages', () => {
    mockUseEvents.events = [pendingEvent];
    mockUseEventsWithMessages.unreadCountByEvent = { [pendingEvent.id]: 2 };

    render(
      <MemoryRouter>
        <EventList />
      </MemoryRouter>
    );

    const indicator = screen.getByTestId('event-card-unread-indicator');
    expect(indicator).toBeInTheDocument();
    expect(indicator).toHaveAttribute('aria-label', '2 ungelesene Nachrichten');
  });

  it('does not show an unread indicator when the event has no unread messages', () => {
    mockUseEvents.events = [pendingEvent];
    mockUseEventsWithMessages.unreadCountByEvent = { [pendingEvent.id]: 0 };

    render(
      <MemoryRouter>
        <EventList />
      </MemoryRouter>
    );

    expect(screen.queryByTestId('event-card-unread-indicator')).not.toBeInTheDocument();
  });

  it('does not show an unread indicator when the event has no entry in the unread map', () => {
    mockUseEvents.events = [pendingEvent];

    render(
      <MemoryRouter>
        <EventList />
      </MemoryRouter>
    );

    expect(screen.queryByTestId('event-card-unread-indicator')).not.toBeInTheDocument();
  });
});
