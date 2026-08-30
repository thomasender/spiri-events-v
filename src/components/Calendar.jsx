import { useState, useMemo, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, CalendarDays, MapPin } from 'lucide-react';
import { getEventOccurrences } from '../utils/eventOccurrences';
import './Calendar.css';

const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const WEEKDAYS_LONG = [
  'Montag',
  'Dienstag',
  'Mittwoch',
  'Donnerstag',
  'Freitag',
  'Samstag',
  'Sonntag',
];
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

function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year, month) {
  const day = new Date(year, month, 1).getDay();
  return day === 0 ? 6 : day - 1;
}

function formatDate(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function isToday(dateStr) {
  const today = new Date();
  return dateStr === formatDate(today.getFullYear(), today.getMonth(), today.getDate());
}

function isPast(dateStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [year, month, day] = dateStr.split('-');
  const date = new Date(year, month - 1, day);
  return date < today;
}

function getMonthDays(year, month) {
  const firstDay = getFirstDayOfMonth(year, month);
  const daysInMonth = getDaysInMonth(year, month);
  const prevMonthDays = getDaysInMonth(month === 0 ? year - 1 : year, month === 0 ? 11 : month - 1);

  const cells = [];
  for (let i = 0; i < firstDay; i++) {
    const day = prevMonthDays - firstDay + i + 1;
    const m = month === 0 ? 11 : month - 1;
    const y = month === 0 ? year - 1 : year;
    cells.push({ date: formatDate(y, m, day), day, isCurrentMonth: false });
  }
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push({ date: formatDate(year, month, day), day, isCurrentMonth: true });
  }
  const remaining = 42 - cells.length;
  for (let day = 1; day <= remaining; day++) {
    const m = month === 11 ? 0 : month + 1;
    const y = month === 11 ? year + 1 : year;
    cells.push({ date: formatDate(y, m, day), day, isCurrentMonth: false });
  }
  return cells;
}

const FALLBACK_DOT_COLOR = 'var(--text-light)';

function getEventColor(event, categoryColors) {
  const category = event.category;
  return (categoryColors && categoryColors[category]) || FALLBACK_DOT_COLOR;
}

