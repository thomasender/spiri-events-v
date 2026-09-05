import { useState } from 'react';
import { Link } from 'react-router-dom';
import { MapPin } from 'lucide-react';
import {
  formatEventDateLabel,
  formatEventDateRangeLabel,
  getEventLocationLabel,
  getOrganizerName,
  getPrimaryCategory,
  isMultiDayEvent,
} from '../utils/eventFormat';
import { getEventFallbackImage } from '../utils/eventFallbacks';
import './EventCard.css';

export default function EventCard({ event, categoryColor, onClick }) {
  const organizerName = getOrganizerName(event);
  const category = getPrimaryCategory(event);
  const fallbackImage = getEventFallbackImage(event);
  const multiDay = isMultiDayEvent(event);
  const dateRangeLabel = multiDay ? formatEventDateRangeLabel(event.date, event.endDate) : null;
  const locationLabel = getEventLocationLabel(event);
  const [imageError, setImageError] = useState(false);
  const imageSrc = event.imageUrl && !imageError ? event.imageUrl : fallbackImage;

  return (
    <Link
      to={`/event/${event.slug || event.id}?occurrenceDate=${event.date}`}
      className="event-tile"
      onClick={onClick}
    >
      <div className="event-tile-image-wrapper">
        <img
          src={imageSrc}
          alt=""
          className="event-tile-image"
          onError={() => setImageError(true)}
        />
        {category && (
          <span className="event-tile-category" style={{ backgroundColor: categoryColor }}>
            {category}
          </span>
        )}
      </div>

      <div className="event-tile-body">
        <span className="event-tile-date">
          {multiDay ? (
            <span data-testid="event-tile-date-range">{dateRangeLabel}</span>
          ) : (
            <>
              {formatEventDateLabel(event.date)}
              {event.time && ` · ${event.time} Uhr`}
            </>
          )}
        </span>
        <h3 className="event-tile-title">{event.title}</h3>
        {locationLabel && (
          <span
            className={`event-tile-location${event.isOnline ? ' event-tile-location--online' : ''}`}
            data-testid={event.isOnline ? 'event-tile-location-online' : undefined}
          >
            <MapPin size={14} />
            {locationLabel}
          </span>
        )}
        {organizerName && (
          <div className="event-tile-organizer">
            <span className="event-tile-organizer-avatar">{organizerName.charAt(0)}</span>
            <span>{organizerName}</span>
          </div>
        )}
      </div>
    </Link>
  );
}
