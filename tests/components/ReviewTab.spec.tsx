import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ReviewTab from '../../src/components/ReviewTab';

const mockApproveEvent = vi.hoisted(() => vi.fn());
const mockUserDisplayNames = vi.hoisted(() => ({ namesByUid: {}, loading: false }));

const mockUsePendingEvents = vi.hoisted(() => ({
  pendingEvents: [],
  loading: false,
  approveEvent: mockApproveEvent,
}));

const mockUseAllEvents = vi.hoisted(() => ({
  events: [],
  loading: false,
  error: null,
}));

const mockUseEventsWithMessages = vi.hoisted(() => ({
  events: [],
  unreadCountByEvent: {},
  hasMessagesByEvent: {},
  inKlaerungAuthorNameByEvent: {},
  loading: false,
}));

vi.mock('../../src/hooks/useEvents', () => ({
  usePendingEvents: () => mockUsePendingEvents,
  useAllEvents: () => mockUseAllEvents,
}));

vi.mock('../../src/hooks/useEventsWithMessages', () => ({
  useEventsWithMessages: () => mockUseEventsWithMessages,
}));

const mockRegions = vi.hoisted(() => ({
  current: [
    { id: 'vorarlberg', slug: 'vorarlberg', name: 'Vorarlberg', active: true },
    { id: 'tirol', slug: 'tirol', name: 'Tirol', active: false },
    { id: 'steiermark', slug: 'steiermark', name: 'Steiermark', active: false },
  ] as Array<Record<string, unknown>>,
}));

vi.mock('../../src/hooks/useRegions', () => ({
  useRegions: () => ({ regions: mockRegions.current, loading: false }),
}));

vi.mock('../../src/hooks/useUserDisplayNames', () => ({
  useUserDisplayNames: () => mockUserDisplayNames,
}));

const mockUpdateDoc = vi.hoisted(() => vi.fn());
const mockAlerts = vi.hoisted(() => ({
  unreadByEvent: {} as Record<string, { kind: string; changeCount: number }>,
  markRead: vi.fn(async () => {}),
}));

vi.mock('../../src/hooks/useAdminAlerts', () => ({
  useAdminAlerts: () => mockAlerts,
}));

const mockAuth = vi.hoisted(() => ({
  current: { user: { uid: 'admin-uid' }, role: 'Admin' } as Record<string, unknown>,
}));

vi.mock('../../src/hooks/useAuth', () => ({
  useAuth: () => mockAuth.current,
}));

vi.mock('firebase/app', () => ({ getApp: vi.fn() }));

vi.mock('../../src/lib/firebase', () => ({ db: {} }));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  getFirestore: vi.fn(),
  serverTimestamp: vi.fn(),
  updateDoc: mockUpdateDoc,
}));

function renderReviewTab() {
  return render(
    <MemoryRouter>
      <ReviewTab />
    </MemoryRouter>
  );
}

beforeEach(() => {
  sessionStorage.clear();
  mockRegions.current = mockRegions.current.map((r) => ({ ...r, active: r.id === 'vorarlberg' }));
  mockAuth.current = { user: { uid: 'admin-uid' }, role: 'Admin' };
  mockApproveEvent.mockReset();
  mockUpdateDoc.mockReset();
  mockAlerts.unreadByEvent = {};
  mockAlerts.markRead.mockClear();
  mockUpdateDoc.mockResolvedValue(undefined);
  mockUsePendingEvents.pendingEvents = [];
  mockUsePendingEvents.loading = false;
  mockUseAllEvents.events = [];
  mockUseAllEvents.loading = false;
  mockUseEventsWithMessages.unreadCountByEvent = {};
  mockUseEventsWithMessages.hasMessagesByEvent = {};
  mockUseEventsWithMessages.inKlaerungAuthorNameByEvent = {};
  mockUserDisplayNames.namesByUid = {};
  mockUserDisplayNames.loading = false;
});