export default function Calendar({
  events,
  onEventClick,
  currentMonth,
  onMonthChange,
  categoryColors,
  categories,
}) {
  const [slideDirection, setSlideDirection] = useState(null);
  const [expandedDay, setExpandedDay] = useState(null);
  const expandedDayRef = useRef(null);

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();

  // Close expanded day popover when clicking outside
  useEffect(() => {
    if (!expandedDay) return;
    const handleClickOutside = (e) => {
      if (expandedDayRef.current && !expandedDayRef.current.contains(e.target)) {
        setExpandedDay(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [expandedDay]);

  const eventsByDay = useMemo(() => {
    const map = {};
    events.forEach((event) => {
      const expandedDays = getEventOccurrences(event, { mode: 'calendar' });
      expandedDays.forEach((expanded) => {
        if (!map[expanded.date]) map[expanded.date] = [];
        map[expanded.date].push(expanded);
      });
    });
    return map;
  }, [events]);

  const monthDays = useMemo(() => getMonthDays(year, month), [year, month]);

  const prevMonth = () => {
    setSlideDirection('right');
    onMonthChange(new Date(year, month - 1, 1));
  };

  const nextMonth = () => {
    setSlideDirection('left');
    onMonthChange(new Date(year, month + 1, 1));
  };

  const goToToday = () => {
    const today = new Date();
    setSlideDirection(null);
    onMonthChange(new Date(today.getFullYear(), today.getMonth(), 1));
  };

  const calendarKey = `${year}-${month}`;

  return (
    <div className="calendar">
      {/* Header */}
      <div className="calendar-header">
        <button onClick={goToToday} className="btn-today" title="Heute">
          <CalendarDays size={16} />
        </button>
        <div className="calendar-title">
          <button onClick={prevMonth} className="btn-nav" title="Vorheriger Monat">
            <ChevronLeft size={18} />
          </button>
          <h2>
            {MONTHS[month]} {year}
          </h2>
          <button onClick={nextMonth} className="btn-nav" title="Nächster Monat">
            <ChevronRight size={18} />
          </button>
        </div>
        <span className="calendar-header-spacer" />
      </div>

      {/* Mobile agenda: scrollable event list for the visible weeks */}
      <div className="mobile-agenda">
        {monthDays
          .filter((cell) => cell.isCurrentMonth)
          .map((cell) => {
            const dayEvents = eventsByDay[cell.date] || [];
            const today = isToday(cell.date);
            const weekdayIndex = new Date(cell.date + 'T12:00:00').getDay();
            const weekdayName = WEEKDAYS_LONG[weekdayIndex === 0 ? 6 : weekdayIndex - 1];

            return (
              <div
                key={cell.date}
                data-date={cell.date}
                className={`agenda-day ${!cell.isCurrentMonth ? 'other-month' : ''} ${today ? 'today' : ''}`}
              >
                <div className="agenda-day-header">
                  <span className="agenda-day-weekday">{weekdayName}</span>
                  <span className={`agenda-day-number ${today ? 'today' : ''}`}>{cell.day}</span>
                </div>
                {dayEvents.length > 0 ? (
                  <div className="agenda-events">
                    {dayEvents.map((event) => (
                      <button
                        key={`${event.id}-${event.date}`}
                        className="agenda-event-row"
                        onClick={() => onEventClick(event)}
                      >
                        <div className="agenda-event-main">
                          <span className="agenda-event-time">{event.time || '—'}</span>
                          <span className="agenda-event-title">{event.title}</span>
                        </div>
                        <div className="agenda-event-meta">
                          <span className="agenda-event-place">
                            <MapPin size={12} />
                            {event.isOnline ? 'Online' : event.place?.split(',')[0]}
                          </span>
                          {(event.contribution === 'free' ||
                            event.contribution === 'donation' ||
                            event.fee) && (
                            <span
                              className={`agenda-event-badge ${
                                event.contribution === 'free'
                                  ? 'free'
                                  : event.contribution === 'donation'
                                    ? 'donation'
                                    : 'fee'
                              }`}
                            >
                              {event.contribution === 'free'
                                ? 'Frei'
                                : event.contribution === 'donation'
                                  ? 'Spende'
                                  : `${event.fee}€`}
                            </span>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="agenda-day-empty" />
                )}
              </div>
            );
          })}
      </div>

      {/* Desktop month grid */}
      <div className="desktop-calendar">
        <div className="calendar-weekdays">
          {WEEKDAYS.map((day) => (
            <div key={day} className="weekday">
              {day}
            </div>
          ))}
        </div>

        <div
          key={calendarKey}
          className={`calendar-grid ${slideDirection === 'left' ? 'slide-left-enter' : ''} ${slideDirection === 'right' ? 'slide-right-enter' : ''}`}
          onAnimationEnd={() => setSlideDirection(null)}
        >
          {monthDays.map((cell) => {
            const dayEvents = eventsByDay[cell.date] || [];
            const today = isToday(cell.date);
            const past = isPast(cell.date) && !today;
            const hasEvents = dayEvents.length > 0;

            return (
              <button
                key={cell.date}
                className={`calendar-cell ${!cell.isCurrentMonth ? 'other-month' : ''} ${today ? 'today' : ''} ${past ? 'past' : ''} ${hasEvents ? 'has-events' : ''}`}
                onClick={() =>
                  hasEvents && setExpandedDay(cell.date === expandedDay ? null : cell.date)
                }
                disabled={!hasEvents}
              >
                <span className="day-number">{cell.day}</span>
                {hasEvents && (
                  <span className="cell-dots">
                    {dayEvents.slice(0, 3).map((event, i) => (
                      <span
                        key={event.id + i}
                        className="cell-dot"
                        style={{ backgroundColor: getEventColor(event, categoryColors) }}
                      />
                    ))}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Expanded day popover */}
        {expandedDay && eventsByDay[expandedDay] && (
          <div className="day-popover-overlay" onClick={() => setExpandedDay(null)}>
            <div ref={expandedDayRef} className="day-popover" onClick={(e) => e.stopPropagation()}>
              <div className="day-popover-header">
                <span className="day-popover-title">
                  Alle Events am{' '}
                  {new Date(expandedDay + 'T12:00:00').toLocaleDateString('de-DE', {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                  })}
                </span>
                <button className="day-popover-close" onClick={() => setExpandedDay(null)}>
                  ×
                </button>
              </div>
              <div className="day-popover-events">
                {eventsByDay[expandedDay].map((event) => (
                  <button
                    key={`${event.id}-${event.date}`}
                    className={`day-popover-event ${
                      event.contribution === 'free'
                        ? 'free'
                        : event.contribution === 'donation'
                          ? 'donation'
                          : 'fee'
                    }`}
                    onClick={() => {
                      onEventClick(event);
                      setExpandedDay(null);
                    }}
                  >
                    <span
                      className="day-popover-event-dot"
                      style={{ backgroundColor: getEventColor(event, categoryColors) }}
                    />
                    <span className="day-popover-event-info">
                      <span className="day-popover-event-time">{event.time || '—'}</span>
                      <span className="day-popover-event-name">{event.title}</span>
                    </span>
                    {(event.contribution === 'free' ||
                      event.contribution === 'donation' ||
                      event.fee) && (
                      <span
                        className={`day-popover-event-badge ${
                          event.contribution === 'free'
                            ? 'free'
                            : event.contribution === 'donation'
                              ? 'donation'
                              : 'fee'
                        }`}
                      >
                        {event.contribution === 'free'
                          ? 'Frei'
                          : event.contribution === 'donation'
                            ? 'Spende'
                            : `${event.fee}€`}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {categories && categories.length > 0 && (
          <>
            <div className="calendar-divider" />
            <ul className="calendar-legend">
              {categories.map((category) => (
                <li key={category}>
                  <span
                    className="calendar-legend-dot"
                    style={{
                      backgroundColor:
                        (categoryColors && categoryColors[category]) || FALLBACK_DOT_COLOR,
                    }}
                  />
                  {category}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
