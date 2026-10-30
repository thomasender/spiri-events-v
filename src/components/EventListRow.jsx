import { Link } from 'react-router-dom';
import { MapPin } from 'lucide-react';
import {
  formatDayNumber,
  formatMonthShort,
  formatWeekdayShort,
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
import { MemberBadgeFrame } from './MemberBadge';
import { isEntryCancelled } from '../utils/eventCancellation';
import './EventListRow.css';

export default function EventListRow({ event, categoryColor, linkState, onClick }) {
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
      state={linkState}
      className="event-row"
      onClick={(e) => {
        trackEventOpen(event);
        onClick?.(e);
      }}
    >
      <div className="event-row-date">
        <span className="event-row-weekday">{formatWeekdayShort(event.date)}</span>
        <span className="event-row-day">{formatDayNumber(event.date)}</span>
        <span className="event-row-month">{formatMonthShort(event.date)}</span>
      </div>

      <div className="event-row-image-wrapper">
        <EventCoverImage
          thumbnail
          event={event}
          fallbackSrc={fallbackImage}
          className="event-row-image"
          alt=""
        />
      </div>

      <div className="event-row-body">
        {cancelled && <CancelledBadge />}
        {category && (
          <span className="event-row-category" style={{ backgroundColor: categoryColor }}>
            {category}
          </span>
        )}
        <h3 className="event-row-title">{event.title}</h3>
        {locationLabel && (
          <span
            className={`event-row-location${event.isOnline ? ' event-row-location--online' : ''}`}
            data-testid={event.isOnline ? 'event-row-location-online' : undefined}
          >
            <MapPin size={14} />
            {locationLabel}
            {!event.isOnline && event.place && ` · ${event.place}`}
          </span>
        )}
        {organizerName && (
          <div className="event-row-organizer">
            <MemberBadgeFrame uid={event.createdBy}>
              {event.organizer && event.organizer.photoURL ? (
                <img
                  src={event.organizer.photoURL}
                  alt=""
                  className="event-row-organizer-photo"
                  data-testid="event-row-organizer-photo"
                  loading="lazy"
                />
              ) : (
                <span className="event-row-organizer-avatar">{organizerName.charAt(0)}</span>
              )}
            </MemberBadgeFrame>
            <span>{organizerName}</span>
          </div>
        )}
      </div>

      {multiDay ? (
        <div
          className="event-row-time event-row-date-range"
          data-testid="event-row-date-range"
          title={dateRangeLabel}
        >
          <span>{dateRangeLabel}</span>
        </div>
      ) : (
        event.time && (
          <div className="event-row-time">
            <span>{event.time} Uhr</span>
          </div>
        )
      )}
      <FavoriteButton eventId={event.id} />
    </Link>
  );
}
