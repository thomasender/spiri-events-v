import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import EventsSection, { EVENTS_PAGE_SIZE } from '../../src/components/EventsSection';

const makeEvents = (count: number, prefix = 'evt') =>
  Array.from({ length: count }, (_, i) => ({
    id: `${prefix}-${i}`,
    slug: `${prefix}-${i}`,
    title: `${prefix} ${i}`,
    date: '2099-01-15',
    time: '18:00',
    bezirk: 'Bregenz',
    category: 'Yoga',
    organizer: { name: 'Anna' },
  }));

const renderSection = (events: ReturnType<typeof makeEvents>) => {
  const ui = (list: typeof events) => (
    <MemoryRouter>
      <EventsSection
        events={list}
        currentMonth={new Date(2099, 0, 1)}
        onMonthChange={() => {}}
        viewMode="card"
        onViewModeChange={() => {}}
        categoryColorByName={new Map()}
      />
    </MemoryRouter>
  );
  const view = render(ui(events));
  return { ...view, rerenderWith: (list: typeof events) => view.rerender(ui(list)) };
};

describe('EventsSection — Mehr laden', () => {
  it('shows only the first page and a load-more button for long lists', () => {
    renderSection(makeEvents(60));
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(EVENTS_PAGE_SIZE);
    expect(screen.getByTestId('events-load-more')).toHaveTextContent('24 von 60');
    expect(screen.getByText('60 Events')).toBeInTheDocument();
  });

  it('adds another page per click and hides the button once everything is shown', () => {
    renderSection(makeEvents(60));
    fireEvent.click(screen.getByTestId('events-load-more'));
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(EVENTS_PAGE_SIZE * 2);
    fireEvent.click(screen.getByTestId('events-load-more'));
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(60);
    expect(screen.queryByTestId('events-load-more')).toBeNull();
  });

  it('has no button when the list fits on one page', () => {
    renderSection(makeEvents(EVENTS_PAGE_SIZE));
    expect(screen.queryByTestId('events-load-more')).toBeNull();
  });

  it('starts at page one again when the list changes (filter or month)', () => {
    const { rerenderWith } = renderSection(makeEvents(60));
    fireEvent.click(screen.getByTestId('events-load-more'));
    rerenderWith(makeEvents(70, 'other'));
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(EVENTS_PAGE_SIZE);
  });
});

describe('EventsSection — 30-day default view (QRpwwNTI)', () => {
  afterEach(() => vi.useRealTimers());

  const renderRolling = (onMonthChange = vi.fn()) => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2099, 0, 20, 10, 0));
    render(
      <MemoryRouter>
        <EventsSection
          events={makeEvents(2)}
          currentMonth={new Date(2099, 0, 1)}
          rolling
          onMonthChange={onMonthChange}
          viewMode="card"
          onViewModeChange={() => {}}
          categoryColorByName={new Map()}
        />
      </MemoryRouter>
    );
    return onMonthChange;
  };

  it('labels the rolling view and keeps the back arrow enabled', () => {
    renderRolling();
    expect(screen.getByRole('heading', { level: 2, name: 'Nächste 30 Tage' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Vorheriger Monat' })).toBeEnabled();
  });

  it('> goes to the next calendar month, < to the current month view', () => {
    const onMonthChange = renderRolling();
    fireEvent.click(screen.getByRole('button', { name: 'Nächster Monat' }));
    expect(onMonthChange).toHaveBeenLastCalledWith(new Date(2099, 1, 1));
    fireEvent.click(screen.getByRole('button', { name: 'Vorheriger Monat' }));
    expect(onMonthChange).toHaveBeenLastCalledWith(new Date(2099, 0, 1));
  });
});

describe('EventsSection — Filter gesetzt hint', () => {
  const renderWith = (activeFilterCount: number, count = 5, onShowFilters = vi.fn()) => {
    render(
      <MemoryRouter>
        <EventsSection
          events={makeEvents(count)}
          currentMonth={new Date(2099, 0, 1)}
          onMonthChange={() => {}}
          viewMode="card"
          onViewModeChange={() => {}}
          categoryColorByName={new Map()}
          activeFilterCount={activeFilterCount}
          onShowFilters={onShowFilters}
        />
      </MemoryRouter>
    );
    return onShowFilters;
  };

  it('shows no button without filters', () => {
    renderWith(0);
    expect(screen.getByText('5 Events')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Filter gesetzt/ })).not.toBeInTheDocument();
  });

  it('shows "(1 Filter gesetzt)"', () => {
    renderWith(1);
    expect(
      screen.getByRole('button', { name: '1 Filter gesetzt, zu den Filtern springen' })
    ).toHaveTextContent('(1 Filter gesetzt)');
  });

  it('shows "(2 Filter gesetzt)" and calls onShowFilters on click', () => {
    const onShowFilters = renderWith(2);
    const button = screen.getByRole('button', {
      name: '2 Filter gesetzt, zu den Filtern springen',
    });
    expect(button).toHaveTextContent('(2 Filter gesetzt)');
    expect(button).not.toHaveAttribute('aria-expanded');
    fireEvent.click(button);
    expect(onShowFilters).toHaveBeenCalledTimes(1);
  });

  it('says "1 Event" in the singular', () => {
    renderWith(0, 1);
    expect(screen.getByText('1 Event')).toBeInTheDocument();
  });
});