describe('ReviewTab — three sections (j67qz6b2)', () => {
  it('renders the empty state when nothing is pending or recently approved', () => {
    renderReviewTab();
    expect(screen.getByTestId('review-empty-state')).toBeInTheDocument();
    expect(screen.queryByTestId('review-section-pending')).not.toBeInTheDocument();
    expect(screen.queryByTestId('review-section-approved')).not.toBeInTheDocument();
  });

  it('renders the pending section with one "Wartend auf Genehmigung" header and a count of all pending events', () => {
    mockUsePendingEvents.pendingEvents = [
      { id: 'p1', title: 'Neu 1', status: 'pending' },
      { id: 'p2', title: 'Neu 2', status: 'pending' },
      { id: 'p3', title: 'Klaerung', status: 'pending' },
    ];
    mockUseEventsWithMessages.hasMessagesByEvent = { p3: true };
    renderReviewTab();
    const section = screen.getByTestId('review-section-pending');
    expect(section).toBeInTheDocument();
    expect(screen.getByTestId('review-section-pending-count')).toHaveTextContent('3');
    expect(section).toHaveTextContent('Wartend auf Genehmigung');
  });

  it('subsumes "Neu eingereicht" and "In Klärung" into one "Wartend auf Genehmigung" section', () => {
    mockUsePendingEvents.pendingEvents = [
      { id: 'p1', title: 'Neu Event', status: 'pending' },
      { id: 'p2', title: 'Klärung Event', status: 'pending' },
    ];
    mockUseEventsWithMessages.hasMessagesByEvent = { p2: true };
    renderReviewTab();
    expect(screen.getByTestId('review-subsection-neu')).toBeInTheDocument();
    expect(screen.getByTestId('review-subsection-klaerung')).toBeInTheDocument();
    expect(screen.getByTestId('review-subsection-neu')).toHaveTextContent('Neu eingereicht');
    expect(screen.getByTestId('review-subsection-klaerung')).toHaveTextContent('In Klärung');
  });

  it('puts pending events with messages into the "In Klärung" subsection, not "Neu eingereicht"', () => {
    mockUsePendingEvents.pendingEvents = [
      { id: 'p1', title: 'Neu Event', status: 'pending' },
      { id: 'p2', title: 'Klärung Event', status: 'pending' },
    ];
    mockUseEventsWithMessages.hasMessagesByEvent = { p2: true };
    renderReviewTab();
    expect(screen.getByTestId('review-subsection-neu-count')).toHaveTextContent('1');
    expect(screen.getByTestId('review-subsection-klaerung-count')).toHaveTextContent('1');
    expect(screen.getByTestId('review-section-pending')).toHaveTextContent('Neu Event');
    expect(screen.getByTestId('review-section-pending')).toHaveTextContent('Klärung Event');
    expect(screen.getByTestId('review-subsection-klaerung-block')).toHaveTextContent(
      'Klärung Event'
    );
    expect(screen.getByTestId('review-subsection-neu-block')).toHaveTextContent('Neu Event');
    expect(screen.getByTestId('review-subsection-neu-block')).not.toHaveTextContent(
      'Klärung Event'
    );
  });

  it('hides the "In Klärung" subsection when no pending events have messages', () => {
    mockUsePendingEvents.pendingEvents = [{ id: 'p1', title: 'Neu Event', status: 'pending' }];
    renderReviewTab();
    expect(screen.queryByTestId('review-subsection-klaerung')).not.toBeInTheDocument();
  });

  it('renders the "Genehmigt in den letzten 7 Tagen" section for recently approved events', () => {
    const now = Date.now();
    mockUseAllEvents.events = [
      {
        id: 'a1',
        title: 'Recent Approval',
        status: 'approved',
        approvedBy: 'admin-uid',
        approvedAt: { toDate: () => new Date(now - 2 * 24 * 60 * 60 * 1000) },
      },
      {
        id: 'a2',
        title: 'Old Approval',
        status: 'approved',
        approvedBy: 'admin-uid',
        approvedAt: { toDate: () => new Date(now - 30 * 24 * 60 * 60 * 1000) },
      },
    ];
    mockUserDisplayNames.namesByUid = { 'admin-uid': 'Test Admin' };
    renderReviewTab();
    const section = screen.getByTestId('review-section-approved');
    expect(section).toBeInTheDocument();
    expect(section).toHaveTextContent('Genehmigt in den letzten 7 Tagen');
    expect(section).toHaveTextContent('Recent Approval');
    expect(section).not.toHaveTextContent('Old Approval');
    expect(screen.getByTestId('review-section-approved-count')).toHaveTextContent('1');
  });

  it('hides the approved section when no approved events fall within the 7-day window', () => {
    const now = Date.now();
    mockUseAllEvents.events = [
      {
        id: 'a1',
        title: 'Old Approval',
        status: 'approved',
        approvedAt: { toDate: () => new Date(now - 30 * 24 * 60 * 60 * 1000) },
      },
    ];
    renderReviewTab();
    expect(screen.queryByTestId('review-section-approved')).not.toBeInTheDocument();
  });

  it('hides the approved section when approved events have no approvedAt timestamp', () => {
    mockUseAllEvents.events = [{ id: 'a1', title: 'Legacy Approved', status: 'approved' }];
    renderReviewTab();
    expect(screen.queryByTestId('review-section-approved')).not.toBeInTheDocument();
  });

  it('renders both sections side by side when there are pending and recently approved events', () => {
    const now = Date.now();
    mockUsePendingEvents.pendingEvents = [{ id: 'p1', title: 'Pending Now', status: 'pending' }];
    mockUseAllEvents.events = [
      {
        id: 'a1',
        title: 'Recent Approved',
        status: 'approved',
        approvedAt: { toDate: () => new Date(now - 1 * 24 * 60 * 60 * 1000) },
      },
    ];
    renderReviewTab();
    expect(screen.getByTestId('review-section-pending')).toBeInTheDocument();
    expect(screen.getByTestId('review-section-approved')).toBeInTheDocument();
  });
});

