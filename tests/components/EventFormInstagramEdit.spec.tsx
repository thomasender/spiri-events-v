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

// The signed-in user's own (private) profile and the creator's public profile
// (the only one an admin can read for someone else's event).
const mockProfiles = vi.hoisted(() => ({
  own: null as Record<string, unknown> | null,
  organizerPublic: null as Record<string, unknown> | null,
  organizerUids: [] as Array<string | null>,
}));

vi.mock('../../src/hooks/useProfile', () => ({
  useProfile: () => ({ profile: mockProfiles.own }),
}));

vi.mock('../../src/hooks/useOrganizerProfile', () => ({
  useOrganizerProfile: (uid: string | null) => {
    mockProfiles.organizerUids.push(uid);
    return { profile: uid ? mockProfiles.organizerPublic : null };
  },
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
  uploadEventCover: vi.fn(async () => ({
    url: 'https://example.com/uploaded.jpg',
    thumbUrl: null,
  })),
  deleteImageByUrl: vi.fn(async () => {}),
  getImageDimensions: vi.fn(async () => ({ width: 1200, height: 800 })),
  getAspectRatioRecommendation: vi.fn(() => ({ isRecommended: true })),
  MAX_INPUT_SIZE_BYTES: 5 * 1024 * 1024,
}));

