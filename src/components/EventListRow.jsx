import { useState } from 'react';
import { Link } from 'react-router-dom';
import { MapPin } from 'lucide-react';
import {
  formatDayNumber,
  formatMonthShort,
  formatWeekdayShort,
  getOrganizerName,
  getPrimaryCategory,
} from '../utils/eventFormat';
import { getEventFallbackImage } from '../utils/eventFallbacks';
import './EventListRow.css';

export default function EventListRow({ event, categoryColor, linkState }) {
  const organizerName = getOrganizerName(event);
  const category = getPrimaryCategory(event);
  const fallbackImage = getEventFallbackImage(event);
  const [imageError, setImageError] = useState(false);
  const imageSrc = event.imageUrl && !imageError ? event.imageUrl : fallbackImage;

  return (
    <Link to={`/event/${event.slug || event.id}`} state={linkState} className="event-row">
      <div className="event-row-date">
        <span className="event-row-weekday">{formatWeekdayShort(event.date)}</span>
        <span className="event-row-day">{formatDayNumber(event.date)}</span>
        <span className="event-row-month">{formatMonthShort(event.date)}</span>
      </div>

      <div className="event-row-image-wrapper">
        <img
          src={imageSrc}
          alt=""
          className="event-row-image"
          onError={() => setImageError(true)}
        />
      </div>

      <div className="event-row-body">
        {category && (
          <span className="event-row-category" style={{ backgroundColor: categoryColor }}>
            {category}
          </span>
        )}
        <h3 className="event-row-title">{event.title}</h3>
        {event.bezirk && (
          <span className="event-row-location">
            <MapPin size={14} />
            {event.bezirk}
            {event.place && ` · ${event.place}`}
          </span>
        )}
        {organizerName && (
          <div className="event-row-organizer">
            <span className="event-row-organizer-avatar">{organizerName.charAt(0)}</span>
            <span>{organizerName}</span>
          </div>
        )}
      </div>

      {event.time && (
        <div className="event-row-time">
          <span>{event.time} Uhr</span>
        </div>
      )}
    </Link>
  );
}
