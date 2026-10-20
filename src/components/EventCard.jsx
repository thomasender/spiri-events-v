import { Link } from 'react-router-dom';
import { MapPin } from 'lucide-react';
import {
  formatEventDateLabel,
  formatEventDateRangeLabel,
  getEventCityLabel,
  getOrganizerName,
  getPrimaryCategory,
  isMultiDayEvent,
} from '../utils/eventFormat';
import { getEventFallbackImage } from '../utils/eventFallbacks';
import { trackEventOpen } from '../lib/analyticsEvents';
import EventCoverImage from './EventCoverImage';
import FavoriteButton from './FavoriteButton';
import CancelledBadge from './CancelledBadge';
import { isEntryCancelled } from '../utils/eventCancellation';
import './EventCard.css';

export default function EventCard({ event, categoryColor, onClick }) {
  const organizerName = getOrganizerName(event);
  const category = getPrimaryCategory(event);
  const fallbackImage = getEventFallbackImage(event);
  const multiDay = isMultiDayEvent(event);
  const dateRangeLabel = multiDay ? formatEventDateRangeLabel(event.date, event.endDate) : null;
  const locationLabel = getEventCityLabel(event);
  const cancelled = isEntryCancelled(event);

  return (
    <Link
      to={`/event/${event.slug || event.id}`}
      className="event-tile"
      onClick={(e) => {
        trackEventOpen(event);
        onClick?.(e);
      }}
    >
      <div className="event-tile-image-wrapper">
        <EventCoverImage
          thumbnail
          event={event}
          fallbackSrc={fallbackImage}
          className="event-tile-image"
          alt=""
        />
        {category && (
          <span className="event-tile-category" style={{ backgroundColor: categoryColor }}>
            {category}
          </span>
        )}
        <FavoriteButton eventId={event.id} />
      </div>

      <div className="event-tile-body">
        {cancelled && <CancelledBadge />}
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
            {event.organizer && event.organizer.photoURL ? (
              <img
                src={event.organizer.photoURL}
                alt=""
                className="event-tile-organizer-photo"
                data-testid="event-tile-organizer-photo"
                loading="lazy"
              />
            ) : (
              <span className="event-tile-organizer-avatar">{organizerName.charAt(0)}</span>
            )}
            <span>{organizerName}</span>
          </div>
        )}
      </div>
    </Link>
  );
}
