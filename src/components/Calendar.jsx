import { useState, useMemo, useEffect, useRef } from 'react'
import { ChevronLeft, ChevronRight, CalendarDays, MapPin } from 'lucide-react'
import './Calendar.css'

const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']
const WEEKDAYS_LONG = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag']
const MONTHS = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'
]

function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate()
}

function getFirstDayOfMonth(year, month) {
  const day = new Date(year, month, 1).getDay()
  return day === 0 ? 6 : day - 1
}

function formatDate(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function formatDateShort(dateStr) {
  const [year, month, day] = dateStr.split('-')
  const date = new Date(year, month - 1, day)
  return date.toLocaleDateString('de-DE', {
    day: 'numeric',
    month: 'short'
  })
}

function isToday(year, month, day) {
  const today = new Date()
  return (
    today.getFullYear() === year &&
    today.getMonth() === month &&
    today.getDate() === day
  )
}

function isPast(dateStr) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const [year, month, day] = dateStr.split('-')
  const date = new Date(year, month - 1, day)
  return date < today
}

function getWeekDaysStartingFrom(year, month, day) {
  const date = new Date(year, month, day)
  const dayOfWeek = date.getDay()
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
  const monday = new Date(date)
  monday.setDate(date.getDate() + mondayOffset)

  const week = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    const isCurrentMonth = d.getMonth() === month
    week.push({
      date: formatDate(d.getFullYear(), d.getMonth(), d.getDate()),
      day: d.getDate(),
      isCurrentMonth
    })
  }
  return week
}

function getMonthDays(year, month) {
  const firstDay = getFirstDayOfMonth(year, month)
  const daysInMonth = getDaysInMonth(year, month)
  const prevMonthDays = getDaysInMonth(month === 0 ? year - 1 : year, month === 0 ? 11 : month - 1)

  const cells = []
  for (let i = 0; i < firstDay; i++) {
    const day = prevMonthDays - firstDay + i + 1
    const m = month === 0 ? 11 : month - 1
    const y = month === 0 ? year - 1 : year
    cells.push({ date: formatDate(y, m, day), day, isCurrentMonth: false })
  }
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push({ date: formatDate(year, month, day), day, isCurrentMonth: true })
  }
  const remaining = 42 - cells.length
  for (let day = 1; day <= remaining; day++) {
    const m = month === 11 ? 0 : month + 1
    const y = month === 11 ? year + 1 : year
    cells.push({ date: formatDate(y, m, day), day, isCurrentMonth: false })
  }
  return cells
}

