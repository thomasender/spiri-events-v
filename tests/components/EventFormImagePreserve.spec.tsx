import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const mockAuth = vi.hoisted(() => ({
  user: null as { uid: string } | null,
  role: null as string | null,
}));

const mockProfile = vi.hoisted(() => ({
  profile: null as Record<string, unknown> | null,
}));

const mockEvents = vi.hoisted(() => ({
  addEvent: vi.fn(async () => ({})),
  updateEvent: vi.fn(async () => ({})),
  deleteEvent: vi.fn(async () => {}),
  submitForReview: vi.fn(async () => {}),
  revertToDraft: vi.fn(async () => {}),
}));

vi.mock('../../src/hooks/useAuth', () => ({
  useAuth: () => ({
    user: mockAuth.user,
    role: mockAuth.role,
  }),
}));

vi.mock('../../src/hooks/useProfile', () => ({
  useProfile: () => ({ profile: mockProfile.profile }),
}));

vi.mock('../../src/hooks/useEvents', () => ({
  useEvents: () => mockEvents,
  KATEGORIEN: ['Yoga', 'Breathwork', 'Meditation', 'Tanz', 'Singen', 'Soundhealing', 'Sonstiges'],
  BEZIRKE: ['Bregenz', 'Dornbirn', 'Feldkirch', 'Bludenz', 'Grenznahe'],
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
  uploadImage: vi.fn(async () => 'https://example.com/brand-new-image.jpg'),
  deleteImageByUrl: vi.fn(async () => {}),
  getImageDimensions: vi.fn(async () => ({ width: 1200, height: 800 })),
  getAspectRatioRecommendation: vi.fn(() => ({ isRecommended: true })),
  MAX_INPUT_SIZE_BYTES: 5 * 1024 * 1024,
}));

import EventForm from '../../src/components/EventForm';

const EXISTING_IMAGE_URL =
  'https://firebasestorage.googleapis.com/v0/b/test.appspot.com/o/events%2Fevent-with-picture%2Foriginal.jpg';

const baseEvent = {
  id: 'event-with-picture',
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
  imageUrl: EXISTING_IMAGE_URL,
  createdBy: 'owner-uid',
};

beforeEach(() => {
  mockAuth.user = { uid: 'admin-uid' };
  mockAuth.role = 'Admin';
  mockProfile.profile = null;
  mockEvents.addEvent.mockClear();
  mockEvents.updateEvent.mockClear();
  mockEvents.deleteEvent.mockClear();
});

describe('EventForm — image preservation on edit (6bs5MvXI)', () => {
  it('preserves the existing imageUrl when editing without touching the picture', async () => {
    render(
      <MemoryRouter>
        <EventForm event={baseEvent} />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: /änderungen speichern/i }));

    await vi.waitFor(() => {
      expect(mockEvents.updateEvent).toHaveBeenCalledTimes(1);
    });

    const payload = mockEvents.updateEvent.mock.calls[0][1];
    expect(payload.imageUrl).toBe(EXISTING_IMAGE_URL);
  });

  it('sets imageUrl to null when the user removes the picture and saves', async () => {
    render(
      <MemoryRouter>
        <EventForm event={baseEvent} />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: /bild entfernen/i }));

    fireEvent.click(screen.getByRole('button', { name: /änderungen speichern/i }));

    await vi.waitFor(() => {
      expect(mockEvents.updateEvent).toHaveBeenCalledTimes(1);
    });

    const payload = mockEvents.updateEvent.mock.calls[0][1];
    expect(payload.imageUrl).toBeNull();
  });
});
