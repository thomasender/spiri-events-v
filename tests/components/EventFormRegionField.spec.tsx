import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import type { ReactNode } from 'react';
import { RegionContext, DEFAULT_REGION_CONTEXT } from '../../src/hooks/useRegion';
import { STATIC_REGIONS, mergeRegions } from '../../src/utils/regions';

// The "Region" field of the event forms: only with two or more active
// regions, before the Bezirk / Landkreis field, whose options follow it.

const mockAuth = vi.hoisted(() => ({
  user: { uid: 'user-uid', email: 'user@test.local', emailVerified: true } as Record<
    string,
    unknown
  >,
  role: null as string | null,
  staffRegionIds: [] as string[],
}));

const mockEvents = vi.hoisted(() => ({
  addEvent: vi.fn(async () => ({ id: 'new-event-id' })),
  updateEvent: vi.fn(async () => ({})),
  deleteEvent: vi.fn(async () => {}),
  submitForReview: vi.fn(async () => {}),
  revertToDraft: vi.fn(async () => {}),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => vi.fn() };
});
vi.mock('../../src/hooks/useAuth', () => ({ useAuth: () => mockAuth }));
vi.mock('../../src/hooks/useProfile', () => ({ useProfile: () => ({ profile: null }) }));
// The person's public profile (directory listing), read by the online-event gate.
const mockOrganizer = vi.hoisted(() => ({ profile: null as Record<string, unknown> | null }));
vi.mock('../../src/hooks/useOrganizerProfile', () => ({
  useOrganizerProfile: () => ({ profile: mockOrganizer.profile, loading: false }),
}));
vi.mock('../../src/hooks/useEvents', () => ({
  useEvents: () => mockEvents,
  useAllEvents: () => ({ events: [], loading: false, error: null }),
  KATEGORIEN: ['Yoga', 'Sonstiges'],
  BEZIRKE: ['Bregenz', 'Dornbirn', 'Feldkirch', 'Bludenz', 'Grenznahe'],
}));
vi.mock('../../src/hooks/useCategories', () => ({ useCategories: () => ['Yoga', 'Sonstiges'] }));
vi.mock('../../src/lib/imageUpload', () => ({
  uploadImage: vi.fn(async () => 'https://example.com/test.jpg'),
  deleteImageByUrl: vi.fn(async () => {}),
  getImageDimensions: vi.fn(async () => ({ width: 1200, height: 800 })),
  getAspectRatioRecommendation: vi.fn(() => ({ isRecommended: true })),
  MAX_INPUT_SIZE_BYTES: 5 * 1024 * 1024,
}));

const placeData = vi.hoisted(() => ({ loadPlaceIndex: vi.fn() }));
vi.mock('../../src/lib/placeData', async () => {
  const search = await import('../../src/utils/placeSearch');
  const { RAW_INDEX } = await import('../fixtures/smallPlaceIndex');
  placeData.loadPlaceIndex.mockImplementation(() =>
    Promise.resolve(search.preparePlaceIndex(RAW_INDEX))
  );
  return placeData;
});

import EventFormWizard from '../../src/components/EventFormWizard';
import EventForm from '../../src/components/EventForm';

// Static register with the given regions active; Tirol has its Bezirke like
// the emulator fixture (they come from Firestore in the app).
function regionContext(activeIds: string[], currentId = 'vorarlberg') {
  const allRegions = mergeRegions([
    ...STATIC_REGIONS.map((r) => ({ id: r.id, active: activeIds.includes(r.id) })),
    { id: 'tirol', active: activeIds.includes('tirol'), bezirke: ['Innsbruck', 'Kufstein'] },
  ]);
  const regions = allRegions.filter((r) => r.active);
  return {
    ...DEFAULT_REGION_CONTEXT,
    allRegions,
    regions,
    regionId: currentId,
    region: allRegions.find((r) => r.id === currentId) ?? null,
  };
}

const withRegions = (
  ctx: ReturnType<typeof regionContext>,
  ui: ReactNode,
  entry = '/admin/new'
) => (
  <HelmetProvider>
    <RegionContext.Provider value={ctx as never}>
      <MemoryRouter initialEntries={[entry]}>{ui}</MemoryRouter>
    </RegionContext.Provider>
  </HelmetProvider>
);

