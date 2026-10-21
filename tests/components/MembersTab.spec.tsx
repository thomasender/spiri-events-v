import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import MembersTab from '../../src/components/MembersTab';

const state = vi.hoisted(() => ({
  role: 'Admin',
  members: [] as Record<string, unknown>[],
  updateMember: vi.fn(),
  memberEvents: [] as Record<string, unknown>[],
}));

vi.mock('../../src/hooks/useAuth', () => ({ useAuth: () => ({ role: state.role }) }));
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
    lists: [],
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
  state.updateMember.mockReset();
  state.memberEvents = [];
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
