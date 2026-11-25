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
  useAllEvents: () => ({ events: [], loading: false, error: null }),
  KATEGORIEN: ['Yoga', 'Breathwork', 'Meditation', 'Tanz', 'Singen', 'Soundhealing', 'Sonstiges'],
  BEZIRKE: ['Bregenz', 'Dornbirn', 'Feldkirch', 'Bludenz', 'Grenznahe'],
}));

// No real Firestore listener (its late connection error used to be logged
// after the worker closed, an unhandled error of the whole run).
vi.mock('../../src/hooks/useProfile', () => ({
  useProfile: () => ({ profile: null }),
}));

vi.mock('../../src/hooks/useOrganizerProfile', () => ({
  useOrganizerProfile: () => ({ profile: null }),
}));

vi.mock('../../src/hooks/useCategories', () => ({
  useCategories: () => [
    'Yoga',
    'Breathwork',
    'Meditation',
    'Tanz',
    'Singen',
    'Soundhealing',
    'Sonstiges',
  ],
}));

vi.mock('../../src/lib/imageUpload', () => ({
  uploadImage: vi.fn(async () => 'https://example.com/test.jpg'),
  uploadEventCover: vi.fn(async () => ({ url: 'https://example.com/test.jpg', thumbUrl: null })),
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
  category: 'Yoga',
  bezirk: 'Bregenz',
  organizer: { firstName: 'A', lastName: 'B', email: 'a@b.c' },
  kontakt: '0676 1234567',
  status: 'approved',
  imageUrl: null,
  createdBy: 'owner-uid',
};

beforeEach(() => {
  mockAuth.user = { uid: 'admin-uid' };
  mockAuth.role = 'Admin';
});

import EventForm from '../../src/components/EventForm';

// "Keine Angabe" (no price stated) exists only for imported events: it is shown while editing such an
// event so the state is visible, and never offered when creating or editing a normal event.
describe('EventForm: price "Keine Angabe"', () => {
  it('shows the option, checked, for an imported event without a price', () => {
    render(
      <MemoryRouter>
        <EventForm event={{ ...baseEvent, contribution: 'unspecified' }} />
      </MemoryRouter>
    );
    expect(screen.getByLabelText('Keine Angabe')).toBeChecked();
  });

  it('does not offer it for a normal event', () => {
    render(
      <MemoryRouter>
        <EventForm event={baseEvent} />
      </MemoryRouter>
    );
    expect(screen.queryByLabelText('Keine Angabe')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Kostenlos')).toBeChecked();
  });

  it('does not offer it when creating an event', () => {
    render(
      <MemoryRouter>
        <EventForm />
      </MemoryRouter>
    );
    expect(screen.queryByLabelText('Keine Angabe')).not.toBeInTheDocument();
  });
});