vi.mock('../../src/components/RichTextEditorLazy', () => ({
  default: ({ value, onChange }: { value: string; onChange: (html: string) => void }) => (
    <textarea
      data-testid="description-editor"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
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
  city: 'Bregenz',
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
  mockProfiles.own = null;
  mockProfiles.organizerPublic = null;
  mockProfiles.organizerUids = [];
});

describe("EventForm — Instagram handle belongs to the event's creator", () => {
  const consentedEvent = { ...oldApprovedEvent, instagramConsent: true };
  const signInAsAdmin = () => {
    mockAuth.user = { uid: 'admin-uid', email: 'admin@test.local' };
    mockAuth.role = 'Admin';
    mockProfiles.own = { socialMedia: { instagram: '@the_admin' } };
  };

  async function savedPayload() {
    submitForm();
    await waitFor(() => expect(mockEvents.updateEvent).toHaveBeenCalledTimes(1));
    return (mockEvents.updateEvent.mock.calls[0] as unknown as unknown[])[1] as Record<
      string,
      unknown
    >;
  }

  it("admin editing a user's event sees the organizer's handle, not their own", async () => {
    signInAsAdmin();
    mockProfiles.organizerPublic = { socialMedia: { instagram: '@the_organizer' } };
    renderForm(consentedEvent);

    expect(mockProfiles.organizerUids).toContain('owner-uid');
    expect(screen.getByTestId('instagram-handle-text').textContent).toBe('@the_organizer');
    expect(screen.getByTestId('instagram-consent').textContent).not.toContain('@the_admin');

    const payload = await savedPayload();
    expect(payload.instagramConsent).toBe(true);
    expect(payload).not.toHaveProperty('instagramHandleOverride');
  });

  it("admin never sees their own handle, even when the organizer's is private", async () => {
    signInAsAdmin();
    renderForm(consentedEvent);

    expect(screen.queryByTestId('instagram-handle-text')).toBeNull();
    const hint = screen.getByTestId('instagram-consent-hint').textContent;
    expect(hint).toContain('aus dem Profil des Veranstalters');
    expect(hint).not.toContain('@the_admin');

    const payload = await savedPayload();
    expect(payload).not.toHaveProperty('instagramHandleOverride');
  });

  it("admin edit keeps the organizer's per-event handle", async () => {
    signInAsAdmin();
    renderForm({ ...consentedEvent, instagramHandleOverride: '@event_handle' });

    expect(screen.getByTestId('instagram-handle-text').textContent).toBe('@event_handle');
    const payload = await savedPayload();
    expect(payload).not.toHaveProperty('instagramHandleOverride');
  });

  it('admin editing their own event keeps using their own profile handle', async () => {
    signInAsAdmin();
    mockProfiles.organizerPublic = { socialMedia: { instagram: '@someone_else' } };
    renderForm({ ...consentedEvent, createdBy: 'admin-uid' });

    expect(mockProfiles.organizerUids.every((uid) => uid === null)).toBe(true);
    expect(screen.getByTestId('instagram-handle-text').textContent).toBe('@the_admin');
    expect(screen.getByTestId('instagram-consent-hint').textContent).toContain(
      'deinen Instagram-Namen aus deinem Profil'
    );
  });

  it('a per-event handle typed in the edit form is saved', async () => {
    mockProfiles.own = { socialMedia: { instagram: '@owner_profile' } };
    renderForm(consentedEvent);

    fireEvent.click(screen.getByTestId('instagram-handle-edit'));
    const input = screen.getByTestId('instagram-handle-input');
    fireEvent.change(input, { target: { value: '@for_this_event' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    const payload = await savedPayload();
    expect(payload.instagramHandleOverride).toBe('@for_this_event');
    // Only Instagram settings changed: no re-approval.
    expect(payload.status).toBe('approved');
  });
});

describe('EventForm — extra Instagram names', () => {
  const consentedEvent = { ...oldApprovedEvent, instagramConsent: true };
  const savedPayload = async () => {
    submitForm();
    await waitFor(() => expect(mockEvents.updateEvent).toHaveBeenCalledTimes(1));
    return (mockEvents.updateEvent.mock.calls[0] as unknown as unknown[])[1] as Record<
      string,
      unknown
    >;
  };

  it('saves a newly added extra name together with the consent', async () => {
    mockProfiles.own = { socialMedia: { instagram: '@owner_profile' } };
    renderForm(consentedEvent);
    fireEvent.click(screen.getByTestId('instagram-extra-add'));
    const input = screen.getByTestId('instagram-extra-input');
    fireEvent.change(input, { target: { value: '@zweite' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    const payload = await savedPayload();
    expect(payload.instagramExtraHandles).toEqual(['@zweite']);
  });

  it('sends nothing when the stored names are unchanged', async () => {
    renderForm({ ...consentedEvent, instagramExtraHandles: ['@zweite'] });
    expect(screen.getByTestId('instagram-extra-list').textContent).toContain('@zweite');
    const payload = await savedPayload();
    expect(payload).not.toHaveProperty('instagramExtraHandles');
  });

  it('sends nothing without consent, and no link is shown', async () => {
    renderForm({ ...oldApprovedEvent, instagramConsent: false, instagramExtraHandles: ['@x'] });
    expect(screen.queryByTestId('instagram-extra-add')).toBeNull();
    const payload = await savedPayload();
    expect(payload).not.toHaveProperty('instagramExtraHandles');
  });

  it('sends an empty list when the last name is removed', async () => {
    renderForm({ ...consentedEvent, instagramExtraHandles: ['@zweite'] });
    fireEvent.click(screen.getByTestId('instagram-extra-remove'));
    const payload = await savedPayload();
    expect(payload.instagramExtraHandles).toEqual([]);
  });
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
    // The rules freeze an approved event's content for its owner, so only the
    // Instagram fields may be sent (no normalised defaults of the old event).
    expect(Object.keys(payload).sort()).toEqual(
      ['instagramConsent', 'instagramImage', 'status'].sort()
    );
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
});

// Trello 6af0678b: an approved event stays approved when the owner changes
// anything but the title, the description or a photo.
describe('EventForm — editing an approved event', () => {
  async function savedPayload() {
    await waitFor(() => expect(mockEvents.updateEvent).toHaveBeenCalledTimes(1));
    return (mockEvents.updateEvent.mock.calls[0] as unknown as unknown[])[1] as Record<
      string,
      unknown
    >;
  }

  it('a new date and link are saved right away: approved, only the changes, no dialog', async () => {
    renderForm(oldApprovedEvent);

    fireEvent.change(screen.getByLabelText('Datum *'), { target: { value: '2026-12-17' } });
    fireEvent.change(screen.getByLabelText('Link (optional)'), {
      target: { value: 'https://neu.example' },
    });
    expect(screen.getByTestId('submit-event-button').textContent).toContain('Änderungen speichern');
    submitForm();

    const payload = await savedPayload();
    expect(screen.queryByText('Event erneut einreichen')).toBeNull();
    expect(payload).toEqual({
      date: '2026-12-17',
      link: 'https://neu.example',
      instagramConsent: false,
      status: 'approved',
    });
  });

  it('an unchanged cover and crop are not sent along with a free change', async () => {
    renderForm({ ...oldApprovedEvent, imageZoom: 1.5 });

    fireEvent.change(screen.getByLabelText('Datum *'), { target: { value: '2026-12-17' } });
    submitForm();

    const payload = await savedPayload();
    expect(payload.status).toBe('approved');
    expect(payload).not.toHaveProperty('imageUrl');
    expect(payload).not.toHaveProperty('imageZoom');
  });

  it.each([
    [
      'title',
      () =>
        fireEvent.change(screen.getByLabelText('Titel *'), { target: { value: 'Neuer Titel' } }),
    ],
    [
      'description',
      () =>
        fireEvent.change(screen.getByTestId('description-editor'), {
          target: { value: '<p>ganz anders</p>' },
        }),
    ],
    [
      'cover photo removed',
      () => fireEvent.click(screen.getByTestId('title-image-focal-picker-remove')),
    ],
  ])('%s change: asks for re-approval and saves as pending', async (_name, change) => {
    renderForm(oldApprovedEvent);

    change();
    expect(screen.getByTestId('submit-event-button').textContent).toContain('Erneut einreichen');
    submitForm();

    expect(await screen.findByText('Event erneut einreichen')).toBeTruthy();
    expect(mockEvents.updateEvent).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Ja, fortfahren'));

    const payload = await savedPayload();
    expect(payload.status).toBe('pending');
  });

  it('admins keep editing approved events without a review', async () => {
    mockAuth.user = { uid: 'admin-uid', email: 'admin@test.local' };
    mockAuth.role = 'Admin';
    renderForm(oldApprovedEvent);

    fireEvent.change(screen.getByLabelText('Titel *'), { target: { value: 'Korrigiert' } });
    submitForm();

    const payload = await savedPayload();
    expect(screen.queryByText('Event erneut einreichen')).toBeNull();
    expect(payload.status).toBe('approved');
    expect(payload.title).toBe('Korrigiert');
  });
});
