import { EVENTS } from '../../src/lib/analytics';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { DEFAULT_REGION_CONTEXT, RegionContext } from '../../src/hooks/useRegion';
import { STATIC_REGIONS } from '../../src/utils/regions.js';
import { getCombinedView } from '../../src/utils/regionRouting.js';
import CalendarPage, { buildFeedUrl, buildGoogleCalendarUrl } from '../../src/pages/CalendarPage';

const mockUseAllEvents = vi.hoisted(() => ({ events: [], loading: false, error: null }));
const mockUseCategories = vi.hoisted(() => ({ value: [] }));

vi.mock('../../src/hooks/useEvents', () => ({
  usePublicEvents: () => mockUseAllEvents,
  KATEGORIEN: ['Yoga', 'Breathwork', 'Meditation', 'Tanz', 'Singen', 'Soundhealing', 'Sonstiges'],
  BEZIRKE: ['Bregenz', 'Dornbirn', 'Feldkirch', 'Bludenz', 'Grenznahe'],
  ONLINE_LOCATION: 'Online',
}));

vi.mock('../../src/hooks/useCategories', () => ({
  useCategories: () => mockUseCategories.value,
}));

const mockUseFavorites = vi.hoisted(() => ({ isSignedIn: false }));

vi.mock('../../src/hooks/useFavorites', () => ({
  useFavorites: () => ({
    ready: true,
    isSignedIn: mockUseFavorites.isSignedIn,
    favoriteIds: new Set<string>(),
    isFavorite: () => false,
    toggleFavorite: vi.fn(),
  }),
}));

const mockAuthUser = vi.hoisted(() => ({ user: null as { uid: string } | null }));

vi.mock('../../src/hooks/useAuth', () => ({
  useAuth: () => ({ user: mockAuthUser.user, canCreateEvents: false }),
}));

// The calendar export asks the getCalendarFeedToken callable for the user's token.
const mockCallable = vi.hoisted(() => ({ calls: [] as unknown[], token: 'tok-1' }));

vi.mock('firebase/functions', async () => {
  const actual = await vi.importActual<object>('firebase/functions');
  return {
    ...actual,
    httpsCallable: (_fns: unknown, name: string) => async (data: unknown) => {
      mockCallable.calls.push({ name, data });
      return { data: { token: mockCallable.token } };
    },
  };
});

function setStoredCategories(categories) {
  window.localStorage.setItem(
    'calendarFilterState',
    JSON.stringify({
      currentMonth: '2026-09',
      selectedCategories: categories,
      selectedOrte: [],
      viewMode: 'card',
    })
  );
}

function getPressedChips() {
  const chips = document.querySelectorAll('.filter-chip--category');
  return Array.from(chips)
    .filter((c) => c.getAttribute('aria-pressed') === 'true')
    .map((c) => c.getAttribute('data-category'));
}

function setStoredOrte(selectedOrte: string[]) {
  window.localStorage.setItem(
    'calendarFilterState',
    JSON.stringify({
      currentMonth: '2026-09',
      selectedCategories: ['Yoga', 'Meditation'],
      selectedOrte,
      viewMode: 'card',
    })
  );
}

function renderPage() {
  return render(
    <MemoryRouter>
      <HelmetProvider>
        <CalendarPage />
      </HelmetProvider>
    </MemoryRouter>
  );
}

function getAccordion() {
  return document.querySelector('.filter-accordion') as HTMLDetailsElement;
}