// A directory listing in Tirol that names a Tirol Bezirk (qualifies for online events there).
const TIROL_LISTING = {
  listedInDirectory: true,
  directoryRegionIds: ['tirol'],
  directoryRegions: ['Innsbruck', 'Online'],
};

const FUTURE_DATE = (() => {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d.toISOString().split('T')[0];
})();

function seedWizardDraft(formData: Record<string, unknown> = {}, currentStep = 3) {
  localStorage.setItem(
    'eventWizardDraft:user-uid',
    JSON.stringify({
      version: 1,
      savedAt: Date.now(),
      draft: {
        formData: {
          title: 'Region Test Event',
          date: FUTURE_DATE,
          time: '10:00',
          endDate: '',
          place: 'Ort',
          city: 'Testort',
          contribution: 'free',
          priceCurrency: 'EUR',
          description: '<p>Beschreibung</p>',
          recurrence: 'none',
          customDates: [],
          category: 'Yoga',
          bezirk: '',
          isOnline: false,
          organizer: { name: 'Test User', email: 'user@test.local' },
          kontakt: 'user@test.local',
          ...formData,
        },
        currentStep,
        rightsConfirmed: true,
      },
    })
  );
}

// The region field is gone. In Vorarlberg (Gemeinde field) the region changes via
// "Der Ort liegt in einer anderen Region", elsewhere via "Finde meinen Bezirk nicht".
function openRegionDialog() {
  const other = screen.queryByRole('button', { name: 'Der Ort liegt in einer anderen Region' });
  if (other) {
    fireEvent.click(other);
    return;
  }
  fireEvent.change(document.getElementById('bezirk') as HTMLElement, {
    target: { value: '__bezirk-not-found__' },
  });
}

