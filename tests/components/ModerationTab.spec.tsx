import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import ModerationTab from '../../src/components/ModerationTab';
import { STATIC_REGIONS } from '../../src/utils/regions';

type Moderator = {
  uid: string;
  email: string | null;
  displayName: string;
  disabled: boolean;
  regionIds: string[];
  updatedAt: string | null;
};

const state = vi.hoisted(() => ({
  role: 'Admin' as string | null,
  staffRegionIds: [] as string[],
  moderators: [] as Moderator[],
  members: [] as Record<string, unknown>[],
  setCalls: [] as Array<{ uid: string; regionIds: string[] }>,
  setError: null as null | { code: string; message: string },
}));

vi.mock('../../src/lib/firebase', () => ({ functions: {} }));
vi.mock('firebase/functions', () => ({
  httpsCallable: (_fns: unknown, name: string) => async (data: unknown) => {
    if (name === 'adminListRegionModerators') return { data: { moderators: state.moderators } };
    if (name === 'adminListMembers') return { data: { members: state.members } };
    if (name === 'adminSetRegionModerator') {
      if (state.setError) throw state.setError;
      const { uid, regionIds } = data as { uid: string; regionIds: string[] };
      state.setCalls.push({ uid, regionIds });
      state.moderators = regionIds.length
        ? [
            ...state.moderators.filter((m) => m.uid !== uid),
            {
              uid,
              email: `${uid}@x.at`,
              displayName: uid,
              disabled: false,
              regionIds,
              updatedAt: null,
            },
          ]
        : state.moderators.filter((m) => m.uid !== uid);
      return { data: { uid, regionIds, changed: true } };
    }
    throw new Error(`unexpected callable ${name}`);
  },
}));
vi.mock('../../src/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { uid: 'me' },
    role: state.role,
    staffRegionIds: state.staffRegionIds,
  }),
}));
vi.mock('../../src/hooks/useRegions', () => ({
  useRegions: () => ({
    regions: STATIC_REGIONS.map((r) => ({ ...r, active: r.id === 'vorarlberg' })),
    loading: false,
  }),
}));

const member = (uid: string, over: Record<string, unknown> = {}) => ({
  uid,
  email: `${uid}@x.at`,
  displayName: uid,
  username: '',
  directoryRegions: [],
  directoryCategories: [],
  staffRole: null,
  ...over,
});

beforeEach(() => {
  state.role = 'Admin';
  state.staffRegionIds = [];
  state.moderators = [];
  state.setCalls = [];
  state.setError = null;
  state.members = [
    member('anna'),
    member('boss', { displayName: 'Bossi', staffRole: 'Admin' }),
    member('me', { displayName: 'Ich selbst' }),
  ];
});

async function openAddDialog() {
  render(<ModerationTab />);
  await screen.findByTestId('moderation-empty');
  fireEvent.click(screen.getByTestId('moderation-add'));
  return screen.getByRole('dialog', { name: 'Moderator:in hinzufügen' });
}