describe('CalendarPage — category filter initial state (wkzZei1s)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    // Anchor to the last day of the current month so the events stay in
    // `monthEvents` (and therefore the rendered agenda) regardless of when
    // the tests run.
    const now = new Date();
    const lastOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const isoDate = `${lastOfMonth.getFullYear()}-${String(lastOfMonth.getMonth() + 1).padStart(
      2,
      '0'
    )}-${String(lastOfMonth.getDate()).padStart(2, '0')}`;
    mockUseAllEvents.events = [
      { id: '1', title: 'Y1', date: isoDate, bezirk: 'Bregenz', category: 'Yoga' },
      { id: '2', title: 'M1', date: isoDate, bezirk: 'Dornbirn', category: 'Meditation' },
    ];
    mockUseCategories.value = [
      'Yoga',
      'Breathwork',
      'Meditation',
      'Tanz',
      'Singen',
      'Soundhealing',
      'Sonstiges',
    ];
  });

  it('starts on "Keine" — no category chips pressed — when no saved state exists', async () => {
    renderPage();

    // No chip should be pressed on initial render.
    await waitFor(() => {
      const pressed = getPressedChips();
      expect(pressed).toEqual([]);
    });

    // All seeded events must still be visible: an empty selection is the
    // documented "show everything" semantic and must not change.
    const tiles = document.querySelectorAll('.event-tile, .event-row');
    expect(tiles.length).toBeGreaterThan(0);
  });

  it('does NOT auto-include a new category that loads after the saved selection', async () => {
    // User previously selected Yoga + Meditation. A new category "Qi Gong"
    // appears in the registry while they are away. Without auto-include, the
    // user's saved selection must be preserved exactly — widening it
    // silently would contradict the "one click to filter" promise.
    setStoredCategories(['Yoga', 'Meditation']);
    mockUseCategories.value = ['Yoga', 'Meditation', 'Qi Gong'];

    renderPage();

    await waitFor(() => {
      const pressed = getPressedChips().sort();
      expect(pressed).toEqual(['Meditation', 'Yoga']);
    });
  });

  it('keeps a deselected category off across unrelated re-renders', async () => {
    // The user previously had a subset of categories selected. The calendar
    // only offers categories that have upcoming events, so give every
    // category one.
    const future = new Date();
    future.setDate(future.getDate() + 3);
    const date = `${future.getFullYear()}-${String(future.getMonth() + 1).padStart(2, '0')}-${String(future.getDate()).padStart(2, '0')}`;
    mockUseAllEvents.events = mockUseCategories.value.map((category) => ({
      id: `evt-${category}`,
      title: category,
      category,
      date,
      time: '18:00',
    }));
    setStoredCategories(['Yoga', 'Meditation', 'Tanz']);

    renderPage();

    // Without auto-include the saved subset is the initial selection —
    // exactly what the user left the filter in last time.
    await waitFor(() => {
      expect(getPressedChips().sort()).toEqual(['Meditation', 'Tanz', 'Yoga']);
    });

    // User expands to every category then drops Soundhealing.
    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: 'Alle' })[0]);
    });
    const soundhealing = screen.getByRole('button', { name: /^Soundhealing/ });
    await act(async () => {
      fireEvent.click(soundhealing);
    });

    await waitFor(() => {
      expect(getPressedChips()).not.toContain('Soundhealing');
    });

    // An unrelated state change (date filter) forces a re-render. The
    // selection must not silently re-add Soundhealing — the original bug
    // this test guarded against would resurface here if auto-include were
    // ever re-introduced.
    const heute = screen.getByTestId('filter-chip-date-heute');
    await act(async () => {
      fireEvent.click(heute);
    });
    await act(async () => {
      fireEvent.click(heute);
    });

    expect(getPressedChips()).not.toContain('Soundhealing');
  });

  it('"Alle" and "Keine" both keep every event visible (no change in filter behaviour)', async () => {
    renderPage();

    const baseline = document.querySelectorAll('.event-tile, .event-row').length;
    expect(baseline).toBeGreaterThan(0);

    // Click "Alle" — every chip pressed, every event still visible.
    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: 'Alle' })[0]);
    });
    expect(document.querySelectorAll('.event-tile, .event-row').length).toBe(baseline);

    // Click "Keine" — no chip pressed, every event still visible.
    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: 'Keine' })[0]);
    });
    await waitFor(() => {
      expect(getPressedChips()).toEqual([]);
    });
    expect(document.querySelectorAll('.event-tile, .event-row').length).toBe(baseline);
  });
});