describe('ReviewTab — collapsible sections (rnp10LBx)', () => {
  it('keeps pending open and approved closed by default, and toggles with aria-expanded', () => {
    const now = Date.now();
    mockUsePendingEvents.pendingEvents = [{ id: 'p1', title: 'Pending Now', status: 'pending' }];
    mockUseAllEvents.events = [
      {
        id: 'a1',
        title: 'Recent Approved',
        status: 'approved',
        approvedAt: { toDate: () => new Date(now - 24 * 60 * 60 * 1000) },
      },
    ];
    renderReviewTab();
    const pendingToggle = screen.getByTestId('review-toggle-pending');
    const approvedToggle = screen.getByTestId('review-toggle-approved');
    expect(pendingToggle).toHaveAttribute('aria-expanded', 'true');
    expect(approvedToggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText('Pending Now')).toBeVisible();
    expect(screen.getByText('Recent Approved')).not.toBeVisible();

    fireEvent.click(approvedToggle);
    expect(approvedToggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Recent Approved')).toBeVisible();

    fireEvent.click(pendingToggle);
    expect(screen.getByText('Pending Now')).not.toBeVisible();
    expect(screen.getByTestId('review-section-pending-count')).toHaveTextContent('1');
  });
});

describe('ReviewTab — rich metadata on each row (j67qz6b2)', () => {
  it('shows "Eingereicht am" on pending rows from createdAt', () => {
    mockUsePendingEvents.pendingEvents = [
      {
        id: 'p1',
        title: 'Pending One',
        status: 'pending',
        createdAt: { toDate: () => new Date('2026-09-20T10:00:00Z') },
      },
    ];
    renderReviewTab();
    expect(screen.getByTestId('event-card-submitted-at-p1')).toHaveTextContent(/Eingereicht am/);
  });

  it('shows "Genehmigt von [name] am [date]" on approved rows', () => {
    const now = Date.now();
    mockUseAllEvents.events = [
      {
        id: 'a1',
        title: 'Approved One',
        status: 'approved',
        approvedBy: 'admin-uid',
        approvedAt: { toDate: () => new Date(now - 1 * 24 * 60 * 60 * 1000) },
      },
    ];
    mockUserDisplayNames.namesByUid = { 'admin-uid': 'Anna Schmidt' };
    renderReviewTab();
    const meta = screen.getByTestId('event-card-approved-by-a1');
    expect(meta).toHaveTextContent('Genehmigt von Anna Schmidt');
    expect(meta).toHaveTextContent(/am /);
  });

  it('falls back to "einem Admin" when the reviewer profile name is not yet known', () => {
    const now = Date.now();
    mockUseAllEvents.events = [
      {
        id: 'a1',
        title: 'Approved One',
        status: 'approved',
        approvedBy: 'admin-uid',
        approvedAt: { toDate: () => new Date(now - 1 * 24 * 60 * 60 * 1000) },
      },
    ];
    mockUserDisplayNames.namesByUid = {};
    renderReviewTab();
    expect(screen.getByTestId('event-card-approved-by-a1')).toHaveTextContent('einem Admin');
  });

  it('shows "In Klärung mit [admin-name]" on rows where messages are present', () => {
    mockUsePendingEvents.pendingEvents = [{ id: 'p1', title: 'Klärung Event', status: 'pending' }];
    mockUseEventsWithMessages.hasMessagesByEvent = { p1: true };
    mockUseEventsWithMessages.inKlaerungAuthorNameByEvent = { p1: 'Anna Schmidt' };
    renderReviewTab();
    const meta = screen.getByTestId('event-card-in-klaerung-by-p1');
    expect(meta).toHaveTextContent('In Klärung mit Anna Schmidt');
  });

  it('renders the full-width "KLÄRUNG LÄUFT" ribbon when hasMessages is true', () => {
    mockUsePendingEvents.pendingEvents = [{ id: 'p1', title: 'Klärung Event', status: 'pending' }];
    mockUseEventsWithMessages.hasMessagesByEvent = { p1: true };
    renderReviewTab();
    expect(screen.getByTestId('event-card-clarification-ribbon')).toHaveTextContent(
      /Klärung läuft/i
    );
    expect(screen.getByTestId('event-card-clarification-ribbon').className).toContain(
      'event-card-clarification-ribbon'
    );
  });

  it('does not render the clarification ribbon when the event has no messages', () => {
    mockUsePendingEvents.pendingEvents = [{ id: 'p1', title: 'Plain Event', status: 'pending' }];
    renderReviewTab();
    expect(screen.queryByTestId('event-card-clarification-ribbon')).not.toBeInTheDocument();
  });
});

describe("ReviewTab — deleting another user's event", () => {
  it('requires a reason and stores it on the trashed event', async () => {
    mockUsePendingEvents.pendingEvents = [
      { id: 'p1', title: 'Fremdes Event', status: 'pending', createdBy: 'user-uid' },
    ];
    renderReviewTab();
    fireEvent.click(screen.getByRole('button', { name: 'Event löschen' }));
    const confirm = screen.getByRole('button', { name: 'In Papierkorb' });
    expect(confirm).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Grund für das Löschen/), {
      target: { value: '  Doppelt eingetragen ' },
    });
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);
    await waitFor(() => expect(mockUpdateDoc).toHaveBeenCalledTimes(1));
    expect(mockUpdateDoc.mock.calls[0][1]).toMatchObject({
      status: 'trashed',
      trashedBy: 'admin-uid',
      trashReason: 'Doppelt eingetragen',
    });
  });

  it('asks for no reason when the admin deletes their own event', () => {
    mockUsePendingEvents.pendingEvents = [
      { id: 'p1', title: 'Eigenes Event', status: 'pending', createdBy: 'admin-uid' },
    ];
    renderReviewTab();
    fireEvent.click(screen.getByRole('button', { name: 'Event löschen' }));
    expect(screen.queryByLabelText(/Grund für das Löschen/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'In Papierkorb' })).toBeEnabled();
  });
});

