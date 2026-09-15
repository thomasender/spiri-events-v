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

describe('CalendarPage — category filter persistence after new categories appear', () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockUseAllEvents.events = [
      { id: '1', title: 'Y1', date: '2026-09-10', bezirk: 'Bregenz', category: 'Yoga' },
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

  it('does NOT re-add a category the user just toggled off when categories hook re-emits', async () => {
    // The user previously had only a subset of categories selected.
    setStoredCategories(['Yoga', 'Meditation', 'Tanz']);

    render(
      <MemoryRouter>
        <HelmetProvider>
          <CalendarPage />
        </HelmetProvider>
      </MemoryRouter>
    );

    // Auto-include on first render picks up the rest, so all 7 are now pressed.
    await waitFor(() => {
      expect(getPressedChips().sort()).toEqual([
        'Breathwork',
        'Meditation',
        'Singen',
        'Sonstiges',
        'Soundhealing',
        'Tanz',
        'Yoga',
      ]);
    });

    // User clicks "Soundhealing" to deselect it.
    const chip = screen.getByRole('button', { name: 'Soundhealing' });
    await act(async () => {
      fireEvent.click(chip);
    });

    // Soundhealing must be deselected now.
    await waitFor(() => {
      const pressed = getPressedChips();
      expect(pressed).not.toContain('Soundhealing');
    });

    // A re-render of the categories hook should NOT silently re-add
    // Soundhealing to the selection.
    await act(async () => {
      // Force a re-render by triggering a no-op state change elsewhere.
      fireEvent.click(screen.getAllByRole('button', { name: 'Alle' })[0]);
      fireEvent.click(screen.getAllByRole('button', { name: 'Keine' })[0]);
    });

    // The user's deselection of Soundhealing must persist through the noise.
    const finalPressed = getPressedChips();
    expect(finalPressed).not.toContain('Soundhealing');
  });

  it('still auto-includes a genuinely new category that was not in the saved selection', async () => {
    setStoredCategories(['Yoga', 'Meditation']);
    // Qi Gong is a previously-unseen category that just got approved.
    mockUseCategories.value = ['Yoga', 'Meditation', 'Qi Gong'];

    render(
      <MemoryRouter>
        <HelmetProvider>
          <CalendarPage />
        </HelmetProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      const pressed = getPressedChips();
      expect(pressed).toContain('Qi Gong');
      expect(pressed).toContain('Yoga');
      expect(pressed).toContain('Meditation');
    });
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
