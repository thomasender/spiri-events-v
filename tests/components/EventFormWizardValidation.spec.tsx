import { EVENTS } from '../../src/lib/analytics';
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
  city: 'Bregenz',
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

function renderWizard(
  entry: string | { pathname: string; state?: Record<string, unknown> } = '/admin/new'
) {
  return render(
    <HelmetProvider>
      <MemoryRouter initialEntries={[entry]}>
        <EventFormWizard />
      </MemoryRouter>
    </HelmetProvider>
  );
}

beforeEach(() => {
  seedCover();
  mockAuth.user = { uid: 'user-uid', email: 'user@test.local', emailVerified: true };
  mockAuth.canCreateEvents = true;
  mockAuth.role = null;
  mockProfile.value = null;
  mockNavigate.mockClear();
  mockEvents.addEvent.mockClear();
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

  it('limits the title to 50 characters, marks it red at the limit without a counter and blocks an over-long draft title', () => {
    seedDraft({ currentStep: 2, formData: { title: 'x'.repeat(60) } });
    renderWizard();

    expect(document.getElementById('title')).toHaveAttribute('maxlength', '50');
    expect(screen.queryByTestId('title-counter')).not.toBeInTheDocument();
    expect(document.getElementById('title')).toHaveClass('input-error');
    fireEvent.click(screen.getByRole('button', { name: /^weiter$/i }));
    expect(screen.getByText(/höchstens 50 Zeichen/)).toBeInTheDocument();
  });

  it('blocks "Weiter" on step 2 without a title image and advances once one is chosen', async () => {
    clearWizardDraftFiles('user-uid');
    seedDraft({ currentStep: 2 });
    renderWizard();

    expect(screen.getByTestId('title-image-hint')).toHaveTextContent(/KI-generiert/);
    expect(screen.getByTestId('title-image-hint')).toHaveTextContent(/16:9/);
    expect(screen.getByTestId('title-image-hint')).toHaveTextContent(/9:16/);
    fireEvent.click(screen.getByRole('button', { name: /^weiter$/i }));

    expect(screen.getByTestId('wizard-validation-error')).toBeInTheDocument();
    expect(screen.getByText('Bitte lade ein Titelbild hoch')).toBeInTheDocument();

    const file = new File(['x'], 'cover.jpg', { type: 'image/jpeg' });
    URL.createObjectURL = vi.fn(() => 'blob:cover');
    fireEvent.change(screen.getByTestId('title-image-input'), { target: { files: [file] } });
    await waitFor(() => expect(screen.getByTestId('title-image-focal-picker')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /^weiter$/i }));
    await waitFor(() => expect(document.getElementById('date')).not.toBeNull());
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

const track = vi.hoisted(() => vi.fn());
vi.mock('../../src/lib/analytics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/lib/analytics')>()),
  trackEvent: track,
}));

describe('EventFormWizard analytics', () => {
  beforeEach(() => track.mockClear());

  it('reports event_create_start when opened, without personal data', () => {
    seedDraft({ currentStep: 1 });
    renderWizard();
    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith(EVENTS.EVENT_CREATE_START);
  });

  it('reports event_create_submit only after the event was saved, not for drafts', async () => {
    seedDraft({ currentStep: 4, rightsConfirmed: true });
    renderWizard();
    fireEvent.click(screen.getByTestId('save-as-draft-button'));
    await waitFor(() => expect(mockEvents.addEvent).toHaveBeenCalledTimes(1));
    expect(track).not.toHaveBeenCalledWith(EVENTS.EVENT_CREATE_SUBMIT);
  });

  it('reports event_create_submit when the confirmation is accepted', async () => {
    seedDraft({ currentStep: 4, rightsConfirmed: true });
    renderWizard();
    fireEvent.click(screen.getByTestId('submit-event-button'));
    const dialog = await waitFor(() => {
      const el = document.querySelector('.confirm-dialog') as HTMLElement | null;
      if (!el) throw new Error('no dialog');
      return el;
    });
    fireEvent.click(within(dialog).getByRole('button', { name: /^einreichen$/i }));
    await waitFor(() => expect(track).toHaveBeenCalledWith(EVENTS.EVENT_CREATE_SUBMIT));
  });
});

describe('EventFormWizard Titelbild check on submit', () => {
  it('sends a step-4 draft that lost its Titelbild (reload) back to step 2 instead of saving', () => {
    clearWizardDraftFiles('user-uid');
    seedDraft({ currentStep: 4, rightsConfirmed: true });
    renderWizard();

    fireEvent.click(screen.getByTestId('submit-event-button'));

    expect(screen.getByTestId('wizard-validation-error')).toHaveTextContent(
      'Bitte lade dein Titelbild (noch einmal) hoch.'
    );
    expect(screen.getByText('Bitte lade ein Titelbild hoch')).toBeInTheDocument();
    expect(screen.getByTestId('title-image-input')).toBeInTheDocument();
    expect(document.querySelector('.confirm-dialog')).toBeNull();
    expect(mockEvents.addEvent).not.toHaveBeenCalled();
  });

  it('restores the Titelbild of the draft, so the summary shows it and submitting works', async () => {
    seedDraft({ currentStep: 4, rightsConfirmed: true });
    renderWizard();
    expect(screen.getByTestId('summary-image-preview')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('submit-event-button'));
    await waitFor(() => expect(document.querySelector('.confirm-dialog')).not.toBeNull());
  });
});

