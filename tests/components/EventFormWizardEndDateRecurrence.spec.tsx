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

function makeDraft(overrides = {}) {
  const start = new Date();
  start.setDate(start.getDate() + 30);
  const end = new Date(start);
  end.setDate(end.getDate() + 2); // multi-day event
  const seriesEnd = new Date(start);
  seriesEnd.setDate(seriesEnd.getDate() + 60);
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
      recurrenceEndDate: seriesEnd.toISOString().split('T')[0],
      customDates: [],
      category: 'Yoga',
      bezirk: 'Bregenz',
      city: 'Bregenz',
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
  seedCover();
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

describe('EventFormWizard — unexpected year in the date field', () => {
  it('does not crash when the date has a 5-digit year', () => {
    seedDraft({ formData: { date: '20343-05-01', endDate: '', recurrence: 'weekly' } });
    expect(() => renderWizard()).not.toThrow();
  });
});

describe('EventFormWizard — recurrence question labels (kZAYjgbF)', () => {
  it('asks "Wiederholt sich dein Event oder ist es einmalig?" with Einmalig / Wiederholung options', () => {
    seedDraft();
    renderWizard();
    expect(
      screen.getByText('Wiederholt sich dein Event oder ist es einmalig?')
    ).toBeInTheDocument();
    expect(screen.getByTestId('recurrence-no-radio').closest('label')).toHaveTextContent(
      'Einmalig'
    );
    expect(screen.getByTestId('recurrence-yes-radio').closest('label')).toHaveTextContent(
      'Wiederholung'
    );
  });
});

describe('EventFormWizard — recurrence limited to 180 days (cTfN9wqQ)', () => {
  const isoDaysFromToday = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0];
  };

  it('blocks a recurrence end date beyond 180 days after the event date', async () => {
    seedDraft({ formData: { endDate: '', recurrenceEndDate: isoDaysFromToday(30 + 200) } });
    renderWizard();
    fireEvent.click(screen.getByTestId('continue-button'));

    await waitFor(() =>
      expect(screen.getByText('Wiederholung darf maximal 180 Tage betragen')).toBeInTheDocument()
    );
    expect(screen.queryByTestId('submit-event-button')).toBeNull();
  });

  it('allows a recurrence end date within 180 days', async () => {
    seedDraft({ formData: { endDate: '', recurrenceEndDate: isoDaysFromToday(30 + 170) } });
    renderWizard();
    fireEvent.click(screen.getByTestId('continue-button'));

    await waitFor(() => expect(screen.queryByTestId('submit-event-button')).not.toBeNull());
  });
});

