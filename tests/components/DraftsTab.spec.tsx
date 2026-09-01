import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import DraftsTab from '../../src/components/DraftsTab';

const mockDuplicateEvent = vi.hoisted(() => vi.fn());
const mockDeleteEvent = vi.hoisted(() => vi.fn());
const mockUpdateEvent = vi.hoisted(() => vi.fn());
const mockSubmitForReview = vi.hoisted(() => vi.fn());

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
  duplicateEvent: mockDuplicateEvent,
}));

const mockGetNextUpcomingOccurrence = vi.hoisted(() => vi.fn());
const mockGetOccurrenceCount = vi.hoisted(() => vi.fn());
const mockGetRecurrenceLabel = vi.hoisted(() => vi.fn());

vi.mock('../../src/hooks/useAuth', () => ({
  useAuth: () => mockAuth,
}));

vi.mock('../../src/hooks/useEvents', () => ({
  useEvents: () => mockUseEvents,
}));

vi.mock('../../src/utils/eventOccurrences', () => ({
  getNextUpcomingOccurrence: (...args) => mockGetNextUpcomingOccurrence(...args),
  getOccurrenceCount: (...args) => mockGetOccurrenceCount(...args),
  getRecurrenceLabel: (...args) => mockGetRecurrenceLabel(...args),
}));

const today = new Date();
today.setHours(12, 0, 0, 0);
const todayStr = today.toISOString().split('T')[0];

const draftEvent = {
  id: 'draft-1',
  title: 'My Draft Event',
  date: todayStr,
  time: '10:00',
  place: 'Studio A',
  bezirk: 'Bregenz',
  status: 'draft',
  contribution: 'free',
  recurrence: 'none',
};

const approvedEvent = {
  id: 'approved-1',
  title: 'Approved Event',
  date: todayStr,
  time: '10:00',
  place: 'Studio A',
  bezirk: 'Bregenz',
  status: 'approved',
  contribution: 'free',
  recurrence: 'none',
};

const pendingEvent = {
  id: 'pending-1',
  title: 'Pending Event',
  date: todayStr,
  time: '10:00',
  place: 'Studio A',
  bezirk: 'Bregenz',
  status: 'pending',
  contribution: 'free',
  recurrence: 'none',
};