describe('EventFormWizard without account (guest)', () => {
  function seedGuestDraft(formData: Record<string, unknown> = {}, currentStep = 4) {
    localStorage.setItem(
      'eventWizardDraft:guest',
      JSON.stringify({
        version: 1,
        savedAt: Date.now(),
        draft: {
          formData: { ...DRAFT_FORM, organizer: { name: 'Gast Person', email: '' }, ...formData },
          currentStep,
          rightsConfirmed: true,
        },
      })
    );
    saveWizardDraftFiles('guest', {
      cover: new File(['x'], 'cover.jpg', { type: 'image/jpeg' }),
    });
  }

  beforeEach(() => {
    clearWizardDraftFiles('guest');
    mockAuth.user = null as unknown as typeof mockAuth.user;
    mockAuth.canCreateEvents = false;
  });

  it('lets a guest pass step 1 without an account e-mail', async () => {
    renderWizard();
    fireEvent.change(document.getElementById('organizer.name'), {
      target: { value: 'Gast Person' },
    });
    fireEvent.change(document.getElementById('kontakt'), {
      target: { value: '+43 660 1234567' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^weiter$/i }));
    await waitFor(() => expect(document.getElementById('title')).not.toBeNull());
  });

  it('shows the login block instead of "Einreichen" at the end and keeps the draft for the login', async () => {
    seedGuestDraft({ kontakt: 'gast@example.com' });
    renderWizard();

    expect(screen.getByTestId('wizard-guest-gate')).toHaveTextContent(
      /melde dich an oder erstelle ein Konto/
    );
    expect(screen.queryByTestId('submit-event-button')).toBeNull();
    expect(screen.queryByTestId('save-as-draft-button')).toBeNull();

    localStorage.removeItem('eventWizardDraft:guest');
    fireEvent.click(screen.getByTestId('wizard-guest-register'));

    expect(mockNavigate).toHaveBeenCalledWith('/login', {
      state: {
        from: '/admin/new',
        authMode: 'register',
        createEventDraft: true,
        displayName: 'Gast Person',
        email: 'gast@example.com',
      },
    });
    const stored = JSON.parse(localStorage.getItem('eventWizardDraft:guest') ?? 'null');
    expect(stored.draft.currentStep).toBe(4);
    expect(stored.draft.formData.title).toBe(DRAFT_FORM.title);
  });

  it('checks the draft before sending the guest to the login', () => {
    seedGuestDraft();
    clearWizardDraftFiles('guest');
    renderWizard();
    fireEvent.click(screen.getByTestId('wizard-guest-login'));
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(screen.getByText('Bitte lade ein Titelbild hoch')).toBeInTheDocument();
  });

  it('takes the guest draft over after the login: step 4, account e-mail as organizer e-mail', async () => {
    seedGuestDraft();
    mockAuth.user = { uid: 'user-uid', email: 'user@test.local', emailVerified: true };
    mockAuth.canCreateEvents = true;
    renderWizard();

    expect(screen.getByTestId('submit-event-button')).toBeInTheDocument();
    expect(screen.getByTestId('summary-image-preview')).toBeInTheDocument();
    expect(localStorage.getItem('eventWizardDraft:guest')).toBeNull();

    fireEvent.click(screen.getByTestId('submit-event-button'));
    const dialog = await waitFor(() => {
      const el = document.querySelector('.confirm-dialog') as HTMLElement | null;
      if (!el) throw new Error('no dialog');
      return el;
    });
    fireEvent.click(within(dialog).getByRole('button', { name: /^einreichen$/i }));
    await waitFor(() => expect(mockEvents.addEvent).toHaveBeenCalledTimes(1));
    const saved = (mockEvents.addEvent.mock.calls[0] as unknown[])[0] as {
      organizer: { email: string; firstName: string };
    };
    expect(saved.organizer.email).toBe('user@test.local');
    expect(saved.organizer.firstName).toBe('Gast');
  });

  it('asks a signed-in member with an unconfirmed e-mail to confirm it instead of "Einreichen"', () => {
    mockAuth.user = { uid: 'user-uid', email: 'user@test.local', emailVerified: false };
    seedDraft({ currentStep: 4, rightsConfirmed: true });
    renderWizard();

    expect(screen.getByTestId('wizard-verify-gate')).toHaveTextContent(
      /bestätige noch deine E-Mail-Adresse/
    );
    expect(screen.queryByTestId('submit-event-button')).toBeNull();
    expect(screen.queryByTestId('wizard-guest-gate')).toBeNull();
  });

  it('back from the confirmation link without a draft here: says where the draft is', () => {
    mockAuth.user = { uid: 'user-uid', email: 'user@test.local', emailVerified: true };
    mockAuth.canCreateEvents = true;
    renderWizard({ pathname: '/admin/new', state: { afterVerify: true } });
    expect(screen.getByTestId('wizard-draft-elsewhere')).toHaveTextContent(
      /im ursprünglichen Browser/
    );
  });

  it('back from the confirmation link with the draft: opens the last page', () => {
    mockAuth.user = { uid: 'user-uid', email: 'user@test.local', emailVerified: true };
    mockAuth.canCreateEvents = true;
    seedDraft({ currentStep: 2, rightsConfirmed: true });
    renderWizard({ pathname: '/admin/new', state: { afterVerify: true } });
    expect(screen.getByTestId('submit-event-button')).toBeInTheDocument();
    expect(screen.queryByTestId('wizard-draft-elsewhere')).toBeNull();
  });
});
