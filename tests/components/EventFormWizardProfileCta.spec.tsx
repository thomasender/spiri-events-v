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

const mockNavigate = vi.fn();

const mockConfetti = vi.hoisted(() => Object.assign(vi.fn(), { reset: vi.fn() }));

vi.mock('canvas-confetti', () => ({
  default: Object.assign(vi.fn(), { create: () => mockConfetti }),
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
  useDuplicateCheck: () => ({ findDuplicates: async () => [] }),
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

// The Titelbild of a seeded draft (kept in memory by wizardDraftFiles); a save
// re-checks it, so every seeded draft gets one unless a test removes it.
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

const COMPLETE_DRAFT = {
  formData: {
    title: 'Profil CTA Test Event',
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
    city: 'Bregenz',
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
  seedCover();
  mockAuth.user = { uid: 'user-uid', email: 'user@test.local', emailVerified: true };
  mockAuth.role = null;
  mockProfile.value = null;
  mockEvents.addEvent.mockClear();
  mockEvents.updateEvent.mockClear();
  mockNavigate.mockClear();
  mockConfetti.mockClear();
});

describe('EventFormWizard success dialog — profile completion CTA (EkrMNDkO regression)', () => {
  it('shows the Profil ausfüllen CTA when the user only has the auto-seeded profile doc (slug set, no displayName/bio)', async () => {
    mockProfile.value = {
      displayName: '',
      bio: '',
      bioHtml: '',
      slug: 'user-uid',
      username: 'user',
      photoURL: null,
      website: '',
      contact: 'user@test.local',
      socialMedia: { facebook: '', instagram: '', sharePublicly: false },
    };
    seedDraft();
    renderWizard();

    fireEvent.click(screen.getByTestId('submit-event-button'));

    await waitFor(() => expect(document.querySelector('.confirm-dialog')).not.toBeNull());
    const confirmDialog = document.querySelector('.confirm-dialog');
    fireEvent.click(within(confirmDialog).getByRole('button', { name: /^einreichen$/i }));

    await waitFor(() => {
      expect(screen.getByTestId('success-dialog')).toBeInTheDocument();
    });
    expect(screen.getByTestId('success-dialog-cta')).toBeInTheDocument();
    expect(screen.getByTestId('success-dialog-cta-button')).toHaveTextContent(/Profil/);
  });

  it('shows the CTA when the user has no profile doc at all', async () => {
    mockProfile.value = null;
    seedDraft();
    renderWizard();

    fireEvent.click(screen.getByTestId('submit-event-button'));

    await waitFor(() => expect(document.querySelector('.confirm-dialog')).not.toBeNull());
    const confirmDialog = document.querySelector('.confirm-dialog');
    fireEvent.click(within(confirmDialog).getByRole('button', { name: /^einreichen$/i }));

    await waitFor(() => {
      expect(screen.getByTestId('success-dialog')).toBeInTheDocument();
    });
    expect(screen.getByTestId('success-dialog-cta')).toBeInTheDocument();
  });

  it('hides the CTA once the user has filled in displayName and bio', async () => {
    mockProfile.value = {
      displayName: 'Test User',
      bio: 'Eine kurze Beschreibung.',
      bioHtml: '<p>Eine kurze Beschreibung.</p>',
      slug: 'test-user',
      username: 'test-user',
      photoURL: null,
      website: '',
      contact: 'user@test.local',
      socialMedia: { facebook: '', instagram: '', sharePublicly: false },
    };
    seedDraft();
    renderWizard();

    fireEvent.click(screen.getByTestId('submit-event-button'));

    await waitFor(() => expect(document.querySelector('.confirm-dialog')).not.toBeNull());
    const confirmDialog = document.querySelector('.confirm-dialog');
    fireEvent.click(within(confirmDialog).getByRole('button', { name: /^einreichen$/i }));

    await waitFor(() => {
      expect(screen.getByTestId('success-dialog')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('success-dialog-cta')).not.toBeInTheDocument();
  });
});

describe('EventFormWizard confetti celebration', () => {
  it('rains confetti after a successful submit', async () => {
    seedDraft();
    renderWizard();

    fireEvent.click(screen.getByTestId('submit-event-button'));
    await waitFor(() => expect(document.querySelector('.confirm-dialog')).not.toBeNull());
    const confirmDialog = document.querySelector('.confirm-dialog');
    fireEvent.click(within(confirmDialog).getByRole('button', { name: /^einreichen$/i }));

    await waitFor(() => expect(screen.getByTestId('success-dialog')).toBeInTheDocument());
    await waitFor(() => expect(mockConfetti).toHaveBeenCalled());
  });

  it('does not rain confetti when saving a draft', async () => {
    seedDraft();
    renderWizard();

    fireEvent.click(screen.getByTestId('save-as-draft-button'));

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/admin'));
    expect(mockConfetti).not.toHaveBeenCalled();
  });
});

describe('EventFormWizard organizer prefill', () => {
  it('uses the profile name instead of the e-mail prefix, also when the profile loads late', async () => {
    mockProfile.value = null;
    const view = renderWizard();
    expect(await screen.findByLabelText(/Veranstalter/)).toHaveValue('user');

    mockProfile.value = { displayName: 'Anna Blume', slug: 'user-uid' };
    view.rerender(
      <HelmetProvider>
        <MemoryRouter initialEntries={['/admin/new']}>
          <EventFormWizard />
        </MemoryRouter>
      </HelmetProvider>
    );
    await waitFor(() => expect(screen.getByLabelText(/Veranstalter/)).toHaveValue('Anna Blume'));
  });
});
