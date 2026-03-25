import { useState, useMemo } from 'react'
import { ChevronLeft, ChevronRight, CalendarDays, MapPin, Clock } from 'lucide-react'
import './Calendar.css'

const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']
const WEEKDAYS_SHORT = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']
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

function formatDateLong(dateStr) {
  const [year, month, day] = dateStr.split('-')
  const date = new Date(year, month - 1, day)
  return date.toLocaleDateString('de-DE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long'
  })
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

function isSameDay(d1, d2) {
  return d1 === d2
}

function isPast(dateStr) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const [year, month, day] = dateStr.split('-')
  const date = new Date(year, month - 1, day)
  return date < today
}

function getWeekDays(year, month) {
  const firstDay = getFirstDayOfMonth(year, month)
  const daysInMonth = getDaysInMonth(year, month)
  const prevMonthDays = getDaysInMonth(month === 0 ? year - 1 : year, month === 0 ? 11 : month - 1)

  const week = []
  for (let i = firstDay - 1; i >= 0; i--) {
    const d = prevMonthDays - i
    const m = month === 0 ? 11 : month - 1
    const y = month === 0 ? year - 1 : year
    week.push({ date: formatDate(y, m, d), day: d, isCurrentMonth: false })
  }
  for (let d = 1; d <= daysInMonth; d++) {
    week.push({ date: formatDate(year, month, d), day: d, isCurrentMonth: true })
  }
  const remaining = 7 - week.length
  for (let d = 1; d <= remaining; d++) {
    const m = month === 11 ? 0 : month + 1
    const y = month === 11 ? year + 1 : year
    week.push({ date: formatDate(y, m, d), day: d, isCurrentMonth: false })
  }
  return week
}

export default function Calendar({ events, onEventClick, currentMonth, onMonthChange }) {
  const [slideDirection, setSlideDirection] = useState(null)
  const [selectedDate, setSelectedDate] = useState(null)

  const year = currentMonth.getFullYear()
  const month = currentMonth.getMonth()

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

  const monthDays = useMemo(() => {
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
  }, [year, month])

  const weekDays = useMemo(() => getWeekDays(year, month), [year, month])

  const prevMonth = () => {
    setSlideDirection('right')
    setSelectedDate(null)
    onMonthChange(new Date(year, month - 1, 1))
  }

  const nextMonth = () => {
    setSlideDirection('left')
    setSelectedDate(null)
    onMonthChange(new Date(year, month + 1, 1))
  }

  const goToToday = () => {
    const today = new Date()
    setSlideDirection(null)
    setSelectedDate(formatDate(today.getFullYear(), today.getMonth(), today.getDate()))
    onMonthChange(new Date(today.getFullYear(), today.getMonth(), 1))
  }

  const handleWeekDayClick = (date) => {
    setSelectedDate(date)
  }

  const calendarKey = `${year}-${month}`

  const hasEventsAnywhere = events.length > 0

  const selectedDayEvents = selectedDate ? (eventsByDay[selectedDate] || []) : null

  const todayInMonth = isToday(year, month, new Date().getDate())

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

      {/* Week strip — mobile only: shows current week */}
      <div className="week-strip">
        {weekDays.map((cell) => {
          const dayEvents = eventsByDay[cell.date] || []
          const today = isToday(year, month, cell.day)
          const past = isPast(cell.date) && !today
          const isSelected = selectedDate === cell.date

          return (
            <button
              key={cell.date}
              className={`week-day ${!cell.isCurrentMonth ? 'other-month' : ''} ${today ? 'today' : ''} ${past ? 'past' : ''} ${isSelected ? 'selected' : ''}`}
              onClick={() => handleWeekDayClick(cell.date)}
            >
              <span className="week-day-name">{WEEKDAYS_SHORT[weekDays.indexOf(cell) % 7]}</span>
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

      {/* Selected day detail — mobile only */}
      {selectedDate && (
        <div className="day-detail">
          <div className="day-detail-header">
            <h3>{formatDateLong(selectedDate)}</h3>
            <button className="day-detail-close" onClick={() => setSelectedDate(null)}>
              ×
            </button>
          </div>
          {selectedDayEvents && selectedDayEvents.length > 0 ? (
            <div className="day-events">
              {selectedDayEvents.map(event => (
                <button
                  key={event.id}
                  className="agenda-event-card"
                  onClick={() => onEventClick(event)}
                >
                  <div className="agenda-event-time">
                    {event.time || '—'}
                  </div>
                  <div className="agenda-event-info">
                    <span className="agenda-event-title">{event.title}</span>
                    <span className="agenda-event-place">
                      <MapPin size={12} />
                      {event.place.split(',')[0]}
                    </span>
                  </div>
                  <div className={`agenda-event-badge ${event.contribution === 'free' ? 'free' : 'fee'}`}>
                    {event.contribution === 'free' ? 'Frei' : `${event.fee}€`}
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <p className="day-no-events">Keine Events an diesem Tag</p>
          )}
        </div>
      )}

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
                    <span className="more-events">+{dayEvents.length - 3}</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {!hasEventsAnywhere && (
        <div className="calendar-empty">
          <p>Keine Events vorhanden</p>
        </div>
      )}
    </div>
  )
}