describe('CalendarPage — "Meine Favoriten" placement', () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockUseAllEvents.events = [];
    mockUseCategories.value = ['Yoga', 'Meditation'];
    mockUseFavorites.isSignedIn = true;
  });
  afterEach(() => {
    mockUseFavorites.isSignedIn = false;
  });

  it('lives inside the collapsed "Mehr Filter" accordion, after the Bezirke chips', () => {
    renderPage();

    const chip = screen.getByTestId('filter-chip-favorites');
    const accordion = getAccordion();
    expect(accordion.open).toBe(false);
    expect(accordion.contains(chip)).toBe(true);

    const online = screen.getByTestId('filter-chip-online');
    expect(online.compareDocumentPosition(chip) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('is hidden for visitors who are not signed in', () => {
    mockUseFavorites.isSignedIn = false;
    renderPage();

    expect(screen.queryByTestId('filter-chip-favorites')).toBeNull();
  });
});

describe('CalendarPage — "Mehr Filter" accordion auto-expand (W3OspPxk)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockUseAllEvents.events = [];
    mockUseCategories.value = ['Yoga', 'Meditation'];
  });

  it('starts collapsed when no saved Ort filter is active', () => {
    setStoredOrte([]);

    renderPage();

    const accordion = getAccordion();
    expect(accordion).not.toBeNull();
    expect(accordion.open).toBe(false);
  });

  it('starts expanded when a saved Ort filter is active', () => {
    setStoredOrte(['Feldkirch']);

    renderPage();

    const accordion = getAccordion();
    expect(accordion.open).toBe(true);
    // The active filter chip inside the accordion must be visible so the user
    // sees which filter is in effect.
    expect(screen.getByRole('button', { name: /^Feldkirch/ })).toBeVisible();
  });

  it('lets the user collapse the accordion manually even when a filter is active', () => {
    setStoredOrte(['Bregenz', 'Feldkirch']);

    renderPage();
    const accordion = getAccordion();
    expect(accordion.open).toBe(true);

    fireEvent.click(accordion.querySelector('.filter-accordion-summary')!);
    expect(accordion.open).toBe(false);

    // The user's collapse must survive an unrelated re-render of the page.
    fireEvent.click(accordion.querySelector('.filter-accordion-summary')!);
    expect(accordion.open).toBe(true);
  });

  it('does not auto-re-expand after the user collapses and adds another Ort filter', () => {
    setStoredOrte(['Bregenz']);

    renderPage();
    const accordion = getAccordion();
    expect(accordion.open).toBe(true);

    // User collapses the accordion on purpose.
    fireEvent.click(accordion.querySelector('.filter-accordion-summary')!);
    expect(accordion.open).toBe(false);

    // Now they open it and toggle on another Ort filter.
    fireEvent.click(accordion.querySelector('.filter-accordion-summary')!);
    const dornbirn = screen.getByRole('button', { name: /^Dornbirn/ });
    fireEvent.click(dornbirn);

    // User-driven state must win — collapsing again still collapses.
    fireEvent.click(accordion.querySelector('.filter-accordion-summary')!);
    expect(accordion.open).toBe(false);
  });
});

describe('CalendarPage — empty events hint (DWz8EwMO)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockUseAllEvents.events = [];
    mockUseCategories.value = ['Yoga', 'Meditation'];
  });

  it('shows the filter-adjustment hint when no events match', () => {
    renderPage();

    expect(screen.getByText(/Keine Events mit dieser Auswahl gefunden/i)).toBeInTheDocument();
    expect(screen.queryByText(/Keine Events in diesem Monat gefunden/i)).toBeNull();
  });
});