function changeRegionViaDialog(regionId: string) {
  openRegionDialog();
  const dialog = screen.getByTestId('event-region-dialog');
  fireEvent.change(within(dialog).getByLabelText('Region'), { target: { value: regionId } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Region ändern' }));
}

const optionTexts = (select: HTMLElement) =>
  within(select)
    .getAllByRole('option')
    .map((o) => o.textContent);

beforeEach(() => {
  localStorage.clear();
  mockAuth.user = { uid: 'user-uid', email: 'user@test.local', emailVerified: true };
  mockAuth.role = null;
  mockAuth.staffRegionIds = [];
  mockOrganizer.profile = null;
  mockEvents.addEvent.mockClear();
  mockEvents.updateEvent.mockClear();
});

async function submitWizardAndGetEvent() {
  fireEvent.click(screen.getByTestId('submit-event-button'));
  await waitFor(() => expect(document.querySelector('.confirm-dialog')).not.toBeNull());
  const dialog = document.querySelector('.confirm-dialog') as HTMLElement;
  fireEvent.click(within(dialog).getByRole('button', { name: /^einreichen$/i }));
  await waitFor(() => expect(mockEvents.addEvent).toHaveBeenCalled());
  return (mockEvents.addEvent.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
}

describe('EventFormWizard region field', () => {
  it('shows no region field and a Gemeinde field with a single active region', () => {
    seedWizardDraft();
    render(withRegions(regionContext(['vorarlberg']), <EventFormWizard />));

    expect(screen.queryByTestId('event-region-field')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Ort *')).toBeInTheDocument();
    expect(document.getElementById('bezirk')).toBeNull();
    fireEvent.keyDown(screen.getByLabelText('Ort *'), { key: 'ArrowDown', code: 'ArrowDown' });
    expect(document.querySelectorAll('.kategorie__option')).toHaveLength(96);
    expect(
      screen.queryByRole('button', { name: 'Der Ort liegt in einer anderen Region' })
    ).not.toBeInTheDocument();
  });

  it('offers to change the region from the Gemeinde field when several regions are active', () => {
    seedWizardDraft();
    render(withRegions(regionContext(['vorarlberg', 'tirol'], 'vorarlberg'), <EventFormWizard />));

    expect(document.getElementById('bezirk')).toBeNull();
    openRegionDialog();
    expect(screen.getByTestId('event-region-dialog')).toHaveTextContent('Region Vorarlberg');
  });

  it('with two active regions: no region field, Bezirke of the current region, extra option', () => {
    seedWizardDraft();
    render(withRegions(regionContext(['vorarlberg', 'tirol'], 'tirol'), <EventFormWizard />));

    expect(screen.queryByTestId('event-region-field')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Region *')).not.toBeInTheDocument();
    expect(optionTexts(document.getElementById('bezirk') as HTMLElement)).toEqual([
      'Bezirk auswählen...',
      'Innsbruck',
      'Kufstein',
      'Finde meinen Bezirk nicht',
    ]);
  });

  it('?region=tirol (coming-soon page) enters the event for a region that is not open yet', async () => {
    seedWizardDraft({ bezirk: 'Innsbruck' }, 4);
    render(
      withRegions(
        regionContext(['vorarlberg', 'bayern']),
        <EventFormWizard />,
        '/admin/new?region=tirol'
      )
    );

    const saved = await submitWizardAndGetEvent();
    expect(saved.regionId).toBe('tirol');
    expect(saved.bezirk).toBe('Innsbruck');
  });

  it('"Finde meinen Bezirk nicht" names the current region and cancelling changes nothing', () => {
    seedWizardDraft();
    render(withRegions(regionContext(['vorarlberg', 'tirol'], 'tirol'), <EventFormWizard />));

    fireEvent.change(document.getElementById('bezirk') as HTMLElement, {
      target: { value: '__bezirk-not-found__' },
    });
    const dialog = screen.getByTestId('event-region-dialog');
    expect(dialog).toHaveTextContent('Du bist gerade in der Region Tirol');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Nein, hier bleiben' }));

    expect(screen.queryByTestId('event-region-dialog')).not.toBeInTheDocument();
    expect((document.getElementById('bezirk') as HTMLSelectElement).value).toBe('');
    expect(optionTexts(document.getElementById('bezirk') as HTMLElement)).toContain('Innsbruck');
  });

  it('uses "Landkreis" for the Bayern and resets a Bezirk that no longer fits when the region changes', () => {
    seedWizardDraft({ bezirk: 'Dornbirn', city: 'Dornbirn', regionId: 'vorarlberg' });
    render(withRegions(regionContext(['vorarlberg', 'bayern']), <EventFormWizard />));

    const bezirk = () => document.getElementById('bezirk') as HTMLSelectElement;
    expect(document.querySelector('.kategorie__single-value')).toHaveTextContent('Dornbirn');
    expect(bezirk()).toBeNull();

    changeRegionViaDialog('bayern');

    expect(screen.getByLabelText('Landkreis')).toBeInTheDocument();
    expect(bezirk().value).toBe('');
    expect((document.getElementById('city') as HTMLInputElement).value).toBe('');
    expect(optionTexts(bezirk())).toContain('Oberallgäu');
    expect(optionTexts(bezirk())[0]).toBe('Landkreis auswählen...');
    expect(optionTexts(bezirk())).not.toContain('Dornbirn');
  });

  it('lets an Ort without Landkreis through (a place in no list, e.g. Liechtenstein)', () => {
    seedWizardDraft({ regionId: 'bayern', city: 'Ruggell', bezirk: '' });
    render(withRegions(regionContext(['vorarlberg', 'bayern']), <EventFormWizard />));

    fireEvent.click(screen.getByRole('button', { name: /^weiter$/i }));

    expect(screen.queryByText(/Bitte Landkreis auswählen/)).not.toBeInTheDocument();
    expect(document.getElementById('city')).toBeNull(); // next step
  });

  it('submits regionId and bezirk of the chosen region', async () => {
    seedWizardDraft({ bezirk: 'Innsbruck', regionId: 'tirol' }, 4);
    render(withRegions(regionContext(['vorarlberg', 'tirol']), <EventFormWizard />));

    const saved = await submitWizardAndGetEvent();

    expect(saved.regionId).toBe('tirol');
    expect(saved.bezirk).toBe('Innsbruck');
  });

  it('submits the preselected current region when the person never touched the field', async () => {
    seedWizardDraft({ bezirk: 'Kufstein' }, 4);
    render(withRegions(regionContext(['vorarlberg', 'tirol'], 'tirol'), <EventFormWizard />));

    const saved = await submitWizardAndGetEvent();

    expect(saved.regionId).toBe('tirol');
  });

  it('online event: no Bezirk, the region still counts', async () => {
    mockOrganizer.profile = TIROL_LISTING;
    seedWizardDraft({ isOnline: true, bezirk: '', regionId: 'tirol' }, 3);
    render(withRegions(regionContext(['vorarlberg', 'tirol']), <EventFormWizard />));

    expect(document.getElementById('bezirk')).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: /^weiter$/i }));
    await waitFor(() => expect(screen.getByTestId('submit-event-button')).toBeInTheDocument());
    const saved = await submitWizardAndGetEvent();
    expect(saved).toMatchObject({ isOnline: true, bezirk: '', regionId: 'tirol' });
  });

  it('offers "Online-Event" only with a directory listing that names a Bezirk of the region', () => {
    seedWizardDraft({ regionId: 'tirol' });
    const ctx = regionContext(['vorarlberg', 'tirol'], 'tirol');
    const { unmount } = render(withRegions(ctx, <EventFormWizard />));
    expect(screen.getByTestId('is-online-checkbox')).toBeDisabled();
    expect(screen.getByTestId('online-event-hint')).toHaveTextContent(
      'Online-Events sind nur möglich, wenn du im Verzeichnis für Tirol gelistet bist'
    );
    unmount();

    // Listed in Tirol, but only with the "Online" chip: still no Bezirk of Tirol.
    mockOrganizer.profile = { ...TIROL_LISTING, directoryRegions: ['Online'] };
    const second = render(withRegions(ctx, <EventFormWizard />));
    expect(screen.getByTestId('is-online-checkbox')).toBeDisabled();
    expect(screen.getByTestId('online-event-hint')).toHaveTextContent(
      'mindestens einen Bezirk in Tirol nennt'
    );
    second.unmount();

    mockOrganizer.profile = TIROL_LISTING;
    render(withRegions(ctx, <EventFormWizard />));
    expect(screen.getByTestId('is-online-checkbox')).not.toBeDisabled();
    expect(screen.queryByTestId('online-event-hint')).not.toBeInTheDocument();
  });

  it('online-event gate: off with one active region and for staff', () => {
    seedWizardDraft();
    const { unmount } = render(withRegions(regionContext(['vorarlberg']), <EventFormWizard />));
    expect(screen.getByTestId('is-online-checkbox')).not.toBeDisabled();
    expect(screen.queryByTestId('online-event-hint')).not.toBeInTheDocument();
    unmount();

    mockAuth.role = 'Admin';
    render(withRegions(regionContext(['vorarlberg', 'tirol'], 'tirol'), <EventFormWizard />));
    expect(screen.getByTestId('is-online-checkbox')).not.toBeDisabled();
    expect(screen.queryByTestId('online-event-hint')).not.toBeInTheDocument();
  });

  it('ordinary organizers cannot pick inactive regions, moderators can pick their own', () => {
    seedWizardDraft();
    const ctx = regionContext(['vorarlberg', 'tirol']);
    const regionOptions = () => {
      openRegionDialog();
      return optionTexts(
        within(screen.getByTestId('event-region-dialog')).getByLabelText('Region')
      );
    };
    const { unmount } = render(withRegions(ctx, <EventFormWizard />));
    expect(regionOptions()).toEqual(['Vorarlberg', 'Tirol']);
    unmount();

    mockAuth.role = 'RegionModerator';
    mockAuth.staffRegionIds = ['wien'];
    render(withRegions(ctx, <EventFormWizard />));
    expect(regionOptions()).toEqual(['Vorarlberg', 'Tirol', 'Wien (noch nicht freigeschaltet)']);
  });
});

describe('Ort -> Landkreis in regions without a Gemeinde list', () => {
  // Bayern and a cultural region (Ruhrgebiet, districts as assigned in Verwaltung).
  function deContext(currentId: string) {
    const allRegions = mergeRegions([
      ...STATIC_REGIONS.map((r) => ({
        id: r.id,
        active: ['vorarlberg', 'bayern', 'ruhrgebiet'].includes(r.id),
      })),
      { id: 'ruhrgebiet', active: true, bezirke: ['Essen', 'Dortmund'] },
    ]);
    return {
      ...DEFAULT_REGION_CONTEXT,
      allRegions,
      regions: allRegions.filter((r) => r.active),
      regionId: currentId,
      region: allRegions.find((r) => r.id === currentId) ?? null,
    };
  }
  const city = () => document.getElementById('city') as HTMLInputElement;
  const bezirk = () => document.getElementById('bezirk') as HTMLSelectElement;
  const typeCity = (value: string) => {
    fireEvent.focus(city());
    fireEvent.change(city(), { target: { value } });
  };

  it('picking a place sets the Landkreis, which stays editable', async () => {
    seedWizardDraft({ city: '', regionId: 'ruhrgebiet' });
    render(withRegions(deContext('ruhrgebiet'), <EventFormWizard />));

    typeCity('Dort');
    fireEvent.click((await screen.findAllByTestId('city-place-option'))[0]);

    expect(city().value).toBe('Dortmund');
    expect(bezirk().value).toBe('Dortmund');
    expect(screen.getByTestId('city-district-hint')).toHaveTextContent('Landkreis Dortmund');

    fireEvent.change(bezirk(), { target: { value: 'Essen' } });
    expect(bezirk().value).toBe('Essen');
    expect(city().value).toBe('Dortmund');
    expect(screen.queryByTestId('city-district-hint')).not.toBeInTheDocument();
  });

  it('a picked place decides its Landkreis; a place of another open region moves the form there', async () => {
    seedWizardDraft({ city: '', regionId: 'bayern' });
    render(withRegions(deContext('bayern'), <EventFormWizard />));

    typeCity('Neustadt');
    const options = await screen.findAllByTestId('city-place-option');
    expect(options).toHaveLength(2);
    fireEvent.click(options[0]);
    expect(city().value).toBe('Neustadt');
    expect(bezirk().value).toBe('Neustadt a.d.Aisch-Bad Windsheim');
  });

  it('a place of another open region moves the form there', async () => {
    seedWizardDraft({ city: '', regionId: 'bayern' });
    render(
      withRegions(regionContext(['vorarlberg', 'bayern', 'tirol'], 'bayern'), <EventFormWizard />)
    );

    typeCity('Inns');
    fireEvent.click(await screen.findByText('Innsbruck'));
    expect(city().value).toBe('Innsbruck');
    expect(bezirk().value).toBe('Innsbruck');
    expect(optionTexts(bezirk())).toContain('Kufstein');
    expect(screen.getByLabelText('Bezirk')).toBeInTheDocument();
    expect(screen.queryByTestId('city-region-hint')).not.toBeInTheDocument();
  });
});

describe('Ort decides the region while only Vorarlberg is active', () => {
  it('a place of a region that is not open yet goes there, with a hint', async () => {
    seedWizardDraft({ city: '', bezirk: '' });
    render(withRegions(regionContext(['vorarlberg']), <EventFormWizard />));
    expect(screen.queryByTestId('city-region-hint')).not.toBeInTheDocument();

    const ort = screen.getByLabelText('Ort *');
    fireEvent.focus(ort);
    fireEvent.change(ort, { target: { value: 'Lind' } });
    fireEvent.click(await screen.findByRole('option', { name: /Lindau \(Bodensee\)/ }));

    expect(screen.getByTestId('city-region-hint')).toHaveTextContent(
      'Dieser Ort gehört zur Region Bayern, die noch nicht freigeschaltet ist. Dein Event erscheint dort ab der Freischaltung.'
    );
    expect(document.getElementById('bezirk')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /^weiter$/i }));
    const saved = await submitWizardAndGetEvent();
    expect(saved.regionId).toBe('bayern');
    expect(saved.bezirk).toBe('Lindau (Bodensee)');
    expect(saved.city).toBe('Lindau (Bodensee)');
  });

  it('a place in no list stays in Vorarlberg without Bezirk; a Gemeinde as before', async () => {
    seedWizardDraft({ city: 'Ruggell', bezirk: '' }, 4);
    render(withRegions(regionContext(['vorarlberg']), <EventFormWizard />));
    const saved = await submitWizardAndGetEvent();
    expect(saved.regionId).toBe('vorarlberg');
    expect(saved.bezirk).toBe('');
    expect(saved.city).toBe('Ruggell');
  });
});

