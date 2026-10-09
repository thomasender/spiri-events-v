import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';

const mockAuth = vi.hoisted(() => ({
  user: { uid: 'user-uid', email: 'user@test.local', emailVerified: true },
  role: null,
}));

const mockProfile = vi.hoisted(() => ({ value: null }));

const mockEvents = vi.hoisted(() => ({
  addEvent: vi.fn(async () => ({ id: 'new-event-id' })),
  updateEvent: vi.fn(async () => {}),
}));

const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useParams: () => ({}),
  };
});

vi.mock('../../src/hooks/useAuth', () => ({
  useAuth: () => mockAuth,
}));

vi.mock('../../src/hooks/useProfile', () => ({
  useProfile: () => ({ profile: mockProfile.value }),
}));

vi.mock('../../src/hooks/useEvents', () => ({
  useEvents: () => mockEvents,
  useAllEvents: () => ({ events: [], loading: false, error: null }),
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
  uploadImage: vi.fn(async () => 'https://example.com/test.jpg'),
  deleteImageByUrl: vi.fn(async () => {}),
  getImageDimensions: vi.fn(async () => ({ width: 1200, height: 800 })),
  getAspectRatioRecommendation: vi.fn(() => ({ isRecommended: true })),
  MAX_INPUT_SIZE_BYTES: 5 * 1024 * 1024,
}));

import EventFormWizard from '../../src/components/EventFormWizard';

const FUTURE_DATE = (() => {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d.toISOString().split('T')[0];
})();

const COMPLETE_DRAFT = {
  formData: {
    title: 'Instagram Consent Test Event',
    date: FUTURE_DATE,
    time: '10:00',
    endDate: '',
    place: 'Test Place',
    contribution: 'free',
    fee: '',
    priceCurrency: 'EUR',
    feeNote: '',
    description: '<p>Beschreibung</p>',
    link: '',
    recurrence: 'none',
    recurrenceEndDate: '',
    customDates: [],
    category: 'Yoga',
    bezirk: 'Bregenz',
    isOnline: false,
    organizer: { name: 'Test User', email: 'user@test.local' },
    kontakt: 'user@test.local',
  },
  currentStep: 4,
  rightsConfirmed: true,
};

function seedDraft() {
  localStorage.setItem(
    'eventWizardDraft:user-uid',
    JSON.stringify({ version: 1, savedAt: Date.now(), draft: COMPLETE_DRAFT })
  );
}

function renderWizard() {
  return render(
    <HelmetProvider>
      <MemoryRouter initialEntries={['/admin/new']}>
        <EventFormWizard />
      </MemoryRouter>
    </HelmetProvider>
  );
}

beforeEach(() => {
  localStorage.clear();
  mockAuth.user = { uid: 'user-uid', email: 'user@test.local', emailVerified: true };
  mockAuth.role = null;
  mockProfile.value = null;
  mockEvents.addEvent.mockClear();
  mockEvents.updateEvent.mockClear();
  mockNavigate.mockClear();
});

