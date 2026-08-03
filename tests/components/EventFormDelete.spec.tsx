import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const mockAuth = vi.hoisted(() => ({
  user: null as { uid: string } | null,
  role: null as string | null,
}));

const mockEvents = vi.hoisted(() => ({
  addEvent: vi.fn(async () => ({})),
  updateEvent: vi.fn(async () => ({})),
  deleteEvent: vi.fn(async () => {}),
}));

vi.mock('../../src/hooks/useAuth', () => ({
  useAuth: () => ({
    user: mockAuth.user,
    role: mockAuth.role,
  }),
}));

vi.mock('../../src/hooks/useEvents', () => ({
  useEvents: () => mockEvents,
  KATEGORIEN: ['Yoga', 'Meditation', 'Tanz', 'Singen', 'Atemarbeit', 'Sonstiges'],
  BEZIRKE: ['Bregenz', 'Dornbirn', 'Feldkirch', 'Bludenz', 'Grenznahe'],
}));

vi.mock('../../src/lib/imageUpload', () => ({
  uploadImage: vi.fn(async () => 'https://example.com/test.jpg'),
  deleteImageByUrl: vi.fn(async () => {}),
  getImageDimensions: vi.fn(async () => ({ width: 1200, height: 800 })),
  getAspectRatioRecommendation: vi.fn(() => ({ isRecommended: true })),
  MAX_INPUT_SIZE_BYTES: 5 * 1024 * 1024,
}));

const baseEvent = {
  id: 'event-x',
  title: 'Test Event',
  date: '2026-08-10',
  endDate: null,
  time: '10:00',
  endTime: '11:00',
  place: 'Test Place',
  contribution: 'free',
  fee: null,
  description: 'desc',
  link: '',
  recurrence: 'none',
  recurrenceEndDate: '',
  categories: ['Yoga'],
  bezirk: 'Bregenz',
  organizer: { firstName: 'A', lastName: 'B', email: 'a@b.c' },
  kontakt: '0676 1234567',
  status: 'approved',
  imageUrl: null,
  createdBy: 'owner-uid',
};

beforeEach(() => {
  mockAuth.user = null;
  mockAuth.role = null;
  mockEvents.addEvent.mockClear();
  mockEvents.updateEvent.mockClear();
  mockEvents.deleteEvent.mockClear();
});

import EventForm from '../../src/components/EventForm';

describe('EventForm — delete button visibility', () => {
  it('shows the delete button for the event owner in edit mode', () => {
    mockAuth.user = { uid: 'owner-uid' };
    mockAuth.role = null;

    render(
      <MemoryRouter>
        <EventForm event={baseEvent} />
      </MemoryRouter>
    );

    expect(screen.getByTestId('delete-event-from-form-button')).toBeInTheDocument();
  });

  it('shows the delete button for an admin even on a foreign event in edit mode', () => {
    mockAuth.user = { uid: 'admin-uid' };
    mockAuth.role = 'Admin';

    render(
      <MemoryRouter>
        <EventForm event={baseEvent} />
      </MemoryRouter>
    );

    expect(screen.getByTestId('delete-event-from-form-button')).toBeInTheDocument();
  });

  it('hides the delete button for a non-admin non-owner user in edit mode', () => {
    mockAuth.user = { uid: 'random-user-uid' };
    mockAuth.role = null;

    render(
      <MemoryRouter>
        <EventForm event={baseEvent} />
      </MemoryRouter>
    );

    expect(screen.queryByTestId('delete-event-from-form-button')).toBeNull();
  });

  it('hides the delete button in create mode (no event prop) even for admins', () => {
    mockAuth.user = { uid: 'admin-uid' };
    mockAuth.role = 'Admin';

    render(
      <MemoryRouter>
        <EventForm />
      </MemoryRouter>
    );

    expect(screen.queryByTestId('delete-event-from-form-button')).toBeNull();
  });
});

describe('EventForm — delete flow', () => {
  it('opens the confirm dialog, calls deleteEvent on confirm, and skips save', async () => {
    mockAuth.user = { uid: 'admin-uid' };
    mockAuth.role = 'Admin';

    render(
      <MemoryRouter>
        <EventForm event={baseEvent} />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByTestId('delete-event-from-form-button'));

    expect(
      await screen.findByText(/möchtest du dieses event wirklich löschen\?/i)
    ).toBeInTheDocument();

    const confirmButton = screen.getByRole('button', { name: /^löschen$/i });
    await fireEvent.click(confirmButton);

    expect(mockEvents.deleteEvent).toHaveBeenCalledWith('event-x');
    expect(mockEvents.updateEvent).not.toHaveBeenCalled();
  });
});
