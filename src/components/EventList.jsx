import { Link } from 'react-router-dom'
import { useEvents } from '../hooks/useEvents'
import { useAuth } from '../hooks/useAuth'
import { PlusCircle, Edit2, Trash2, Calendar, MapPin, Image } from 'lucide-react'
import ConfirmDialog from './ConfirmDialog'
import { useState } from 'react'
import './EventList.css'

function formatDate(dateStr) {
  const [year, month, day] = dateStr.split('-')
  const date = new Date(year, month - 1, day)
  return date.toLocaleDateString('de-DE', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  })
}

function formatEndDate(startDateStr, endDateStr) {
  if (!endDateStr) return null
  const [syear, smonth, sday] = startDateStr.split('-')
  const [eyear, emonth, eday] = endDateStr.split('-')
  const start = new Date(syear, smonth - 1, sday)
  const end = new Date(eyear, emonth - 1, eday)
  if (start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth() && start.getDate() === end.getDate()) {
    return null
  }
  const endDate = new Date(eyear, emonth - 1, eday)
  return endDate.toLocaleDateString('de-DE', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  })
}

export default function EventList() {
  const { user } = useAuth()
  const { events, loading, deleteEvent } = useEvents(user)
  const [deleteId, setDeleteId] = useState(null)
  const [deleting, setDeleting] = useState(false)

  const handleDelete = async () => {
    if (!deleteId) return
    setDeleting(true)
    try {
      await deleteEvent(deleteId)
      setDeleteId(null)
    } catch (err) {
      console.error('Delete failed:', err)
    } finally {
      setDeleting(false)
    }
  }

  if (loading) {
    return (
      <div className="loading-spinner"></div>
    )
  }

  return (
    <div className="event-list-page">
      <div className="event-list-header">
        <div>
          <h1>Meine Events</h1>
          <p>Verwalte deine Events</p>
        </div>
        <Link to="/admin/new" className="btn btn-primary">
          <PlusCircle size={18} />
          <span>Neues Event</span>
        </Link>
      </div>

      {events.length === 0 ? (
        <div className="event-list-empty">
          <div className="empty-icon">
            <Calendar size={48} />
          </div>
          <h2>Noch keine Events</h2>
          <p>Erstelle dein erstes Event und teile es mit der Community.</p>
          <Link to="/admin/new" className="btn btn-primary">
            <PlusCircle size={18} />
            <span>Event erstellen</span>
          </Link>
        </div>
      ) : (
        <div className="event-list-grid">
          {events.map(event => (
            <div key={event.id} className="event-card">
              {event.imageUrl ? (
                <div className="event-card-image">
                  <img src={event.imageUrl} alt={event.title} />
                </div>
              ) : null}
              <div className="event-card-content">
                <div className="event-card-header">
                  <h3>{event.title}</h3>
                  <span className={`badge ${event.contribution === 'free' ? 'badge--free' : 'badge--fee'}`}>
                    {event.contribution === 'free' ? 'Kostenlos' : `${event.fee} €`}
                  </span>
                </div>

                <div className="event-card-meta">
                  <div className="meta-item">
                    <Calendar size={14} />
                    <span>
                      {formatDate(event.date)}
                      {formatEndDate(event.date, event.endDate) && ` — ${formatEndDate(event.date, event.endDate)}`}
                      {event.time && ` • ${event.time}`}
                    </span>
                  </div>
                  <div className="meta-item">
                    <MapPin size={14} />
                    <span>{event.place}</span>
                  </div>
                </div>

                {event.description && (
                  <p className="event-card-description">
                    {event.description.length > 120
                      ? event.description.substring(0, 120) + '...'
                      : event.description}
                  </p>
                )}
              </div>

              <div className="event-card-actions">
                <Link to={`/admin/edit/${event.id}`} className="btn btn-secondary btn-sm">
                  <Edit2 size={16} />
                  <span>Bearbeiten</span>
                </Link>
                <button
                  onClick={() => setDeleteId(event.id)}
                  className="btn btn-danger btn-sm"
                >
                  <Trash2 size={16} />
                  <span>Löschen</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        isOpen={Boolean(deleteId)}
        title="Event löschen"
        message="Möchtest du dieses Event wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden."
        confirmLabel="Löschen"
        cancelLabel="Abbrechen"
        onConfirm={handleDelete}
        onCancel={() => setDeleteId(null)}
        loading={deleting}
      />
    </div>
  )
}