describe('CalendarPage — facet counts and reset', () => {
  function makeEvents(specs: { category: string; bezirk: string }[]) {
    const now = new Date();
    const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const date = `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, '0')}-${String(
      last.getDate()
    ).padStart(2, '0')}`;
    return specs.map((s, i) => ({
      id: `e${i}`,
      title: `Event ${i}`,
      date,
      time: '18:00',
      status: 'approved',
      ...s,
    }));
  }

  function storeFilter(selectedCategories: string[], selectedOrte: string[] = []) {
    const now = new Date();
    window.localStorage.setItem(
      'calendarFilterState',
      JSON.stringify({
        currentMonth: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
        selectedCategories,
        selectedOrte,
        viewMode: 'card',
      })
    );
  }

  function countOf(selector: string) {
    return document.querySelector(`${selector} [data-testid="filter-chip-count"]`)?.textContent;
  }

  beforeEach(() => {
    window.localStorage.clear();
    mockUseCategories.value = ['Yoga', 'Meditation'];
    mockUseAllEvents.events = makeEvents([
      { category: 'Yoga', bezirk: 'Dornbirn' },
      { category: 'Yoga', bezirk: 'Bregenz' },
      { category: 'Meditation', bezirk: 'Dornbirn' },
    ]);
  });

  it('shows per-category counts without any filter set', () => {
    renderPage();

    expect(countOf('[data-category="Yoga"]')).toBe('2');
    expect(countOf('[data-category="Meditation"]')).toBe('1');
  });

  it('does not zero out other categories when one is selected', () => {
    storeFilter(['Yoga']);
    renderPage();

    expect(countOf('[data-category="Yoga"]')).toBe('2');
    expect(countOf('[data-category="Meditation"]')).toBe('1');
  });

  function withEventInTwoMonths() {
    mockUseCategories.value = ['Yoga', 'Meditation', 'Schwitzhütte'];
    const later = new Date();
    later.setMonth(later.getMonth() + 2, 15);
    const date = `${later.getFullYear()}-${String(later.getMonth() + 1).padStart(2, '0')}-15`;
    mockUseAllEvents.events = [
      ...mockUseAllEvents.events,
      {
        id: 'late',
        title: 'Late',
        date,
        time: '18:00',
        status: 'approved',
        category: 'Schwitzhütte',
        bezirk: 'Dornbirn',
      },
    ];
  }

  it('hides category chips with 0 events in the shown month (yDDYM01K)', () => {
    withEventInTwoMonths();
    renderPage();
    expect(document.querySelector('[data-category="Schwitzhütte"]')).toBeNull();
    expect(document.querySelector('[data-category="Yoga"]')).not.toBeNull();
  });

  it('keeps a selected category chip even with 0 events (yDDYM01K)', () => {
    withEventInTwoMonths();
    storeFilter(['Schwitzhütte']);
    renderPage();
    expect(document.querySelector('[data-category="Schwitzhütte"]')).not.toBeNull();
  });

  it('narrows category counts by the selected Bezirk', () => {
    storeFilter([], ['Dornbirn']);
    renderPage();

    expect(countOf('[data-category="Yoga"]')).toBe('1');
    expect(countOf('[data-category="Meditation"]')).toBe('1');
  });

  it('narrows Bezirk counts by the selected category', () => {
    storeFilter(['Yoga']);
    renderPage();
    fireEvent.click(screen.getByText('Mehr Filter'));

    const ortCount = (name: string) =>
      screen
        .getByRole('button', { name: new RegExp('^' + name) })
        ?.querySelector('[data-testid="filter-chip-count"]')?.textContent;
    expect(ortCount('Dornbirn')).toBe('1');
    expect(ortCount('Feldkirch')).toBe('0');
  });

  it('offers a reset button in the empty state only while a filter is active', () => {
    storeFilter(['Meditation'], ['Bregenz']);
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Filter zurücksetzen' }));

    expect(getPressedChips()).toEqual([]);
    expect(screen.queryByRole('button', { name: 'Filter zurücksetzen' })).toBeNull();
  });

  it('shows no reset button when nothing is filtered', () => {
    mockUseAllEvents.events = [];
    renderPage();

    expect(screen.queryByRole('button', { name: 'Filter zurücksetzen' })).toBeNull();
  });
});

describe('CalendarPage — past-month navigation disabled (QveMKnvt)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockUseAllEvents.events = [];
    mockUseCategories.value = ['Yoga'];
  });

  function setStoredCurrentMonth(monthKey: string) {
    window.localStorage.setItem(
      'calendarFilterState',
      JSON.stringify({
        currentMonth: monthKey,
        selectedCategories: [],
        selectedOrte: [],
        viewMode: 'card',
      })
    );
  }

  it('drops a saved currentMonth that is in the past', async () => {
    const today = new Date();
    const past = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const pastKey = `${past.getFullYear()}-${String(past.getMonth() + 1).padStart(2, '0')}`;
    setStoredCurrentMonth(pastKey);

    renderPage();

    // The saved past month must be discarded so the user lands on the
    // current month (and can navigate forward from there).
    const expectedKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    await waitFor(() => {
      const stored = JSON.parse(window.localStorage.getItem('calendarFilterState') || '{}');
      expect(stored.currentMonth).toBe(expectedKey);
    });
  });

  it('keeps a saved currentMonth that is the current month', () => {
    const today = new Date();
    const currentKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    setStoredCurrentMonth(currentKey);

    renderPage();

    const stored = JSON.parse(window.localStorage.getItem('calendarFilterState') || '{}');
    expect(stored.currentMonth).toBe(currentKey);
  });

  it('keeps a saved currentMonth that is in the future', () => {
    const today = new Date();
    const future = new Date(today.getFullYear(), today.getMonth() + 2, 1);
    const futureKey = `${future.getFullYear()}-${String(future.getMonth() + 1).padStart(2, '0')}`;
    setStoredCurrentMonth(futureKey);

    renderPage();

    const stored = JSON.parse(window.localStorage.getItem('calendarFilterState') || '{}');
    expect(stored.currentMonth).toBe(futureKey);
  });

  it('disables the events-section prev button when the current month is loaded', async () => {
    const today = new Date();
    const currentKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    setStoredCurrentMonth(currentKey);

    renderPage();

    const prevButton = await waitFor(() => {
      const buttons = screen.getAllByRole('button', { name: /Vorheriger Monat/i });
      const disabled = buttons.find((b) => b.hasAttribute('disabled'));
      expect(disabled).toBeDefined();
      return disabled!;
    });
    expect(prevButton).toBeDisabled();
  });
});

