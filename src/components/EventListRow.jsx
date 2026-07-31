import { Link } from 'react-router-dom';
import { MapPin } from 'lucide-react';
import {
  formatDayNumber,
  formatMonthShort,
  formatWeekdayShort,
  getOrganizerName,
  getPrimaryCategory,
} from '../utils/eventFormat';
import './EventListRow.css';

export default function EventListRow({ event, categoryColor }) {
  const organizerName = getOrganizerName(event);
  const category = getPrimaryCategory(event);

  return (
    <Link to={`/event/${event.slug || event.id}`} className="event-row">
      <div className="event-row-date">
        <span className="event-row-weekday">{formatWeekdayShort(event.date)}</span>
        <span className="event-row-day">{formatDayNumber(event.date)}</span>
        <span className="event-row-month">{formatMonthShort(event.date)}</span>
      </div>

      <div className="event-row-image-wrapper">
        {event.imageUrl ? (
          <img src={event.imageUrl} alt="" className="event-row-image" />
        ) : (
          <div className="event-row-image-placeholder" />
        )}
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
