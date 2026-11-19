import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';

const mockAuth = vi.hoisted(() => ({
  user: { uid: 'user-uid', email: 'user@test.local', emailVerified: true },
  role: null,
  canCreateEvents: true,
}));

const mockProfile = vi.hoisted(() => ({ value: null }));

const mockEvents = vi.hoisted(() => ({
  addEvent: vi.fn(async () => ({ id: 'new-event-id' })),
  updateEvent: vi.fn(async () => {}),
}));

const mockFirestore = vi.hoisted(() => ({ updateDoc: vi.fn(async () => {}) }));

const mockDuplicates = vi.hoisted(() => ({ findDuplicates: vi.fn(async () => [] as unknown[]) }));

const mockNavigate = vi.fn();

const mockConfetti = vi.hoisted(() => Object.assign(vi.fn(), { reset: vi.fn() }));

vi.mock('canvas-confetti', () => ({
  default: Object.assign(vi.fn(), { create: () => mockConfetti }),
}));

vi.mock('firebase/firestore', async () => {
  const actual = await vi.importActual<typeof import('firebase/firestore')>('firebase/firestore');
  return {
    ...actual,
    doc: vi.fn((_db: unknown, ...path: string[]) => ({ path: path.join('/') })),
    updateDoc: mockFirestore.updateDoc,
  };
});

// The wizard reads the pre-entry flag (app_settings/preEntries); the plain-object doc() above
// would trip the real onSnapshot, and the flag is off for these tests anyway.
vi.mock('../../src/hooks/usePreEntries', () => ({
  usePreEntryAccess: () => ({ available: false, settings: {} }),
  preEntryAdmin: {},
}));

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

