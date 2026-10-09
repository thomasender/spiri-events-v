import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// Editing an existing (also old) event: the organizer can opt in to Instagram,
// pick the Instagram photo, and changing only these settings keeps an
// approved event approved and public (no new admin approval).

const mockAuth = vi.hoisted(() => ({
  user: { uid: 'owner-uid', email: 'owner@test.local' } as { uid: string; email: string },
  role: null as string | null,
}));

const mockEvents = vi.hoisted(() => ({
  addEvent: vi.fn(async () => ({})),
  updateEvent: vi.fn(async () => ({})),
  deleteEvent: vi.fn(async () => {}),
  submitForReview: vi.fn(async () => {}),
  revertToDraft: vi.fn(async () => {}),
}));

vi.mock('../../src/hooks/useAuth', () => ({
  useAuth: () => ({ user: mockAuth.user, role: mockAuth.role }),
}));

vi.mock('../../src/hooks/useProfile', () => ({
  useProfile: () => ({ profile: null }),
}));

vi.mock('../../src/hooks/useEvents', () => ({
  useEvents: () => mockEvents,
  useAllEvents: () => ({ events: [], loading: false, error: null }),
  KATEGORIEN: ['Yoga', 'Sonstiges'],
  BEZIRKE: ['Bregenz', 'Dornbirn', 'Feldkirch', 'Bludenz', 'Grenznahe'],
}));

vi.mock('../../src/hooks/useCategories', () => ({
  useCategories: () => ['Yoga', 'Sonstiges'],
}));

vi.mock('../../src/lib/imageUpload', () => ({
  uploadImage: vi.fn(async () => 'https://example.com/uploaded.jpg'),
  deleteImageByUrl: vi.fn(async () => {}),
  getImageDimensions: vi.fn(async () => ({ width: 1200, height: 800 })),
  getAspectRatioRecommendation: vi.fn(() => ({ isRecommended: true })),
  MAX_INPUT_SIZE_BYTES: 5 * 1024 * 1024,
}));

import EventForm from '../../src/components/EventForm';

const COVER_URL = 'https://example.com/cover.jpg';

// An old approved event: created before the Instagram fields existed.
const oldApprovedEvent = {
  id: 'old-event',
  slug: 'old-event-slug',
  title: 'Altes Event',
  date: '2026-12-10',
  time: '10:00',
  endTime: '',
  place: 'Ort',
  contribution: 'free',
  fee: null,
  description: '<p>desc</p>',
  link: '',
  recurrence: 'none',
  recurrenceEndDate: '',
  category: 'Yoga',
  bezirk: 'Bregenz',
  organizer: { firstName: 'A', lastName: 'B', email: 'owner@test.local' },
  kontakt: 'owner@test.local',
  status: 'approved',
  imageUrl: COVER_URL,
  createdBy: 'owner-uid',
};

// jsdom wrongly flags the zoom slider (step 0.05) as stepMismatch, which makes
// a button click skip the form submit; real browsers never do that for range
// inputs, so submit the form directly.
function submitForm() {
  fireEvent.submit(screen.getByTestId('submit-event-button').closest('form') as HTMLFormElement);
}

function renderForm(event: Record<string, unknown>) {
  return render(
    <MemoryRouter>
      <EventForm event={event} />
    </MemoryRouter>
  );
}

beforeEach(() => {
  mockAuth.user = { uid: 'owner-uid', email: 'owner@test.local' };
  mockAuth.role = null;
  mockEvents.updateEvent.mockClear();
});

describe('EventForm — Instagram settings on existing events', () => {
  it('lets the owner of an old event opt in and pick a photo without re-approval', async () => {
    renderForm(oldApprovedEvent);

    expect(screen.queryByTestId('instagram-image-accordion')).toBeNull();
    fireEvent.click(screen.getByTestId('instagram-consent-checkbox'));
    expect(screen.getByTestId('instagram-image-accordion')).toBeTruthy();
    expect(screen.getByTestId('instagram-upload-button')).toBeTruthy();

    submitForm();

    await waitFor(() => expect(mockEvents.updateEvent).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('Event erneut einreichen')).toBeNull();
    const [id, payload] = mockEvents.updateEvent.mock.calls[0] as unknown as [
      string,
      Record<string, unknown>,
    ];
    expect(id).toBe('old-event');
    expect(payload.status).toBe('approved');
    expect(payload.instagramConsent).toBe(true);
    expect(payload).not.toHaveProperty('slug');
    expect((payload.instagramImage as { url: string }).url).toBe(COVER_URL);
  });

  it('keeps a previously uploaded extra Instagram photo when saving', async () => {
    const extra = 'https://example.com/extra-portrait.jpg';
    renderForm({
      ...oldApprovedEvent,
      instagramConsent: true,
      instagramImage: { url: extra, focalPoint: { x: 0.5, y: 0.3 }, zoom: 2 },
    });

    submitForm();

    await waitFor(() => expect(mockEvents.updateEvent).toHaveBeenCalledTimes(1));
    const payload = (mockEvents.updateEvent.mock.calls[0] as unknown as unknown[])[1] as Record<
      string,
      unknown
    >;
    expect(payload.status).toBe('approved');
    expect(payload.instagramImage).toEqual({
      url: extra,
      focalPoint: { x: 0.5, y: 0.3 },
      zoom: 2,
    });
  });

  it('still asks for re-approval when the owner changes other event details', async () => {
    renderForm(oldApprovedEvent);

    fireEvent.change(screen.getByLabelText('Titel *'), { target: { value: 'Neuer Titel' } });
    submitForm();

    expect(await screen.findByText('Event erneut einreichen')).toBeTruthy();
    expect(mockEvents.updateEvent).not.toHaveBeenCalled();
  });
});
