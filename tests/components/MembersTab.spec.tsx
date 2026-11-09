import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import MembersTab from '../../src/components/MembersTab';
import { RegionContext, DEFAULT_REGION_CONTEXT } from '../../src/hooks/useRegion';
import { STATIC_REGIONS, mergeRegions } from '../../src/utils/regions';

const state = vi.hoisted(() => ({
  role: 'Admin',
  staffRegionIds: [] as string[],
  members: [] as Record<string, unknown>[],
  updateMember: vi.fn(),
  memberEvents: [] as Record<string, unknown>[],
  lists: [] as { id: string; name: string; memberUids: string[] }[],
  messengerOpen: false,
  broadcastCalls: [] as Record<string, unknown>[],
  broadcastResult: vi.fn(),
}));

vi.mock('../../src/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { uid: 'me' },
    role: state.role,
    staffRegionIds: state.staffRegionIds,
  }),
}));
vi.mock('../../src/hooks/useChatSettings', () => ({
  useMessengerAccess: () => ({ available: state.messengerOpen, mode: 'all', loading: false }),
}));
vi.mock('../../src/lib/firebase', () => ({
  callable: (name: string) => async (data: Record<string, unknown>) => {
    if (name !== 'adminSendBroadcastDm') throw new Error(`unexpected callable ${name}`);
    state.broadcastCalls.push(data);
    return { data: state.broadcastResult(data) };
  },
}));
vi.mock('../../src/hooks/useAdminMembers', () => ({
  useAdminMembers: () => ({
    members: state.members,
    loading: false,
    error: null,
    reload: vi.fn(),
    updateMember: state.updateMember,
  }),
}));
vi.mock('../../src/hooks/useMemberLists', () => ({
  useMemberLists: () => ({
    lists: state.lists,
    createList: vi.fn(),
    setMemberUids: vi.fn(),
    renameList: vi.fn(),
    deleteList: vi.fn(),
  }),
}));
vi.mock('../../src/hooks/useMemberEvents', () => ({
  useMemberEvents: () => ({ events: state.memberEvents, loading: false, error: null }),
}));
vi.mock('../../src/hooks/useCategories', () => ({ useCategories: () => ['Yoga', 'Tanz'] }));

const member = (uid: string, over: Record<string, unknown> = {}) => ({
  uid,
  email: `${uid}@x.at`,
  emailVerified: false,
  displayName: uid,
  username: '',
  slug: '',
  photoURL: '',
  listedInDirectory: false,
  directoryHidden: false,
  directoryCategories: [],
  directoryRegions: [],
  instagramConsent: false,
  instagramHandle: '',
  createdAt: '2026-01-01T00:00:00.000Z',
  lastSignInAt: null,
  disabled: false,
  ...over,
});

beforeEach(() => {
  state.role = 'Admin';
  state.staffRegionIds = [];
  state.updateMember.mockReset();
  state.memberEvents = [];
  state.lists = [];
  state.messengerOpen = false;
  state.broadcastCalls = [];
  state.broadcastResult.mockReset();
  state.members = [
    member('anna', { directoryRegions: ['Dornbirn'], directoryCategories: ['Yoga'] }),
    member('bernd', { directoryRegions: ['Bregenz'] }),
  ];
});

