import { useState, useEffect } from 'react';
import { X, Calendar, Clock, MapPin, Ticket, ExternalLink, User, Mail, Phone } from 'lucide-react';
import { getEventFallbackImage } from '../utils/eventFallbacks';
import { parseContactText } from '../utils/contactFormat';
import RichTextView from './RichTextView';
import './EventModal.css';

function formatDate(dateStr) {
  const [year, month, day] = dateStr.split('-');
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString('de-DE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function formatEndDate(startDateStr, endDateStr) {
  if (!endDateStr) return null;
  const [syear, smonth, sday] = startDateStr.split('-');
  const [eyear, emonth, eday] = endDateStr.split('-');
  const start = new Date(syear, smonth - 1, sday);
  const end = new Date(eyear, emonth - 1, eday);
  if (
    start.getFullYear() === end.getFullYear() &&
    start.getMonth() === end.getMonth() &&
    start.getDate() === end.getDate()
  ) {
    return null;
  }
  const endDate = new Date(eyear, emonth - 1, eday);
  return endDate.toLocaleDateString('de-DE', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function formatRecurrence(recurrence, recurrenceEndDate, eventDate) {
  if (!recurrence || recurrence === 'none') return null;
  if (recurrence === 'custom') return 'An einzelnen Terminen';
  let weekday = '';
  if (eventDate && (recurrence === 'weekly' || recurrence === 'biweekly')) {
    const [year, month, day] = eventDate.split('-');
    const date = new Date(year, month - 1, day);
    weekday = ` ${date.toLocaleDateString('de-DE', { weekday: 'long' })}`;
  }
  const labels = {
    weekly: `Jeden${weekday}`,
    biweekly: `Jeden zweiten${weekday}`,
    monthly: 'Jeden Monat',
  };
  let label = labels[recurrence];
  if (!label) {
    label = recurrence.charAt(0).toUpperCase() + recurrence.slice(1);
  }
  if (recurrenceEndDate) {
    const [year, month, day] = recurrenceEndDate.split('-');
    const endDate = new Date(year, month - 1, day);
    label += ` bis ${endDate.toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' })}`;
  }
  return label;
}

export default function EventModal({ event, onClose }) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const fallbackImage = getEventFallbackImage(event);
  const showRemoteImage = Boolean(event.imageUrl) && !imageError;
  const imageSrc = showRemoteImage ? event.imageUrl : fallbackImage;

  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  if (!event) return null;

  const isFree = event.contribution === 'free';
  const isDonation = event.contribution === 'donation';

  return (
    <div className="modal-overlay fade-enter" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Schließen">
          <X size={24} />
        </button>

        <div className="modal-header">
          <div className="modal-image-wrapper">
            {showRemoteImage && !imageLoaded && <div className="modal-image-skeleton" />}
            <img
              src={imageSrc}
              alt={event.title}
              className={`modal-image ${imageLoaded || !showRemoteImage ? 'loaded' : ''}`}
              onLoad={() => setImageLoaded(true)}
              onError={() => setImageError(true)}
            />
          </div>
          <h2 className="modal-title">{event.title}</h2>
          <div className="modal-meta-row">
            {event.category && (
              <div className="modal-categories">
                <span className="category-chip">{event.category}</span>
              </div>
            )}
            <div
              className={`modal-badge ${isFree ? 'badge--free' : isDonation ? 'badge--donation' : 'badge--fee'}`}
            >
              <Ticket size={14} />
              <span>
                {isFree
                  ? 'Kostenlos'
                  : isDonation
                    ? 'Freie Spende'
                    : event.fee
                      ? `${event.fee} €`
                      : 'Gebühr'}
              </span>
            </div>
          </div>
        </div>

        <div className="modal-details">
          <div className="detail-item">
            <Calendar size={18} className="detail-icon" />
            <div>
              <span className="detail-label">Datum</span>
              <span className="detail-value">
                {formatDate(event.date)}
                {formatEndDate(event.date, event.endDate) &&
                  ` — ${formatEndDate(event.date, event.endDate)}`}
              </span>
            </div>
          </div>

          {event.time && (
            <div className="detail-item">
              <Clock size={18} className="detail-icon" />
              <div>
                <span className="detail-label">Uhrzeit</span>
                <span className="detail-value">
                  {event.time}
                  {event.endTime ? ` — ${event.endTime} Uhr` : ' Uhr'}
                </span>
              </div>
            </div>
          )}

          {formatRecurrence(event.recurrence, event.recurrenceEndDate, event.date) && (
            <div className="detail-item">
              <Calendar size={18} className="detail-icon" />
              <div>
                <span className="detail-label">Wiederholung</span>
                <span className="detail-value">
                  {formatRecurrence(event.recurrence, event.recurrenceEndDate, event.date)}
                </span>
              </div>
            </div>
          )}

          <div className="detail-item">
            <MapPin size={18} className="detail-icon" />
            <div>
              <span className="detail-label">Bezirk</span>
              <span className="detail-value">{event.bezirk}</span>
            </div>
          </div>

          <div className="detail-item">
            <MapPin size={18} className="detail-icon" />
            <div>
              <span className="detail-label">Ort</span>
              <span className="detail-value">{event.place}</span>
            </div>
          </div>

          {event.organizer && (event.organizer.firstName || event.organizer.lastName) && (
            <div className="detail-item" data-testid="event-organizer">
              <User size={18} className="detail-icon" />
              <div>
                <span className="detail-label">Veranstalter</span>
                <span className="detail-value organizer-value">
                  {event.organizer.photoURL && (
                    <img
                      src={event.organizer.photoURL}
                      alt=""
                      className="organizer-photo"
                      data-testid="organizer-photo"
                    />
                  )}
                  <span>
                    {event.organizer.firstName} {event.organizer.lastName}
                  </span>
                </span>
              </div>
            </div>
          )}

          {event.kontakt && (
            <div className="detail-item">
              {(() => {
                const segments = parseContactText(event.kontakt);
                const hasEmail = segments.some((s) => s.type === 'email');
                const hasPhone = segments.some((s) => s.type === 'phone');
                return hasEmail || hasPhone ? (
                  hasEmail ? (
                    <Mail size={18} className="detail-icon" />
                  ) : (
                    <Phone size={18} className="detail-icon" />
                  )
                ) : (
                  <Phone size={18} className="detail-icon" />
                );
              })()}
              <div>
                <span className="detail-label">Kontakt</span>
                <span className="detail-value">
                  {parseContactText(event.kontakt).map((segment, index) => {
                    if (segment.type === 'email') {
                      return (
                        <a key={index} href={`mailto:${segment.value}`} className="detail-link">
                          {segment.value}
                        </a>
                      );
                    }
                    if (segment.type === 'phone') {
                      return (
                        <a key={index} href={`tel:${segment.value}`} className="detail-link">
                          {segment.value}
                        </a>
                      );
                    }
                    return <span key={index}>{segment.value}</span>;
                  })}
                </span>
              </div>
            </div>
          )}
        </div>

        {event.description && (
          <div className="modal-description">
            <h3>Über das Event</h3>
            <RichTextView html={event.description} />
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
  );
}