describe('DraftsTab (Bslx5TQW)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetNextUpcomingOccurrence.mockReturnValue(todayStr);
    mockGetOccurrenceCount.mockReturnValue(12);
    mockGetRecurrenceLabel.mockReturnValue('Jeden Donnerstag');
    mockUseEvents.events = [];
    mockUseEvents.loading = false;
  });

  it('shows the empty state when the user has no drafts', () => {
    render(
      <MemoryRouter>
        <DraftsTab />
      </MemoryRouter>
    );

    expect(screen.getByText('Keine Entwürfe')).toBeInTheDocument();
    expect(screen.getByTestId('drafts-empty-state')).toBeInTheDocument();
  });

  it('renders only draft events and ignores approved/pending', () => {
    mockUseEvents.events = [draftEvent, approvedEvent, pendingEvent];

    render(
      <MemoryRouter>
        <DraftsTab />
      </MemoryRouter>
    );

    expect(screen.getByText('My Draft Event')).toBeInTheDocument();
    expect(screen.queryByText('Approved Event')).not.toBeInTheDocument();
    expect(screen.queryByText('Pending Event')).not.toBeInTheDocument();
  });

  it('shows the Entwurf badge and Duplizieren + Einreichen buttons on every draft card', () => {
    mockUseEvents.events = [draftEvent];

    render(
      <MemoryRouter>
        <DraftsTab />
      </MemoryRouter>
    );

    expect(screen.getByText('Entwurf')).toBeInTheDocument();
    expect(screen.getByTestId('duplicate-event-button')).toBeInTheDocument();
    expect(screen.getByTestId('submit-draft-button')).toBeInTheDocument();
  });

  it('shows the draft count in the section header', () => {
    mockUseEvents.events = [
      { ...draftEvent, id: 'd1', date: '2099-01-01' },
      { ...draftEvent, id: 'd2', date: '2099-02-01' },
      { ...draftEvent, id: 'd3', date: '2099-03-01' },
    ];

    render(
      <MemoryRouter>
        <DraftsTab />
      </MemoryRouter>
    );

    expect(screen.getByText('3 Entwürfe')).toBeInTheDocument();
  });

  it('uses singular "1 Entwurf" when exactly one draft exists', () => {
    mockUseEvents.events = [draftEvent];

    render(
      <MemoryRouter>
        <DraftsTab />
      </MemoryRouter>
    );

    expect(screen.getByText('1 Entwurf')).toBeInTheDocument();
  });

  it('calls duplicateEvent when the Duplizieren button is clicked', () => {
    mockUseEvents.events = [draftEvent];

    render(
      <MemoryRouter>
        <DraftsTab />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByTestId('duplicate-event-button'));

    expect(mockDuplicateEvent).toHaveBeenCalledTimes(1);
    expect(mockDuplicateEvent).toHaveBeenCalledWith('draft-1');
  });

  it('does NOT show a success dialog after duplicating a draft (VPCvHJKg)', async () => {
    mockDuplicateEvent.mockResolvedValue('new-event-id');
    mockUseEvents.events = [draftEvent];

    render(
      <MemoryRouter>
        <DraftsTab />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByTestId('duplicate-event-button'));

    await waitFor(() => {
      expect(mockDuplicateEvent).toHaveBeenCalledWith('draft-1');
    });

    expect(screen.queryByTestId('success-dialog')).not.toBeInTheDocument();
  });

  it('clears the duplicating spinner after the duplicate resolves', async () => {
    mockDuplicateEvent.mockResolvedValue('new-event-id');
    mockUseEvents.events = [draftEvent];

    render(
      <MemoryRouter>
        <DraftsTab />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByTestId('duplicate-event-button'));

    await waitFor(() => {
      expect(mockDuplicateEvent).toHaveBeenCalledTimes(1);
    });

    expect(screen.getByTestId('duplicate-event-button')).toHaveAttribute('title', 'Duplizieren');
    expect(screen.getByTestId('duplicate-event-button')).not.toBeDisabled();
  });

  it('opens the submit confirmation dialog when Einreichen is clicked', () => {
    mockUseEvents.events = [draftEvent];

    render(
      <MemoryRouter>
        <DraftsTab />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByTestId('submit-draft-button'));

    expect(screen.getByText('Entwurf einreichen')).toBeInTheDocument();
  });

  it('opens the delete confirmation dialog when the trash icon is clicked', () => {
    mockUseEvents.events = [draftEvent];

    render(
      <MemoryRouter>
        <DraftsTab />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: /event löschen/i }));

    expect(screen.getByText('Entwurf löschen')).toBeInTheDocument();
  });

  it('calls deleteEvent when delete is confirmed', async () => {
    mockDeleteEvent.mockResolvedValue(undefined);
    mockUseEvents.events = [draftEvent];

    render(
      <MemoryRouter>
        <DraftsTab />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: /event löschen/i }));

    const dialog = await screen.findByText('Entwurf löschen');
    const dialogRoot = dialog.closest('.confirm-dialog');
    const confirmButton = dialogRoot.querySelector('.confirm-confirm');
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(mockDeleteEvent).toHaveBeenCalledWith('draft-1');
    });
  });

  it('renders a loading spinner while loading', () => {
    mockUseEvents.loading = true;

    const { container } = render(
      <MemoryRouter>
        <DraftsTab />
      </MemoryRouter>
    );

    expect(container.querySelector('.loading-spinner')).toBeInTheDocument();
  });

  it('does NOT show the Zu Entwurf button on drafts (it is for pending events)', () => {
    mockUseEvents.events = [draftEvent];

    render(
      <MemoryRouter>
        <DraftsTab />
      </MemoryRouter>
    );

    expect(screen.queryByTestId('revert-to-draft-button')).not.toBeInTheDocument();
  });

  it('does NOT show a Genehmigen button on drafts (no approval flow from drafts)', () => {
    mockUseEvents.events = [draftEvent];

    render(
      <MemoryRouter>
        <DraftsTab />
      </MemoryRouter>
    );

    expect(screen.queryByRole('button', { name: /genehmigen/i })).not.toBeInTheDocument();
  });

  it('renders drafts as list rows, not cards (sosoEwss)', () => {
    mockUseEvents.events = [draftEvent];

    render(
      <MemoryRouter>
        <DraftsTab />
      </MemoryRouter>
    );

    expect(document.querySelector('.event-list-rows')).toBeInTheDocument();
    expect(document.querySelector('.event-card-content')).toBeInTheDocument();
    expect(document.querySelector('.event-card-actions')).toBeInTheDocument();
  });

  it('does not render the card/list view toggle anymore (sosoEwss)', () => {
    mockUseEvents.events = [draftEvent];

    render(
      <MemoryRouter>
        <DraftsTab />
      </MemoryRouter>
    );

    expect(screen.queryByTestId('drafts-view-toggle-card')).not.toBeInTheDocument();
    expect(screen.queryByTestId('drafts-view-toggle-list')).not.toBeInTheDocument();
  });

  it('does not render the price badge on draft rows in Entwürfe (sosoEwss)', () => {
    mockUseEvents.events = [draftEvent];

    render(
      <MemoryRouter>
        <DraftsTab />
      </MemoryRouter>
    );

    expect(screen.queryByText(/kostenlos/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/freie spende/i)).not.toBeInTheDocument();
  });
});
