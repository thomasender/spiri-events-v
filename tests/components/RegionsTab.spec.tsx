import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import RegionsTab from '../../src/components/RegionsTab';
import { STATIC_REGIONS } from '../../src/utils/regions';

type Status = {
  regionId: string;
  moderatorCount: number;
  upcomingEventCount: number;
  unmet: string[];
};

const state = vi.hoisted(() => ({
  role: 'Admin' as string | null,
  staffRegionIds: [] as string[],
  active: { vorarlberg: true } as Record<string, boolean>,
  contact: {} as Record<string, string>,
  statuses: [] as Status[],
  moderators: [] as Array<Record<string, unknown>>,
  setCalls: [] as Array<{ regionId: string; active: boolean; override: boolean }>,
  setError: null as null | { code: string; message: string; details?: unknown },
  refreshes: 0,
}));

vi.mock('../../src/lib/firebase', () => ({ functions: {} }));
vi.mock('firebase/functions', () => ({
  httpsCallable: (_fns: unknown, name: string) => async (data: unknown) => {
    if (name === 'adminListRegionModerators') return { data: { moderators: state.moderators } };
    if (name === 'adminListRegionActivation') {
      return { data: { regions: state.statuses, minModerators: 1, minUpcomingEvents: 15 } };
    }
    if (name === 'adminSetRegionActive') {
      const call = data as { regionId: string; active: boolean; override: boolean };
      state.setCalls.push(call);
      if (state.setError) throw state.setError;
      state.active[call.regionId] = call.active;
      return { data: { ...call, changed: true } };
    }
    throw new Error(`unexpected callable ${name}`);
  },
}));
vi.mock('../../src/hooks/useAuth', () => ({
  useAuth: () => ({ user: { uid: 'me' }, role: state.role, staffRegionIds: state.staffRegionIds }),
}));
vi.mock('../../src/hooks/useRegions', () => ({
  useRegions: () => ({
    regions: STATIC_REGIONS.map((r) => ({
      ...r,
      active: Boolean(state.active[r.id]),
      ...(state.contact[r.id] ? { contactEmail: state.contact[r.id] } : {}),
    })),
    loading: false,
  }),
  refreshRegions: async () => {
    state.refreshes += 1;
  },
}));

const status = (regionId: string, moderatorCount: number, upcomingEventCount: number): Status => ({
  regionId,
  moderatorCount,
  upcomingEventCount,
  unmet: [
    ...(moderatorCount < 1 ? ['moderators'] : []),
    ...(upcomingEventCount < 15 ? ['events'] : []),
  ],
});

beforeEach(() => {
  state.role = 'Admin';
  state.staffRegionIds = [];
  state.active = { vorarlberg: true };
  state.contact = {};
  state.statuses = [status('vorarlberg', 0, 40), status('tirol', 1, 20), status('wien', 0, 7)];
  state.moderators = [
    {
      uid: 't',
      email: 't@x.at',
      displayName: 'Tina',
      disabled: false,
      regionIds: ['tirol'],
      updatedAt: null,
    },
  ];
  state.setCalls = [];
  state.setError = null;
  state.refreshes = 0;
});

async function row(id: string) {
  const el = await screen.findByTestId(`region-row-${id}`);
  // Wait until the server status (upcoming events) has arrived.
  await waitFor(() => expect(within(el).getByTestId('region-upcoming')).not.toHaveTextContent('…'));
  return el;
}