describe('ModerationTab', () => {
  it('shows an empty state when nobody moderates yet', async () => {
    render(<ModerationTab />);
    expect(await screen.findByTestId('moderation-empty')).toHaveTextContent(
      'Noch keine Regions-Moderator:innen'
    );
  });

  it('lists moderators with their regions as chips', async () => {
    state.moderators = [
      {
        uid: 't',
        email: 't@x.at',
        displayName: 'Tina',
        disabled: false,
        regionIds: ['tirol', 'steiermark'],
        updatedAt: null,
      },
    ];
    render(<ModerationTab />);
    const row = await screen.findByTestId('moderation-row');
    expect(row).toHaveTextContent('Tina');
    expect(row).toHaveTextContent('t@x.at');
    const chips = within(within(row).getByRole('list', { name: 'Regionen' })).getAllByRole(
      'listitem'
    );
    expect(chips.map((c) => c.textContent)).toEqual(['Tirol', 'Steiermark']);
  });

  it('adds a moderator: pick a member, choose regions, save', async () => {
    const dialog = await openAddDialog();
    fireEvent.change(within(dialog).getByRole('searchbox'), { target: { value: 'ann' } });
    fireEvent.click(await within(dialog).findByRole('button', { name: /anna/ }));
    expect(within(dialog).getByTestId('moderation-selected-person')).toHaveTextContent('anna');

    const save = within(dialog).getByRole('button', { name: 'Speichern' });
    expect(save).toBeDisabled();
    // Inactive regions can be assigned too (moderation before the launch).
    expect(within(dialog).getAllByRole('checkbox')).toHaveLength(STATIC_REGIONS.length);
    expect(
      within(dialog).getByRole('checkbox', { name: /Innerschweiz \(noch nicht freigeschaltet\)/ })
    ).toBeEnabled();
    expect(within(dialog).getByRole('group', { name: 'Regionen' })).toBeInTheDocument();
    expect(
      within(dialog).getByRole('checkbox', { name: /Tirol \(noch nicht freigeschaltet\)/ })
    ).toBeEnabled();
    fireEvent.click(within(dialog).getByRole('checkbox', { name: /Tirol/ }));
    fireEvent.click(within(dialog).getByRole('checkbox', { name: /Salzburg/ }));
    fireEvent.click(save);

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(state.setCalls).toEqual([{ uid: 'anna', regionIds: ['salzburg', 'tirol'] }]);
    expect(screen.getByRole('status')).toHaveTextContent('anna moderiert Salzburg, Tirol');
    expect(await screen.findByTestId('moderation-row')).toHaveTextContent('anna');
  });

  it('shows Super-Admins and yourself as such and does not let you pick them', async () => {
    const dialog = await openAddDialog();
    fireEvent.change(within(dialog).getByRole('searchbox'), { target: { value: 'oss' } });
    expect(
      await within(dialog).findByRole('button', { name: /Bossi.*Super-Admin/ })
    ).toBeDisabled();
    fireEvent.change(within(dialog).getByRole('searchbox'), { target: { value: 'selbst' } });
    expect(await within(dialog).findByRole('button', { name: /Das bist du/ })).toBeDisabled();
  });

  it.each([
    [
      { code: 'functions/failed-precondition', message: 'Super-Admins cannot be changed here.' },
      'Diese Person ist Super-Admin',
    ],
    [
      { code: 'functions/failed-precondition', message: 'You cannot change your own role.' },
      'Deine eigene Rolle kannst du hier nicht ändern',
    ],
    [{ code: 'functions/invalid-argument', message: 'Unknown region.' }, 'gültige Regionen'],
    [{ code: 'functions/permission-denied', message: 'Admins only.' }, 'Nur Super-Admins'],
  ])('explains server error %o in plain German', async (err, text) => {
    state.setError = err;
    const dialog = await openAddDialog();
    fireEvent.change(within(dialog).getByRole('searchbox'), { target: { value: 'ann' } });
    fireEvent.click(await within(dialog).findByRole('button', { name: /anna/ }));
    fireEvent.click(within(dialog).getByRole('checkbox', { name: /Tirol/ }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Speichern' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(text);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('edits the regions of an existing moderator', async () => {
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
    render(<ModerationTab />);
    fireEvent.click(await screen.findByRole('button', { name: 'Regionen von Tina ändern' }));
    const dialog = screen.getByRole('dialog', { name: 'Regionen ändern' });
    expect(within(dialog).getByRole('checkbox', { name: /Tirol/ })).toBeChecked();
    fireEvent.click(within(dialog).getByRole('checkbox', { name: /Tirol/ }));
    // Unticking the last region does not revoke by accident.
    expect(within(dialog).getByRole('button', { name: 'Speichern' })).toBeDisabled();
    fireEvent.click(within(dialog).getByRole('checkbox', { name: /Wien/ }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Speichern' }));
    await waitFor(() => expect(state.setCalls).toEqual([{ uid: 't', regionIds: ['wien'] }]));
  });

  it('revokes the role only after confirmation', async () => {
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
    render(<ModerationTab />);
    fireEvent.click(await screen.findByRole('button', { name: 'Rolle von Tina entziehen' }));
    expect(screen.getByText(/Tina kann danach keine Events mehr freigeben/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Abbrechen' }));
    expect(state.setCalls).toEqual([]);

    fireEvent.click(screen.getByRole('button', { name: 'Rolle von Tina entziehen' }));
    const confirm = screen
      .getAllByRole('button', { name: 'Rolle entziehen' })
      .find((b) => b.classList.contains('confirm-confirm')) as HTMLElement;
    fireEvent.click(confirm);
    await waitFor(() => expect(state.setCalls).toEqual([{ uid: 't', regionIds: [] }]));
    expect(await screen.findByTestId('moderation-empty')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Tina ist keine Moderator:in mehr');
  });

  it('renders nothing for moderators and organizers', () => {
    state.role = 'RegionModerator';
    state.staffRegionIds = ['tirol'];
    const { container } = render(<ModerationTab />);
    expect(container).toBeEmptyDOMElement();
  });
});
