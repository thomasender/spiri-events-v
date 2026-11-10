import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ModerationLogTab from '../../src/components/ModerationLogTab';

const at = (iso: string) => ({ toMillis: () => new Date(iso).getTime() });

const state = vi.hoisted(() => ({
  role: 'Admin' as string | null,
  multiRegion: true,
  specs: [] as Array<{ where: unknown[][] }>,
  log: {
    entries: [] as Record<string, unknown>[],
    loading: false,
    loadingMore: false,
    error: null as unknown,
    hasMore: false,
    loadMore: vi.fn(),
  },
}));

vi.mock('../../src/hooks/useAuth', () => ({
  useAuth: () => ({ role: state.role, staffRegionIds: [] }),
}));
vi.mock('../../src/hooks/useModerationLog', () => ({
  useModerationLog: (spec: { where: unknown[][] }) => {
    state.specs.push(spec);
    return state.log;
  },
}));
vi.mock('../../src/hooks/useRegionModerators', () => ({
  useRegionModerators: () => ({ moderators: [{ uid: 'm1', displayName: 'Mia Moser' }] }),
}));
vi.mock('../../src/hooks/useRegionLabels', () => ({
  useRegionLabels: () => ({
    multiRegion: state.multiRegion,
    nameOf: (id: string) => ({ tirol: 'Tirol', vorarlberg: 'Vorarlberg' })[id] ?? id,
    regions: [
      { id: 'vorarlberg', name: 'Vorarlberg', active: true },
      { id: 'tirol', name: 'Tirol', active: true },
      { id: 'wien', name: 'Wien', active: false },
    ],
  }),
}));

const ENTRIES = [
  {
    id: 'r1',
    action: 'approved',
    eventId: 'e1',
    eventTitle: 'Yoga am See',
    eventDate: '2026-12-01',
    regionId: 'tirol',
    actorUid: 'm1',
    actorName: 'Mia Moser',
    actorRole: 'RegionModerator',
    byStaff: true,
    changedFields: [],
    at: at('2026-11-09T08:00:00Z'),
  },
  {
    id: 'r2',
    action: 'rejected',
    eventId: 'e2',
    eventTitle: 'Kakao-Zeremonie',
    regionId: 'vorarlberg',
    actorUid: 'a1',
    actorName: 'Peter',
    actorRole: 'Admin',
    byStaff: true,
    reason: 'Doppelt eingetragen',
    changedFields: [],
    at: at('2026-11-10T09:30:00Z'),
  },
  {
    id: 'r3',
    action: 'deleted',
    eventId: 'e3',
    eventTitle: 'Alter Kreis',
    regionId: 'vorarlberg',
    actorUid: null,
    actorName: null,
    actorRole: 'System',
    byStaff: false,
    changedFields: [],
    at: at('2026-11-01T03:30:00Z'),
  },
];

function renderTab() {
  return render(
    <MemoryRouter>
      <ModerationLogTab />
    </MemoryRouter>
  );
}

const lastSpec = () => state.specs[state.specs.length - 1];

beforeEach(() => {
  state.role = 'Admin';
  state.multiRegion = true;
  state.specs = [];
  state.log = {
    entries: ENTRIES,
    loading: false,
    loadingMore: false,
    error: null,
    hasMore: false,
    loadMore: vi.fn(),
  };
});