vi.mock('../../src/hooks/useDuplicateCheck', () => ({
  useDuplicateCheck: () => mockDuplicates,
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

import EventFormWizard from '../../src/components/EventFormWizard';
import { clearWizardDraftFiles, saveWizardDraftFiles } from '../../src/utils/wizardDraftFiles';

function seedCover() {
  clearWizardDraftFiles('user-uid');
  saveWizardDraftFiles('user-uid', {
    cover: new File(['x'], 'cover.jpg', { type: 'image/jpeg' }),
  });
}

const FUTURE_DATE = (() => {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d.toISOString().split('T')[0];
})();

const REMEMBERED = {
  organizerName: 'Anna Yoga',
  kontakt: 'anna@yoga.at',
  kontaktMessenger: [],
  registration: 'https://anmeldung.example/yoga',
  link: '',
  category: 'Yoga',
  contribution: 'fee',
  fee: 15,
  feeMax: null,
  priceCurrency: 'EUR',
  feeNote: '',
  firstSessionFree: false,
  place: 'Hauptstraße 1',
  city: 'Dornbirn',
  bezirk: 'Dornbirn',
  placeRegionId: '',
  cityPicked: true,
  isOnline: false,
};

const VENUES = [
  {
    place: 'Hauptstraße 1',
    city: 'Dornbirn',
    bezirk: 'Dornbirn',
    placeRegionId: '',
    cityPicked: true,
  },
  { place: 'Seestraße 5', city: 'Bregenz', bezirk: 'Bregenz', placeRegionId: '', cityPicked: true },
];

const DRAFT = {
  formData: {
    title: 'Mein Entwurf',
    date: FUTURE_DATE,
    time: '10:00',
    place: 'Entwurfsweg 3',
    contribution: 'free',
    description: '<p>Beschreibung</p>',
    recurrence: 'none',
    category: 'Tanz',
    bezirk: 'Feldkirch',
    city: 'Feldkirch',
    cityPicked: true,
    isOnline: false,
    organizer: { name: 'Entwurfs-Name', email: 'user@test.local' },
    kontakt: 'entwurf@test.local',
    registration: 'Entwurfs-Anmeldung',
  },
  currentStep: 1,
  rightsConfirmed: true,
};

function seedDraft(draft = DRAFT) {
  localStorage.setItem(
    'eventWizardDraft:user-uid',
    JSON.stringify({ version: 1, savedAt: Date.now(), draft })
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
  seedCover();
  mockAuth.user = { uid: 'user-uid', email: 'user@test.local', emailVerified: true };
  mockProfile.value = {
    displayName: 'Profil Name',
    eventFormDefaults: REMEMBERED,
    savedVenues: VENUES,
  };
  mockEvents.addEvent.mockClear();
  mockFirestore.updateDoc.mockClear();
  mockNavigate.mockClear();
  mockDuplicates.findDuplicates.mockReset();
  mockDuplicates.findDuplicates.mockResolvedValue([]);
});

describe('EventFormWizard remembered answers (Trello 6afd8505)', () => {
  it('starts a new event with the remembered Veranstalter, Kontakt and Anmeldung', async () => {
    renderWizard();
    await waitFor(() => expect(screen.getByLabelText(/Veranstalter/)).toHaveValue('Anna Yoga'));
    expect(screen.getByLabelText(/^Kontakt/)).toHaveValue('anna@yoga.at');
    expect(screen.getByLabelText(/Anmeldung/)).toHaveValue('https://anmeldung.example/yoga');
    // Not remembered: the title is on a later step and stays empty.
    expect(screen.queryByDisplayValue('Mein Entwurf')).not.toBeInTheDocument();
  });

  it('lets a running draft win over the remembered values', async () => {
    seedDraft();
    renderWizard();
    await waitFor(() => expect(screen.getByLabelText(/Veranstalter/)).toHaveValue('Entwurfs-Name'));
    expect(screen.getByLabelText(/^Kontakt/)).toHaveValue('entwurf@test.local');
    expect(screen.getByLabelText(/Anmeldung/)).toHaveValue('Entwurfs-Anmeldung');
  });

  it('keeps the profile defaults without remembered values or without an account', async () => {
    mockProfile.value = { displayName: 'Profil Name' };
    renderWizard();
    await waitFor(() => expect(screen.getByLabelText(/Veranstalter/)).toHaveValue('Profil Name'));
    expect(screen.getByLabelText(/^Kontakt/)).toHaveValue('user@test.local');
  });

  it('overwrites a remembered value by typing', async () => {
    renderWizard();
    await waitFor(() => expect(screen.getByLabelText(/Veranstalter/)).toHaveValue('Anna Yoga'));
    fireEvent.change(screen.getByLabelText(/Veranstalter/), { target: { value: 'Neu' } });
    expect(screen.getByLabelText(/Veranstalter/)).toHaveValue('Neu');
  });

  it('fills Ort, Bezirk and Adresse from "Frühere Orte" and still allows typing', async () => {
    seedDraft({
      ...DRAFT,
      formData: { ...DRAFT.formData, city: '', place: '', bezirk: '' },
      currentStep: 3,
    });
    renderWizard();
    const select = await screen.findByTestId('saved-venues-select');
    fireEvent.change(select, { target: { value: '1' } });

    await waitFor(() =>
      expect(screen.getByLabelText('Adresse / Veranstaltungsort')).toHaveValue('Seestraße 5')
    );
    expect(screen.getByText('Bregenz')).toBeInTheDocument();
    // validatePlaceChoice accepts it: no "Bitte wähle einen Ort" error appears.
    expect(screen.queryByText(/Bitte wähle einen Ort/)).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Adresse / Veranstaltungsort'), {
      target: { value: 'Andere Straße 9' },
    });
    expect(screen.getByLabelText('Adresse / Veranstaltungsort')).toHaveValue('Andere Straße 9');
  });

  it('writes the answers and the venue to the profile after saving a draft', async () => {
    seedDraft({ ...DRAFT, currentStep: 4 });
    renderWizard();
    fireEvent.click(await screen.findByTestId('save-as-draft-button'));

    await waitFor(() => expect(mockFirestore.updateDoc).toHaveBeenCalled());
    const [ref, update] = mockFirestore.updateDoc.mock.calls[0] as unknown as [
      { path: string },
      { eventFormDefaults: Record<string, unknown>; savedVenues: Array<Record<string, unknown>> },
    ];
    expect(ref.path).toBe('users/user-uid');
    expect(update.eventFormDefaults).toMatchObject({
      organizerName: 'Entwurfs-Name',
      registration: 'Entwurfs-Anmeldung',
      city: 'Feldkirch',
      category: 'Tanz',
    });
    expect(update.eventFormDefaults).not.toHaveProperty('title');
    expect(update.savedVenues[0]).toMatchObject({ city: 'Feldkirch', place: 'Entwurfsweg 3' });
    expect(update.savedVenues).toHaveLength(3);
  });

  it('still saves when remembering fails', async () => {
    mockFirestore.updateDoc.mockRejectedValueOnce(new Error('permission-denied'));
    seedDraft({ ...DRAFT, currentStep: 4 });
    renderWizard();
    fireEvent.click(await screen.findByTestId('save-as-draft-button'));
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/admin'));
    expect(mockEvents.addEvent).toHaveBeenCalled();
  });
});

describe('EventFormWizard duplicate check (Trello 6afdc0ce)', () => {
  const HIT = {
    event: {
      id: 'old-1',
      slug: 'mein-entwurf-in-feldkirch-20261205',
      title: 'Mein Entwurf',
      date: FUTURE_DATE,
      time: '10:00',
      city: 'Feldkirch',
    },
    score: 2,
    day: FUTURE_DATE,
  };

  it('opens the confirm dialog as before when nothing similar exists', async () => {
    seedDraft({ ...DRAFT, currentStep: 4 });
    renderWizard();
    fireEvent.click(await screen.findByTestId('submit-event-button'));
    expect(await screen.findByText('Event zur Genehmigung einreichen')).toBeInTheDocument();
    expect(screen.queryByText('Gibt es dieses Event schon?')).not.toBeInTheDocument();
    expect(mockDuplicates.findDuplicates).toHaveBeenCalledTimes(1);
  });

  it('shows the duplicate dialog and saves a draft only after the choice', async () => {
    mockDuplicates.findDuplicates.mockResolvedValue([HIT]);
    seedDraft({ ...DRAFT, currentStep: 4 });
    renderWizard();
    fireEvent.click(await screen.findByTestId('save-as-draft-button'));
    expect(await screen.findByText('Gibt es dieses Event schon?')).toBeInTheDocument();
    expect(mockEvents.addEvent).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByText('Als Entwurf speichern', { selector: '.duplicate-actions *' })
    );
    await waitFor(() => expect(mockEvents.addEvent).toHaveBeenCalled());
    expect(mockEvents.addEvent.mock.calls[0][1]).toBe('draft');
  });

  it('submits anyway into the normal review', async () => {
    mockDuplicates.findDuplicates.mockResolvedValue([HIT]);
    seedDraft({ ...DRAFT, currentStep: 4 });
    renderWizard();
    fireEvent.click(await screen.findByTestId('submit-event-button'));
    fireEvent.click(await screen.findByText('Mein Event ist anders, trotzdem einreichen'));
    await waitFor(() => expect(mockEvents.addEvent).toHaveBeenCalled());
    expect(mockEvents.addEvent.mock.calls[0][1]).toBe('pending');
  });

  it('goes back without saving', async () => {
    mockDuplicates.findDuplicates.mockResolvedValue([HIT]);
    seedDraft({ ...DRAFT, currentStep: 4 });
    renderWizard();
    fireEvent.click(await screen.findByTestId('submit-event-button'));
    fireEvent.click(await screen.findByText('Zurück und ändern'));
    expect(screen.queryByText('Gibt es dieses Event schon?')).not.toBeInTheDocument();
    expect(mockEvents.addEvent).not.toHaveBeenCalled();
  });

  it('asks before discarding and then only drops the wizard draft', async () => {
    mockDuplicates.findDuplicates.mockResolvedValue([HIT]);
    seedDraft({ ...DRAFT, currentStep: 4 });
    renderWizard();
    fireEvent.click(await screen.findByTestId('submit-event-button'));
    fireEvent.click(await screen.findByText('Mein Event verwerfen'));
    expect(await screen.findByText('Event verwerfen?')).toBeInTheDocument();
    expect(localStorage.getItem('eventWizardDraft:user-uid')).not.toBeNull();

    fireEvent.click(screen.getByText('Ja, verwerfen'));
    expect(localStorage.getItem('eventWizardDraft:user-uid')).toBeNull();
    expect(mockNavigate).toHaveBeenCalledWith('/admin');
    expect(mockEvents.addEvent).not.toHaveBeenCalled();
  });
});
