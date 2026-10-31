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
  invites: [] as Array<Record<string, unknown>>,
  inviteCalls: [] as unknown[],
  revokeCalls: [] as unknown[],
  inviteEmailSent: true,
}));

vi.mock('../../src/lib/firebase', () => ({ functions: {} }));
vi.mock('firebase/functions', () => ({
  httpsCallable: (_fns: unknown, name: string) => async (data: unknown) => {
    if (name === 'adminListRegionModerators') return { data: { moderators: state.moderators } };
    if (name === 'adminListMembers') return { data: { members: state.members } };
    if (name === 'adminListModeratorInvites') return { data: { invites: state.invites } };
    if (name === 'adminCreateModeratorInvite') {
      const { email, regionIds } = data as { email: string; regionIds: string[] };
      state.inviteCalls.push(data);
      const inviteId = String(state.inviteCalls.length).padStart(64, '0');
      state.invites = [
        ...state.invites.filter((i) => i.email !== email),
        {
          inviteId,
          email,
          regionIds,
          createdAt: '2026-10-31T10:00:00.000Z',
          expiresAt: '2026-11-14T10:00:00.000Z',
          expired: false,
        },
      ];
      return {
        data: {
          inviteId,
          inviteUrl: `https://www.thetribe.at/einladung?t=${inviteId}`,
          expiresAt: '2026-11-14T10:00:00.000Z',
          emailSent: state.inviteEmailSent,
        },
      };
    }
    if (name === 'adminRevokeModeratorInvite') {
      const { inviteId } = data as { inviteId: string };
      state.revokeCalls.push(inviteId);
      state.invites = state.invites.filter((i) => i.inviteId !== inviteId);
      return { data: { revoked: true } };
    }
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
  state.invites = [];
  state.inviteCalls = [];
  state.revokeCalls = [];
  state.inviteEmailSent = true;
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

  describe('invitations by e-mail', () => {
    const pending = {
      inviteId: 'a'.repeat(64),
      email: 'neu@x.at',
      regionIds: ['tirol'],
      createdAt: '2026-10-31T10:00:00.000Z',
      expiresAt: '2026-11-14T10:00:00.000Z',
      expired: false,
    };

    it('invites an address for the chosen regions', async () => {
      render(<ModerationTab />);
      await screen.findByTestId('moderation-empty');
      fireEvent.click(screen.getByTestId('moderation-invite'));
      const dialog = screen.getByRole('dialog', { name: 'Per E-Mail einladen' });
      const send = within(dialog).getByRole('button', { name: 'Einladung senden' });
      expect(send).toBeDisabled();
      fireEvent.change(within(dialog).getByLabelText('E-Mail-Adresse'), {
        target: { value: ' neu@x.at ' },
      });
      expect(send).toBeDisabled();
      fireEvent.click(within(dialog).getByRole('checkbox', { name: /Tirol/ }));
      fireEvent.click(send);
      expect(await within(dialog).findByTestId('moderation-invite-result')).toHaveTextContent(
        'Die Einladung ist unterwegs an neu@x.at'
      );
      expect(state.inviteCalls).toEqual([
        { email: 'neu@x.at', regionIds: ['tirol'], sendEmail: true },
      ]);
      fireEvent.click(within(dialog).getByRole('button', { name: 'Fertig' }));
      const row = await screen.findByTestId('moderation-invite-row');
      expect(row).toHaveTextContent('neu@x.at');
      expect(row).toHaveTextContent('Tirol');
    });

    it('says so when the mail could not be sent', async () => {
      state.inviteEmailSent = false;
      render(<ModerationTab />);
      await screen.findByTestId('moderation-empty');
      fireEvent.click(screen.getByTestId('moderation-invite'));
      const dialog = screen.getByRole('dialog', { name: 'Per E-Mail einladen' });
      fireEvent.change(within(dialog).getByLabelText('E-Mail-Adresse'), {
        target: { value: 'neu@x.at' },
      });
      fireEvent.click(within(dialog).getByRole('checkbox', { name: /Tirol/ }));
      fireEvent.click(within(dialog).getByRole('button', { name: 'Einladung senden' }));
      expect(await within(dialog).findByTestId('moderation-invite-result')).toHaveTextContent(
        'konnte nicht gesendet werden'
      );
      expect(within(dialog).getByRole('button', { name: 'Link kopieren' })).toBeInTheDocument();
    });

    it('resends and revokes open invitations', async () => {
      state.invites = [pending];
      render(<ModerationTab />);
      fireEvent.click(
        await screen.findByRole('button', { name: 'Einladung an neu@x.at erneut senden' })
      );
      await waitFor(() =>
        expect(state.inviteCalls).toEqual([
          { email: 'neu@x.at', regionIds: ['tirol'], sendEmail: true },
        ])
      );
      expect(await screen.findByRole('status')).toHaveTextContent('erneut an neu@x.at gesendet');

      fireEvent.click(screen.getByRole('button', { name: 'Einladung an neu@x.at widerrufen' }));
      fireEvent.click(screen.getByRole('button', { name: 'Widerrufen' }));
      await waitFor(() => expect(state.revokeCalls).toHaveLength(1));
      await waitFor(() =>
        expect(screen.queryByTestId('moderation-invite-row')).not.toBeInTheDocument()
      );
    });

    it('asks before making a new link for an older invitation', async () => {
      state.invites = [pending];
      render(<ModerationTab />);
      fireEvent.click(await screen.findByRole('button', { name: 'Link für neu@x.at kopieren' }));
      expect(screen.getByText(/Der Link aus der E-Mail funktioniert/)).toBeInTheDocument();
      expect(state.inviteCalls).toEqual([]);
      fireEvent.click(screen.getByRole('button', { name: 'Neuen Link kopieren' }));
      await waitFor(() =>
        expect(state.inviteCalls).toEqual([
          { email: 'neu@x.at', regionIds: ['tirol'], sendEmail: false },
        ])
      );
    });
  });
});
