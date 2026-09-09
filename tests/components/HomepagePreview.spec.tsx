import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import HomepagePreview from '../../src/components/HomepagePreview';
import { SEED_CATEGORIES } from '../../src/utils/categoryColors';

vi.mock('../../src/components/Calendar', () => ({
  default: function CalendarStub({ events, categories: cats }) {
    return (
      <div
        data-testid="homepage-preview-calendar-stub"
        data-event-count={events.length}
        data-categories={(cats || []).join(',')}
      />
    );
  },
}));

vi.mock('../../src/components/EventsSection', () => ({
  default: function EventsSectionStub({ events, onCardClick }) {
    return (
      <div data-testid="homepage-preview-events-stub" data-event-count={events.length}>
        <button type="button" onClick={onCardClick} data-testid="events-stub-card">
          First event
        </button>
      </div>
    );
  },
}));

function makeDemoEvents(
  count = 6,
  year = new Date().getFullYear(),
  month = new Date().getMonth() + 2
) {
  const events = [];
  const monthStr = String(month).padStart(2, '0');
  for (let i = 0; i < count; i += 1) {
    events.push({
      id: `demo-${i}`,
      title: `Demo ${i}`,
      date: `${year}-${monthStr}-${String(i + 1).padStart(2, '0')}`,
      endDate: '',
      time: '',
      place: 'Bregenz',
      bezirk: 'Bregenz',
      category: 'Yoga',
      contribution: 'free',
      recurrence: 'none',
      status: 'approved',
      slug: `demo-${i}`,
      isDemo: true,
    });
  }
  return events;
}

function nextMonth() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 1);
}

function renderPreview(props = {}) {
  const events = props.events || makeDemoEvents();
  const categories = props.categories || SEED_CATEGORIES.map((c) => c.name);
  const categoryColorByName =
    props.categoryColorByName || new Map(SEED_CATEGORIES.map((c) => [c.name, c.color]));
  return render(
    <MemoryRouter>
      <HomepagePreview
        events={events}
        categories={categories}
        categoryColorByName={categoryColorByName}
        currentMonth={props.currentMonth || nextMonth()}
        onMonthChange={() => {}}
        {...props}
      />
    </MemoryRouter>
  );
}

describe('HomepagePreview', () => {
  it('renders the hero, filter panel, events section and sidebar calendar', () => {
    renderPreview();
    expect(screen.getByTestId('homepage-preview')).toBeInTheDocument();
    expect(screen.getByTestId('homepage-preview-hero')).toBeInTheDocument();
    expect(screen.getByTestId('homepage-preview-filter-panel')).toBeInTheDocument();
    expect(screen.getByTestId('homepage-preview-events-stub')).toBeInTheDocument();
    expect(screen.getByTestId('homepage-preview-sidebar-calendar')).toBeInTheDocument();
  });

  it('passes events through to the events section and the sidebar calendar', () => {
    renderPreview({ events: makeDemoEvents(4) });
    const eventsStub = screen.getByTestId('homepage-preview-events-stub');
    const calendarStub = screen.getByTestId('homepage-preview-calendar-stub');
    expect(eventsStub.getAttribute('data-event-count')).toBe('4');
    expect(calendarStub.getAttribute('data-event-count')).toBe('4');
  });

  it('toggles a category off when its chip is clicked', () => {
    renderPreview();
    const yogaChip = screen.getByTestId('homepage-preview-filter-category-Yoga');
    expect(yogaChip).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(yogaChip);
    expect(yogaChip).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(yogaChip);
    expect(yogaChip).toHaveAttribute('aria-pressed', 'true');
  });

  it('toggles a date filter chip and exposes the aria-pressed state', () => {
    renderPreview();
    const heuteChip = screen.getByTestId('homepage-preview-filter-date-heute');
    expect(heuteChip).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(heuteChip);
    expect(heuteChip).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(heuteChip);
    expect(heuteChip).toHaveAttribute('aria-pressed', 'false');
  });

  it('exposes the create-event CTA button so theme edits show on it', () => {
    renderPreview();
    expect(screen.getByTestId('homepage-preview-create-cta')).toBeInTheDocument();
  });

  it('calls onCardClick (or preventDefault) when an event card is clicked', () => {
    const onCardClick = vi.fn();
    renderPreview({ onCardClick });
    fireEvent.click(screen.getByTestId('events-stub-card'));
    expect(onCardClick).toHaveBeenCalledTimes(1);
  });

  it('falls back to preventDefault when no onCardClick handler is provided', () => {
    renderPreview();
    // The stub renders a <button onClick={onCardClick}>. Without a
    // handler the default preventDefault behavior should keep navigation
    // from happening — here we just assert the click does not throw and
    // that the event stub remains present.
    fireEvent.click(screen.getByTestId('events-stub-card'));
    expect(screen.getByTestId('homepage-preview-events-stub')).toBeInTheDocument();
  });

  it('keeps all categories selected initially so the preview shows every event', () => {
    renderPreview();
    for (const cat of SEED_CATEGORIES) {
      const chip = screen.getByTestId(`homepage-preview-filter-category-${cat.name}`);
      expect(chip).toHaveAttribute('aria-pressed', 'true');
    }
  });
});
