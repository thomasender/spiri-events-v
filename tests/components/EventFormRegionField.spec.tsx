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
vi.mock('../../src/hooks/useOrganizerProfile', () => ({
  useOrganizerProfile: () => ({ profile: null }),
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
    expect(document.querySelectorAll('#gemeinden-list option')).toHaveLength(96);
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
    expect((document.getElementById('city') as HTMLInputElement).value).toBe('Dornbirn');
    expect(bezirk()).toBeNull();

    changeRegionViaDialog('bayern');

    expect(screen.getByLabelText('Landkreis *')).toBeInTheDocument();
    expect(bezirk().value).toBe('');
    expect((document.getElementById('city') as HTMLInputElement).value).toBe('');
    expect(optionTexts(bezirk())).toContain('Oberallgäu');
    expect(optionTexts(bezirk())[0]).toBe('Landkreis auswählen...');
    expect(optionTexts(bezirk())).not.toContain('Dornbirn');
  });

  it('asks for the Landkreis when none is chosen', () => {
    seedWizardDraft({ regionId: 'bayern' });
    render(withRegions(regionContext(['vorarlberg', 'bayern']), <EventFormWizard />));

    fireEvent.click(screen.getByRole('button', { name: /^weiter$/i }));

    expect(screen.getByText(/Bitte Landkreis auswählen oder als Online-Event/)).toBeInTheDocument();
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
    seedWizardDraft({ isOnline: true, bezirk: '', regionId: 'tirol' }, 3);
    render(withRegions(regionContext(['vorarlberg', 'tirol']), <EventFormWizard />));

    expect(document.getElementById('bezirk')).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: /^weiter$/i }));
    await waitFor(() => expect(screen.getByTestId('submit-event-button')).toBeInTheDocument());
    const saved = await submitWizardAndGetEvent();
    expect(saved).toMatchObject({ isOnline: true, bezirk: '', regionId: 'tirol' });
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
    fireEvent.change(document.getElementById('city') as HTMLElement, {
      target: { value: 'Dornbirn' },
    });
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