describe('ModerationLogTab', () => {
  it('lists every entry newest first with time, action, event, region and person', () => {
    renderTab();
    const rows = screen.getAllByTestId('modlog-row');
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent('Abgelehnt');
    expect(rows[0]).toHaveTextContent('Kakao-Zeremonie');
    expect(rows[0]).toHaveTextContent('Begründung: Doppelt eingetragen');
    expect(rows[0]).toHaveTextContent('10:30');
    expect(rows[1]).toHaveTextContent('Genehmigt');
    expect(rows[1]).toHaveTextContent('Termin: 01.12.2026');
    expect(rows[1]).toHaveTextContent('Tirol');
    expect(rows[1]).toHaveTextContent('Moderator:in');
    expect(rows[2]).toHaveTextContent('System (automatisch)');
    expect(screen.getByTestId('modlog-summary')).toHaveTextContent(
      '3 Einträge: 1 Genehmigt · 1 Abgelehnt · 1 Endgültig gelöscht'
    );
  });

  it('links to the event, except for deleted ones', () => {
    renderTab();
    expect(screen.getByRole('link', { name: 'Yoga am See' })).toHaveAttribute(
      'href',
      '/admin/edit/e1'
    );
    expect(screen.queryByRole('link', { name: 'Alter Kreis' })).not.toBeInTheDocument();
  });

  it('starts with the team only, last 30 days', () => {
    renderTab();
    expect(lastSpec().where[0]).toEqual(['byStaff', '==', true]);
    expect(lastSpec().where[1][0]).toBe('at');
  });

  it('text search narrows the loaded entries', () => {
    renderTab();
    fireEvent.change(screen.getByTestId('modlog-search'), { target: { value: 'kakao' } });
    expect(screen.getAllByTestId('modlog-row')).toHaveLength(1);
    expect(screen.getByTestId('modlog-summary')).toHaveTextContent('1 von 3 geladenen Einträgen');
    fireEvent.change(screen.getByTestId('modlog-search'), { target: { value: 'nichts' } });
    expect(screen.getByTestId('modlog-empty')).toBeInTheDocument();
  });

  it('action, region and period filters go to the query', () => {
    renderTab();
    fireEvent.change(screen.getByTestId('modlog-action'), { target: { value: 'rejected' } });
    fireEvent.change(screen.getByTestId('modlog-region'), { target: { value: 'tirol' } });
    fireEvent.change(screen.getByTestId('modlog-period'), { target: { value: 'all' } });
    expect(lastSpec().where).toEqual([
      ['regionId', '==', 'tirol'],
      ['byStaff', '==', true],
      ['action', '==', 'rejected'],
    ]);
    // Only active regions are offered.
    const region = screen.getByTestId('modlog-region');
    expect(within(region).queryByText('Wien')).not.toBeInTheDocument();
  });

  it('clicking a person filters by her and locks the team switch', () => {
    renderTab();
    fireEvent.click(screen.getByRole('button', { name: 'Mia Moser' }));
    expect(lastSpec().where[0]).toEqual(['actorUid', '==', 'm1']);
    expect(screen.getByTestId('modlog-who')).toBeDisabled();
    expect(screen.getByTestId('modlog-person')).toHaveValue('m1');
    fireEvent.click(screen.getByTestId('modlog-reset'));
    expect(lastSpec().where[0]).toEqual(['byStaff', '==', true]);
  });

  it('a custom period shows the date fields', () => {
    renderTab();
    expect(screen.queryByTestId('modlog-from')).not.toBeInTheDocument();
    fireEvent.change(screen.getByTestId('modlog-period'), { target: { value: 'custom' } });
    fireEvent.change(screen.getByTestId('modlog-from'), { target: { value: '2026-11-01' } });
    expect(lastSpec().where.some((w) => w[0] === 'at' && w[1] === '>=')).toBe(true);
  });

  it('sorts by a column on header click', () => {
    renderTab();
    fireEvent.click(screen.getByTestId('modlog-sort-eventTitle'));
    const titles = screen
      .getAllByTestId('modlog-row')
      .map((r) => r.querySelector('.modlog-event-title')?.textContent);
    expect(titles).toEqual(['Alter Kreis', 'Kakao-Zeremonie', 'Yoga am See']);
  });

  it('loads older entries on demand', () => {
    state.log.hasMore = true;
    renderTab();
    expect(screen.getByTestId('modlog-summary')).toHaveTextContent('(weitere vorhanden)');
    fireEvent.click(screen.getByTestId('modlog-more'));
    expect(state.log.loadMore).toHaveBeenCalled();
  });

  it('with a single active region there is no region column or filter', () => {
    state.multiRegion = false;
    renderTab();
    expect(screen.queryByTestId('modlog-region')).not.toBeInTheDocument();
    expect(screen.queryByTestId('modlog-sort-regionId')).not.toBeInTheDocument();
  });

  it('shows an error instead of the table', () => {
    state.log.error = new Error('failed-precondition');
    renderTab();
    expect(screen.getByTestId('modlog-error')).toBeInTheDocument();
    expect(screen.queryByTestId('modlog-row')).not.toBeInTheDocument();
  });

  it('renders nothing for non-Super-Admins', () => {
    state.role = 'RegionModerator';
    const { container } = renderTab();
    expect(container).toBeEmptyDOMElement();
  });
});