describe('MembersTab', () => {
  it('renders nothing for non-admins', () => {
    state.role = 'User';
    const { container } = render(<MembersTab />);
    expect(container).toBeEmptyDOMElement();
  });

  it('lists members and filters by search and region', () => {
    render(<MembersTab />);
    expect(screen.getAllByTestId('member-row')).toHaveLength(2);

    fireEvent.change(screen.getByLabelText('Mitglieder suchen'), { target: { value: 'bernd@' } });
    expect(screen.getAllByTestId('member-row')).toHaveLength(1);

    fireEvent.change(screen.getByLabelText('Mitglieder suchen'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Nach Bezirk filtern'), {
      target: { value: 'Dornbirn' },
    });
    const rows = screen.getAllByTestId('member-row');
    expect(rows).toHaveLength(1);
    expect(within(rows[0]).getByText('anna@x.at')).toBeInTheDocument();
  });

  it('sets the Vereinsmitgliedschaft from the row and filters club members', async () => {
    state.members = [member('anna', { clubMember: true }), member('bernd')];
    state.updateMember.mockResolvedValue(undefined);
    render(<MembersTab />);
    const toggles = screen.getAllByTestId('member-club-toggle') as HTMLInputElement[];
    expect(toggles.map((t) => t.checked)).toEqual([true, false]);
    fireEvent.click(screen.getByLabelText('bernd ist Vereinsmitglied'));
    await vi.waitFor(() =>
      expect(state.updateMember).toHaveBeenCalledWith('bernd', { clubMember: true })
    );
    fireEvent.click(screen.getByTestId('members-club-filter'));
    const rows = screen.getAllByTestId('member-row');
    expect(rows).toHaveLength(1);
    expect(within(rows[0]).getByText('anna@x.at')).toBeInTheDocument();
  });

  it('shows all events of a member, drafts included, in a dialog', () => {
    state.memberEvents = [
      { id: 'e1', title: 'Yoga am See', date: '2026-12-01', status: 'draft' },
      { id: 'e2', title: 'Tanzabend', date: '2026-12-05', status: 'approved' },
    ];
    render(
      <MemoryRouter>
        <MembersTab />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByLabelText('Events von anna ansehen'));
    const dialog = screen.getByTestId('member-events-dialog');
    expect(within(dialog).getAllByTestId('member-event-row')).toHaveLength(2);
    expect(within(dialog).getByText('Yoga am See')).toBeInTheDocument();
    expect(within(dialog).getByText('Entwurf')).toBeInTheDocument();

    fireEvent.click(within(dialog).getByText('Schließen'));
    expect(screen.queryByTestId('member-events-dialog')).not.toBeInTheDocument();
  });

  it('saves edits through updateMember and blocks a listing without category', async () => {
    state.updateMember.mockResolvedValue(undefined);
    render(<MembersTab />);
    fireEvent.click(screen.getByLabelText('bernd bearbeiten'));
    const dialog = screen.getByTestId('member-edit-dialog');

    fireEvent.click(within(dialog).getByLabelText('Im Verzeichnis sichtbar'));
    fireEvent.click(within(dialog).getByText('Speichern'));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('mindestens eine Kategorie');
    expect(state.updateMember).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByLabelText('Tanz'));
    fireEvent.click(within(dialog).getByText('Speichern'));
    await vi.waitFor(() =>
      expect(state.updateMember).toHaveBeenCalledWith(
        'bernd',
        expect.objectContaining({ listedInDirectory: true, directoryCategories: ['Tanz'] })
      )
    );
  });

  it('sorts newest members first by default', () => {
    state.members = [
      member('alt', { createdAt: '2025-01-01T00:00:00.000Z' }),
      member('neu', { createdAt: '2026-06-01T00:00:00.000Z' }),
      member('mitte', { createdAt: '2025-12-01T00:00:00.000Z' }),
    ];
    render(<MembersTab />);
    const rows = screen.getAllByTestId('member-row');
    expect(rows.map((r) => within(r).getByText(/@x\.at/).textContent)).toEqual([
      'neu@x.at',
      'mitte@x.at',
      'alt@x.at',
    ]);
  });

  it('shows Instagram sharing and handle instead of Bezirke and Kategorien', () => {
    state.members = [member('anna', { instagramConsent: true, instagramHandle: '@anna.yoga' })];
    render(<MembersTab />);
    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent);
    expect(headers).toContain('Instagram teilen');
    expect(headers).toContain('Instagram-Name');
    expect(headers).not.toContain('Bezirke');
    expect(headers).not.toContain('Kategorien');
    const row = screen.getByTestId('member-row');
    expect(within(row).getByText('@anna.yoga')).toBeInTheDocument();
    expect(within(row).getByText('Ja')).toBeInTheDocument();
  });
});