export default function Calendar({ events, onEventClick, currentMonth, onMonthChange }) {
  const [slideDirection, setSlideDirection] = useState(null)
  const [mobileViewDate, setMobileViewDate] = useState(() => new Date())
  const [expandedDay, setExpandedDay] = useState(null)
  const expandedDayRef = useRef(null)

  const year = currentMonth.getFullYear()
  const month = currentMonth.getMonth()

  // Sync month header with week navigation
  useEffect(() => {
    const viewYear = mobileViewDate.getFullYear()
    const viewMonth = mobileViewDate.getMonth()
    if (viewYear !== year || viewMonth !== month) {
      onMonthChange(new Date(viewYear, viewMonth, 1))
    }
  }, [mobileViewDate]) // eslint-disable-line react-hooks/exhaustive-deps

  // Close expanded day popover when clicking outside
  useEffect(() => {
    if (!expandedDay) return
    const handleClickOutside = (e) => {
      if (expandedDayRef.current && !expandedDayRef.current.contains(e.target)) {
        setExpandedDay(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [expandedDay])

  const eventsByDay = useMemo(() => {
    const map = {}
    events.forEach(event => {
      if (event.date) {
        if (!map[event.date]) map[event.date] = []
        map[event.date].push(event)
      }
    })
    return map
  }, [events])

  const monthDays = useMemo(() => getMonthDays(year, month), [year, month])

  const prevMonth = () => {
    setSlideDirection('right')
    const newDate = new Date(year, month - 1, 1)
    onMonthChange(newDate)
    setMobileViewDate(newDate)
  }

  const nextMonth = () => {
    setSlideDirection('left')
    const newDate = new Date(year, month + 1, 1)
    onMonthChange(newDate)
    setMobileViewDate(newDate)
  }

  const goToToday = () => {
    const today = new Date()
    setSlideDirection(null)
    onMonthChange(new Date(today.getFullYear(), today.getMonth(), 1))
    setMobileViewDate(today)
  }

  const goToPrevWeek = () => {
    const d = new Date(mobileViewDate)
    d.setDate(d.getDate() - 7)
    setMobileViewDate(d)
  }

  const goToNextWeek = () => {
    const d = new Date(mobileViewDate)
    d.setDate(d.getDate() + 7)
    setMobileViewDate(d)
  }

  const mobileWeekDays = useMemo(() => {
    return getWeekDaysStartingFrom(
      mobileViewDate.getFullYear(),
      mobileViewDate.getMonth(),
      mobileViewDate.getDate()
    )
  }, [mobileViewDate])

  const calendarKey = `${year}-${month}`

  const hasEventsAnywhere = events.length > 0

  return (
    <div className="calendar">
      {/* Header */}
      <div className="calendar-header">
        <div className="calendar-title">
          <h2>{MONTHS[month]} {year}</h2>
        </div>
        <div className="calendar-controls">
          <button onClick={goToToday} className="btn btn-secondary btn-today" title="Heute">
            <CalendarDays size={18} />
            <span>Heute</span>
          </button>
          <button onClick={prevMonth} className="btn btn-secondary btn-nav" title="Vorheriger Monat">
            <ChevronLeft size={20} />
          </button>
          <button onClick={nextMonth} className="btn btn-secondary btn-nav" title="Nächster Monat">
            <ChevronRight size={20} />
          </button>
        </div>
      </div>

      {/* Mobile week nav */}
      <div className="mobile-week-nav">
        <button onClick={goToPrevWeek} className="btn btn-secondary btn-nav" title="Vorherige Woche">
          <ChevronLeft size={18} />
        </button>
        <span className="mobile-week-label">
          {formatDateShort(mobileWeekDays[0].date)} — {formatDateShort(mobileWeekDays[6].date)}
        </span>
        <button onClick={goToNextWeek} className="btn btn-secondary btn-nav" title="Nächste Woche">
          <ChevronRight size={18} />
        </button>
      </div>

      {/* Mobile week strip */}
      <div className="week-strip">
        {mobileWeekDays.map((cell) => {
          const dayEvents = eventsByDay[cell.date] || []
          const today = isToday(
            mobileViewDate.getFullYear(),
            mobileViewDate.getMonth(),
            cell.day
          )
          const past = isPast(cell.date) && !today

          return (
            <button
              key={cell.date}
              className={`week-day ${!cell.isCurrentMonth ? 'other-month' : ''} ${today ? 'today' : ''} ${past ? 'past' : ''}`}
              onClick={() => onEventClick && dayEvents.length > 0 && onEventClick(dayEvents[0])}
            >
              <span className="week-day-name">
                {WEEKDAYS_LONG[new Date(cell.date + 'T12:00:00').getDay() === 0 ? 6 : new Date(cell.date + 'T12:00:00').getDay() - 1]}
              </span>
              <span className="week-day-num">{cell.day}</span>
              {dayEvents.length > 0 && (
                <span className="week-day-dots">
                  {dayEvents.slice(0, 3).map((_, i) => (
                    <span key={i} className="dot" />
                  ))}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Mobile agenda: scrollable event list for the visible weeks */}
      <div className="mobile-agenda">
        {monthDays
          .filter(cell => cell.isCurrentMonth)
          .map((cell) => {
            const dayEvents = eventsByDay[cell.date] || []
            const today = isToday(year, month, cell.day)
            const weekdayIndex = new Date(cell.date + 'T12:00:00').getDay()
            const weekdayName = WEEKDAYS_LONG[weekdayIndex === 0 ? 6 : weekdayIndex - 1]

            return (
              <div key={cell.date} className={`agenda-day ${!cell.isCurrentMonth ? 'other-month' : ''} ${today ? 'today' : ''}`}>
                <div className="agenda-day-header">
                  <span className="agenda-day-weekday">{weekdayName}</span>
                  <span className={`agenda-day-number ${today ? 'today' : ''}`}>{cell.day}</span>
                </div>
                {dayEvents.length > 0 ? (
                  <div className="agenda-events">
                    {dayEvents.map(event => (
                      <button
                        key={event.id}
                        className="agenda-event-row"
                        onClick={() => onEventClick(event)}
                      >
                        <div className="agenda-event-main">
                          <span className="agenda-event-time">
                            {event.time || '—'}
                          </span>
                          <span className="agenda-event-title">{event.title}</span>
                        </div>
                        <div className="agenda-event-meta">
                          <span className="agenda-event-place">
                            <MapPin size={12} />
                            {event.place?.split(',')[0]}
                          </span>
                          <span className={`agenda-event-badge ${event.contribution === 'free' ? 'free' : 'fee'}`}>
                            {event.contribution === 'free' ? 'Frei' : `${event.fee}€`}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="agenda-day-empty" />
                )}
              </div>
            )
          })}
      </div>

      {/* Desktop month grid */}
      <div className="desktop-calendar">
        <div className="calendar-weekdays">
          {WEEKDAYS.map(day => (
            <div key={day} className="weekday">{day}</div>
          ))}
        </div>

        <div
          key={calendarKey}
          className={`calendar-grid ${slideDirection === 'left' ? 'slide-left-enter' : ''} ${slideDirection === 'right' ? 'slide-right-enter' : ''}`}
          onAnimationEnd={() => setSlideDirection(null)}
        >
          {monthDays.map((cell) => {
            const dayEvents = eventsByDay[cell.date] || []
            const today = isToday(year, month, cell.day)
            const past = isPast(cell.date) && !today
            const hasEvents = dayEvents.length > 0

            return (
              <div
                key={cell.date}
                className={`calendar-cell ${!cell.isCurrentMonth ? 'other-month' : ''} ${today ? 'today' : ''} ${past ? 'past' : ''} ${hasEvents ? 'has-events' : ''}`}
              >
                <span className="day-number">{cell.day}</span>
                <div className="cell-events">
                  {dayEvents.slice(0, 3).map(event => (
                    <button
                      key={event.id}
                      className={`event-chip ${event.contribution === 'free' ? 'event-chip--free' : 'event-chip--fee'}`}
                      onClick={(e) => {
                        e.stopPropagation()
                        onEventClick(event)
                      }}
                      title={event.title}
                    >
                      <span className="event-chip-dot" />
                      <span className="event-chip-title">{event.title}</span>
                    </button>
                  ))}
                  {dayEvents.length > 3 && (
                    <button
                      className="more-events"
                      onClick={(e) => {
                        e.stopPropagation()
                        setExpandedDay(cell.date === expandedDay ? null : cell.date)
                      }}
                    >
                      +{dayEvents.length - 3}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* Expanded day popover */}
        {expandedDay && eventsByDay[expandedDay] && (
          <div className="day-popover-overlay" onClick={() => setExpandedDay(null)}>
            <div
              ref={expandedDayRef}
              className="day-popover"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="day-popover-header">
                <span className="day-popover-title">
                  Alle Events am {new Date(expandedDay + 'T12:00:00').toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })}
                </span>
                <button className="day-popover-close" onClick={() => setExpandedDay(null)}>
                  ×
                </button>
              </div>
              <div className="day-popover-events">
                {eventsByDay[expandedDay].map(event => (
                  <button
                    key={event.id}
                    className={`day-popover-event ${event.contribution === 'free' ? 'free' : 'fee'}`}
                    onClick={() => {
                      onEventClick(event)
                      setExpandedDay(null)
                    }}
                  >
                    <span className="day-popover-event-dot" />
                    <span className="day-popover-event-info">
                      <span className="day-popover-event-time">{event.time || '—'}</span>
                      <span className="day-popover-event-name">{event.title}</span>
                    </span>
                    <span className={`day-popover-event-badge ${event.contribution === 'free' ? 'free' : 'fee'}`}>
                      {event.contribution === 'free' ? 'Frei' : `${event.fee}€`}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {!hasEventsAnywhere && (
        <div className="calendar-empty">
          <p>Keine Events vorhanden</p>
        </div>
      )}
    </div>
  )
}