describe('CalendarPage — mobile layout DOM scaffolding (zh4jJzje)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockUseAllEvents.events = [];
    mockUseCategories.value = ['Yoga', 'Meditation'];
  });

  // The mobile layout hides the hero, the section labels (Datum /
  // Kategorie / Ort) and the Alle/Keine toggles via CSS media queries.
  // jsdom does not apply CSS, so we can only assert the DOM scaffolding
  // is in place — the responsive show/hide behaviour is verified by a
  // Playwright @mobile spec rather than by Vitest.

  it('keeps the hero block in the DOM (CSS hides it below 640px)', () => {
    renderPage();
    expect(document.querySelector('.hero')).not.toBeNull();
    expect(screen.getByTestId('hero-features-slider')).toBeInTheDocument();
  });

  it('keeps the Datum section label in the DOM (CSS hides it below 640px)', () => {
    renderPage();
    // The Datum label is a section eyebrow inside the filter panel.
    expect(screen.getByText('Datum')).toBeInTheDocument();
  });

  it('keeps the Kategorie section label in the DOM (CSS hides it below 640px)', () => {
    renderPage();
    expect(screen.getByText('Kategorie')).toBeInTheDocument();
  });

  it('keeps the Alle/Keine quick-action buttons in the filter panel', () => {
    renderPage();
    const alleButtons = screen.getAllByRole('button', { name: 'Alle' });
    expect(alleButtons.length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: 'Keine' }).length).toBeGreaterThan(0);
  });
});

describe('CalendarPage — "Mehr Filter" summary (zh4jJzje)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockUseAllEvents.events = [];
    mockUseCategories.value = ['Yoga', 'Meditation'];
  });

  it('renders a filter icon (sliders) next to the "Mehr Filter" label', () => {
    renderPage();

    const summary = document.querySelector('.filter-accordion-summary');
    expect(summary).not.toBeNull();

    // The label wrapper holds both the icon and the text — the icon is
    // a lucide SVG marked with a dedicated class so the test does not
    // accidentally match the chevron at the other end of the summary.
    const label = summary?.querySelector('.filter-accordion-label');
    expect(label).not.toBeNull();
    expect(label?.textContent).toContain('Mehr Filter');

    const filterIcon = label?.querySelector('.filter-accordion-filter-icon');
    expect(filterIcon).not.toBeNull();
    expect(filterIcon?.tagName.toLowerCase()).toBe('svg');

    // The chevron still lives at the right edge of the summary so users
    // can tell the accordion is expandable.
    const chevron = summary?.querySelector('.filter-accordion-icon');
    expect(chevron).not.toBeNull();
    expect(chevron?.tagName.toLowerCase()).toBe('svg');
  });

  it('still toggles the accordion open and closed via the summary click', () => {
    renderPage();

    const accordion = getAccordion();
    expect(accordion.open).toBe(false);

    fireEvent.click(accordion.querySelector('.filter-accordion-summary')!);
    expect(accordion.open).toBe(true);

    fireEvent.click(accordion.querySelector('.filter-accordion-summary')!);
    expect(accordion.open).toBe(false);
  });
});

const track = vi.hoisted(() => vi.fn());
vi.mock('../../src/lib/analytics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/lib/analytics')>()),
  trackEvent: track,
}));

describe('CalendarPage analytics', () => {
  beforeEach(() => {
    track.mockClear();
    window.localStorage.clear();
    const future = new Date();
    future.setDate(future.getDate() + 3);
    const date = `${future.getFullYear()}-${String(future.getMonth() + 1).padStart(2, '0')}-${String(future.getDate()).padStart(2, '0')}`;
    mockUseCategories.value = ['Yoga', 'Meditation'];
    mockUseAllEvents.events = ['Yoga', 'Meditation'].map((category) => ({
      id: `evt-${category}`,
      slug: `slug-${category}`,
      title: category,
      category,
      date,
      time: '18:00',
    }));
  });

  it('reports filter_apply with the category name when a chip is switched on', async () => {
    renderPage();
    const chip = await screen.findByRole('button', { name: /^Yoga/ });
    fireEvent.click(chip);
    expect(track).toHaveBeenCalledWith(EVENTS.FILTER_APPLY, {
      filter_type: 'category',
      value: 'Yoga',
    });
    track.mockClear();
    fireEvent.click(chip);
    expect(track).not.toHaveBeenCalled();
  });

  it('reports calendar_view_change when the view is switched, not when re-selected', async () => {
    renderPage();
    const list = await screen.findByRole('button', { name: /Listenansicht/ });
    fireEvent.click(list);
    expect(track).toHaveBeenCalledWith(EVENTS.CALENDAR_VIEW_CHANGE, { view: 'list' });
    track.mockClear();
    fireEvent.click(list);
    expect(track).not.toHaveBeenCalled();
  });

  it('reports select_content when an event card is opened', async () => {
    renderPage();
    const card = await waitFor(() => {
      const el = document.querySelector('a.event-tile');
      if (!el) throw new Error('no card');
      return el as HTMLElement;
    });
    fireEvent.click(card);
    expect(track).toHaveBeenCalledWith(
      EVENTS.SELECT_CONTENT,
      expect.objectContaining({ content_type: 'event', item_id: expect.stringMatching(/^slug-/) })
    );
  });
});

