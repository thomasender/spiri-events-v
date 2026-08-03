import { useState } from 'react';
import { Link } from 'react-router-dom';
import { MapPin } from 'lucide-react';
import { formatEventDateLabel, getOrganizerName, getPrimaryCategory } from '../utils/eventFormat';
import { getEventFallbackImage } from '../utils/eventFallbacks';
import './EventCard.css';

export default function EventCard({ event, categoryColor }) {
  const organizerName = getOrganizerName(event);
  const category = getPrimaryCategory(event);
  const fallbackImage = getEventFallbackImage(event);
  const [imageError, setImageError] = useState(false);
  const imageSrc = event.imageUrl && !imageError ? event.imageUrl : fallbackImage;

  return (
    <Link to={`/event/${event.slug || event.id}`} className="event-tile">
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
          {formatEventDateLabel(event.date)}
          {event.time && ` · ${event.time} Uhr`}
        </span>
        <h3 className="event-tile-title">{event.title}</h3>
        {event.bezirk && (
          <span className="event-tile-location">
            <MapPin size={14} />
            {event.bezirk}
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
