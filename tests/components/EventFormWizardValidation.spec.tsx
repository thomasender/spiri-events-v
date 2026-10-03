import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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

const DRAFT_FORM = {
  title: 'Validierungs Test Event',
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
};

function seedDraft({ currentStep, rightsConfirmed = false, formData = {} }) {
  localStorage.setItem(
    'eventWizardDraft:user-uid',
    JSON.stringify({
      version: 1,
      savedAt: Date.now(),
      draft: { formData: { ...DRAFT_FORM, ...formData }, currentStep, rightsConfirmed },
    })
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
  mockAuth.user = { uid: 'user-uid', email: 'user@test.local', emailVerified: true };
  mockAuth.role = null;
  mockProfile.value = null;
  mockNavigate.mockClear();
});

describe('EventFormWizard step validation', () => {
  it('blocks "Weiter" on step 1 while organizer fields are empty and recovers once they are filled', async () => {
    seedDraft({
      currentStep: 1,
      formData: { organizer: { name: '', email: 'user@test.local' }, kontakt: '' },
    });
    renderWizard();

    fireEvent.click(screen.getByRole('button', { name: /^weiter$/i }));

    expect(screen.getByTestId('wizard-validation-error')).toHaveTextContent(
      'Bitte fülle alle Pflichtfelder aus.'
    );
    expect(screen.getAllByText(/ist erforderlich/).length).toBeGreaterThan(0);
    expect(document.getElementById('title')).toBeNull();

    fireEvent.change(document.getElementById('organizer.name'), {
      target: { value: 'Thomas Ender' },
    });
    fireEvent.change(document.getElementById('kontakt'), {
      target: { value: 'thomas@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^weiter$/i }));

    await waitFor(() => expect(document.getElementById('title')).not.toBeNull());
    expect(screen.queryByTestId('wizard-validation-error')).not.toBeInTheDocument();
  });

  it('blocks "Weiter" on step 2 while the description is empty', () => {
    seedDraft({ currentStep: 2, formData: { description: '' } });
    renderWizard();

    fireEvent.click(screen.getByRole('button', { name: /^weiter$/i }));

    expect(screen.getByTestId('wizard-validation-error')).toBeInTheDocument();
    expect(screen.getByTestId('description-error')).toBeInTheDocument();
  });
});

describe('EventFormWizard copyright confirmation', () => {
  it.each([['submit-event-button'], ['save-as-draft-button']])(
    'refuses %s until the rights are confirmed, then clears the error',
    (buttonTestId) => {
      seedDraft({ currentStep: 4, rightsConfirmed: false });
      renderWizard();

      expect(screen.queryByTestId('rights-confirmed-error')).not.toBeInTheDocument();
      fireEvent.click(screen.getByTestId(buttonTestId));

      expect(screen.getByTestId('rights-confirmed-error')).toHaveTextContent(
        'Bitte bestätige die Nutzungsrechte'
      );
      expect(document.querySelector('.confirm-dialog')).toBeNull();
      expect(mockEvents.addEvent).not.toHaveBeenCalled();

      fireEvent.click(screen.getByTestId('rights-confirmed-checkbox'));
      expect(screen.queryByTestId('rights-confirmed-error')).not.toBeInTheDocument();
    }
  );

  it('opens the submit confirmation once the rights are confirmed', async () => {
    seedDraft({ currentStep: 4, rightsConfirmed: true });
    renderWizard();

    fireEvent.click(screen.getByTestId('submit-event-button'));

    await waitFor(() => expect(document.querySelector('.confirm-dialog')).not.toBeNull());
  });
});
