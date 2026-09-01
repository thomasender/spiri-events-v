import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Edit2,
  Trash2,
  MapPin,
  Mail,
  Eye,
  CheckCircle,
  Repeat,
  Send,
  FileText,
  Copy,
} from 'lucide-react';
import StatusBadge from './StatusBadge';
import { formatDayNumber, formatMonthShort, formatWeekdayShort } from '../utils/eventFormat';
import { getNextUpcomingOccurrence, getRecurrenceLabel } from '../utils/eventOccurrences';
import { getEventLocationLabel, isMultiDayEvent } from '../utils/eventFormat';
import { getEventFallbackImage } from '../utils/eventFallbacks';
import { formatPriceWithCurrency } from '../utils/currency';
import './EventAdminListRow.css';

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

export default function EventAdminListRow({
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
  const recurrenceLabel = getRecurrenceLabel(event);
  const nextOccurrence = isRecurring ? getNextUpcomingOccurrence(event) : null;
  const hasUnread = unreadCount > 0;
  const locationLabel = getEventLocationLabel(event);
  const multiDay = isMultiDayEvent(event);
  const fallbackImage = getEventFallbackImage(event);
  const [imageError, setImageError] = useState(false);
  const imageSrc = event.imageUrl && !imageError ? event.imageUrl : fallbackImage;

  const eventDate = isRecurring && nextOccurrence ? nextOccurrence : event.date;

  const eventLinkTarget =
    isRecurring && nextOccurrence
      ? `/event/${event.slug || event.id}?occurrenceDate=${nextOccurrence}`
      : `/event/${event.slug || event.id}`;

  return (
    <div className={`event-admin-row${hasUnread ? ' event-admin-row--has-unread' : ''}`}>
      <Link to={eventLinkTarget} state={{ from: fromPath }} className="event-admin-row-link">
        <div className="event-admin-row-date">
          <span className="event-admin-row-weekday">{formatWeekdayShort(eventDate)}</span>
          <span className="event-admin-row-day">{formatDayNumber(eventDate)}</span>
          <span className="event-admin-row-month">{formatMonthShort(eventDate)}</span>
        </div>

        <div className="event-admin-row-image-wrapper">
          <img
            src={imageSrc}
            alt=""
            className="event-admin-row-image"
            onError={() => setImageError(true)}
          />
        </div>

        <div className="event-admin-row-body">
          <div className="event-admin-row-header">
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
            <div className="event-admin-row-badges">
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
                      : formatPriceWithCurrency(event.fee, event.priceCurrency)}
                </span>
              )}
            </div>
          </div>

          <div className="event-admin-row-meta">
            {!multiDay && event.time && (
              <span className="event-admin-row-meta-item">{event.time} Uhr</span>
            )}
            {!multiDay && event.date && !isRecurring && (
              <span className="event-admin-row-meta-item">{formatDate(event.date)}</span>
            )}
            {isRecurring && recurrenceLabel && (
              <span className="event-admin-row-meta-item">{recurrenceLabel}</span>
            )}
            {locationLabel && (
              <span className="event-admin-row-meta-item">
                <MapPin size={12} />
                {locationLabel}
              </span>
            )}
            {event.organizer && event.organizer.email && (
              <span className="event-admin-row-meta-item event-admin-row-meta-item--email">
                <Mail size={12} />
                {event.organizer.email}
              </span>
            )}
          </div>
        </div>
      </Link>

      <div className="event-admin-row-actions">
        <Link
          to={eventLinkTarget}
          state={{ from: fromPath }}
          className="btn btn-secondary btn-sm event-admin-row-action"
          aria-label="Ansehen"
          title="Ansehen"
        >
          <Eye size={16} />
        </Link>
        {showApprove && (
          <button
            onClick={() => onApprove?.(event.id)}
            className="btn btn-success btn-sm event-admin-row-action"
            disabled={approving === event.id}
            aria-label="Genehmigen"
            title={approving === event.id ? 'Genehmige...' : 'Genehmigen'}
          >
            <CheckCircle size={16} />
          </button>
        )}
        {showSubmit && (
          <button
            onClick={() => onSubmit?.(event)}
            className="btn btn-primary btn-sm event-admin-row-action"
            data-testid="submit-draft-button"
            aria-label="Einreichen"
            title="Einreichen"
          >
            <Send size={16} />
          </button>
        )}
        {showRevert && (
          <button
            onClick={() => onRevert?.(event)}
            className="btn btn-secondary btn-sm event-admin-row-action"
            data-testid="revert-to-draft-button"
            aria-label="Zu Entwurf"
            title="Zu Entwurf"
          >
            <FileText size={16} />
          </button>
        )}
        {showDuplicate && (
          <button
            onClick={() => onDuplicate?.(event)}
            className="btn btn-secondary btn-sm event-admin-row-action"
            disabled={duplicating}
            data-testid="duplicate-event-button"
            aria-label="Duplizieren"
            title={duplicating ? 'Dupliziere...' : 'Duplizieren'}
          >
            <Copy size={16} />
          </button>
        )}
        <Link
          to={`/admin/edit/${event.id}`}
          state={{ from: fromPath }}
          className="btn btn-secondary btn-sm event-admin-row-action"
          aria-label={isRecurring ? 'Serie bearbeiten' : 'Bearbeiten'}
          title={isRecurring ? 'Serie bearbeiten' : 'Bearbeiten'}
        >
          <Edit2 size={16} />
        </Link>
        <button
          onClick={() => onDeleteClick?.(event)}
          className="btn btn-subtle-danger btn-sm event-admin-row-action"
          aria-label={isRecurring ? 'Serie löschen' : 'Event löschen'}
          title={isRecurring ? 'Serie löschen' : 'Event löschen'}
        >
          <Trash2 size={16} />
        </button>
      </div>
    </div>
  );
}
