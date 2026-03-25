import { useState } from 'react'
import { useAllEvents } from '../hooks/useEvents'
import Calendar from '../components/Calendar'
import EventModal from '../components/EventModal'
import './CalendarPage.css'

export default function CalendarPage() {
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [selectedEvent, setSelectedEvent] = useState(null)
  const { events, loading, error } = useAllEvents()

  const handleEventClick = (event) => {
    setSelectedEvent(event)
  }

  const closeModal = () => {
    setSelectedEvent(null)
  }

  return (
    <div className="calendar-page">
      <div className="page-header">
        <div className="header-content">
          <h1>Spirituelle Events Vorarlberg</h1>
          <p>Entdecke Workshops, Meditationen und Retreats in deiner Nähe</p>
        </div>
        <div className="header-decoration"></div>
      </div>

      <div className="calendar-wrapper">
        {loading ? (
          <div className="loading-spinner"></div>
        ) : error ? (
          <div className="calendar-error">
            <h3>Verbindungsfehler</h3>
            <p>Kalender konnte nicht geladen werden. Bitte überprüfe deine Firebase Konfiguration und Firestore Regeln.</p>
            <p className="error-detail">{error}</p>
          </div>
        ) : (
          <Calendar
            events={events}
            onEventClick={handleEventClick}
            currentMonth={currentMonth}
            onMonthChange={setCurrentMonth}
          />
        )}
      </div>

      {selectedEvent && (
        <EventModal event={selectedEvent} onClose={closeModal} />
      )}
    </div>
  )
}