async function submitAndGetSavedEvent() {
  fireEvent.click(screen.getByTestId('submit-event-button'));
  const confirmDialog = document.querySelector('.confirm-dialog') as HTMLElement;
  await waitFor(() => expect(confirmDialog).toBeTruthy());
  fireEvent.click(within(confirmDialog).getByRole('button', { name: /^einreichen$/i }));
  await waitFor(() => expect(mockEvents.addEvent).toHaveBeenCalled());
  return (mockEvents.addEvent.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
}

const profileWith = (extra: Record<string, unknown>) => ({
  displayName: 'Test User',
  bio: 'Bio',
  slug: 'test-user',
  photoURL: null,
  socialMedia: { facebook: '', instagram: '', sharePublicly: false },
  ...extra,
});

describe('EventFormWizard Instagram consent', () => {
  it('is off by default and saved as false', async () => {
    mockProfile.value = profileWith({});
    seedDraft();
    renderWizard();
    expect(screen.getByTestId('instagram-consent-checkbox')).not.toBeChecked();
    const saved = await submitAndGetSavedEvent();
    expect(saved.instagramConsent).toBe(false);
  });

  it('takes the default from the profile setting', async () => {
    mockProfile.value = profileWith({ instagramConsentDefault: true });
    seedDraft();
    renderWizard();
    expect(screen.getByTestId('instagram-consent-checkbox')).toBeChecked();
    const saved = await submitAndGetSavedEvent();
    expect(saved.instagramConsent).toBe(true);
  });

  it('can be overridden per event and the chosen value is saved', async () => {
    mockProfile.value = profileWith({ instagramConsentDefault: true });
    seedDraft();
    renderWizard();
    fireEvent.click(screen.getByTestId('instagram-consent-checkbox'));
    expect(screen.getByTestId('instagram-consent-checkbox')).not.toBeChecked();
    const saved = await submitAndGetSavedEvent();
    expect(saved.instagramConsent).toBe(false);
  });

  it('can be ticked when the profile default is off', async () => {
    mockProfile.value = profileWith({});
    seedDraft();
    renderWizard();
    fireEvent.click(screen.getByTestId('instagram-consent-checkbox'));
    const saved = await submitAndGetSavedEvent();
    expect(saved.instagramConsent).toBe(true);
  });

  it('shows the profile handle for tagging, or a hint to add one', () => {
    mockProfile.value = profileWith({
      socialMedia: {
        facebook: '',
        instagram: 'https://instagram.com/maria.yoga',
        sharePublicly: false,
      },
    });
    seedDraft();
    const { unmount } = renderWizard();
    expect(screen.getByTestId('instagram-consent-hint')).toHaveTextContent('@maria.yoga');
    unmount();

    mockProfile.value = profileWith({});
    renderWizard();
    expect(screen.getByTestId('instagram-consent-hint')).toHaveTextContent(
      /Trage in deinem Profil/
    );
  });
});

describe('EventFormWizard Instagram image crop', () => {
  const IMG_A = 'https://firebasestorage.googleapis.com/a.jpg';
  const IMG_B = 'https://firebasestorage.googleapis.com/b.jpg';

  function seedDraftWithDescription(description: string) {
    localStorage.setItem(
      'eventWizardDraft:user-uid',
      JSON.stringify({
        version: 1,
        savedAt: Date.now(),
        draft: { ...COMPLETE_DRAFT, formData: { ...COMPLETE_DRAFT.formData, description } },
      })
    );
  }

  it('opens the crop section only once Instagram is allowed', () => {
    mockProfile.value = profileWith({});
    seedDraftWithDescription(`<p>Text</p><img src="${IMG_A}">`);
    renderWizard();
    expect(screen.queryByTestId('instagram-image-accordion')).toBeNull();
    fireEvent.click(screen.getByTestId('instagram-consent-checkbox'));
    expect(screen.getByTestId('instagram-image-accordion')).toBeInTheDocument();
    expect(screen.getByTestId('instagram-image-picker')).toHaveTextContent(
      /sehr vielen Menschen gezeigt/
    );
  });

  it('tells the user a mood picture is used when there is no photo', () => {
    mockProfile.value = profileWith({ instagramConsentDefault: true });
    seedDraft();
    renderWizard();
    expect(screen.getByTestId('instagram-image-picker-empty')).toBeInTheDocument();
  });

  it('saves the picked photo with zoom and focal point', async () => {
    mockProfile.value = profileWith({ instagramConsentDefault: true });
    seedDraftWithDescription(`<p>Text</p><img src="${IMG_A}"><img src="${IMG_B}">`);
    renderWizard();
    const options = screen.getAllByTestId('instagram-image-option');
    expect(options).toHaveLength(2);
    fireEvent.click(options[1]);
    expect(options[1]).toHaveAttribute('aria-pressed', 'true');
    fireEvent.change(screen.getByTestId('instagram-image-zoom'), { target: { value: '2' } });
    fireEvent.keyDown(screen.getByTestId('instagram-focal-picker-handle-x'), { key: 'Home' });
    const saved = await submitAndGetSavedEvent();
    expect(saved.instagramImage).toEqual({ url: IMG_B, focalPoint: { x: 0, y: 0.5 }, zoom: 2 });
  });

  it('defaults to the first photo, centred, and stores nothing without consent', async () => {
    mockProfile.value = profileWith({ instagramConsentDefault: true });
    seedDraftWithDescription(`<img src="${IMG_A}">`);
    const { unmount } = renderWizard();
    const saved = await submitAndGetSavedEvent();
    expect(saved.instagramImage).toEqual({ url: IMG_A, focalPoint: { x: 0.5, y: 0.5 }, zoom: 1 });
    unmount();

    mockEvents.addEvent.mockClear();
    mockProfile.value = profileWith({});
    seedDraftWithDescription(`<img src="${IMG_A}">`);
    renderWizard();
    const savedWithout = await submitAndGetSavedEvent();
    expect(savedWithout).not.toHaveProperty('instagramImage');
  });

  it('offers an extra photo upload just for Instagram and stores it once uploaded', async () => {
    const originalCreate = URL.createObjectURL;
    URL.createObjectURL = vi.fn(() => 'blob:instagram-extra');
    try {
      mockProfile.value = profileWith({ instagramConsentDefault: true });
      seedDraftWithDescription(`<img src="${IMG_A}">`);
      renderWizard();
      const file = new File(['x'], 'hochformat.jpg', { type: 'image/jpeg' });
      fireEvent.change(screen.getByTestId('instagram-upload-input'), {
        target: { files: [file] },
      });
      const options = screen.getAllByTestId('instagram-image-option');
      expect(options).toHaveLength(2);
      expect(options[1]).toHaveAttribute('aria-pressed', 'true');

      const saved = await submitAndGetSavedEvent();
      expect(saved).not.toHaveProperty('instagramImage');
      await waitFor(() =>
        expect(mockEvents.updateEvent).toHaveBeenCalledWith(expect.any(String), {
          instagramImage: {
            url: 'https://example.com/test.jpg',
            focalPoint: { x: 0.5, y: 0.5 },
            zoom: 1,
          },
        })
      );
    } finally {
      URL.createObjectURL = originalCreate;
    }
  });
});