describe('EventForm (edit) of an old "Umgebung" event', () => {
  it('keeps "Grenznahe" and Vorarlberg on save and shows "Umgebung"', async () => {
    const legacy = {
      id: 'g1',
      slug: 'g1',
      title: 'Yoga am See',
      date: '2026-12-10',
      time: '10:00',
      endTime: '',
      place: 'Hafen',
      city: 'Lindau',
      contribution: 'free',
      fee: null,
      description: '<p>desc</p>',
      link: '',
      recurrence: 'none',
      recurrenceEndDate: '',
      category: 'Yoga',
      bezirk: 'Grenznahe',
      organizer: { firstName: 'A', lastName: 'B', email: 'user@test.local' },
      kontakt: 'user@test.local',
      status: 'pending',
      createdBy: 'user-uid',
    };
    render(withRegions(regionContext(['vorarlberg']), <EventForm event={legacy} />));
    expect(screen.getByTestId('city-district-hint')).toHaveTextContent('Umgebung');
    expect(screen.queryByTestId('city-region-hint')).not.toBeInTheDocument();
    fireEvent.submit(screen.getByTestId('submit-event-button').closest('form') as HTMLFormElement);
    await waitFor(() => expect(mockEvents.updateEvent).toHaveBeenCalled());
    const saved = (mockEvents.updateEvent.mock.calls[0] as unknown[])[1] as Record<string, unknown>;
    expect(saved.bezirk).toBe('Grenznahe');
    expect(saved.regionId).toBe('vorarlberg');
    expect(saved.city).toBe('Lindau');
  });
});

