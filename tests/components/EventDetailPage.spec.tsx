import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { arrayUnion } from 'firebase/firestore';

const mockAuth = vi.hoisted(() => ({
  user: null as { uid: string } | null,
  role: null as string | null,
  loading: false,
}));

const mockEvents = vi.hoisted(() => ({
  deleteEvent: vi.fn(async () => {}),
  updateEvent: vi.fn(async () => {}),
}));

const mockFirestoreDoc = vi.hoisted(() => ({
  getDocResult: null as null | { id: string; data: Record<string, unknown> },
}));

vi.mock('../../src/hooks/useAuth', () => ({
  useAuth: () => ({
    user: mockAuth.user,
    role: mockAuth.role,
    loading: mockAuth.loading,
  }),
}));

vi.mock('../../src/hooks/useEvents', () => ({
  useEvents: () => mockEvents,
}));

vi.mock('../../src/hooks/useCategoryRegistry', () => ({
  useCategoryRegistry: () => ({
    categories: [],
    colorByName: new Map(),
    nameExists: () => false,
    loading: false,
    error: null,
    isAdmin: false,
    addCategory: vi.fn(),
    updateCategory: vi.fn(),
    deleteCategory: vi.fn(),
  }),
}));

vi.mock('firebase/firestore', async () => {
  const actual = await vi.importActual('firebase/firestore');
  return {
    ...actual,
    getDoc: async () => {
      if (!mockFirestoreDoc.getDocResult) {
        return { exists: () => false, data: () => ({}) };
      }
      return {
        exists: () => true,
        data: () => mockFirestoreDoc.getDocResult.data,
      };
    },
    getDocs: async () => ({ empty: true, docs: [] }),
    collection: () => ({ type: 'collection' }),
    doc: () => ({ type: 'doc' }),
    query: () => ({ type: 'query' }),
    where: () => ({ type: 'where' }),
  };
});

vi.mock('react-helmet-async', () => ({
  Helmet: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="helmet">{children}</div>
  ),
}));

vi.mock('../../src/lib/firebase', () => ({
  db: {},
}));

vi.mock('../../src/lib/slug', () => ({
  isLegacyId: () => true,
}));

vi.mock('../../src/utils/eventFallbacks', () => ({
  getEventFallbackImage: () => '/event-fallbacks/sonstiges.jpg',
}));

const mockGetEventOccurrences = vi.hoisted(() => vi.fn());
const mockGetNextUpcomingOccurrence = vi.hoisted(() => vi.fn());
const mockGetRecurrenceDatesForDetail = vi.hoisted(() => vi.fn());

vi.mock('../../src/utils/eventOccurrences', async () => {
  const actual = await vi.importActual('../../src/utils/eventOccurrences');
  return {
    ...actual,
    getEventOccurrences: (...args) => mockGetEventOccurrences(...args),
    getNextUpcomingOccurrence: (...args) => mockGetNextUpcomingOccurrence(...args),
    getRecurrenceDatesForDetail: (...args) => mockGetRecurrenceDatesForDetail(...args),
    getOccurrenceCount: vi.fn(),
    getRecurrenceLabel: vi.fn(),
  };
});

import EventDetailPage from '../../src/pages/EventDetailPage';

const foreignEvent = {
  id: 'remote-event-id',
  title: 'Yoga heute',
  slug: 'yoga-heute-yogastudio-dornbirn-20260804',
  date: '2026-08-04',
  endDate: null,
  time: '10:00',
  endTime: '11:30',
  place: 'Yogastudio Dornbirn',
  description: 'Yoga Kurs.',
  category: 'Yoga',
  bezirk: 'Dornbirn',
  organizer: { firstName: 'Anna', lastName: 'Schmidt', email: 'admin@test.com' },
  kontakt: '0676 1234567',
  status: 'approved',
  createdBy: 'other-user-uid',
};

