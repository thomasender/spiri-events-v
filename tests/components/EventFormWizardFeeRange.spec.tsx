import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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

function makeDraft(overrides = {}) {
  return {
    formData: {
      title: 'Range Test Event',
      date: FUTURE_DATE,
      time: '10:00',
      endDate: '',
      place: 'Test Place',
      contribution: 'fee',
      fee: '300',
      feeMax: '',
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
      ...(overrides.formData || {}),
    },
    currentStep: 3,
    rightsConfirmed: true,
  };
}

function seedDraft(overrides = {}) {
  localStorage.setItem(
    'eventWizardDraft:user-uid',
    JSON.stringify({ version: 1, savedAt: Date.now(), draft: makeDraft(overrides) })
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
  mockEvents.addEvent.mockClear();
  mockEvents.updateEvent.mockClear();
  mockNavigate.mockClear();
  localStorage.clear();
});

describe('EventFormWizard — fee range (UGSVxljS)', () => {
  it('renders the new "Betrag bis" input alongside "Betrag" when contribution is fee', () => {
    seedDraft();
    renderWizard();

    expect(screen.getByTestId('fee-input')).toBeInTheDocument();
    const feeMaxInput = screen.getByTestId('fee-max-input');
    expect(feeMaxInput).toBeInTheDocument();
    expect(feeMaxInput).toHaveAttribute('type', 'number');
  });

  it('does not show the "Betrag bis" input when contribution is free', () => {
    seedDraft({ formData: { contribution: 'free', fee: '', feeMax: '' } });
    renderWizard();

    expect(screen.queryByTestId('fee-input')).not.toBeInTheDocument();
    expect(screen.queryByTestId('fee-max-input')).not.toBeInTheDocument();
  });

  it('shows a validation error when feeMax is below fee', () => {
    seedDraft({ formData: { fee: '300', feeMax: '100' } });
    renderWizard();

    const feeMaxInput = screen.getByTestId('fee-max-input');
    // Update the value via fireEvent.change so the input mirrors the typed value.
    fireEvent.change(feeMaxInput, { target: { value: '100' } });
    fireEvent.blur(feeMaxInput);

    // Click "Weiter" to trigger step validation. Validation should set the
    // feeMax error on the input. The form should not advance.
    fireEvent.click(screen.getByRole('button', { name: /weiter/i }));

    expect(screen.getByText('Maximalbetrag muss ≥ Betrag sein')).toBeInTheDocument();
  });

  it('accepts a feeMax greater than or equal to fee (no error)', () => {
    seedDraft({ formData: { fee: '300', feeMax: '450' } });
    renderWizard();

    const feeMaxInput = screen.getByTestId('fee-max-input');
    fireEvent.change(feeMaxInput, { target: { value: '450' } });
    fireEvent.blur(feeMaxInput);

    expect(screen.queryByText('Maximalbetrag muss ≥ Betrag sein')).not.toBeInTheDocument();
  });
});

describe('EventFormWizard — optional end time', () => {
  it('shows an error when the end time is not after the start time', () => {
    seedDraft({ formData: { time: '10:00', endTime: '09:00' } });
    renderWizard();

    expect(screen.getByLabelText(/Bis \(optional\)/)).toHaveValue('09:00');
    fireEvent.click(screen.getByRole('button', { name: /weiter/i }));

    expect(screen.getByText('Die Endzeit muss nach der Startzeit liegen')).toBeInTheDocument();
  });

  it('accepts an empty end time and a later end time without error', () => {
    seedDraft({ formData: { time: '09:00', endTime: '' } });
    const { unmount } = renderWizard();
    fireEvent.click(screen.getByRole('button', { name: /weiter/i }));
    expect(
      screen.queryByText('Die Endzeit muss nach der Startzeit liegen')
    ).not.toBeInTheDocument();
    unmount();

    seedDraft({ formData: { time: '09:00', endTime: '17:00' } });
    renderWizard();
    fireEvent.click(screen.getByRole('button', { name: /weiter/i }));
    expect(
      screen.queryByText('Die Endzeit muss nach der Startzeit liegen')
    ).not.toBeInTheDocument();
  });
});
