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
    currentStep: 4,
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

describe('EventFormWizard — multi-day + recurrence confirmation (6abf99cb)', () => {
  // The wizard page heading and the standard submit dialog title share the
  // text "Event zur Genehmigung einreichen", so target the dialog itself via
  // its CSS class + content rather than the visible text alone.
  function visibleDialogTitles() {
    return Array.from(document.querySelectorAll('.confirm-dialog h2')).map((h) => h.textContent);
  }

  it('prompts the user when endDate is set AND recurrence is enabled', async () => {
    seedDraft();
    renderWizard();

    fireEvent.click(screen.getByTestId('submit-event-button'));

    await waitFor(() => {
      expect(visibleDialogTitles()).toContain('Enddatum und Wiederholung kombiniert');
    });

    // Only the warning dialog should be open — the standard submit dialog
    // (titled "Event zur Genehmigung einreichen") must not appear yet.
    expect(visibleDialogTitles()).not.toContain('Event zur Genehmigung einreichen');

    // Confirming the warning advances to the standard submit dialog
    const warningDialog = document.querySelector('.confirm-dialog');
    fireEvent.click(within(warningDialog).getByRole('button', { name: /beides ist korrekt/i }));

    await waitFor(() => {
      expect(visibleDialogTitles()).toContain('Event zur Genehmigung einreichen');
    });
  });

  it('does not prompt when endDate is empty', async () => {
    seedDraft({ formData: { endDate: '', recurrence: 'weekly' } });
    renderWizard();

    fireEvent.click(screen.getByTestId('submit-event-button'));

    await waitFor(() => {
      expect(visibleDialogTitles()).toContain('Event zur Genehmigung einreichen');
    });
    expect(visibleDialogTitles()).not.toContain('Enddatum und Wiederholung kombiniert');
  });

  it('does not prompt when recurrence is none', async () => {
    seedDraft({ formData: { recurrence: 'none' } });
    renderWizard();

    fireEvent.click(screen.getByTestId('submit-event-button'));

    await waitFor(() => {
      expect(visibleDialogTitles()).toContain('Event zur Genehmigung einreichen');
    });
    expect(visibleDialogTitles()).not.toContain('Enddatum und Wiederholung kombiniert');
  });

  it('cancelling the warning stops submission and does not show the submit dialog', async () => {
    seedDraft();
    renderWizard();

    fireEvent.click(screen.getByTestId('submit-event-button'));

    await waitFor(() => {
      expect(visibleDialogTitles()).toContain('Enddatum und Wiederholung kombiniert');
    });
    const warningDialog = document.querySelector('.confirm-dialog');
    fireEvent.click(within(warningDialog).getByRole('button', { name: /abbrechen und korrigieren/i }));

    await waitFor(() => {
      expect(visibleDialogTitles()).not.toContain('Enddatum und Wiederholung kombiniert');
    });
    expect(visibleDialogTitles()).not.toContain('Event zur Genehmigung einreichen');
    expect(mockEvents.addEvent).not.toHaveBeenCalled();
  });
});