const recurringEvent = {
  id: 'recurring-event-id',
  title: 'Wochen-Yoga',
  slug: 'wochen-yoga-20260804',
  date: '2026-08-04',
  endDate: null,
  time: '10:00',
  endTime: '11:30',
  place: 'Yogastudio Dornbirn',
  description: 'Wöchentlicher Yoga Kurs.',
  category: 'Yoga',
  bezirk: 'Dornbirn',
  organizer: { firstName: 'Anna', lastName: 'Schmidt', email: 'admin@test.com' },
  kontakt: '0676 1234567',
  status: 'approved',
  createdBy: 'other-user-uid',
  recurrence: 'weekly',
  recurrenceEndDate: '2026-12-31',
};

const customDatesEvent = {
  id: 'custom-dates-event-id',
  title: 'Individuelle Termine',
  slug: 'individuelle-termine-workshop-raum-20260804',
  date: '2026-08-04',
  endDate: null,
  time: '17:00',
  endTime: '19:00',
  place: 'Workshop Raum',
  description: 'Workshopreihe mit individuellen Terminen.',
  category: 'Yoga',
  bezirk: 'Dornbirn',
  organizer: { firstName: 'Anna', lastName: 'Schmidt', email: 'admin@test.com' },
  kontakt: 'anna@example.com',
  status: 'approved',
  createdBy: 'other-user-uid',
  recurrence: 'custom',
  customDates: ['2026-08-04', '2026-08-18', '2026-09-01', '2026-10-06'],
};

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/event/yoga-heute-yogastudio-dornbirn-20260804']}>
      <Routes>
        <Route path="/event/:slug" element={<EventDetailPage />} />
      </Routes>
    </MemoryRouter>
  );

const renderPageWithState = (from: string) =>
  render(
    <MemoryRouter
      initialEntries={[
        { pathname: '/event/yoga-heute-yogastudio-dornbirn-20260804', state: { from } },
      ]}
    >
      <Routes>
        <Route path="/event/:slug" element={<EventDetailPage />} />
      </Routes>
    </MemoryRouter>
  );

const renderRecurringEventPage = (occurrenceDate) =>
  render(
    <MemoryRouter
      initialEntries={[
        `/event/wochen-yoga-20260804${occurrenceDate ? `?occurrenceDate=${occurrenceDate}` : ''}`,
      ]}
    >
      <Routes>
        <Route path="/event/:slug" element={<EventDetailPage />} />
      </Routes>
    </MemoryRouter>
  );

const renderCustomDatesEventPage = (occurrenceDate?: string | null) =>
  render(
    <MemoryRouter
      initialEntries={[
        `/event/individuelle-termine-workshop-raum-20260804${occurrenceDate ? `?occurrenceDate=${occurrenceDate}` : ''}`,
      ]}
    >
      <Routes>
        <Route path="/event/:slug" element={<EventDetailPage />} />
      </Routes>
    </MemoryRouter>
  );

beforeEach(() => {
  mockAuth.user = null;
  mockAuth.role = null;
  mockAuth.loading = false;
  mockFirestoreDoc.getDocResult = {
    id: foreignEvent.id,
    data: foreignEvent,
  };
  mockEvents.deleteEvent.mockClear();
  mockGetRecurrenceDatesForDetail.mockReset();
  mockGetRecurrenceDatesForDetail.mockReturnValue([]);
});

describe('EventDetailPage — edit/delete visibility', () => {
  it('shows no edit or delete buttons for guest visitors', async () => {
    renderPage();
    expect(await screen.findByText('Yoga heute')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /event bearbeiten/i })).toBeNull();
    expect(screen.queryByTestId('delete-event-button')).toBeNull();
  });

  it('shows edit and delete buttons for the event owner', async () => {
    mockAuth.user = { uid: 'other-user-uid' };

    renderPage();
    expect(await screen.findByText('Yoga heute')).toBeInTheDocument();

    const editLink = screen.getByRole('link', { name: /event bearbeiten/i });
    expect(editLink).toHaveAttribute('href', '/admin/edit/remote-event-id');

    expect(screen.getByTestId('delete-event-button')).toBeInTheDocument();
  });

  it('shows edit and delete buttons for an admin even on a non-owned event', async () => {
    mockAuth.user = { uid: 'admin-uid' };
    mockAuth.role = 'Admin';

    renderPage();
    expect(await screen.findByText('Yoga heute')).toBeInTheDocument();

    const editLink = screen.getByRole('link', { name: /event bearbeiten/i });
    expect(editLink).toHaveAttribute('href', '/admin/edit/remote-event-id');

    expect(screen.getByTestId('delete-event-button')).toBeInTheDocument();
  });

  it('hides edit and delete buttons for a non-admin non-owner user', async () => {
    mockAuth.user = { uid: 'random-user-uid' };

    renderPage();
    expect(await screen.findByText('Yoga heute')).toBeInTheDocument();

    expect(screen.queryByRole('link', { name: /event bearbeiten/i })).toBeNull();
    expect(screen.queryByTestId('delete-event-button')).toBeNull();
  });
});