describe('MembersTab: Sammelnachricht', () => {
  const dryRun = {
    dryRun: true,
    requested: 2,
    sent: 1,
    skipped: 1,
    skipReasons: { no_direct_messages: 1 },
    failed: 0,
    broadcastId: null,
    waitMs: 0,
  };

  it('counts the ticked members on the button, which is disabled without a choice', () => {
    render(<MembersTab />);
    const button = screen.getByTestId('members-broadcast');
    expect(button).toBeDisabled();
    expect(button).toHaveTextContent(/^Nachricht senden$/);
    fireEvent.click(screen.getByLabelText('anna auswählen'));
    expect(button).toBeEnabled();
    expect(button).toHaveTextContent('Nachricht senden (1)');
  });

  it('uses the chosen list without ticks, and the ticked members win when both are set', async () => {
    state.lists = [{ id: 'l1', name: 'Newsletter', memberUids: ['anna', 'bernd', 'carla'] }];
    state.broadcastResult.mockReturnValue(dryRun);
    render(<MembersTab />);
    fireEvent.change(screen.getByLabelText('Liste wählen'), { target: { value: 'l1' } });
    expect(screen.getByTestId('members-broadcast')).toHaveTextContent('Nachricht senden (3)');

    fireEvent.click(screen.getByLabelText('bernd auswählen'));
    expect(screen.getByTestId('members-broadcast')).toHaveTextContent('Nachricht senden (1)');
    fireEvent.click(screen.getByTestId('members-broadcast'));
    const dialog = screen.getByTestId('member-broadcast-dialog');
    fireEvent.change(within(dialog).getByTestId('member-broadcast-text'), {
      target: { value: 'Hallo' },
    });
    fireEvent.click(within(dialog).getByText('Weiter'));
    await within(dialog).findByTestId('member-broadcast-summary');
    expect(state.broadcastCalls[0]).toMatchObject({ recipientUids: ['bernd'], dryRun: true });
  });

  it('checks with a dry run first, then sends with the same request id and shows the result', async () => {
    state.broadcastResult.mockImplementation((data: Record<string, unknown>) =>
      data.dryRun ? dryRun : { ...dryRun, dryRun: false, broadcastId: 'me_x', sent: 1, skipped: 1 }
    );
    render(<MembersTab />);
    fireEvent.click(screen.getByLabelText('anna auswählen'));
    fireEvent.click(screen.getByLabelText('bernd auswählen'));
    fireEvent.click(screen.getByTestId('members-broadcast'));
    const dialog = screen.getByTestId('member-broadcast-dialog');
    expect(within(dialog).getByText('Weiter')).toBeDisabled();

    fireEvent.change(within(dialog).getByTestId('member-broadcast-text'), {
      target: { value: 'Neu: das Postfach 🎉' },
    });
    expect(within(dialog).getByTestId('member-broadcast-counter')).toHaveTextContent(
      '19 / 1000 Zeichen'
    );
    expect(within(dialog).getByLabelText('Vorschau')).toHaveTextContent('Neu: das Postfach 🎉');
    fireEvent.click(within(dialog).getByText('Weiter'));

    const summary = await within(dialog).findByTestId('member-broadcast-summary');
    expect(summary).toHaveTextContent('Wird an 1 Mitglied gesendet, 1 übersprungen.');
    expect(within(dialog).getByText('1 × möchte keine Privatnachrichten')).toBeInTheDocument();
    expect(state.broadcastCalls).toHaveLength(1);
    expect(state.broadcastCalls[0]).toMatchObject({
      recipientUids: ['anna', 'bernd'],
      text: 'Neu: das Postfach 🎉',
      dryRun: true,
    });

    fireEvent.click(within(dialog).getByText('Jetzt an 1 Mitglied senden'));
    expect(await within(dialog).findByTestId('member-broadcast-result')).toHaveTextContent(
      'Gesendet an 1 Mitglied. 1 übersprungen.'
    );
    expect(state.broadcastCalls).toHaveLength(2);
    expect(state.broadcastCalls[1]).toMatchObject({
      recipientUids: ['anna', 'bernd'],
      dryRun: false,
    });
    expect(state.broadcastCalls[1].requestId).toBe(state.broadcastCalls[0].requestId);
  });

  it('shows the refusal of the server, e.g. when the Postfach is not open for all', async () => {
    state.broadcastResult.mockImplementation(() => {
      throw Object.assign(
        new Error('Das Postfach ist gerade nicht für alle Mitglieder freigeschaltet.'),
        {
          code: 'functions/failed-precondition',
        }
      );
    });
    render(<MembersTab />);
    fireEvent.click(screen.getByLabelText('anna auswählen'));
    fireEvent.click(screen.getByTestId('members-broadcast'));
    const dialog = screen.getByTestId('member-broadcast-dialog');
    fireEvent.change(within(dialog).getByTestId('member-broadcast-text'), {
      target: { value: 'Hallo' },
    });
    fireEvent.click(within(dialog).getByText('Weiter'));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'nicht für alle Mitglieder freigeschaltet'
    );
    expect(within(dialog).queryByText(/Jetzt an/)).not.toBeInTheDocument();
  });

  it('offers a Nachricht link per member (not for yourself) when the Postfach is open', () => {
    state.messengerOpen = true;
    state.members = [member('anna'), member('me')];
    render(
      <MemoryRouter>
        <MembersTab />
      </MemoryRouter>
    );
    const links = screen.getAllByTestId('dm-link');
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute('href', '/postfach/anna');
  });
});