describe('RegionsTab', () => {
  it('renders nothing for moderators and normal users', () => {
    for (const [role, ids] of [
      ['RegionModerator', ['tirol']],
      ['User', []],
      [null, []],
    ] as const) {
      state.role = role;
      state.staffRegionIds = [...ids];
      const { container, unmount } = render(<RegionsTab />);
      expect(container).toBeEmptyDOMElement();
      unmount();
    }
  });

  it('lists every region with status, moderators, events, districts and contact', async () => {
    state.contact = { tirol: 'tirol@example.at' };
    render(<RegionsTab />);
    expect(screen.getAllByTestId(/^region-row-/)).toHaveLength(STATIC_REGIONS.length);
    const tirol = await row('tirol');
    expect(within(tirol).getByTestId('region-status')).toHaveTextContent('noch nicht aktiv');
    expect(within(tirol).getByTestId('region-moderators')).toHaveTextContent('1 (Tina)');
    expect(within(tirol).getByTestId('region-upcoming')).toHaveTextContent('20');
    expect(within(tirol).getByTestId('region-contact')).toHaveTextContent('tirol@example.at');
    const vbg = await row('vorarlberg');
    expect(within(vbg).getByTestId('region-status')).toHaveTextContent('aktiv');
    expect(vbg).toHaveTextContent('Bezirke');
    expect(within(vbg).getByTestId('region-contact')).toHaveTextContent('–');
  });

  it('activates a region that meets the conditions and refreshes the regions', async () => {
    render(<RegionsTab />);
    const tirol = await row('tirol');
    fireEvent.click(within(tirol).getByRole('button', { name: 'Tirol freischalten' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Tirol ist jetzt freigeschaltet');
    expect(state.setCalls).toEqual([{ regionId: 'tirol', active: true, override: false }]);
    expect(state.refreshes).toBe(1);
    expect(within(await row('tirol')).getByTestId('region-status')).toHaveTextContent(/^aktiv$/);
  });

  it('asks before activating with unmet conditions; Abbrechen changes nothing', async () => {
    render(<RegionsTab />);
    fireEvent.click(within(await row('wien')).getByRole('button', { name: 'Wien freischalten' }));
    const list = await screen.findByTestId('region-unmet-list');
    expect(list).toHaveTextContent('Es fehlt mindestens ein:e Moderator:in');
    expect(list).toHaveTextContent('Nur 7 von 15 kommenden Events');
    fireEvent.click(screen.getByRole('button', { name: 'Abbrechen' }));
    expect(screen.queryByTestId('region-unmet-list')).not.toBeInTheDocument();
    expect(state.setCalls).toEqual([]);
  });

  it('activates with override after "Trotzdem freischalten"', async () => {
    render(<RegionsTab />);
    fireEvent.click(within(await row('wien')).getByRole('button', { name: 'Wien freischalten' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Trotzdem freischalten' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Wien ist jetzt freigeschaltet');
    expect(state.setCalls).toEqual([{ regionId: 'wien', active: true, override: true }]);
  });

  it('opens the confirm dialog when the server reports unmet conditions', async () => {
    state.setError = {
      code: 'functions/failed-precondition',
      message: 'Activation conditions not met.',
      details: {
        reason: 'conditions-unmet',
        unmet: ['events'],
        moderatorCount: 1,
        upcomingEventCount: 12,
        minUpcomingEvents: 15,
      },
    };
    render(<RegionsTab />);
    fireEvent.click(within(await row('tirol')).getByRole('button', { name: 'Tirol freischalten' }));
    const list = await screen.findByTestId('region-unmet-list');
    expect(list).toHaveTextContent('Nur 12 von 15 kommenden Events');
    expect(list).not.toHaveTextContent('Moderator:in');
  });

  it('confirms a deactivation', async () => {
    state.active.tirol = true;
    render(<RegionsTab />);
    fireEvent.click(within(await row('tirol')).getByRole('button', { name: 'Tirol deaktivieren' }));
    expect(
      await screen.findByText(
        'Die Region ist danach für Besucher nicht mehr sichtbar, es erscheint „kommt bald“.'
      )
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Deaktivieren' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Tirol ist deaktiviert');
    expect(state.setCalls).toEqual([{ regionId: 'tirol', active: false, override: false }]);
  });

  it('shows server errors in plain German', async () => {
    state.active.tirol = true;
    state.setError = { code: 'functions/permission-denied', message: 'Admins only.' };
    render(<RegionsTab />);
    fireEvent.click(within(await row('tirol')).getByRole('button', { name: 'Tirol deaktivieren' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Deaktivieren' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Nur Super-Admins können Regionen freischalten oder deaktivieren.'
    );
  });

  it('never lets Vorarlberg be deactivated', async () => {
    render(<RegionsTab />);
    const button = within(await row('vorarlberg')).getByRole('button', {
      name: 'Vorarlberg deaktivieren',
    });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(screen.queryByRole('button', { name: 'Deaktivieren' })).not.toBeInTheDocument();
    expect(state.setCalls).toEqual([]);
  });
});
