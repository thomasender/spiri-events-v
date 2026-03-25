import { useState, useMemo } from 'react'
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react'
import EventChip from './EventChip'
import './Calendar.css'

const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']
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

function isToday(year, month, day) {
  const today = new Date()
  return (
    today.getFullYear() === year &&
    today.getMonth() === month &&
    today.getDate() === day
  )
}

function isPast(year, month, day) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const date = new Date(year, month, day)
  return date < today
}

export default function Calendar({ events, onEventClick, currentMonth, onMonthChange }) {
  const [slideDirection, setSlideDirection] = useState(null)

  const year = currentMonth.getFullYear()
  const month = currentMonth.getMonth()

  console.log('[Calendar] Rendering, year:', year, 'month:', month, 'events:', events.map(e => ({ title: e.title, date: e.date })))

  const daysInMonth = getDaysInMonth(year, month)
  const firstDay = getFirstDayOfMonth(year, month)

  const eventsByDay = useMemo(() => {
    const map = {}
    events.forEach(event => {
      if (event.date) {
        if (!map[event.date]) map[event.date] = []
        map[event.date].push(event)
      }
    })
    console.log('[Calendar] eventsByDay keys:', Object.keys(map))
    return map
  }, [events])

  const prevMonth = () => {
    setSlideDirection('right')
    onMonthChange(new Date(year, month - 1, 1))
  }

  const nextMonth = () => {
    setSlideDirection('left')
    onMonthChange(new Date(year, month + 1, 1))
  }

  const goToToday = () => {
    const today = new Date()
    setSlideDirection(null)
    onMonthChange(new Date(today.getFullYear(), today.getMonth(), 1))
  }

  const calendarKey = `${year}-${month}`

  const cells = []
  for (let i = 0; i < firstDay; i++) {
    const prevMonthDays = getDaysInMonth(
      month === 0 ? year - 1 : year,
      month === 0 ? 11 : month - 1
    )
    const day = prevMonthDays - firstDay + i + 1
    const m = month === 0 ? 11 : month - 1
    const y = month === 0 ? year - 1 : year
    cells.push({
      date: formatDate(y, m, day),
      day,
      isCurrentMonth: false,
      isPrevMonth: true
    })
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = formatDate(year, month, day)
    cells.push({
      date: dateStr,
      day,
      isCurrentMonth: true,
      isPrevMonth: false
    })
  }

  const remainingCells = 42 - cells.length
  for (let day = 1; day <= remainingCells; day++) {
    const m = month === 11 ? 0 : month + 1
    const y = month === 11 ? year + 1 : year
    cells.push({
      date: formatDate(y, m, day),
      day,
      isCurrentMonth: false,
      isNextMonth: true
    })
  }

  const hasEventsAnywhere = events.length > 0

  return (
    <div className="calendar">
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
        {cells.map((cell, index) => {
          const dayEvents = eventsByDay[cell.date] || []
          const today = isToday(year, month, cell.day)
          const past = isPast(year, month, cell.day) && !today

          return (
            <div
              key={cell.date}
              className={`calendar-cell ${!cell.isCurrentMonth ? 'other-month' : ''} ${today ? 'today' : ''} ${past ? 'past' : ''}`}
            >
              <span className="day-number">{cell.day}</span>
              <div className="cell-events">
                {dayEvents.slice(0, 3).map(event => (
                  <EventChip
                    key={event.id}
                    event={event}
                    onClick={() => onEventClick(event)}
                  />
                ))}
                {dayEvents.length > 3 && (
                  <span className="more-events">+{dayEvents.length - 3}</span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {!hasEventsAnywhere && (
        <div className="calendar-empty">
          <p>Keine Events vorhanden</p>
        </div>
      )}
    </div>
  )
}
