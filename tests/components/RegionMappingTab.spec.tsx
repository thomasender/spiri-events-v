import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import RegionMappingTab from '../../src/components/RegionMappingTab';
import { STATIC_REGIONS } from '../../src/utils/regions';

const state = vi.hoisted(() => ({
  role: 'Admin' as string | null,
  staffRegionIds: [] as string[],
  locks: {} as Record<string, number>,
  saves: [] as Array<{ moves: Array<{ districtKey: string; toRegionId: string }> }>,
  saveError: null as null | { code: string; details?: unknown },
  refreshes: 0,
  active: { vorarlberg: true } as Record<string, boolean>,
  renames: [] as Array<{ id: string; data: Record<string, unknown> }>,
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
    throw new Error(`unexpected callable ${name}`);
  },
}));
vi.mock('../../src/hooks/useAuth', () => ({
  useAuth: () => ({ user: { uid: 'me' }, role: state.role, staffRegionIds: state.staffRegionIds }),
}));
vi.mock('../../src/hooks/useRegions', () => ({
  useRegions: () => ({
    regions: STATIC_REGIONS.map((r) => ({ ...r, active: Boolean(state.active[r.id]) })),
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
});

const check = (name: string) => screen.getByRole('checkbox', { name });
const regionOf = (name: string) =>
  within(screen.getByRole('checkbox', { name }).closest('li') as HTMLElement).getByTestId(
    'mapping-region'
  );

async function stageToFranken(names: string[]) {
  for (const n of names) fireEvent.click(check(n));
  fireEvent.change(screen.getByTestId('mapping-target'), { target: { value: 'franken' } });
  fireEvent.click(screen.getByTestId('mapping-stage'));
}

describe('RegionMappingTab: tap flow (phone, no drag and drop)', () => {
  it('tapping unassigned entries and then a region stages them there', () => {
    render(<RegionMappingTab />);
    const chip = within(screen.getAllByTestId('mapping-unassigned-item')[0]).getByRole('button');
    const name = chip.textContent as string;
    expect(screen.getByTestId('mapping-drop-franken')).toBeDisabled();
    fireEvent.click(chip);
    expect(chip).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByTestId('mapping-drop-franken'));
    expect(screen.getByTestId('mapping-draft')).toBeInTheDocument();
    expect(regionOf(name)).toHaveTextContent('Franken');
    expect(state.saves).toHaveLength(0);
  });

  it('"Aus der Region nehmen" moves selected districts back to their Bundesland', () => {
    render(<RegionMappingTab />);
    fireEvent.click(screen.getByTestId('mapping-suggestion'));
    expect(regionOf('Roth')).toHaveTextContent('Franken');
    fireEvent.click(check('Roth'));
    fireEvent.click(screen.getByTestId('mapping-unstage'));
    expect(regionOf('Roth')).toHaveTextContent('Bayern');
  });
});

describe('RegionMappingTab: prefill, drag and drop, rename', () => {
  it('"Vorschlag laden" stages the prepared assignment as a draft, nothing is saved', () => {
    render(<RegionMappingTab />);
    fireEvent.click(screen.getByTestId('mapping-suggestion'));
    expect(screen.getByTestId('mapping-draft')).toBeInTheDocument();
    expect(regionOf('Roth')).toHaveTextContent('Franken');
    expect(regionOf('Main-Tauber-Kreis')).toHaveTextContent('Tauberfranken');
    expect(state.saves).toHaveLength(0);
  });

  it('the suggestion skips districts that already have events', async () => {
    state.locks = { 'DE|Roth': 3 };
    render(<RegionMappingTab />);
    fireEvent.click(screen.getByTestId('mapping-state-bayern').querySelector('summary')!);
    await screen.findByText(/3 Events/);
    fireEvent.click(screen.getByTestId('mapping-suggestion'));
    expect(regionOf('Roth')).toHaveTextContent('Bayern');
    expect(regionOf('Kitzingen')).toHaveTextContent('Franken');
  });

  it('lists districts without a cultural region separately, also cities without a Landkreis', () => {
    render(<RegionMappingTab />);
    const box = screen.getByTestId('mapping-unassigned');
    expect(box).toHaveTextContent('Berlin');
    expect(box).toHaveTextContent('Hamburg');
    expect(box).toHaveTextContent('Stuttgart');
    fireEvent.click(screen.getByTestId('mapping-suggestion'));
    const after = screen.getByTestId('mapping-unassigned');
    expect(after).toHaveTextContent('Berlin');
    expect(after).not.toHaveTextContent('Stuttgart');
  });

  it('dragging a district onto a region stages the move', () => {
    render(<RegionMappingTab />);
    const row = screen.getByRole('checkbox', { name: 'Roth' }).closest('li') as HTMLElement;
    fireEvent.dragStart(row);
    fireEvent.drop(screen.getByTestId('mapping-drop-franken'));
    expect(regionOf('Roth')).toHaveTextContent('Franken');
    expect(screen.getByTestId('mapping-draft')).toHaveTextContent('Franken: +1');
  });

  it('dragging a selected district moves the whole selection', () => {
    render(<RegionMappingTab />);
    fireEvent.click(check('Roth'));
    fireEvent.click(check('Kitzingen'));
    const row = check('Roth').closest('li') as HTMLElement;
    fireEvent.dragStart(row);
    fireEvent.drop(screen.getByTestId('mapping-drop-franken'));
    expect(regionOf('Kitzingen')).toHaveTextContent('Franken');
    expect(regionOf('Roth')).toHaveTextContent('Franken');
  });

  it('renames a region (display name only)', async () => {
    render(<RegionMappingTab />);
    fireEvent.change(screen.getByTestId('mapping-rename-region'), { target: { value: 'franken' } });
    fireEvent.change(screen.getByTestId('mapping-rename-name'), {
      target: { value: 'Fränkische Lande' },
    });
    fireEvent.click(screen.getByTestId('mapping-rename-save'));
    await waitFor(() => expect(state.renames).toHaveLength(1));
    expect(state.renames[0].id).toBe('franken');
    expect(state.renames[0].data).toMatchObject({ name: 'Fränkische Lande', slug: 'franken' });
    expect(await screen.findByText('Der Name ist geändert.')).toBeInTheDocument();
  });
});

describe('RegionMappingTab', () => {
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

  it('starts on Germany with every Landkreis in its Bundesland (the backend structure)', async () => {
    render(<RegionMappingTab />);
    expect(screen.getByTestId('mapping-state-bayern')).toBeInTheDocument();
    expect(regionOf('Roth')).toHaveTextContent('Bayern');
    expect(regionOf('Main-Tauber-Kreis')).toHaveTextContent('Baden-Württemberg');
    expect(screen.queryByTestId('mapping-draft')).not.toBeInTheDocument();
  });

  it('explains what works and what does not', () => {
    render(<RegionMappingTab />);
    const info = screen.getByTestId('mapping-info');
    expect(within(info).getByRole('heading', { name: 'Das kannst du' })).toBeInTheDocument();
    expect(within(info).getByRole('heading', { name: 'Das geht nicht' })).toBeInTheDocument();
    expect(info).toHaveTextContent('Landkreise mit bestehenden Events verschieben');
  });

  it('offers Germany only (Austria and Switzerland keep their structure): no country switcher', () => {
    render(<RegionMappingTab />);
    expect(screen.queryByTestId('mapping-country-AT')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mapping-country-CH')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mapping-country-DE')).not.toBeInTheDocument();
    expect(screen.getByTestId('mapping-state-bayern')).toBeInTheDocument();
    expect(screen.queryByTestId('mapping-state-tirol')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mapping-state-zuerich')).not.toBeInTheDocument();
  });

  it('filters by search text (umlaut tolerant) and by Bundesland', () => {
    render(<RegionMappingTab />);
    fireEvent.change(screen.getByTestId('mapping-search'), { target: { value: 'wurzburg' } });
    expect(screen.getByRole('checkbox', { name: 'Würzburg (Landkreis)' })).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Roth' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByTestId('mapping-search'), { target: { value: '' } });
    fireEvent.change(screen.getByTestId('mapping-state-filter'), { target: { value: 'hessen' } });
    expect(screen.queryByTestId('mapping-state-bayern')).not.toBeInTheDocument();
    expect(screen.getByTestId('mapping-state-hessen')).toBeInTheDocument();
  });

  it('stages a move as a draft, shows it, and discards it', () => {
    render(<RegionMappingTab />);
    void stageToFranken(['Roth', 'Kitzingen']);
    expect(screen.getByTestId('mapping-draft')).toHaveTextContent(
      '2 Änderungen noch nicht gespeichert'
    );
    expect(screen.getByTestId('mapping-draft')).toHaveTextContent('Franken: +2');
    expect(screen.getByTestId('mapping-draft')).toHaveTextContent('Bayern: −2');
    expect(regionOf('Roth')).toHaveTextContent('Franken');
    expect(regionOf('Roth')).toHaveTextContent('neu');
    expect(screen.getByTestId('mapping-selected')).toHaveTextContent('0 ausgewählt');
    fireEvent.click(screen.getByRole('button', { name: 'Verwerfen' }));
    expect(screen.queryByTestId('mapping-draft')).not.toBeInTheDocument();
    expect(regionOf('Roth')).toHaveTextContent('Bayern');
  });

  it('moving back to the original region drops the change from the draft', () => {
    render(<RegionMappingTab />);
    void stageToFranken(['Roth']);
    fireEvent.click(check('Roth'));
    fireEvent.change(screen.getByTestId('mapping-target'), { target: { value: 'bayern' } });
    fireEvent.click(screen.getByTestId('mapping-stage'));
    expect(screen.queryByTestId('mapping-draft')).not.toBeInTheDocument();
  });

  it('"Alle angezeigten auswählen" selects what the filter shows', () => {
    render(<RegionMappingTab />);
    fireEvent.change(screen.getByTestId('mapping-state-filter'), { target: { value: 'saarland' } });
    fireEvent.click(screen.getByTestId('mapping-toggle-all'));
    expect(screen.getByTestId('mapping-selected')).toHaveTextContent(/^6 ausgewählt$/);
  });

  it('one toggle button selects everything shown and clears it again', () => {
    render(<RegionMappingTab />);
    fireEvent.change(screen.getByTestId('mapping-state-filter'), { target: { value: 'saarland' } });
    const toggle = screen.getByTestId('mapping-toggle-all');
    expect(toggle).toHaveTextContent('Alle angezeigten auswählen');
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(toggle);
    expect(screen.getByTestId('mapping-selected')).toHaveTextContent(/^6 ausgewählt$/);
    expect(toggle).toHaveTextContent('Auswahl aufheben');
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(toggle);
    expect(screen.getByTestId('mapping-selected')).toHaveTextContent(/^0 ausgewählt$/);
  });

  it('folds the Bundeslaender, opens them while filtering, and keeps them open by hand', () => {
    render(<RegionMappingTab />);
    const bayern = screen.getByTestId('mapping-state-bayern');
    expect(bayern).not.toHaveAttribute('open');
    bayern.setAttribute('open', '');
    fireEvent(bayern, new Event('toggle'));
    expect(screen.getByTestId('mapping-state-bayern')).toHaveAttribute('open');
    fireEvent.change(screen.getByTestId('mapping-search'), { target: { value: 'roth' } });
    expect(screen.getByTestId('mapping-state-bayern')).toHaveAttribute('open');
    fireEvent.change(screen.getByTestId('mapping-search'), { target: { value: '' } });
    expect(screen.getByTestId('mapping-state-bayern')).toHaveAttribute('open');
    expect(screen.getByTestId('mapping-state-hessen')).not.toHaveAttribute('open');
  });

  it('locks districts that already have events', async () => {
    state.locks = { 'DE|Roth': 3 };
    render(<RegionMappingTab />);
    await waitFor(() => expect(check('Roth')).toBeDisabled());
    expect(
      within(check('Roth').closest('li') as HTMLElement).getByText(/3 Events/)
    ).toBeInTheDocument();
    expect(check('Kitzingen')).toBeEnabled();
    fireEvent.change(screen.getByTestId('mapping-state-filter'), { target: { value: 'bayern' } });
    fireEvent.click(screen.getByTestId('mapping-toggle-all'));
    expect(screen.getByTestId('mapping-selected')).toHaveTextContent(/^95 ausgewählt$/);
  });

  it('saves the draft after a confirmation, in one call', async () => {
    render(<RegionMappingTab />);
    void stageToFranken(['Roth', 'Kitzingen']);
    fireEvent.click(screen.getByTestId('mapping-save'));
    const dialog = await screen.findByText('Zuordnung speichern?');
    expect(dialog).toBeInTheDocument();
    expect(state.saves).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    await waitFor(() => expect(state.saves).toHaveLength(1));
    expect(state.saves[0].moves).toEqual([
      { districtKey: 'DE|Roth', toRegionId: 'franken' },
      { districtKey: 'DE|Kitzingen', toRegionId: 'franken' },
    ]);
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
    void stageToFranken(['Roth']);
    fireEvent.click(screen.getByTestId('mapping-save'));
    fireEvent.click(await screen.findByRole('button', { name: 'Speichern' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Diese Landkreise haben schon Events und lassen sich noch nicht verschieben: Roth.'
    );
    // The draft stays so nothing is lost.
    expect(screen.getByTestId('mapping-draft')).toBeInTheDocument();
  });

  it('does not allow emptying an active region (save disabled, reason shown)', () => {
    state.active = { vorarlberg: true, saarland: true };
    render(<RegionMappingTab />);
    fireEvent.change(screen.getByTestId('mapping-state-filter'), { target: { value: 'saarland' } });
    fireEvent.click(screen.getByTestId('mapping-toggle-all'));
    fireEvent.change(screen.getByTestId('mapping-target'), {
      target: { value: 'rheinland-pfalz' },
    });
    fireEvent.click(screen.getByTestId('mapping-stage'));
    expect(screen.getByTestId('mapping-save')).toBeDisabled();
    expect(screen.getByTestId('mapping-draft')).toHaveTextContent(
      'Saarland ist aktiv und braucht mindestens einen Landkreis / Bezirk.'
    );
  });

  it('offers the cultural regions grouped by Grossregion plus the Bundeslaender', () => {
    render(<RegionMappingTab />);
    const groups = Array.from(
      (screen.getByTestId('mapping-target') as HTMLSelectElement).querySelectorAll('optgroup')
    ).map((g) => g.label);
    expect(groups).toEqual([
      'Kulturregionen – Norden',
      'Kulturregionen – Westen',
      'Kulturregionen – Mitte',
      'Kulturregionen – Osten',
      'Kulturregionen – Südwesten',
      'Kulturregionen – Südosten',
      'Bundesländer (Ausgangsstruktur)',
    ]);
    const target = within(screen.getByTestId('mapping-target'));
    expect(target.getByRole('option', { name: 'Franken (0)' })).toBeInTheDocument();
    expect(target.getByRole('option', { name: 'Bayern (96)' })).toBeInTheDocument();
  });
});