describe('CalendarPage — calendar feed subscription', () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockUseAllEvents.events = [];
    mockUseCategories.value = ['Yoga', 'Meditation'];
    mockAuthUser.user = { uid: 'u1' };
    mockCallable.calls = [];
    mockCallable.token = 'tok-1';
  });
  afterEach(() => {
    mockAuthUser.user = null;
  });

  // Opens "im eigenen Kalender speichern" and waits for the personal link.
  async function openExport() {
    fireEvent.click(screen.getByText('im eigenen Kalender speichern'));
    await screen.findByTestId('calendar-subscribe-url');
  }

  it('shows visitors a login prompt instead of the export options', async () => {
    mockAuthUser.user = null;
    renderPage();

    expect(screen.getByTestId('calendar-subscribe')).toHaveTextContent(
      'im eigenen Kalender speichern'
    );
    fireEvent.click(screen.getByText('im eigenen Kalender speichern'));

    const prompt = await screen.findByTestId('login-prompt-modal');
    expect(prompt).toHaveTextContent('Kalender');
    expect(screen.getByTestId('calendar-subscribe')).not.toHaveAttribute('open');
    expect(screen.queryByTestId('calendar-subscribe-link')).toBeNull();
    expect(screen.queryByTestId('calendar-subscribe-url')).toBeNull();
    expect(mockCallable.calls).toEqual([]);
  });

  it('asks for the personal token only when a signed-in user opens the section', async () => {
    renderPage();
    expect(mockCallable.calls).toEqual([]);
    expect(screen.queryByTestId('calendar-subscribe-url')).toBeNull();

    await openExport();
    expect(mockCallable.calls).toEqual([{ name: 'getCalendarFeedToken', data: {} }]);
    expect(screen.getByTestId('calendar-subscribe-url')).toHaveTextContent(
      `${window.location.origin}/calendar/feed.ics?token=tok-1`
    );
  });

  it('replaces the link after confirming "Neuen Link erzeugen"', async () => {
    renderPage();
    await openExport();

    mockCallable.token = 'tok-2';
    fireEvent.click(screen.getByTestId('calendar-subscribe-regenerate'));
    const confirm = await screen.findByText('Neuen Kalender-Link erzeugen?');
    fireEvent.click(
      confirm.closest('.confirm-dialog')!.querySelector('.confirm-confirm') as HTMLElement
    );
    await waitFor(() =>
      expect(screen.getByTestId('calendar-subscribe-url')).toHaveTextContent('token=tok-2')
    );
    expect(mockCallable.calls).toContainEqual({
      name: 'getCalendarFeedToken',
      data: { regenerate: true },
    });
  });

  it('puts the export inside the "Mehr Filter" area, not as a standalone section', async () => {
    renderPage();
    await openExport();

    const accordion = document.querySelector('details.filter-accordion') as HTMLElement;
    const exportBox = screen.getByTestId('calendar-subscribe');
    expect(accordion.contains(exportBox)).toBe(true);
    expect(exportBox).toHaveTextContent('im eigenen Kalender speichern');
    expect(screen.queryByText('Alle Events im eigenen Kalender')).not.toBeInTheDocument();
    for (const id of ['link', 'google', 'copy', 'url']) {
      expect(accordion.contains(screen.getByTestId(`calendar-subscribe-${id}`))).toBe(true);
    }
  });

  it('offers the feed as a webcal button and shows the https address', async () => {
    renderPage();
    await openExport();

    const cta = screen.getByTestId('calendar-subscribe-link');
    expect(cta.getAttribute('href')).toBe(
      `webcal://${window.location.host}/calendar/feed.ics?token=tok-1`
    );
    expect(screen.getByTestId('calendar-subscribe-url')).toHaveTextContent(
      `${window.location.origin}/calendar/feed.ics?token=tok-1`
    );
  });

  it('links to Google Calendar with the feed prefilled', async () => {
    renderPage();
    await openExport();

    const href = screen.getByTestId('calendar-subscribe-google').getAttribute('href')!;
    expect(href.startsWith('https://calendar.google.com/calendar/render?cid=')).toBe(true);
    expect(decodeURIComponent(href.split('cid=')[1])).toBe(
      `webcal://${window.location.host}/calendar/feed.ics?token=tok-1`
    );
    expect(buildGoogleCalendarUrl('webcal://x.at/f.ics?bezirk=Online')).toBe(
      'https://calendar.google.com/calendar/render?cid=webcal%3A%2F%2Fx.at%2Ff.ics%3Fbezirk%3DOnline'
    );
  });

  it('copies the feed address and confirms it', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    renderPage();
    await openExport();

    fireEvent.click(screen.getByTestId('calendar-subscribe-copy'));

    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(
        `${window.location.origin}/calendar/feed.ics?token=tok-1`
      )
    );
    expect(await screen.findByText('Adresse kopiert')).toBeInTheDocument();
  });

  it('narrows the feed to the selected Orte and Kategorien', () => {
    const origin = 'https://www.thetribe.at';
    expect(buildFeedUrl(origin, [], [])).toBe(`${origin}/calendar/feed.ics`);
    expect(buildFeedUrl(origin, ['Dornbirn'], [])).toBe(
      `${origin}/calendar/feed.ics?bezirk=Dornbirn`
    );
    expect(buildFeedUrl(origin, ['Online'], ['Yoga'])).toBe(
      `${origin}/calendar/feed.ics?bezirk=Online&kategorie=Yoga`
    );
    // Several selections are all passed on; an unknown Ort is left out.
    expect(buildFeedUrl(origin, ['Dornbirn', 'Bregenz'], ['Yoga', 'Tanz'])).toBe(
      `${origin}/calendar/feed.ics?bezirk=Dornbirn&bezirk=Bregenz&kategorie=Yoga&kategorie=Tanz`
    );
    expect(buildFeedUrl(origin, ['Wien'], [])).toBe(`${origin}/calendar/feed.ics`);
    // The personal token always comes last.
    expect(buildFeedUrl(origin, ['Dornbirn'], ['Yoga'], 'a_b-C')).toBe(
      `${origin}/calendar/feed.ics?bezirk=Dornbirn&kategorie=Yoga&token=a_b-C`
    );
    expect(buildFeedUrl(origin, [], [], 'a_b-C')).toBe(`${origin}/calendar/feed.ics?token=a_b-C`);
  });

  it('adds the region only when it is not Vorarlberg (dark launch: URL unchanged)', () => {
    const origin = 'https://www.thetribe.at';
    const vbg = { regionId: 'vorarlberg', bezirke: ['Bregenz', 'Dornbirn'], isNational: false };
    expect(buildFeedUrl(origin, ['Dornbirn'], ['Yoga'], 'tok', vbg)).toBe(
      buildFeedUrl(origin, ['Dornbirn'], ['Yoga'], 'tok')
    );
    const stmk = { regionId: 'steiermark', bezirke: ['Graz', 'Leoben'], isNational: false };
    expect(buildFeedUrl(origin, ['Graz', 'Dornbirn', 'Online'], ['Yoga'], 'tok', stmk)).toBe(
      `${origin}/calendar/feed.ics?region=steiermark&bezirk=Graz&bezirk=Online&kategorie=Yoga&token=tok`
    );
    expect(buildFeedUrl(origin, [], [], undefined, stmk)).toBe(
      `${origin}/calendar/feed.ics?region=steiermark`
    );
    // A combined view asks for its own slug and the union of its Bezirke.
    const de = { regionId: 'vorarlberg', bezirke: ['Oberallgäu', 'Graz'], isNational: true };
    expect(
      buildFeedUrl(origin, ['Oberallgäu', 'Dornbirn'], [], 'tok', {
        ...de,
        combinedView: { slug: 'deutschland' },
      })
    ).toBe(`${origin}/calendar/feed.ics?region=deutschland&bezirk=Oberallg%C3%A4u&token=tok`);
    expect(
      buildFeedUrl(origin, [], [], undefined, { ...de, combinedView: { slug: 'alle-tribes' } })
    ).toBe(`${origin}/calendar/feed.ics?region=alle-tribes`);
    expect(
      buildFeedUrl(origin, [], [], undefined, { ...de, combinedView: { slug: 'oesterreich' } })
    ).toBe(`${origin}/calendar/feed.ics?region=oesterreich`);
  });
});

