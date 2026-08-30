import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Edit2,
  Trash2,
  Calendar,
  MapPin,
  Eye,
  CheckCircle,
  Mail,
  Repeat,
  Send,
  FileText,
  Copy,
} from 'lucide-react';
import StatusBadge from './StatusBadge';
import RichTextView from './RichTextView';
import {
  getNextUpcomingOccurrence,
  getOccurrenceCount,
  getRecurrenceLabel,
} from '../utils/eventOccurrences';
import { getEventLocationLabel, isMultiDayEvent } from '../utils/eventFormat';
import { getEventFallbackImage } from '../utils/eventFallbacks';

function formatDate(dateStr) {
  if (!dateStr) return '';
  const [year, month, day] = dateStr.split('-');
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString('de-DE', {
    day: 'numeric',
    month: 'short',
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
    month: 'short',
    year: 'numeric',
  });
}

export default function EventAdminCard({
  event,
  showStatus = false,
  showApprove = false,
  showSubmit = false,
  showRevert = false,
  showDuplicate = false,
  unreadCount = 0,
  isAdmin = false,
  approving = null,
  duplicating = false,
  fromPath = '/admin',
  onApprove,
  onSubmit,
  onRevert,
  onDuplicate,
  onDeleteClick,
}) {
  const isRecurring = event.recurrence && event.recurrence !== 'none';
  const isMultiDay = isMultiDayEvent(event);
  const recurrenceLabel = getRecurrenceLabel(event);
  const nextOccurrence = isRecurring ? getNextUpcomingOccurrence(event) : null;
  const occurrenceCount = isRecurring ? getOccurrenceCount(event) : 0;
  const hasUnread = unreadCount > 0;
  const locationLabel = getEventLocationLabel(event);
  const fallbackImage = getEventFallbackImage(event);
  const [imageError, setImageError] = useState(false);
  const imageSrc = event.imageUrl && !imageError ? event.imageUrl : fallbackImage;

  const nextOccurrenceDisplay = nextOccurrence
    ? (() => {
        const [year, month, day] = nextOccurrence.split('-');
        const d = new Date(year, month - 1, day);
        return d.toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'long' });
      })()
    : null;

  return (
    <div className={`event-card${hasUnread ? ' event-card--has-unread' : ''}`}>
      <Link
        to={
          isRecurring && nextOccurrence
            ? `/event/${event.slug || event.id}?occurrenceDate=${nextOccurrence}`
            : `/event/${event.slug || event.id}`
        }
        state={{ from: '/admin' }}
        className="event-card-content"
      >
        <div className="event-card-image-wrapper">
          <img
            src={imageSrc}
            alt=""
            className="event-card-image"
            data-testid="event-card-image"
            onError={() => setImageError(true)}
          />
        </div>
        <div className="event-card-body">
          <div className="event-card-header">
            <h3>
              {event.title}
              {hasUnread && (
                <span
                  className="event-card-unread-indicator"
                  data-testid="event-card-unread-indicator"
                  role="img"
                  aria-label={`${unreadCount} ungelesene Nachricht${unreadCount > 1 ? 'en' : ''}`}
                  title={`${unreadCount} ungelesene Nachricht${unreadCount > 1 ? 'en' : ''}`}
                />
              )}
            </h3>
            <div className="event-card-badges">
              {showStatus && <StatusBadge status={event.status} />}
              {isRecurring && (
                <span className="badge badge--recurring" title="Wiederholende Veranstaltung">
                  <Repeat size={12} />
                  <span>Serie</span>
                </span>
              )}
              {(event.contribution === 'free' ||
                event.contribution === 'donation' ||
                event.fee) && (
                <span
                  className={`badge ${
                    event.contribution === 'free'
                      ? 'badge--free'
                      : event.contribution === 'donation'
                        ? 'badge--donation'
                        : 'badge--fee'
                  }`}
                >
                  {event.contribution === 'free'
                    ? 'Kostenlos'
                    : event.contribution === 'donation'
                      ? 'Freie Spende'
                      : `${event.fee} €`}
                </span>
              )}
            </div>
          </div>

          {event.category && (
            <div className="event-card-categories">
              <span className="category-chip">{event.category}</span>
            </div>
          )}

          <div className="event-card-meta">
            <div className="meta-item">
              <Calendar size={14} />
              <span>
                {isRecurring
                  ? nextOccurrenceDisplay || formatDate(event.date)
                  : formatDate(event.date)}
                {formatEndDate(event.date, event.endDate) &&
                  ` — ${formatEndDate(event.date, event.endDate)}`}
                {!isMultiDay && event.time && ` • ${event.time}`}
              </span>
            </div>
            {locationLabel && (
              <div className="meta-item">
                <MapPin size={14} />
                <span>{locationLabel}</span>
              </div>
            )}
            {!event.isOnline && event.place && (
              <div className="meta-item">
                <MapPin size={14} />
                <span>{event.place}</span>
              </div>
            )}
            {event.organizer && event.organizer.email && (
              <div className="meta-item" data-testid="event-owner-email">
                <Mail size={14} />
                <span>{event.organizer.email}</span>
              </div>
            )}
          </div>

          {isRecurring && recurrenceLabel && (
            <div className="event-card-recurrence">
              <span className="recurrence-pattern">
                <Repeat size={12} />
                {recurrenceLabel}
                {occurrenceCount > 0 && ` · ${occurrenceCount} Termine`}
              </span>
              {nextOccurrence && nextOccurrence !== event.date && (
                <span className="next-occurrence">· Nächster: {nextOccurrenceDisplay}</span>
              )}
            </div>
          )}

          {event.description && (
            <RichTextView
              html={event.description}
              truncate={120}
              className="event-card-description"
            />
          )}

          {event.status === 'pending' && !isAdmin && (
            <p className="event-card-pending-note">Wartet auf Genehmigung durch einen Admin</p>
          )}
          {event.status === 'draft' && (
            <p className="event-card-pending-note">Entwurf — noch nicht eingereicht</p>
          )}
        </div>
      </Link>

      <div className="event-card-actions">
        <Link
          to={
            isRecurring && nextOccurrence
              ? `/event/${event.slug || event.id}?occurrenceDate=${nextOccurrence}`
              : `/event/${event.slug || event.id}`
          }
          state={{ from: '/admin' }}
          className="btn btn-secondary btn-sm"
        >
          <Eye size={16} />
          <span>Ansehen</span>
        </Link>
        {showApprove && (
          <button
            onClick={() => onApprove?.(event.id)}
            className="btn btn-success btn-sm"
            disabled={approving === event.id}
          >
            <CheckCircle size={16} />
            <span>{approving === event.id ? 'Genehmige...' : 'Genehmigen'}</span>
          </button>
        )}
        {showSubmit && (
          <button
            onClick={() => onSubmit?.(event)}
            className="btn btn-primary btn-sm"
            data-testid="submit-draft-button"
          >
            <Send size={16} />
            <span>Einreichen</span>
          </button>
        )}
        {showRevert && (
          <button
            onClick={() => onRevert?.(event)}
            className="btn btn-secondary btn-sm"
            data-testid="revert-to-draft-button"
          >
            <FileText size={16} />
            <span>Zu Entwurf</span>
          </button>
        )}
        {showDuplicate && (
          <button
            onClick={() => onDuplicate?.(event)}
            className="btn btn-secondary btn-sm"
            disabled={duplicating}
            data-testid="duplicate-draft-button"
            title="Erstellt eine Kopie dieses Entwurfs"
          >
            <Copy size={16} />
            <span>{duplicating ? 'Dupliziere...' : 'Duplizieren'}</span>
          </button>
        )}
        <Link
          to={`/admin/edit/${event.id}`}
          state={{ from: fromPath }}
          className="btn btn-secondary btn-sm"
          title={
            isRecurring
              ? 'Du bearbeitest die Seriendefinition. Wiederholung, Uhrzeit, Ort etc. gelten für alle Termine.'
              : undefined
          }
        >
          <Edit2 size={16} />
          <span>{isRecurring ? 'Serie bearbeiten' : 'Bearbeiten'}</span>
        </Link>
        <button
          onClick={() => onDeleteClick?.(event)}
          className="btn btn-subtle-danger btn-sm"
          aria-label={isRecurring ? 'Serie löschen' : 'Event löschen'}
        >
          <Trash2 size={16} />
        </button>
      </div>
    </div>
  );
}
