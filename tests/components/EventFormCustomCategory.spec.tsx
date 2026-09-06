import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import EventForm from '../../src/components/EventForm';

const mockAuth = vi.hoisted(() => ({
  user: { uid: 'admin-uid', email: 'admin@test.com' },
  role: 'Admin',
}));

const mockProfile = vi.hoisted(() => ({
  profile: null as Record<string, unknown> | null,
}));

const mockEvents = vi.hoisted(() => ({
  addEvent: vi.fn(async () => ({ id: 'new-id' })),
  updateEvent: vi.fn(async () => ({})),
  deleteEvent: vi.fn(async () => ({})),
  submitForReview: vi.fn(async () => ({})),
  revertToDraft: vi.fn(async () => ({})),
}));

vi.mock('../../src/hooks/useAuth', () => ({
  useAuth: () => ({ user: mockAuth.user, role: mockAuth.role }),
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
  uploadImage: vi.fn(async () => ''),
  deleteImageByUrl: vi.fn(async () => {}),
  getImageDimensions: vi.fn(async () => ({ width: 1200, height: 800 })),
  getAspectRatioRecommendation: vi.fn(() => ({ isRecommended: true })),
  MAX_INPUT_SIZE_BYTES: 5 * 1024 * 1024,
}));

beforeEach(() => {
  vi.clearAllMocks();
});

function renderEventForm() {
  return render(
    <MemoryRouter>
      <EventForm />
    </MemoryRouter>
  );
}

function getCategoryInput() {
  return document.querySelector('.kategorie__input');
}

describe('EventForm — custom category creation', () => {
  it('lets the user create a new category via the creatable select', async () => {
    renderEventForm();

    const input = getCategoryInput();
    fireEvent.change(input, { target: { value: 'Pilates' } });
    fireEvent.keyDown(input, { key: 'ArrowDown' });

    await waitFor(() => {
      expect(screen.getByText(/Pilates.*als neue Kategorie anlegen/)).toBeTruthy();
    });
  });

  it('normalizes the input: trims whitespace and capitalizes first letter', async () => {
    renderEventForm();

    const input = getCategoryInput();
    fireEvent.change(input, { target: { value: '  pilates  ' } });
    fireEvent.keyDown(input, { key: 'ArrowDown' });

    await waitFor(() => {
      expect(screen.getByText(/Pilates.*als neue Kategorie anlegen/)).toBeTruthy();
    });
  });

  it('rejects single-character input as not a valid new option', async () => {
    renderEventForm();

    const input = getCategoryInput();
    fireEvent.change(input, { target: { value: 'Q' } });
    fireEvent.keyDown(input, { key: 'ArrowDown' });

    await waitFor(() => {
      expect(screen.queryByText(/als neue Kategorie anlegen/)).toBeNull();
    });
  });

  it('does not offer to create a category that already exists (case-insensitive)', async () => {
    renderEventForm();

    const input = getCategoryInput();
    fireEvent.change(input, { target: { value: 'yoga' } });
    fireEvent.keyDown(input, { key: 'ArrowDown' });

    await waitFor(() => {
      expect(screen.queryByText(/als neue Kategorie anlegen/)).toBeNull();
    });
  });
});
