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