describe('ReviewTab for a Regions-Moderator:in', () => {
  beforeEach(() => {
    mockAuth.current = {
      user: { uid: 'mod-uid' },
      role: 'RegionModerator',
      staffRegionIds: ['tirol'],
    };
  });

  it('names her region, offers approve but no edit link on other people’s events', () => {
    mockUsePendingEvents.pendingEvents = [
      { id: 'p1', title: 'Yoga Innsbruck', status: 'pending', regionId: 'tirol', createdBy: 'o' },
    ];
    renderReviewTab();
    expect(screen.getByText(/Events aus Tirol, die auf deine Freigabe warten/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Genehmigen' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Bearbeiten' })).not.toBeInTheDocument();
  });

  it('shows only recently approved events of her regions', () => {
    const approvedAt = new Date().toISOString();
    mockUseAllEvents.events = [
      { id: 'a1', title: 'Tirol Event', status: 'approved', regionId: 'tirol', approvedAt },
      { id: 'a2', title: 'Vorarlberg Event', status: 'approved', approvedAt },
    ];
    renderReviewTab();
    expect(screen.getByText('Tirol Event')).toBeInTheDocument();
    expect(screen.queryByText('Vorarlberg Event')).not.toBeInTheDocument();
  });
});

describe('ReviewTab - regions', () => {
  const pendingEvent = (id: string, regionId?: string, bezirk = 'Bregenz') => ({
    id,
    title: `Event ${id}`,
    date: '2026-12-01',
    status: 'pending',
    bezirk,
    ...(regionId ? { regionId } : {}),
  });

  const activate = (...ids: string[]) => {
    mockRegions.current = mockRegions.current.map((r) => ({
      ...r,
      active: ids.includes(r.id as string),
    }));
  };

  beforeEach(() => {
    mockUsePendingEvents.pendingEvents = [
      pendingEvent('a'),
      pendingEvent('b', 'tirol', 'Innsbruck'),
      pendingEvent('c', 'tirol', 'Imst'),
    ];
  });

  it('shows no region badge, location suffix or filter with one active region', () => {
    mockUsePendingEvents.pendingEvents = [pendingEvent('a'), pendingEvent('x')];
    renderReviewTab();
    expect(screen.queryByTestId('event-card-region-badge-a')).not.toBeInTheDocument();
    expect(screen.queryByTestId('review-region-filter')).not.toBeInTheDocument();
    expect(screen.queryByText(/Bregenz ·/)).not.toBeInTheDocument();
  });

  it('shows the region badge and "Bezirk · Region" with two active regions', () => {
    activate('vorarlberg', 'tirol');
    renderReviewTab();
    expect(screen.getByTestId('event-card-region-badge-a')).toHaveTextContent('Vorarlberg');
    expect(screen.getByTestId('event-card-region-badge-b')).toHaveTextContent('Tirol');
    expect(screen.getByText('Innsbruck · Tirol')).toBeInTheDocument();
  });

  it('Super-Admin gets a filter with pending counts per region that narrows lists and counts', () => {
    activate('vorarlberg', 'tirol');
    renderReviewTab();
    const select = screen.getByTestId('review-region-filter') as HTMLSelectElement;
    const labels = Array.from(select.options).map((o) => o.textContent);
    expect(labels).toEqual(['Alle (3)', 'Vorarlberg (1)', 'Tirol (2)']);
    expect(screen.getByTestId('review-section-pending-count')).toHaveTextContent('3');

    fireEvent.change(select, { target: { value: 'tirol' } });
    expect(screen.getByTestId('review-section-pending-count')).toHaveTextContent('2');
    expect(screen.queryByText('Event a')).not.toBeInTheDocument();
    expect(screen.getByText('Event b')).toBeInTheDocument();
    expect(sessionStorage.getItem('review:regionFilter')).toBe('tirol');
  });

  it('restores the remembered filter choice', () => {
    activate('vorarlberg', 'tirol');
    sessionStorage.setItem('review:regionFilter', 'vorarlberg');
    renderReviewTab();
    expect(screen.getByTestId('review-section-pending-count')).toHaveTextContent('1');
  });

  it('offers a Super-Admin an inactive region that has items', () => {
    activate('vorarlberg');
    renderReviewTab();
    const select = screen.getByTestId('review-region-filter') as HTMLSelectElement;
    expect(Array.from(select.options).map((o) => o.textContent)).toEqual([
      'Alle (3)',
      'Vorarlberg (1)',
      'Tirol (2)',
    ]);
  });

  it('a moderator of two regions sees only her regions in the filter', () => {
    activate('vorarlberg', 'tirol', 'steiermark');
    mockAuth.current = {
      user: { uid: 'mod' },
      role: 'RegionModerator',
      staffRegionIds: ['tirol', 'steiermark'],
    };
    mockUsePendingEvents.pendingEvents = [
      pendingEvent('b', 'tirol', 'Innsbruck'),
      pendingEvent('s', 'steiermark', 'Graz'),
    ];
    renderReviewTab();
    const select = screen.getByTestId('review-region-filter') as HTMLSelectElement;
    expect(Array.from(select.options).map((o) => o.textContent)).toEqual([
      'Alle (2)',
      'Tirol (1)',
      'Steiermark (1)',
    ]);
  });

  it('a moderator of one region gets no filter', () => {
    activate('vorarlberg', 'tirol');
    mockAuth.current = {
      user: { uid: 'mod' },
      role: 'RegionModerator',
      staffRegionIds: ['tirol'],
    };
    mockUsePendingEvents.pendingEvents = [pendingEvent('b', 'tirol', 'Innsbruck')];
    renderReviewTab();
    expect(screen.queryByTestId('review-region-filter')).not.toBeInTheDocument();
  });
});

