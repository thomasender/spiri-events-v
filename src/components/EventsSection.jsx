import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, LayoutGrid, List } from 'lucide-react';
import EventCard from './EventCard';
import EventListRow from './EventListRow';
import { getPrimaryCategory } from '../utils/eventFormat';
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

export default function EventsSection({
  events,
  currentMonth,
  onMonthChange,
  viewMode,
  onViewModeChange,
  categoryColors,
}) {
  const [isMobile, setIsMobile] = useState(window.innerWidth < MOBILE_BREAKPOINT);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const effectiveViewMode = isMobile ? 'card' : viewMode;
  const monthLabel = `${MONTHS[currentMonth.getMonth()]} ${currentMonth.getFullYear()}`;

  const goToPrevMonth = () => {
    onMonthChange(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  };

  const goToNextMonth = () => {
    onMonthChange(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  };

  return (
    <section className="events-section">
      <div className="events-section-header">
        <div className="events-section-month">
          <h2>{monthLabel}</h2>
          <div className="events-section-month-nav">
            <button type="button" onClick={goToPrevMonth} aria-label="Vorheriger Monat">
              <ChevronLeft size={18} />
            </button>
            <button type="button" onClick={goToNextMonth} aria-label="Nächster Monat">
              <ChevronRight size={18} />
            </button>
          </div>
          <span className="events-section-count">{events.length} Events</span>
        </div>

        <div className="events-section-view-toggle">
          <button
            type="button"
            className={`view-toggle-list ${effectiveViewMode === 'list' ? 'active' : ''}`}
            onClick={() => onViewModeChange('list')}
          >
            <List size={16} />
            <span>Listenansicht</span>
          </button>
          <button
            type="button"
            className={effectiveViewMode === 'card' ? 'active' : ''}
            onClick={() => onViewModeChange('card')}
          >
            <LayoutGrid size={16} />
            <span>Kartenansicht</span>
          </button>
        </div>
      </div>

      {events.length === 0 ? (
        <div className="events-section-empty">
          <p>Keine Events in diesem Monat gefunden.</p>
        </div>
      ) : effectiveViewMode === 'card' ? (
        <div className="events-section-grid">
          {events.map((event) => (
            <EventCard
              key={`${event.id}-${event.date}`}
              event={event}
              categoryColor={categoryColors[getPrimaryCategory(event)] || 'var(--text-light)'}
            />
          ))}
        </div>
      ) : (
        <div className="events-section-list">
          {events.map((event) => (
            <EventListRow
              key={`${event.id}-${event.date}`}
              event={event}
              categoryColor={categoryColors[getPrimaryCategory(event)] || 'var(--text-light)'}
            />
          ))}
        </div>
      )}
    </section>
  );
}