describe('CalendarPage — regions (ticket 14)', () => {
  const regionOf = (slug: string, active = true) => ({
    ...STATIC_REGIONS.find((r) => r.id === slug)!,
    active,
  });
  const allRegions = [
    regionOf('vorarlberg'),
    regionOf('steiermark'),
    regionOf('bayern'),
    regionOf('wien', false),
  ];

  function renderInRegion(regionId: string, isNational = false) {
    const combinedView = isNational ? getCombinedView('alle-tribes') : null;
    const value = {
      ...DEFAULT_REGION_CONTEXT,
      region: allRegions.find((r) => r.id === regionId)!,
      regionId,
      regions: allRegions.filter((r) => r.active),
      allRegions,
      isNational,
      combinedView,
      combinedRegions: isNational ? allRegions.filter((r) => r.active) : [],
    };
    return render(
      <MemoryRouter>
        <HelmetProvider>
          <RegionContext.Provider value={value}>
            <CalendarPage />
          </RegionContext.Provider>
        </HelmetProvider>
      </MemoryRouter>
    );
  }

  const titles = () =>
    Array.from(document.querySelectorAll('.event-tile, .event-row')).map((n) => n.textContent);
  const ortChips = () =>
    Array.from(document.querySelectorAll('.filter-chip--ort')).map(
      (c) => c.querySelector('span:not(.filter-chip-icon):not(.filter-chip-count)')?.textContent
    );

  beforeEach(() => {
    window.localStorage.clear();
    const now = new Date();
    const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const date = `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, '0')}-${String(last.getDate()).padStart(2, '0')}`;
    const base = { date, time: '18:00', category: 'Yoga' };
    mockUseAllEvents.events = [
      { ...base, id: 'v-old', title: 'AltVbg', bezirk: 'Dornbirn' },
      { ...base, id: 'v', title: 'NeuVbg', bezirk: 'Bregenz', regionId: 'vorarlberg' },
      { ...base, id: 's', title: 'StmkGraz', bezirk: 'Graz', regionId: 'steiermark' },
      { ...base, id: 'on', title: 'OnlineStmk', isOnline: true, regionId: 'steiermark' },
      { ...base, id: 'w', title: 'WienEvent', bezirk: 'Wien', regionId: 'wien' },
    ];
    mockUseCategories.value = ['Yoga'];
  });

  it('shows only Vorarlberg and online events in Vorarlberg, never inactive regions', () => {
    renderInRegion('vorarlberg');
    const text = titles().join('|');
    expect(text).toContain('AltVbg');
    expect(text).toContain('NeuVbg');
    expect(text).toContain('OnlineStmk');
    expect(text).not.toContain('StmkGraz');
    expect(text).not.toContain('WienEvent');
  });

  it('shows Steiermark events and the Steiermark Bezirke as Ort chips', () => {
    renderInRegion('steiermark');
    const text = titles().join('|');
    expect(text).toContain('StmkGraz');
    expect(text).toContain('OnlineStmk');
    expect(text).not.toContain('AltVbg');
    const chips = ortChips();
    expect(chips).toContain('Graz');
    expect(chips).toContain('Murau');
    expect(chips).not.toContain('Dornbirn');
    expect(chips).not.toContain('Umgebung');
    expect(chips[chips.length - 1]).toBe('Online');
  });

  it('keeps the Vorarlberg Ort chips (incl. Umgebung) unchanged', () => {
    renderInRegion('vorarlberg');
    expect(ortChips()).toEqual([
      'Bregenz',
      'Dornbirn',
      'Feldkirch',
      'Bludenz',
      'Umgebung',
      'Online',
    ]);
  });

  it('combined view lists all active regions but not inactive ones; counts match', () => {
    renderInRegion('vorarlberg', true);
    const text = titles().join('|');
    expect(text).toContain('AltVbg');
    expect(text).toContain('StmkGraz');
    expect(text).not.toContain('WienEvent');
    // Ort chip counts add up to the listed events: AltVbg, NeuVbg, StmkGraz + online.
    const sum = Array.from(document.querySelectorAll('.filter-chip--ort .filter-chip-count'))
      .map((c) => Number(c.textContent))
      .reduce((a, b) => a + b, 0);
    expect(sum).toBe(4);
  });

  it('drops a remembered Ort filter from another region', async () => {
    setStoredOrte(['Dornbirn']);
    renderInRegion('steiermark');
    await waitFor(() => {
      expect(titles().join('|')).toContain('StmkGraz');
    });
  });
});