describe('ReviewTab — organizer edit alerts', () => {
  it('marks only the events with an unread alert as "Vom User bearbeitet"', () => {
    mockUsePendingEvents.pendingEvents = [
      { id: 'p1', title: 'Bearbeitet', status: 'pending' },
      { id: 'p2', title: 'Unberührt', status: 'pending' },
    ];
    mockAlerts.unreadByEvent = { p1: { kind: 'edited', changeCount: 2 } };
    renderReviewTab();
    const ribbons = screen.getAllByTestId('event-card-edit-ribbon');
    expect(ribbons).toHaveLength(1);
    expect(ribbons[0]).toHaveTextContent('Vom User bearbeitet');
  });

  it('labels a re-submission differently', () => {
    mockUsePendingEvents.pendingEvents = [{ id: 'p1', title: 'Zurück', status: 'pending' }];
    mockAlerts.unreadByEvent = { p1: { kind: 'resubmitted', changeCount: 1 } };
    renderReviewTab();
    expect(screen.getByTestId('event-card-edit-ribbon')).toHaveTextContent('Erneut eingereicht');
  });

  it('marks the alert as read when the admin approves the event', async () => {
    mockUsePendingEvents.pendingEvents = [{ id: 'p1', title: 'Bearbeitet', status: 'pending' }];
    mockAlerts.unreadByEvent = { p1: { kind: 'edited', changeCount: 1 } };
    mockApproveEvent.mockResolvedValue(undefined);
    renderReviewTab();
    fireEvent.click(screen.getByRole('button', { name: 'Genehmigen' }));
    await waitFor(() => expect(mockAlerts.markRead).toHaveBeenCalledWith('p1'));
  });
});