describe('EventFormWizard — monthly on the n-th weekday (6adca49e)', () => {
  // 2030-03-04 is the first Monday of March 2030, 2030-03-29 the last Friday.
  const monthlyDraft = (date: string, recurrence = 'monthly') =>
    seedDraft({ formData: { date, endDate: '', recurrence, recurrenceEndDate: '2030-04-30' } });

  it('offers both monthly variants, with texts taken from the start date', () => {
    monthlyDraft('2030-03-04');
    renderWizard();
    const options = screen.getByTestId('monthly-mode-options');
    expect(within(options).getByLabelText(/am gleichen Datum/)).toBeChecked();
    expect(within(options).getByText('am gleichen Datum (jeweils am 4.)')).toBeInTheDocument();
    expect(within(options).getByText('am ersten Montag')).toBeInTheDocument();
  });

  it('does not show the monthly options for weekly series', () => {
    monthlyDraft('2030-03-04', 'weekly');
    renderWizard();
    expect(screen.queryByTestId('monthly-mode-options')).toBeNull();
  });

  it('switches to monthlyWeekday and keeps the Monatlich radio active', () => {
    monthlyDraft('2030-03-04');
    renderWizard();
    fireEvent.click(screen.getByLabelText('am ersten Montag'));
    expect(screen.getByLabelText('am ersten Montag')).toBeChecked();
    expect(screen.getByLabelText('Monatlich')).toBeChecked();
  });

  it('updates the weekday text live when the start date changes, and offers "letzten" for a 5th weekday', () => {
    monthlyDraft('2030-03-04', 'monthlyWeekday');
    renderWizard();
    expect(screen.getByLabelText('am ersten Montag')).toBeChecked();
    fireEvent.change(document.getElementById('date') as HTMLElement, {
      target: { value: '2030-03-29' },
    });
    expect(screen.getByLabelText('am letzten Freitag')).toBeChecked();
    expect(screen.getByText('am gleichen Datum (jeweils am 29.)')).toBeInTheDocument();
  });

  it('runs an old stored draft with plain monthly without errors', () => {
    monthlyDraft('2030-03-04', 'monthly');
    expect(() => renderWizard()).not.toThrow();
    expect(screen.getByLabelText('Monatlich')).toBeChecked();
  });

  it('shows the label on the summary and saves recurrence monthlyWeekday without extra fields', async () => {
    monthlyDraft('2030-03-29', 'monthlyWeekday');
    renderWizard();
    fireEvent.click(screen.getByTestId('continue-button'));
    await waitFor(() => expect(screen.queryByTestId('submit-event-button')).not.toBeNull());
    expect(screen.getByText(/Monatlich am letzten Freitag/)).toBeInTheDocument();

    const noText = screen.queryByTestId('instagram-no-text-checkbox');
    if (noText && !(noText as HTMLInputElement).checked) fireEvent.click(noText);
    fireEvent.click(screen.getByTestId('submit-event-button'));
    const confirmDialog = document.querySelector('.confirm-dialog') as HTMLElement;
    await waitFor(() => expect(confirmDialog).toBeTruthy());
    fireEvent.click(within(confirmDialog).getByRole('button', { name: /^einreichen$/i }));
    await waitFor(() => expect(mockEvents.addEvent).toHaveBeenCalled());
    const saved = (mockEvents.addEvent.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
    expect(saved).toMatchObject({ recurrence: 'monthlyWeekday', date: '2030-03-29' });
    expect(saved).not.toHaveProperty('monthlyOrdinal');
  });
});

describe('EventFormWizard — series needs an end date (XqeZro0q)', () => {
  const REQUIRED = 'Bitte gib ein Enddatum für die Wiederholung an';

  it.each(['weekly', 'biweekly', 'monthly'])(
    'blocks Weiter for %s recurrence without a series end date',
    async (recurrence) => {
      seedDraft({ formData: { endDate: '', recurrence, recurrenceEndDate: '' } });
      renderWizard();
      fireEvent.click(screen.getByTestId('continue-button'));

      await waitFor(() => expect(screen.getByText(REQUIRED)).toBeInTheDocument());
      expect(document.getElementById('recurrenceEndDate')).toHaveClass('input-error');
      expect(screen.queryByTestId('submit-event-button')).toBeNull();
    }
  );

  it('does not require a series end date for custom dates', async () => {
    seedDraft({
      formData: {
        endDate: '',
        recurrence: 'custom',
        recurrenceEndDate: '',
        customDates: ['2030-05-01'],
      },
    });
    renderWizard();
    fireEvent.click(screen.getByTestId('continue-button'));

    await waitFor(() => expect(screen.queryByTestId('submit-event-button')).not.toBeNull());
    expect(screen.queryByText(REQUIRED)).toBeNull();
  });
});

describe('EventFormWizard — Serientermine-Übersicht', () => {
  const isoDaysFromToday = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0];
  };
  // Weekly from today + 30 until today + 58: five dates.
  const series = (extra: Record<string, unknown> = {}) => ({
    formData: {
      endDate: '',
      recurrence: 'weekly',
      recurrenceEndDate: isoDaysFromToday(58),
      ...extra,
    },
    currentStep: 3,
  });
  const list = () => screen.getByTestId('series-dates');
  const removeButtons = () => within(list()).getAllByRole('button', { name: /entfernen$/ });

  async function submitAndGetPayload() {
    fireEvent.click(screen.getByTestId('continue-button'));
    await waitFor(() => expect(onSummary()).toBe(true));
    fireEvent.click(screen.getByTestId('submit-event-button'));
    await waitFor(() => {
      expect(document.querySelector('.confirm-dialog')).not.toBeNull();
    });
    const dialog = document.querySelector('.confirm-dialog') as HTMLElement;
    const buttons = within(dialog).getAllByRole('button');
    fireEvent.click(buttons[buttons.length - 1]);
    await waitFor(() => expect(mockEvents.addEvent).toHaveBeenCalledTimes(1));
    return (mockEvents.addEvent.mock.calls[0] as unknown as unknown[])[0] as Record<
      string,
      unknown
    >;
  }
  const onSummary = () => screen.queryByTestId('submit-event-button') !== null;

  it('shows "Deine Termine (N)" once a series has an end date', () => {
    seedDraft(series());
    renderWizard();
    expect(within(list()).getByText('Deine Termine (5)')).toBeInTheDocument();
    expect(within(list()).getAllByRole('listitem')).toHaveLength(5);
  });

  it('shows nothing without an end date or for a one-off event', () => {
    seedDraft(series({ recurrenceEndDate: '' }));
    const { unmount } = renderWizard();
    expect(screen.queryByTestId('series-dates')).toBeNull();
    unmount();
    localStorage.clear();
    seedDraft(series({ recurrence: 'none' }));
    renderWizard();
    expect(screen.queryByTestId('series-dates')).toBeNull();
  });

  it('does not offer to remove the first date and explains why', () => {
    seedDraft(series());
    renderWizard();
    const first = within(list()).getAllByRole('listitem')[0];
    expect(within(first).queryByRole('button')).toBeNull();
    expect(first).toHaveTextContent('Verschiebe dazu das Startdatum');
    expect(removeButtons()).toHaveLength(4);
  });

  it('keeps a removed date struck through, restores it, and saves the exceptions', async () => {
    seedDraft(series());
    renderWizard();
    fireEvent.click(removeButtons()[0]);
    expect(within(list()).getByText('Deine Termine (4, 1 entfernt)')).toBeInTheDocument();
    expect(within(list()).getAllByRole('listitem')).toHaveLength(5);

    fireEvent.click(removeButtons()[0]);
    fireEvent.click(within(list()).getAllByRole('button', { name: /wiederherstellen$/ })[0]);
    expect(within(list()).getByText('Deine Termine (4, 1 entfernt)')).toBeInTheDocument();

    const payload = await submitAndGetPayload();
    expect(payload.exceptionDates).toHaveLength(1);
    expect(payload.exceptionDates).toEqual([isoDaysFromToday(44)]);
  });

  it('shows the count in the summary', async () => {
    seedDraft(series({ exceptionDates: [isoDaysFromToday(37)] }));
    renderWizard();
    fireEvent.click(screen.getByTestId('continue-button'));
    await waitFor(() => expect(onSummary()).toBe(true));
    expect(screen.getByText(/4 Termine, 1 entfernt/)).toBeInTheDocument();
  });

  it('drops exceptions that fall outside the series when the end date changes', async () => {
    seedDraft(series({ exceptionDates: [isoDaysFromToday(37), isoDaysFromToday(51)] }));
    renderWizard();
    expect(within(list()).getByText('Deine Termine (3, 2 entfernt)')).toBeInTheDocument();

    fireEvent.change(document.getElementById('recurrenceEndDate') as HTMLElement, {
      target: { value: isoDaysFromToday(44) },
    });
    expect(within(list()).getByText('Deine Termine (2, 1 entfernt)')).toBeInTheDocument();

    const payload = await submitAndGetPayload();
    expect(payload.exceptionDates).toEqual([isoDaysFromToday(37)]);
  });

  it('sends no exceptions for a one-off event', async () => {
    seedDraft(
      series({ recurrence: 'none', recurrenceEndDate: '', exceptionDates: ['2030-01-01'] })
    );
    renderWizard();
    const payload = await submitAndGetPayload();
    expect(payload.exceptionDates).toEqual([]);
  });

  it('collapses long series to eight dates until "Alle anzeigen"', () => {
    seedDraft(series({ recurrenceEndDate: isoDaysFromToday(30 + 7 * 11) }));
    renderWizard();
    expect(within(list()).getByText('Deine Termine (12)')).toBeInTheDocument();
    expect(within(list()).getAllByRole('listitem')).toHaveLength(8);
    fireEvent.click(within(list()).getByRole('button', { name: /Alle anzeigen/ }));
    expect(within(list()).getAllByRole('listitem')).toHaveLength(12);
  });
});