describe('EventDetailPage — trash flow', () => {
  it('calls deleteEvent and navigates to the trash tab when the user confirms (SS79oSci)', async () => {
    mockAuth.user = { uid: 'admin-uid' };
    mockAuth.role = 'Admin';

    renderPage();
    expect(await screen.findByText('Yoga heute')).toBeInTheDocument();

    const deleteButton = await screen.findByTestId('delete-event-button');
    await act(async () => {
      fireEvent.click(deleteButton);
    });

    expect(await screen.findByText(/in den Papierkorb verschoben/i)).toBeInTheDocument();

    const confirmButton = screen.getByRole('button', { name: /papierkorb/i });
    await act(async () => {
      fireEvent.click(confirmButton);
    });

    expect(mockEvents.deleteEvent).toHaveBeenCalledWith('remote-event-id');
  });
});

describe('EventDetailPage — recurring event delete flow', () => {
  beforeEach(() => {
    mockFirestoreDoc.getDocResult = {
      id: recurringEvent.id,
      data: recurringEvent,
    };
    mockEvents.updateEvent.mockClear();
    mockEvents.deleteEvent.mockClear();
    mockGetEventOccurrences.mockReturnValue([
      { ...recurringEvent, date: '2026-08-10' },
      { ...recurringEvent, date: '2026-08-17' },
    ]);
    mockGetNextUpcomingOccurrence.mockReturnValue('2026-08-10');
  });

  it('shows recurring delete dialog when deleting a recurring event', async () => {
    mockAuth.user = { uid: 'admin-uid' };
    mockAuth.role = 'Admin';

    renderRecurringEventPage('2026-08-10');
    expect(await screen.findByText('Wochen-Yoga')).toBeInTheDocument();

    const deleteButton = await screen.findByTestId('delete-event-button');
    await act(async () => {
      fireEvent.click(deleteButton);
    });

    expect(await screen.findByRole('heading', { name: /termin auswählen/i })).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Weiter' }));
    });

    await screen.findByRole('heading', { name: /termin löschen/i });
    expect(screen.getByText('Gesamte Serie löschen')).toBeInTheDocument();
  });

  it('calls updateEvent to add exception date when "delete this only" is clicked', async () => {
    mockAuth.user = { uid: 'admin-uid' };
    mockAuth.role = 'Admin';

    renderRecurringEventPage('2026-08-10');
    expect(await screen.findByText('Wochen-Yoga')).toBeInTheDocument();

    const deleteButton = await screen.findByTestId('delete-event-button');
    await act(async () => {
      fireEvent.click(deleteButton);
    });

    expect(await screen.findByRole('heading', { name: /termin auswählen/i })).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Weiter' }));
    });

    await screen.findByRole('heading', { name: /termin löschen/i });

    const deleteThisOnlyBtn = screen.getByText('Nur diesen Termin löschen');
    await deleteThisOnlyBtn.click();

    expect(mockEvents.updateEvent).toHaveBeenCalledWith('recurring-event-id', {
      exceptionDates: arrayUnion('2026-08-10'),
    });
  });

  it('calls updateEvent to set recurrenceEndDate when "delete this and future" is clicked', async () => {
    mockAuth.user = { uid: 'admin-uid' };
    mockAuth.role = 'Admin';

    renderRecurringEventPage('2026-08-10');
    expect(await screen.findByText('Wochen-Yoga')).toBeInTheDocument();

    const deleteButton = await screen.findByTestId('delete-event-button');
    await act(async () => {
      fireEvent.click(deleteButton);
    });

    expect(await screen.findByRole('heading', { name: /termin auswählen/i })).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Weiter' }));
    });

    await screen.findByRole('heading', { name: /termin löschen/i });

    const deleteThisAndFutureBtn = screen.getByText('Diesen und alle folgenden Termine löschen');
    await deleteThisAndFutureBtn.click();

    expect(mockEvents.updateEvent).toHaveBeenCalledWith('recurring-event-id', {
      recurrenceEndDate: '2026-08-09',
    });
  });

  it('sets recurrenceEndDate to day before selected occurrence when "delete this and future" is clicked without occurrenceDate', async () => {
    mockAuth.user = { uid: 'admin-uid' };
    mockAuth.role = 'Admin';

    renderRecurringEventPage(null);
    expect(await screen.findByText('Wochen-Yoga')).toBeInTheDocument();

    const deleteButton = await screen.findByTestId('delete-event-button');
    await act(async () => {
      fireEvent.click(deleteButton);
    });

    expect(await screen.findByRole('heading', { name: /termin auswählen/i })).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Weiter' }));
    });

    await screen.findByRole('heading', { name: /termin löschen/i });

    const deleteThisAndFutureBtn = screen.getByText('Diesen und alle folgenden Termine löschen');
    await deleteThisAndFutureBtn.click();

    expect(mockEvents.updateEvent).toHaveBeenCalledWith('recurring-event-id', {
      recurrenceEndDate: '2026-08-09',
    });
  });

  it('calls deleteEvent when "delete whole series" is clicked', async () => {
    mockAuth.user = { uid: 'admin-uid' };
    mockAuth.role = 'Admin';

    renderRecurringEventPage('2026-08-10');
    expect(await screen.findByText('Wochen-Yoga')).toBeInTheDocument();

    const deleteButton = await screen.findByTestId('delete-event-button');
    await act(async () => {
      fireEvent.click(deleteButton);
    });

    expect(await screen.findByRole('heading', { name: /termin auswählen/i })).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Weiter' }));
    });

    await screen.findByRole('heading', { name: /termin löschen/i });

    const deleteAllBtn = screen.getByText('Gesamte Serie löschen');
    await deleteAllBtn.click();

    expect(mockEvents.deleteEvent).toHaveBeenCalledWith('recurring-event-id');
  });
});

