import { useEffect, useState } from 'react';
import { EVENTS, trackEvent } from '../lib/analytics';
import { ChevronLeft, ChevronRight, LayoutGrid, List } from 'lucide-react';
import EventCard from './EventCard';
import EventListRow from './EventListRow';
import { getPrimaryCategory } from '../utils/eventFormat';
import { resolveEventColor } from '../utils/categoryColors';
import './EventsSection.css';

const MONTHS = [
  'Januar',
  'Februar',
  'März',
  'April',
  'Mai',
  'Juni',
  'Juli',
  'August',
  'September',
  'Oktober',
  'November',
  'Dezember',
];

const MOBILE_BREAKPOINT = 768;

// Only this many events are rendered at first; "Mehr laden" adds another page.
// Keeps the first paint light when a month has dozens of events. Divisible by 3
// (and 2) so the last row of the grid is never half empty before the button.
export const EVENTS_PAGE_SIZE = 24;

export default function EventsSection({
  events,
  currentMonth,
  rolling = false,
  onMonthChange,
  viewMode,
  onViewModeChange,
  categoryColorByName,
  onCardClick,
  onResetFilters,
  activeFilterCount = 0,
  placeHint = null,
  onShowFilters,
  candleNews,
}) {
  const [isMobile, setIsMobile] = useState(window.innerWidth < MOBILE_BREAKPOINT);
  const [visibleCount, setVisibleCount] = useState(EVENTS_PAGE_SIZE);
  // A new list (other month, filter, date quick filter) starts at page one again.
  const [prevEvents, setPrevEvents] = useState(events);
  if (prevEvents !== events) {
    setPrevEvents(events);
    setVisibleCount(EVENTS_PAGE_SIZE);
  }
  const shownEvents = events.slice(0, visibleCount);
  // "(Dornbirn + 25 km, 2 Filter gesetzt)": the place + radius (only while it decides the
  // list, two or more active regions) and the number of set filters.
  const filterHint = [
    placeHint,
    activeFilterCount > 0 ? `${activeFilterCount} Filter gesetzt` : null,
  ]
    .filter(Boolean)
    .join(', ');
  const remaining = events.length - shownEvents.length;

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const effectiveViewMode = isMobile ? 'card' : viewMode;
  const changeView = (mode) => {
    if (mode !== effectiveViewMode) trackEvent(EVENTS.CALENDAR_VIEW_CHANGE, { view: mode });
    onViewModeChange(mode);
  };
  const monthLabel = rolling
    ? 'Nächste 30 Tage'
    : `${MONTHS[currentMonth.getMonth()]} ${currentMonth.getFullYear()}`;
  // Past months are hidden from the public view, so navigating back from the
  // current month would just land users on an empty month. Disable the back
  // button at the current month to make that explicit.
  const today = new Date();
  // In the 30-day view the back button leads to the (current) month view.
  const canGoPrev =
    rolling ||
    currentMonth.getFullYear() > today.getFullYear() ||
    (currentMonth.getFullYear() === today.getFullYear() &&
      currentMonth.getMonth() > today.getMonth());

  const goToPrevMonth = () => {
    if (!canGoPrev) return;
    if (rolling) {
      onMonthChange(new Date(today.getFullYear(), today.getMonth(), 1));
      return;
    }
    onMonthChange(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  };

  const goToNextMonth = () => {
    // From the 30-day view, > goes to the month after the current one.
    const base = rolling ? today : currentMonth;
    onMonthChange(new Date(base.getFullYear(), base.getMonth() + 1, 1));
  };

  return (
    <section className="events-section">
      <div className="events-section-header">
        <div className="events-section-month">
          <h2>{monthLabel}</h2>
          <div className="events-section-month-nav">
            <button
              type="button"
              onClick={goToPrevMonth}
              aria-label="Vorheriger Monat"
              title={canGoPrev ? 'Vorheriger Monat' : 'Im aktuellen Monat'}
              disabled={!canGoPrev}
            >
              <ChevronLeft size={18} />
            </button>
            <button type="button" onClick={goToNextMonth} aria-label="Nächster Monat">
              <ChevronRight size={18} />
            </button>
          </div>
          <span className="events-section-count">
            {events.length === 1 ? '1 Event' : `${events.length} Events`}
            {filterHint && onShowFilters && (
              <>
                {' '}
                <button
                  type="button"
                  className="events-section-filter-link"
                  aria-label={`${filterHint}, zu den Filtern springen`}
                  onClick={onShowFilters}
                >
                  ({filterHint})
                </button>
              </>
            )}
          </span>
        </div>

        {!isMobile && (
          <div className="events-section-view-toggle">
            <button
              type="button"
              className={`view-toggle-list ${effectiveViewMode === 'list' ? 'active' : ''}`}
              onClick={() => changeView('list')}
            >
              <List size={16} />
              <span>Listenansicht</span>
            </button>
            <button
              type="button"
              className={effectiveViewMode === 'card' ? 'active' : ''}
              onClick={() => changeView('card')}
            >
              <LayoutGrid size={16} />
              <span>Kartenansicht</span>
            </button>
          </div>
        )}
      </div>

      {events.length === 0 ? (
        <div className="events-section-empty">
          <p>Keine Events mit dieser Auswahl gefunden. Bitte passe deine Filter an.</p>
          {onResetFilters && (
            <button type="button" className="events-section-reset" onClick={onResetFilters}>
              Filter zurücksetzen
            </button>
          )}
        </div>
      ) : effectiveViewMode === 'card' ? (
        <div className="events-section-grid">
          {shownEvents.map((event) => (
            <EventCard
              key={`${event.id}-${event.date}`}
              event={event}
              categoryColor={resolveEventColor(
                { ...event, category: getPrimaryCategory(event) },
                categoryColorByName
              )}
              onClick={onCardClick}
              candleNews={Boolean(candleNews?.has(event.id))}
            />
          ))}
        </div>
      ) : (
        <div className="events-section-list">
          {shownEvents.map((event) => (
            <EventListRow
              key={`${event.id}-${event.date}`}
              event={event}
              categoryColor={resolveEventColor(
                { ...event, category: getPrimaryCategory(event) },
                categoryColorByName
              )}
              onClick={onCardClick}
            />
          ))}
        </div>
      )}

      {remaining > 0 && (
        <div className="events-section-more">
          <button
            type="button"
            className="btn btn-secondary events-section-more-button"
            data-testid="events-load-more"
            onClick={() => setVisibleCount((count) => count + EVENTS_PAGE_SIZE)}
          >
            Mehr laden ({shownEvents.length} von {events.length})
          </button>
        </div>
      )}
    </section>
  );
}