describe('EventFormWizard — own time per single date (6afd86b4)', () => {
  const customDraft = (extra: Record<string, unknown> = {}) =>
    seedDraft({
      formData: {
        date: '2030-05-01',
        time: '10:00',
        endTime: '12:00',
        endDate: '',
        recurrence: 'custom',
        recurrenceEndDate: '',
        customDates: ['2030-05-08', '2030-05-15'],
        ...extra,
      },
    });
  const timeInput = (i: number) => screen.getByTestId(`custom-time-input-${i}`) as HTMLInputElement;
  const endInput = (i: number) =>
    screen.getByTestId(`custom-end-time-input-${i}`) as HTMLInputElement;
  const setValue = (el: HTMLElement, value: string) => fireEvent.change(el, { target: { value } });

  async function submitAndGetPayload() {
    fireEvent.click(screen.getByTestId('continue-button'));
    await waitFor(() => expect(screen.queryByTestId('submit-event-button')).not.toBeNull());
    fireEvent.click(screen.getByTestId('submit-event-button'));
    await waitFor(() => expect(document.querySelector('.confirm-dialog')).not.toBeNull());
    const dialog = document.querySelector('.confirm-dialog') as HTMLElement;
    const buttons = within(dialog).getAllByRole('button');
    fireEvent.click(buttons[buttons.length - 1]);
    await waitFor(() => expect(mockEvents.addEvent).toHaveBeenCalledTimes(1));
    return (mockEvents.addEvent.mock.calls[0] as unknown as unknown[])[0] as Record<
      string,
      unknown
    >;
  }

  it('prefills every date with the time from above and moves untouched dates along', () => {
    customDraft();
    renderWizard();
    expect(timeInput(0).value).toBe('10:00');
    expect(endInput(0).value).toBe('12:00');

    setValue(timeInput(1), '18:00');
    setValue(document.getElementById('time') as HTMLElement, '09:00');
    setValue(document.getElementById('endTime') as HTMLElement, '11:00');

    expect(timeInput(0).value).toBe('09:00');
    expect(endInput(0).value).toBe('11:00');
    // Own start stays, the end that was never touched follows.
    expect(timeInput(1).value).toBe('18:00');
    expect(endInput(1).value).toBe('11:00');
  });

  it('saves only the dates whose time differs from the one above', async () => {
    customDraft();
    renderWizard();
    setValue(timeInput(0), '10:00'); // same as above: not saved
    setValue(timeInput(1), '18:00');
    setValue(endInput(1), '20:00');

    const payload = await submitAndGetPayload();
    expect(payload).toMatchObject({ time: '10:00', endTime: '12:00' });
    expect(payload.customTimes).toEqual({ '2030-05-15': { time: '18:00', endTime: '20:00' } });
  });

  it('a date that gets another date takes its own time along', async () => {
    customDraft();
    renderWizard();
    setValue(timeInput(1), '18:00');
    setValue(endInput(1), '20:00');
    setValue(screen.getByTestId('custom-date-input-1'), '2030-05-22');
    expect(timeInput(1).value).toBe('18:00');

    const payload = await submitAndGetPayload();
    expect(payload.customTimes).toEqual({ '2030-05-22': { time: '18:00', endTime: '20:00' } });
  });

  it('blocks Weiter when the end of a date lies before its start', async () => {
    customDraft();
    renderWizard();
    setValue(timeInput(0), '19:00');
    fireEvent.click(screen.getByTestId('continue-button'));

    await waitFor(() => expect(screen.getByTestId('custom-times-error')).toBeInTheDocument());
    expect(endInput(0)).toHaveClass('input-error');
    expect(screen.queryByTestId('submit-event-button')).toBeNull();
  });

  it('another kind of repetition drops the own times', async () => {
    customDraft({ customTimes: { '2030-05-08': { time: '18:00' } } });
    renderWizard();
    expect(timeInput(0).value).toBe('18:00');
    fireEvent.click(screen.getByLabelText('Wöchentlich'));
    setValue(document.getElementById('recurrenceEndDate') as HTMLElement, '2030-06-01');
    fireEvent.click(screen.getByLabelText('Benutzerdefinierte Termine'));
    expect(timeInput(0).value).toBe('10:00');
  });
});