describe('EventDetailPage — organizer profile photo', () => {
  const eventWithPhoto = {
    ...foreignEvent,
    organizer: {
      firstName: 'Anna',
      lastName: 'Schmidt',
      email: 'admin@test.com',
      photoURL: 'https://example.com/anna.png',
    },
  };

  beforeEach(() => {
    mockFirestoreDoc.getDocResult = {
      id: eventWithPhoto.id,
      data: eventWithPhoto,
    };
  });

  it('renders organizer profile photo when event has photoURL', async () => {
    renderPage();
    expect(await screen.findByText('Yoga heute')).toBeInTheDocument();

    const organizer = screen.getByTestId('event-organizer');
    expect(organizer).toBeInTheDocument();

    const photo = screen.getByTestId('organizer-photo');
    expect(photo).toBeInTheDocument();
    expect(photo.tagName).toBe('IMG');
    expect(photo).toHaveAttribute('src', 'https://example.com/anna.png');
  });

  it('does not render organizer photo when event has no photoURL', async () => {
    mockFirestoreDoc.getDocResult = {
      id: foreignEvent.id,
      data: foreignEvent,
    };

    renderPage();
    expect(await screen.findByText('Yoga heute')).toBeInTheDocument();

    expect(screen.getByTestId('event-organizer')).toBeInTheDocument();
    expect(screen.queryByTestId('organizer-photo')).toBeNull();
  });
});

