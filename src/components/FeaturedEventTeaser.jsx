import { Link } from 'react-router-dom';
import { CalendarDays, MapPin } from 'lucide-react';
import EventCoverImage from './EventCoverImage';
import { useFeaturedEvent } from '../hooks/useFeaturedEvent';
import { featuredEventTeaserFor, isEventUpcoming } from '../config/featuredEventTeaser';
import {
  formatEventDateLabel,
  formatEventDateRangeLabel,
  getEventLocationLabel,
} from '../utils/eventFormat';
import './FeaturedEventTeaser.css';

/**
 * Prominent teaser for one hand-picked event on the coming-soon page of its
 * region (config: `featuredEventTeaser.js`). Renders nothing for other
 * regions, after the end date, and for an event that is missing, not approved
 * or over.
 */
export default function FeaturedEventTeaser({ regionId }) {
  const cfg = featuredEventTeaserFor(regionId);
  const event = useFeaturedEvent(cfg?.slug);
  if (!cfg || !event || event.status !== 'approved' || !isEventUpcoming(event)) return null;

  const when =
    formatEventDateRangeLabel(event.date, event.endDate) ?? formatEventDateLabel(event.date);
  const where = getEventLocationLabel(event);

  return (
    <section className="featured-teaser" data-testid="featured-event-teaser">
      <div className="featured-teaser-media">
        <EventCoverImage
          event={event}
          alt={event.title}
          loading="eager"
          className="featured-teaser-image"
        />
      </div>
      <div className="featured-teaser-body">
        <span className="eyebrow">{cfg.eyebrow}</span>
        <h2 className="featured-teaser-title">{event.title}</h2>
        <p className="featured-teaser-meta">
          <CalendarDays size={16} aria-hidden="true" /> {when}
        </p>
        {where && (
          <p className="featured-teaser-meta">
            <MapPin size={16} aria-hidden="true" /> {where}
          </p>
        )}
        <Link
          to={`/event/${cfg.slug}`}
          className="btn btn-primary"
          data-testid="featured-event-link"
        >
          Zum Event
        </Link>
      </div>
    </section>
  );
}
