import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import RegionMappingTab from '../../src/components/RegionMappingTab';
import { STATIC_REGIONS } from '../../src/utils/regions';
import { DISTRICT_CATALOG } from '../../src/utils/regionMapping';

const state = vi.hoisted(() => ({
  role: 'Admin' as string | null,
  staffRegionIds: [] as string[],
  locks: {} as Record<string, number>,
  saves: [] as Array<{ moves: Array<{ districtKey: string; toRegionId: string }> }>,
  saveError: null as null | { code: string; details?: unknown },
  refreshes: 0,
  active: { vorarlberg: true } as Record<string, boolean>,
  renames: [] as Array<{ id: string; data: Record<string, unknown> }>,
  creates: [] as Array<Record<string, unknown>>,
  createError: null as null | { code: string; details?: unknown },
  custom: [] as Array<Record<string, unknown>>,
}));

vi.mock('../../src/lib/firebase', () => ({ functions: {}, db: {} }));
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, _col: string, id: string) => ({ id }),
  serverTimestamp: () => 'ts',
  setDoc: async (ref: { id: string }, data: Record<string, unknown>) => {
    state.renames.push({ id: ref.id, data });
  },
}));
vi.mock('firebase/functions', () => ({
  httpsCallable: (_fns: unknown, name: string) => async (data: unknown) => {
    if (name === 'adminGetRegionMappingLocks') return { data: { locks: state.locks } };
    if (name === 'adminSaveRegionMapping') {
      state.saves.push(data as { moves: Array<{ districtKey: string; toRegionId: string }> });
      if (state.saveError) throw state.saveError;
      return { data: { changes: [] } };
    }
    if (name === 'adminCreateRegion') {
      state.creates.push(data as Record<string, unknown>);
      if (state.createError) throw state.createError;
      const input = data as { name: string; country: string };
      return { data: { regionId: 'neue-region', name: input.name } };
    }
    throw new Error(`unexpected callable ${name}`);
  },
}));
vi.mock('../../src/hooks/useAuth', () => ({
  useAuth: () => ({ user: { uid: 'me' }, role: state.role, staffRegionIds: state.staffRegionIds }),
}));
vi.mock('../../src/hooks/useRegions', () => ({
  useRegions: () => ({
    regions: [...STATIC_REGIONS, ...state.custom].map((r) => ({
      ...r,
      active: Boolean(state.active[r.id]),
    })),
    loading: false,
  }),
  refreshRegions: async () => {
    state.refreshes += 1;
  },
}));

beforeEach(() => {
  state.role = 'Admin';
  state.staffRegionIds = [];
  state.locks = {};
  state.saves = [];
  state.saveError = null;
  state.refreshes = 0;
  state.active = { vorarlberg: true };
  state.renames = [];
  state.creates = [];
  state.createError = null;
  state.custom = [];
});

const district = (key: string) =>
  waitFor(() => {
    const el = document.querySelector(`[data-district="${key}"]`);
    if (!el) throw new Error('map not loaded');
    return el;
  });

const pickViaSearch = async (text: string, regionName: string) => {
  fireEvent.change(screen.getByTestId('culture-search'), { target: { value: text } });
  const option = screen
    .getAllByRole('option')
    .find((o) => o.querySelector('strong')?.textContent === regionName)!;
  fireEvent.mouseDown(option);
  await screen.findByTestId('culture-panel');
};

