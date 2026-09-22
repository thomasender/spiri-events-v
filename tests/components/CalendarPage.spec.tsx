import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import CalendarPage from '../../src/pages/CalendarPage';

const mockUseAllEvents = vi.hoisted(() => ({ events: [], loading: false, error: null }));
const mockUseCategories = vi.hoisted(() => ({ value: [] }));

vi.mock('../../src/hooks/useEvents', () => ({
  useAllEvents: () => mockUseAllEvents,
  KATEGORIEN: ['Yoga', 'Breathwork', 'Meditation', 'Tanz', 'Singen', 'Soundhealing', 'Sonstiges'],
  BEZIRKE: ['Bregenz', 'Dornbirn', 'Feldkirch', 'Bludenz', 'Grenznahe'],
  ONLINE_LOCATION: 'Online',
}));

vi.mock('../../src/hooks/useCategories', () => ({
  useCategories: () => mockUseCategories.value,
}));

vi.mock('../../src/hooks/useAuth', () => ({
  useAuth: () => ({ user: null, canCreateEvents: false }),
}));

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
    .map((c) => c.textContent.trim());
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
    const lastOfMonth = new Date(2026, 8, 30); // 2026-09-30
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
    // The user previously had a subset of categories selected.
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
    const soundhealing = screen.getByRole('button', { name: 'Soundhealing' });
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
    expect(screen.getByRole('button', { name: 'Feldkirch' })).toBeVisible();
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
    const dornbirn = screen.getByRole('button', { name: 'Dornbirn' });
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