describe('ReviewTab — image check on pending rows', () => {
  it('opens the cover crop from "Bild prüfen" on a pending row with a cover', () => {
    mockUsePendingEvents.pendingEvents = [
      { id: 'p1', title: 'Mit Bild', status: 'pending', imageUrl: 'https://x/cover.jpg' },
    ];
    renderReviewTab();
    expect(screen.queryByTestId('admin-cover-preview')).toBeNull();
    fireEvent.click(screen.getByTestId('review-image-check-toggle-p1'));
    expect(screen.getByTestId('admin-cover-preview')).toBeInTheDocument();
    expect(screen.getByTestId('admin-cover-crop-edit')).toBeInTheDocument();
    expect(screen.queryByTestId('instagram-post-preview')).toBeNull();
    fireEvent.click(screen.getByTestId('review-image-check-toggle-p1'));
    expect(screen.queryByTestId('admin-cover-preview')).toBeNull();
  });

  it('also shows the Instagram preview when the organizer allowed the post', () => {
    mockUsePendingEvents.pendingEvents = [
      {
        id: 'p1',
        title: 'Mit Instagram',
        status: 'pending',
        imageUrl: 'https://x/cover.jpg',
        instagramConsent: true,
      },
    ];
    renderReviewTab();
    fireEvent.click(screen.getByTestId('review-image-check-toggle-p1'));
    expect(screen.getByTestId('admin-cover-preview')).toBeInTheDocument();
    expect(screen.getByTestId('instagram-post-preview')).toBeInTheDocument();
    expect(screen.getByTestId('admin-instagram-crop-edit')).toBeInTheDocument();
  });

  it('offers no image check for a row without a cover photo', () => {
    mockUsePendingEvents.pendingEvents = [{ id: 'p1', title: 'Ohne Bild', status: 'pending' }];
    renderReviewTab();
    expect(screen.queryByTestId('review-image-check-toggle-p1')).toBeNull();
  });
});