describe('EventForm (edit) region field', () => {
  const storedEvent = {
    id: 'e1',
    slug: 'e1',
    title: 'Yoga Innsbruck',
    date: '2026-12-10',
    time: '10:00',
    endTime: '',
    place: 'Ort',
    city: 'Innsbruck',
    contribution: 'free',
    fee: null,
    description: '<p>desc</p>',
    link: '',
    recurrence: 'none',
    recurrenceEndDate: '',
    category: 'Yoga',
    bezirk: 'Innsbruck',
    regionId: 'tirol',
    organizer: { firstName: 'A', lastName: 'B', email: 'user@test.local' },
    kontakt: 'user@test.local',
    status: 'pending',
    createdBy: 'user-uid',
  };

  const submitForm = () =>
    fireEvent.submit(screen.getByTestId('submit-event-button').closest('form') as HTMLFormElement);
  const savedPayload = async () => {
    await waitFor(() => expect(mockEvents.updateEvent).toHaveBeenCalled());
    return (mockEvents.updateEvent.mock.calls[0] as unknown[])[1] as Record<string, unknown>;
  };

  it('shows the stored region (not the current one) and keeps it on save', async () => {
    render(
      withRegions(
        regionContext(['vorarlberg', 'tirol'], 'vorarlberg'),
        <EventForm event={storedEvent} />
      )
    );

    expect(screen.queryByLabelText('Region *')).not.toBeInTheDocument();
    expect((document.getElementById('bezirk') as HTMLSelectElement).value).toBe('Innsbruck');

    submitForm();
    expect(await savedPayload()).toMatchObject({ regionId: 'tirol', bezirk: 'Innsbruck' });
  });

  it('keeps the stored region even when it is no longer selectable for this person', async () => {
    render(
      withRegions(
        regionContext(['vorarlberg', 'steiermark']),
        <EventForm event={{ ...storedEvent, regionId: 'tirol', bezirk: 'Innsbruck' }} />
      )
    );

    openRegionDialog();
    expect(
      optionTexts(within(screen.getByTestId('event-region-dialog')).getByLabelText('Region'))
    ).toContain('Tirol (noch nicht freigeschaltet)');
    fireEvent.click(screen.getByRole('button', { name: 'Nein, hier bleiben' }));
    submitForm();
    expect((await savedPayload()).regionId).toBe('tirol');
  });

  it('treats an event without regionId as Vorarlberg, not as the current region', async () => {
    render(
      withRegions(
        regionContext(['vorarlberg', 'tirol'], 'tirol'),
        <EventForm
          event={{ ...storedEvent, regionId: undefined, bezirk: 'Dornbirn', city: 'Dornbirn' }}
        />
      )
    );

    openRegionDialog();
    expect(screen.getByTestId('event-region-dialog')).toHaveTextContent('Region Vorarlberg');
    fireEvent.click(screen.getByRole('button', { name: 'Nein, hier bleiben' }));
    submitForm();
    expect(await savedPayload()).toMatchObject({ regionId: 'vorarlberg', bezirk: 'Dornbirn' });
  });

  it('changing the region saves the new region and clears the old Bezirk', async () => {
    render(withRegions(regionContext(['vorarlberg', 'tirol']), <EventForm event={storedEvent} />));

    changeRegionViaDialog('vorarlberg');
    expect(document.getElementById('bezirk')).toBeNull();
    const city = document.getElementById('city') as HTMLElement;
    fireEvent.change(city, { target: { value: 'Dornbirn' } });
    fireEvent.keyDown(city, { key: 'Enter', code: 'Enter' });
    submitForm();

    expect(await savedPayload()).toMatchObject({ regionId: 'vorarlberg', bezirk: 'Dornbirn' });
  });

  it('with one active region nothing changes: no field, stored region kept', async () => {
    render(withRegions(regionContext(['vorarlberg']), <EventForm event={storedEvent} />));

    expect(screen.queryByTestId('event-region-field')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Ort *')).toBeInTheDocument();
    submitForm();
    expect((await savedPayload()).regionId).toBe('tirol');
  });
});

// Example placeholders follow the region of the event (Verwaltung texts > first
// Bezirk > neutral); with only Vorarlberg active they stay as they always were.
describe('event form example texts', () => {
  const TEXTS = {
    id: 'tirol',
    active: true,
    bezirke: ['Innsbruck', 'Kufstein'],
    texts: { examples: { organizer: 'Yoga Studio Inntal', address: 'Maria-Theresien-Str. 1' } },
  };
  const ctxWithTexts = (activeIds: string[], currentId: string) => {
    const base = regionContext(activeIds, currentId);
    const allRegions = mergeRegions([
      ...STATIC_REGIONS.map((r) => ({ id: r.id, active: activeIds.includes(r.id) })),
      TEXTS,
    ]);
    return {
      ...base,
      allRegions,
      region: allRegions.find((r) => r.id === currentId) ?? null,
    };
  };
  const ph = (id: string) => (document.getElementById(id) as HTMLInputElement).placeholder;

  it('only Vorarlberg active: exact old placeholders (wizard step with Ort and Adresse)', () => {
    seedWizardDraft();
    render(withRegions(ctxWithTexts(['vorarlberg'], 'vorarlberg'), <EventFormWizard />));
    expect(ph('place')).toBe('z.B. Yogastudio Mitte, Stadtstraße 12, 6900 Bregenz');
  });

  it('a Tirol event shows Tirol texts, neutral fallback and the first Bezirk, never Vorarlberg examples', () => {
    seedWizardDraft({ regionId: 'tirol' });
    render(withRegions(ctxWithTexts(['vorarlberg', 'tirol'], 'tirol'), <EventFormWizard />));
    expect(ph('city')).toBe('z.B. Innsbruck');
    expect(ph('place')).toBe('z.B. Maria-Theresien-Str. 1');
    expect(document.body.innerHTML).not.toMatch(/Lindau|6900 Bregenz/);
  });

  it('switching the region in the form swaps the placeholders back and forth (edit form, all fields)', () => {
    render(
      withRegions(
        ctxWithTexts(['vorarlberg', 'tirol'], 'tirol'),
        <EventForm event={{ ...storedEventForTexts(), regionId: 'tirol', bezirk: 'Innsbruck' }} />
      )
    );
    const organizer = () =>
      (document.getElementById('organizer.name') as HTMLInputElement)?.placeholder;
    expect(ph('city')).toBe('z.B. Innsbruck');
    expect(ph('place')).toBe('z.B. Maria-Theresien-Str. 1');
    expect(organizer()).toBe('z.B. Yoga Studio Inntal');
    expect(document.querySelector('input[name="kontakt"]')).toHaveProperty(
      'placeholder',
      'z.B. kontakt@email.de'
    );

    changeRegionViaDialog('vorarlberg');
    expect(ph('place')).toBe('z.B. Yogastudio Mitte, Stadtstraße 12, 6900 Bregenz');
    expect(organizer()).toBe('z.B. Peter Mathis oder Yoga Studio Dornbirn');
    expect(document.querySelector('input[name="kontakt"]')).toHaveProperty(
      'placeholder',
      'z.B. 0676 1234567 oder kontakt@email.de'
    );
  });
});

function storedEventForTexts() {
  return {
    id: 'ev1',
    title: 'T',
    date: FUTURE_DATE,
    time: '10:00',
    place: 'Ort',
    city: 'Innsbruck',
    contribution: 'free',
    description: '<p>d</p>',
    category: 'Yoga',
    organizer: { name: 'Test', email: 'user@test.local' },
    kontakt: 'x',
    status: 'draft',
    createdBy: 'user-uid',
  };
}
