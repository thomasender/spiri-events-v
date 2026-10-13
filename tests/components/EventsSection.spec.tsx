import { describe, it, expect } from 'vitest';
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
    expect(screen.getByTestId('events-load-more')).toHaveTextContent('25 von 60');
    expect(screen.getByText('60 Events')).toBeInTheDocument();
  });

  it('adds another page per click and hides the button once everything is shown', () => {
    renderSection(makeEvents(60));
    fireEvent.click(screen.getByTestId('events-load-more'));
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(50);
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
