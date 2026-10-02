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

function makeDraft(overrides = {}) {
  const start = new Date();
  start.setDate(start.getDate() + 30);
  const end = new Date(start);
  end.setDate(end.getDate() + 2); // multi-day event
  return {
    formData: {
      title: 'Retreat',
      date: start.toISOString().split('T')[0],
      time: '10:00',
      endDate: end.toISOString().split('T')[0],
      place: 'Test Place',
      contribution: 'free',
      fee: '',
      priceCurrency: 'EUR',
      feeNote: '',
      description: '<p>Beschreibung</p>',
      link: '',
      recurrence: 'weekly',
      recurrenceEndDate: '',
      customDates: [],
      category: 'Yoga',
      bezirk: 'Bregenz',
      isOnline: false,
      organizer: { name: 'Test User', email: 'user@test.local' },
      kontakt: 'user@test.local',
      ...(overrides.formData || {}),
    },
    currentStep: overrides.currentStep ?? 3,
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

describe('EventFormWizard — multi-day + recurrence confirmation (naTXj8Oa)', () => {
  const WARNING = 'Enddatum und Wiederholung kombiniert';

  function visibleDialogTitles() {
    return Array.from(document.querySelectorAll('.confirm-dialog h2')).map((h) => h.textContent);
  }

  const clickNext = () => fireEvent.click(screen.getByTestId('continue-button'));
  const onSummaryStep = () => screen.queryByTestId('submit-event-button') !== null;

  it('prompts on Weiter (step 3) and marks both fields red', async () => {
    seedDraft();
    renderWizard();
    clickNext();

    await waitFor(() => expect(visibleDialogTitles()).toContain(WARNING));
    expect(onSummaryStep()).toBe(false);
    expect(document.getElementById('endDate')).toHaveClass('input-error');
    expect(document.getElementById('recurrenceEndDate')).toHaveClass('input-error');
  });

  it('confirming advances to the summary step without a second prompt', async () => {
    seedDraft();
    renderWizard();
    clickNext();
    await waitFor(() => expect(visibleDialogTitles()).toContain(WARNING));

    const dialog = document.querySelector('.confirm-dialog') as HTMLElement;
    fireEvent.click(within(dialog).getByRole('button', { name: /beides ist korrekt/i }));

    await waitFor(() => expect(onSummaryStep()).toBe(true));
    expect(visibleDialogTitles()).not.toContain(WARNING);

    // Final submit does not prompt about the combination again
    fireEvent.click(screen.getByTestId('submit-event-button'));
    await waitFor(() => {
      expect(visibleDialogTitles()).toContain('Event zur Genehmigung einreichen');
    });
    expect(visibleDialogTitles()).not.toContain(WARNING);
  });

  it('cancelling stays on step 3 and keeps the red marking', async () => {
    seedDraft();
    renderWizard();
    clickNext();
    await waitFor(() => expect(visibleDialogTitles()).toContain(WARNING));

    const dialog = document.querySelector('.confirm-dialog') as HTMLElement;
    fireEvent.click(within(dialog).getByRole('button', { name: /abbrechen und korrigieren/i }));

    await waitFor(() => expect(visibleDialogTitles()).not.toContain(WARNING));
    expect(onSummaryStep()).toBe(false);
    expect(screen.getByTestId('continue-button')).toBeInTheDocument();
    expect(document.getElementById('endDate')).toHaveClass('input-error');
    expect(document.getElementById('recurrenceEndDate')).toHaveClass('input-error');
    expect(mockEvents.addEvent).not.toHaveBeenCalled();
  });

  it('clears the red marking once the conflict is resolved', async () => {
    seedDraft();
    renderWizard();
    clickNext();
    await waitFor(() => expect(visibleDialogTitles()).toContain(WARNING));
    const dialog = document.querySelector('.confirm-dialog') as HTMLElement;
    fireEvent.click(within(dialog).getByRole('button', { name: /abbrechen und korrigieren/i }));
    await waitFor(() => expect(visibleDialogTitles()).not.toContain(WARNING));

    fireEvent.change(document.getElementById('endDate') as HTMLElement, { target: { value: '' } });

    expect(document.getElementById('endDate')).not.toHaveClass('input-error');
    expect(document.getElementById('recurrenceEndDate')).not.toHaveClass('input-error');
  });

  it('does not prompt when endDate is empty', async () => {
    seedDraft({ formData: { endDate: '', recurrence: 'weekly' } });
    renderWizard();
    clickNext();

    await waitFor(() => expect(onSummaryStep()).toBe(true));
    expect(visibleDialogTitles()).not.toContain(WARNING);
  });

  it('does not prompt when recurrence is none', async () => {
    seedDraft({ formData: { recurrence: 'none' } });
    renderWizard();
    clickNext();

    await waitFor(() => expect(onSummaryStep()).toBe(true));
    expect(visibleDialogTitles()).not.toContain(WARNING);
  });
});
