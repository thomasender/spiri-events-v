import { useEffect } from 'react'
import { X, Calendar, Clock, MapPin, Ticket, ExternalLink, Image } from 'lucide-react'
import './EventModal.css'

function formatDate(dateStr) {
  const [year, month, day] = dateStr.split('-')
  const date = new Date(year, month - 1, day)
  return date.toLocaleDateString('de-DE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
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
    month: 'long',
    year: 'numeric'
  })
}

export default function EventModal({ event, onClose }) {
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleEscape)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleEscape)
      document.body.style.overflow = ''
    }
  }, [onClose])

  if (!event) return null

  const isFree = event.contribution === 'free'

  return (
    <div className="modal-overlay fade-enter" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Schließen">
          <X size={24} />
        </button>

        <div className="modal-header">
          <h2 className="modal-title">{event.title}</h2>
          <div className={`modal-badge ${isFree ? 'badge--free' : 'badge--fee'}`}>
            <Ticket size={14} />
            <span>{isFree ? 'Kostenlos' : event.fee ? `${event.fee} €` : 'Gebühr'}</span>
          </div>
        </div>

        {event.imageUrl && (
          <div className="modal-image">
            <img src={event.imageUrl} alt={event.title} />
          </div>
        )}

        <div className="modal-details">
          <div className="detail-item">
            <Calendar size={18} className="detail-icon" />
            <div>
              <span className="detail-label">Datum</span>
              <span className="detail-value">
                {formatDate(event.date)}
                {formatEndDate(event.date, event.endDate) && ` — ${formatEndDate(event.date, event.endDate)}`}
              </span>
            </div>
          </div>

          {event.time && (
            <div className="detail-item">
              <Clock size={18} className="detail-icon" />
              <div>
                <span className="detail-label">Uhrzeit</span>
                <span className="detail-value">{event.time}</span>
              </div>
            </div>
          )}

          <div className="detail-item">
            <MapPin size={18} className="detail-icon" />
            <div>
              <span className="detail-label">Ort</span>
              <span className="detail-value">{event.place}</span>
            </div>
          </div>
        </div>

        {event.description && (
          <div className="modal-description">
            <h3>Über das Event</h3>
            <p>{event.description}</p>
          </div>
        )}

        {event.link && (
          <a
            href={event.link}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-primary modal-link"
          >
            <span>Mehr Infos & Tickets</span>
            <ExternalLink size={16} />
          </a>
        )}
      </div>
    </div>
  )
}
