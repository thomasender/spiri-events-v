import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import EventList from '../../src/components/EventList';

const mockDeleteEvent = vi.hoisted(() => vi.fn());
const mockUpdateEvent = vi.hoisted(() => vi.fn());
const mockApproveEvent = vi.hoisted(() => vi.fn());

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
}));

const mockUsePendingEvents = vi.hoisted(() => ({
  pendingEvents: [],
  loading: false,
  approveEvent: mockApproveEvent,
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

describe('EventList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetNextUpcomingOccurrence.mockReturnValue(todayStr);
    mockGetOccurrenceCount.mockReturnValue(12);
    mockGetRecurrenceLabel.mockReturnValue('Jeden Donnerstag');
    mockUseEvents.events = [];
    mockUseEvents.loading = false;
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
});