describe('MembersTab for a Regions-Moderator:in', () => {
  beforeEach(() => {
    state.role = 'RegionModerator';
    state.staffRegionIds = ['tirol'];
    // The callable already filters to her regions and strips private fields.
    state.members = [
      {
        uid: 'tina',
        displayName: 'Tina',
        username: 'tina',
        slug: 'tina',
        photoURL: '',
        listedInDirectory: true,
        directoryHidden: false,
        directoryCategories: ['Yoga'],
        directoryRegions: [],
        directoryRegionIds: ['tirol'],
        instagramConsent: true,
        instagramHandle: '@tina.yoga',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ];
  });

  it('shows the member list of her region without e-mail, lists or exports', () => {
    render(<MembersTab />);
    expect(screen.getAllByTestId('member-row')).toHaveLength(1);
    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent);
    expect(headers).not.toContain('E-Mail');
    expect(headers).toEqual(expect.arrayContaining(['Name', 'Benutzername', 'Registriert']));
    expect(headers).toEqual(expect.arrayContaining(['Instagram teilen', 'Instagram-Name']));
    expect(screen.getByText('@tina.yoga')).toBeInTheDocument();
    expect(screen.queryByLabelText('Liste wählen')).not.toBeInTheDocument();
    expect(screen.queryByTestId('members-export-csv')).not.toBeInTheDocument();
    expect(screen.queryByText(/Neue Liste/)).not.toBeInTheDocument();
    // Sending a Sammelnachricht stays with the Super-Admins.
    expect(screen.queryByTestId('members-broadcast')).not.toBeInTheDocument();
    // The Vereinsmitgliedschaft stays with the Super-Admins.
    expect(headers).not.toContain('Verein');
    expect(screen.queryByTestId('member-club-toggle')).not.toBeInTheDocument();
    expect(screen.queryByTestId('members-club-filter')).not.toBeInTheDocument();
  });

  it('saves only the directory fields and explains a refused change', async () => {
    state.updateMember.mockRejectedValueOnce({ code: 'functions/permission-denied' });
    render(<MembersTab />);
    fireEvent.click(screen.getByLabelText('Tina bearbeiten'));
    const dialog = screen.getByTestId('member-edit-dialog');
    expect(within(dialog).getByLabelText('Name')).toHaveAttribute('readonly');
    fireEvent.click(within(dialog).getByText('Speichern'));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'auch in einer anderen Region'
    );
    expect(state.updateMember).toHaveBeenCalledWith('tina', {
      listedInDirectory: true,
      directoryCategories: ['Yoga'],
      directoryRegions: [],
    });
  });
});

describe('MembersTab with several active regions', () => {
  const allRegions = mergeRegions(
    STATIC_REGIONS.map((r) => ({
      id: r.id,
      active: ['vorarlberg', 'liechtenstein'].includes(r.id),
    }))
  );
  const renderMulti = () =>
    render(
      <RegionContext.Provider
        value={
          {
            ...DEFAULT_REGION_CONTEXT,
            allRegions,
            regions: allRegions.filter((r) => r.active),
          } as never
        }
      >
        <MembersTab />
      </RegionContext.Provider>
    );

  it('has no region filter with a single active region', () => {
    render(<MembersTab />);
    expect(screen.queryByTestId('members-region-filter')).not.toBeInTheDocument();
  });

  it('filters by region (members without region ids count as Vorarlberg) and offers their districts', () => {
    state.members = [
      member('anna', { directoryRegions: ['Dornbirn'] }),
      member('carla', { directoryRegions: ['Oberland'], directoryRegionIds: ['liechtenstein'] }),
    ];
    renderMulti();
    expect(screen.getAllByTestId('member-row')).toHaveLength(2);

    fireEvent.change(screen.getByTestId('members-region-filter'), {
      target: { value: 'liechtenstein' },
    });
    const rows = screen.getAllByTestId('member-row');
    expect(rows).toHaveLength(1);
    expect(within(rows[0]).getByText('carla@x.at')).toBeInTheDocument();

    fireEvent.change(screen.getByTestId('members-region-filter'), {
      target: { value: 'vorarlberg' },
    });
    expect(
      within(screen.getAllByTestId('member-row')[0]).getByText('anna@x.at')
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Nach Bezirk oder Landkreis filtern'), {
      target: { value: 'Oberland' },
    });
    expect(screen.queryAllByTestId('member-row')).toHaveLength(0);
  });

  it('the edit dialog groups districts per region with the right label', () => {
    renderMulti();
    fireEvent.click(screen.getByLabelText('bernd bearbeiten'));
    const dialog = screen.getByTestId('member-edit-dialog');
    expect(within(dialog).getByText('Bezirke Vorarlberg')).toBeInTheDocument();
    expect(within(dialog).getByText('Landesteile Liechtenstein')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Oberland')).toBeInTheDocument();
  });
});