describe('RegionMappingTab: cleaned-up page (no Bundesland UI)', () => {
  it('renders nothing for moderators and normal users', () => {
    for (const [role, ids] of [
      ['RegionModerator', ['tirol']],
      ['User', []],
      [null, []],
    ] as const) {
      state.role = role;
      state.staffRegionIds = [...ids];
      const { container, unmount } = render(<RegionMappingTab />);
      expect(container).toBeEmptyDOMElement();
      unmount();
    }
  });

  it('shows no Bundesland sections, filters, info cards or duplicate texts', () => {
    render(<RegionMappingTab />);
    expect(document.querySelector('[data-testid^="mapping-state-"]')).toBeNull();
    expect(screen.queryByTestId('mapping-info')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mapping-search')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mapping-target')).not.toBeInTheDocument();
    expect(screen.queryByText(/Ordnet die Landkreise und Städte/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Bundesländer \(Ausgangsstruktur\)/)).not.toBeInTheDocument();
    expect(screen.getByTestId('mapping-suggestion')).toBeInTheDocument();
  });

  it('lists districts without a cultural region, with the Bundesland as a small label', () => {
    render(<RegionMappingTab />);
    const box = screen.getByTestId('mapping-unassigned');
    expect(box).toHaveTextContent('Berlin');
    expect(box).toHaveTextContent('Hamburg');
    expect(box).toHaveTextContent('Stuttgart');
    expect(box).toHaveTextContent('Bayern');
    fireEvent.click(screen.getByTestId('mapping-suggestion'));
    expect(screen.getByTestId('mapping-draft')).toBeInTheDocument();
    const after = screen.getByTestId('mapping-unassigned');
    expect(after).toHaveTextContent('Berlin');
    expect(after).not.toHaveTextContent('Stuttgart');
    expect(state.saves).toHaveLength(0);
  });

  it('the suggestion skips districts that already have events', async () => {
    state.locks = { 'DE|Roth': 3 };
    render(<RegionMappingTab />);
    await waitFor(() => expect(state.locks).toBeTruthy());
    fireEvent.click(screen.getByTestId('mapping-suggestion'));
    expect(screen.getByTestId('mapping-unassigned')).toHaveTextContent('Roth');
    expect(screen.getByTestId('mapping-unassigned')).not.toHaveTextContent('Kitzingen');
  });

  it('unassigned entries can only be added once a region is picked', async () => {
    render(<RegionMappingTab />);
    const chips = () => within(screen.getByTestId('mapping-unassigned')).getAllByRole('button');
    expect(chips()[0]).toBeDisabled();
    await pickViaSearch('Tauberfr', 'Tauberfranken');
    const chip = chips().find((b) => b.textContent?.startsWith('Roth'))!;
    expect(chip).toBeEnabled();
    fireEvent.click(chip);
    expect(within(screen.getByTestId('culture-districts')).getByText(/Roth/)).toBeInTheDocument();
    expect(screen.getByTestId('mapping-draft')).toHaveTextContent('Tauberfranken: +1');
    expect(within(screen.getByTestId('mapping-unassigned')).queryByText(/^Roth/)).toBeNull();
  });

  it('discards the draft', () => {
    render(<RegionMappingTab />);
    fireEvent.click(screen.getByTestId('mapping-suggestion'));
    fireEvent.click(screen.getByRole('button', { name: 'Verwerfen' }));
    expect(screen.queryByTestId('mapping-draft')).not.toBeInTheDocument();
    expect(screen.getByTestId('mapping-unassigned')).toHaveTextContent('Stuttgart');
  });

  it('saves the draft after a confirmation, in one call', async () => {
    render(<RegionMappingTab />);
    await pickViaSearch('Tauberfr', 'Tauberfranken');
    fireEvent.change(screen.getByTestId('culture-add-input'), { target: { value: 'Roth' } });
    fireEvent.click(screen.getByTestId('culture-add-save'));
    fireEvent.click(screen.getByTestId('mapping-save'));
    expect(await screen.findByText('Zuordnung speichern?')).toBeInTheDocument();
    expect(state.saves).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    await waitFor(() => expect(state.saves).toHaveLength(1));
    expect(state.saves[0].moves).toEqual([{ districtKey: 'DE|Roth', toRegionId: 'tauberfranken' }]);
    expect(await screen.findByRole('status')).toHaveTextContent('Die Zuordnung ist gespeichert.');
    expect(screen.queryByTestId('mapping-draft')).not.toBeInTheDocument();
    expect(state.refreshes).toBe(1);
  });

  it('shows a plain message when the server refuses (districts with events)', async () => {
    state.saveError = {
      code: 'functions/failed-precondition',
      details: { reason: 'events-in-district', blocked: [{ district: 'Roth', events: 2 }] },
    };
    render(<RegionMappingTab />);
    await pickViaSearch('Tauberfr', 'Tauberfranken');
    fireEvent.change(screen.getByTestId('culture-add-input'), { target: { value: 'Roth' } });
    fireEvent.click(screen.getByTestId('culture-add-save'));
    fireEvent.click(screen.getByTestId('mapping-save'));
    fireEvent.click(await screen.findByRole('button', { name: 'Speichern' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Diese Landkreise haben schon Events und lassen sich noch nicht verschieben: Roth.'
    );
    expect(screen.getByTestId('mapping-draft')).toBeInTheDocument();
  });

  it('locks removing districts that already have events', async () => {
    state.locks = { 'DE|Roth': 3 };
    render(<RegionMappingTab />);
    fireEvent.click(screen.getByTestId('mapping-suggestion'));
    await pickViaSearch('Kitzingen', 'Franken');
    expect(screen.getByRole('button', { name: 'Kitzingen aus der Region nehmen' })).toBeEnabled();
  });

  it('does not allow emptying an active region (save disabled, reason shown)', async () => {
    state.active = { vorarlberg: true, saarland: true };
    render(<RegionMappingTab />);
    await pickViaSearch('Tauberfr', 'Tauberfranken');
    for (const d of DISTRICT_CATALOG.filter((x) => x.stateSlug === 'saarland')) {
      fireEvent.change(screen.getByTestId('culture-add-input'), { target: { value: d.name } });
      fireEvent.click(screen.getByTestId('culture-add-save'));
    }
    expect(screen.getByTestId('mapping-save')).toBeDisabled();
    expect(screen.getByTestId('mapping-draft')).toHaveTextContent(
      'Saarland ist aktiv und braucht mindestens einen Landkreis / Bezirk.'
    );
  });
});

describe('RegionMappingTab: culture region map and search', () => {
  it('picks the region of a clicked Landkreis and shows its districts', async () => {
    render(<RegionMappingTab />);
    fireEvent.click(screen.getByTestId('mapping-suggestion'));
    expect(screen.queryByTestId('culture-panel')).not.toBeInTheDocument();
    fireEvent.click(await district('DE|Roth'));
    const panel = await screen.findByTestId('culture-panel');
    expect(within(panel).getByRole('heading', { name: 'Franken' })).toBeInTheDocument();
  });

  it('finds a region by one of its districts and stages add and remove as a draft', async () => {
    render(<RegionMappingTab />);
    fireEvent.click(screen.getByTestId('mapping-suggestion'));
    await pickViaSearch('Roth', 'Franken');

    fireEvent.click(screen.getByRole('button', { name: 'Roth aus der Region nehmen' }));
    expect(within(screen.getByTestId('mapping-unassigned')).getByText(/^Roth/)).toBeInTheDocument();

    fireEvent.change(screen.getByTestId('culture-add-input'), { target: { value: 'Roth' } });
    fireEvent.click(screen.getByTestId('culture-add-save'));
    expect(within(screen.getByTestId('culture-districts')).getByText(/Roth/)).toBeInTheDocument();
    expect(state.saves).toHaveLength(0);
  });

  it('renames the picked region', async () => {
    render(<RegionMappingTab />);
    await pickViaSearch('Tauberfr', 'Tauberfranken');
    fireEvent.change(screen.getByTestId('culture-rename-name'), { target: { value: 'Taubertal' } });
    fireEvent.click(screen.getByTestId('culture-rename-save'));
    await waitFor(() => expect(state.renames[0]?.id).toBe('tauberfranken'));
    expect(state.renames[0].data.name).toBe('Taubertal');
  });

  it('colours Landkreise by the draft, marks changes and adds a clicked one', async () => {
    render(<RegionMappingTab />);
    // Nothing assigned yet: every Landkreis is in its Bundesland (neutral, no region group).
    expect((await district('DE|Roth')).closest('g')).toHaveClass('culture-group--fallback');
    await pickViaSearch('Tauberfr', 'Tauberfranken');
    fireEvent.click(await district('DE|Roth'));
    expect(within(screen.getByTestId('culture-districts')).getByText(/Roth/)).toBeInTheDocument();
    expect((await district('DE|Roth')).closest('g')).toHaveAttribute(
      'data-region',
      'tauberfranken'
    );
    expect((await district('DE|Roth')).closest('g')).toHaveClass('is-selected');
    expect(document.querySelector('[data-changed="DE|Roth"]')).toBeInTheDocument();
    expect(document.querySelector('[data-changed="DE|Ansbach (Stadt)"]')).not.toBeInTheDocument();
    expect(state.saves).toHaveLength(0);
    fireEvent.click(screen.getByText('Verwerfen'));
    expect((await district('DE|Roth')).closest('g')).toHaveClass('culture-group--fallback');
    expect(document.querySelector('[data-changed="DE|Roth"]')).not.toBeInTheDocument();
  });

  it('does not move a clicked Landkreis that already has events', async () => {
    state.locks = { 'DE|Roth': 2 };
    render(<RegionMappingTab />);
    await pickViaSearch('Tauberfr', 'Tauberfranken');
    // Locks load asynchronously; the locked chip of "Noch ohne Region" shows when they are in.
    const chips = within(screen.getByTestId('mapping-unassigned'));
    await waitFor(() =>
      expect(chips.getByText(/^Roth/).closest('button')).toHaveAttribute(
        'title',
        'Hier gibt es schon Events'
      )
    );
    fireEvent.click(await district('DE|Roth'));
    expect(screen.getByRole('alert')).toHaveTextContent('Roth hat schon Events');
    expect(screen.queryByTestId('mapping-draft')).not.toBeInTheDocument();
  });
});

describe('RegionMappingTab: Austria and Switzerland (ticket 599)', () => {
  it('opens on Germany and switches the country', async () => {
    render(<RegionMappingTab />);
    expect(screen.getByTestId('mapping-country-DE')).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByTestId('mapping-country-AT'));
    expect(screen.getByTestId('mapping-country-AT')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByTestId('mapping-suggestion')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mapping-unassigned')).not.toBeInTheDocument();
    expect(await district('AT|Bregenz')).toBeInTheDocument();
    expect(document.querySelector('[data-district="DE|Roth"]')).toBeNull();
  });

  it('adds a Bezirk to another Bundesland and takes it out again (back to its own)', async () => {
    render(<RegionMappingTab />);
    fireEvent.click(screen.getByTestId('mapping-country-AT'));
    await district('AT|Bregenz');
    fireEvent.change(screen.getByTestId('culture-search'), { target: { value: 'Tirol' } });
    fireEvent.mouseDown(screen.getAllByRole('option')[0]);
    const panel = await screen.findByTestId('culture-panel');
    expect(within(panel).getByRole('heading', { name: 'Tirol' })).toBeInTheDocument();
    // no rename for a Bundesland, and its own Bezirke cannot be "taken out"
    expect(screen.queryByTestId('culture-rename-name')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Imst aus der Region nehmen' })).toBeNull();

    fireEvent.change(screen.getByTestId('culture-add-input'), { target: { value: 'Bregenz' } });
    fireEvent.click(screen.getByTestId('culture-add-save'));
    expect(screen.getByTestId('mapping-draft')).toHaveTextContent('Tirol: +1');
    expect((await district('AT|Bregenz')).closest('g')).toHaveAttribute('data-region', 'tirol');

    fireEvent.click(screen.getByRole('button', { name: 'Bregenz aus der Region nehmen' }));
    expect(screen.queryByTestId('mapping-draft')).not.toBeInTheDocument();
  });

  it('saves a Swiss move in one call and offers only Swiss Bezirke', async () => {
    render(<RegionMappingTab />);
    fireEvent.click(screen.getByTestId('mapping-country-CH'));
    await district('CH|Olten');
    fireEvent.change(screen.getByTestId('culture-search'), { target: { value: 'Aargau' } });
    fireEvent.mouseDown(screen.getAllByRole('option')[0]);
    await screen.findByTestId('culture-panel');
    const options = [...document.querySelectorAll('#culture-add-options option')].map(
      (o) => (o as HTMLOptionElement).value
    );
    expect(options).toContain('Olten');
    expect(options).not.toContain('Bregenz');
    fireEvent.click(await district('CH|Olten'));
    fireEvent.click(screen.getByTestId('mapping-save'));
    fireEvent.click(await screen.findByRole('button', { name: 'Speichern' }));
    await waitFor(() => expect(state.saves).toHaveLength(1));
    expect(state.saves[0].moves).toEqual([{ districtKey: 'CH|Olten', toRegionId: 'aargau' }]);
  });

  it('shows map shapes without a register Bezirk as not clickable', async () => {
    render(<RegionMappingTab />);
    fireEvent.click(screen.getByTestId('mapping-country-CH'));
    await district('CH|Olten');
    const loose = document.querySelector('[data-unmatched="Dorneck"]');
    expect(loose).toBeInTheDocument();
    fireEvent.click(loose!);
    expect(screen.queryByTestId('mapping-draft')).not.toBeInTheDocument();
  });
});

describe('RegionMappingTab: create a new region', () => {
  const openForm = () => fireEvent.click(screen.getByText('Neue Region anlegen'));

  it('sends name, the chosen country and the phrase, then picks the new region', async () => {
    state.custom = [
      {
        id: 'neue-region',
        slug: 'neue-region',
        name: 'Neue Region',
        country: 'DE',
        order: 200.001,
        active: false,
        bezirke: [],
        home: false,
        custom: true,
        subdivisionLabel: 'Landkreis',
      },
    ];
    render(<RegionMappingTab />);
    openForm();
    expect(screen.getByTestId('new-region-save')).toBeDisabled();
    fireEvent.change(screen.getByTestId('new-region-name'), { target: { value: ' Neue Region ' } });
    fireEvent.change(screen.getByTestId('new-region-phrase'), {
      target: { value: 'in der Neuen' },
    });
    fireEvent.click(screen.getByTestId('new-region-save'));
    await screen.findByTestId('culture-panel');
    expect(state.creates).toEqual([
      { name: 'Neue Region', country: 'DE', inPhrase: 'in der Neuen' },
    ]);
    expect(state.refreshes).toBe(1);
    expect(screen.getByRole('status')).toHaveTextContent('Die Region „Neue Region“ ist angelegt');
    expect(screen.getByTestId('culture-rename-name')).toHaveValue('Neue Region');
  });

  it('creates in the country that is selected', async () => {
    render(<RegionMappingTab />);
    fireEvent.click(screen.getByTestId('mapping-country-CH'));
    openForm();
    fireEvent.change(screen.getByTestId('new-region-name'), { target: { value: 'Bodensee' } });
    fireEvent.click(screen.getByTestId('new-region-save'));
    await waitFor(() => expect(state.creates).toHaveLength(1));
    expect(state.creates[0]).toMatchObject({ name: 'Bodensee', country: 'CH' });
  });

  it('explains a refused name in plain German', async () => {
    state.createError = {
      code: 'functions/failed-precondition',
      details: { reason: 'slug-reserved' },
    };
    render(<RegionMappingTab />);
    openForm();
    fireEvent.change(screen.getByTestId('new-region-name'), { target: { value: 'Tirol' } });
    fireEvent.click(screen.getByTestId('new-region-save'));
    expect(await screen.findByRole('alert')).toHaveTextContent('schon für etwas anderes vergeben');
    expect(screen.queryByTestId('culture-panel')).not.toBeInTheDocument();
  });
});