describe('EventDetailPage — back navigation from admin drafts', () => {
  it('shows "Zurück zur Verwaltung" pointing at /admin?tab=drafts when state.from is /admin?tab=drafts', async () => {
    renderPageWithState('/admin?tab=drafts');
    expect(await screen.findByText('Yoga heute')).toBeInTheDocument();

    const backLink = screen.getByRole('link', { name: /zurück zur verwaltung/i });
    expect(backLink).toHaveAttribute('href', '/admin?tab=drafts');
  });

  it('shows "Zurück zur Verwaltung" pointing at /admin when state.from is /admin', async () => {
    renderPageWithState('/admin');
    expect(await screen.findByText('Yoga heute')).toBeInTheDocument();

    const backLink = screen.getByRole('link', { name: /zurück zur verwaltung/i });
    expect(backLink).toHaveAttribute('href', '/admin');
  });

  it('shows "Zurück zum Kalender" pointing at / when state.from is /', async () => {
    renderPageWithState('/');
    expect(await screen.findByText('Yoga heute')).toBeInTheDocument();

    const backLink = screen.getByRole('link', { name: /zurück zum kalender/i });
    expect(backLink).toHaveAttribute('href', '/');
  });
});

describe('EventDetailPage — recurrence dates are clickable links (AmfbLIFQ)', () => {
  describe('custom-dates series', () => {
    beforeEach(() => {
      mockFirestoreDoc.getDocResult = {
        id: customDatesEvent.id,
        data: customDatesEvent,
      };
      mockGetRecurrenceDatesForDetail.mockReturnValue([...customDatesEvent.customDates].sort());
    });

    it('renders each individual date as a link to that occurrence', async () => {
      renderCustomDatesEventPage();

      expect(await screen.findByText('Individuelle Termine')).toBeInTheDocument();

      const datesList = screen.getByTestId('event-detail-dates-list');
      expect(datesList).toBeInTheDocument();

      const items = screen.getAllByTestId('event-detail-date-item');
      expect(items).toHaveLength(customDatesEvent.customDates.length);

      const links = screen.getAllByTestId('event-detail-date-link');
      expect(links).toHaveLength(customDatesEvent.customDates.length);

      const expectedHrefs = [...customDatesEvent.customDates]
        .sort()
        .map((date) => `/event/${customDatesEvent.slug}?occurrenceDate=${date}`);
      const actualHrefs = links.map((link) => link.getAttribute('href'));
      expect(actualHrefs).toEqual(expectedHrefs);
    });

    it('hides the list and shows a single date when navigated to a specific occurrence', async () => {
      renderCustomDatesEventPage('2026-09-01');

      expect(await screen.findByText('Individuelle Termine')).toBeInTheDocument();

      expect(screen.queryByTestId('event-detail-dates-list')).toBeNull();
      expect(screen.queryByTestId('event-detail-date-item')).toBeNull();
    });
  });

  describe('weekly series', () => {
    beforeEach(() => {
      mockFirestoreDoc.getDocResult = {
        id: recurringEvent.id,
        data: recurringEvent,
      };
      mockGetRecurrenceDatesForDetail.mockReturnValue(['2026-09-07', '2026-09-14', '2026-09-21']);
    });

    it('renders every future occurrence as a link to that occurrence', async () => {
      renderRecurringEventPage(null);

      expect(await screen.findByText('Wochen-Yoga')).toBeInTheDocument();

      const items = screen.getAllByTestId('event-detail-date-item');
      expect(items).toHaveLength(3);

      const links = screen.getAllByTestId('event-detail-date-link');
      expect(links).toHaveLength(3);

      expect(links[0]).toHaveAttribute(
        'href',
        `/event/${recurringEvent.slug}?occurrenceDate=2026-09-07`
      );
      expect(links[1]).toHaveAttribute(
        'href',
        `/event/${recurringEvent.slug}?occurrenceDate=2026-09-14`
      );
      expect(links[2]).toHaveAttribute(
        'href',
        `/event/${recurringEvent.slug}?occurrenceDate=2026-09-21`
      );
    });

    it('hides the list when navigated to a specific occurrence', async () => {
      renderRecurringEventPage('2026-09-14');

      expect(await screen.findByText('Wochen-Yoga')).toBeInTheDocument();

      expect(screen.queryByTestId('event-detail-dates-list')).toBeNull();
    });
  });

  describe('non-recurring event', () => {
    it('does not render a dates list', async () => {
      renderPage();
      expect(await screen.findByText('Yoga heute')).toBeInTheDocument();

      expect(screen.queryByTestId('event-detail-dates-list')).toBeNull();
      expect(screen.queryByTestId('event-detail-date-item')).toBeNull();
    });
  });
});
