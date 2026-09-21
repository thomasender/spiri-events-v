import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import EventCard from './EventCard';
import { resolveEventColor } from '../utils/categoryColors';
import { useCategoryRegistry } from '../hooks/useCategoryRegistry';
import { getPrimaryCategory } from '../utils/eventFormat';
import './SimilarEvents.css';

const ORGANIZER_EVENTS_LIMIT = 5;
const SCROLL_STEP_FACTOR = 0.8;

function normalizeOrganizerEvent(event) {
  const isOnline = Boolean(event.isOnline);
  const category =
    event.category || (Array.isArray(event.categories) ? event.categories[0] : null) || 'Sonstiges';
  return {
    ...event,
    category,
    bezirk: isOnline ? '' : event.bezirk || '',
    isOnline,
    status: event.status || 'approved',
    organizer: event.organizer || { name: '', email: '' },
    kontakt: event.kontakt || '',
  };
}

export default function OrganizerEvents({ organizerUid, organizerName }) {
  const sliderRef = useRef(null);
  const { colorByName } = useCategoryRegistry();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  useEffect(() => {
    if (!organizerUid) {
      setEvents([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    const q = query(
      collection(db, 'events'),
      where('createdBy', '==', organizerUid),
      where('status', '==', 'approved')
    );

    getDocs(q)
      .then((snapshot) => {
        if (cancelled) return;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayIso = today.toISOString().split('T')[0];

        const normalized = snapshot.docs
          .map((docSnap) => normalizeOrganizerEvent({ id: docSnap.id, ...docSnap.data() }))
          .filter((event) => {
            const referenceDate = event.endDate || event.date;
            return referenceDate && referenceDate >= todayIso;
          })
          .sort((a, b) => (a.date > b.date ? 1 : a.date < b.date ? -1 : 0))
          .slice(0, ORGANIZER_EVENTS_LIMIT);

        setEvents(normalized);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('OrganizerEvents: failed to load events', err);
        setEvents([]);
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [organizerUid]);

  useEffect(() => {
    const node = sliderRef.current;
    if (!node) return;

    const updateArrows = () => {
      const { scrollLeft, scrollWidth, clientWidth } = node;
      setCanScrollLeft(scrollLeft > 1);
      setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 1);
    };

    updateArrows();
    node.addEventListener('scroll', updateArrows, { passive: true });
    window.addEventListener('resize', updateArrows);

    return () => {
      node.removeEventListener('scroll', updateArrows);
      window.removeEventListener('resize', updateArrows);
    };
  }, [events]);

  const scrollBy = (direction) => {
    const node = sliderRef.current;
    if (!node) return;
    const amount = node.clientWidth * SCROLL_STEP_FACTOR;
    node.scrollBy({ left: direction * amount, behavior: 'smooth' });
  };

  if (loading || events.length === 0) {
    return null;
  }

  const firstCategory = getPrimaryCategory(events[0]);
  const categoryColor = resolveEventColor(
    { category: firstCategory, categoryColor: events[0]?.categoryColor },
    colorByName
  );

  return (
    <section
      className="similar-events"
      data-testid="organizer-events"
      aria-label={`Weitere Events von ${organizerName || 'diesem Veranstalter'}`}
    >
      <div className="similar-events-header">
        <h2>Weitere Events dieses Veranstalters</h2>
        {firstCategory && (
          <span
            className="similar-events-category-badge"
            style={{ backgroundColor: categoryColor }}
            data-testid="organizer-events-category-badge"
          >
            {firstCategory}
          </span>
        )}
      </div>

      <div className="similar-events-slider-wrapper">
        <button
          type="button"
          className="similar-events-arrow similar-events-arrow--left"
          onClick={() => scrollBy(-1)}
          disabled={!canScrollLeft}
          aria-label="Vorherige Events"
          data-testid="organizer-events-prev"
        >
          <ChevronLeft size={20} />
        </button>

        <div
          className="similar-events-slider"
          ref={sliderRef}
          data-testid="organizer-events-slider"
        >
          {events.map((event) => (
            <div
              className="similar-events-slide"
              key={`${event.id}-${event.date}`}
              data-testid="organizer-event-card"
            >
              <EventCard
                event={event}
                categoryColor={categoryColor}
                onClick={() => window.scrollTo(0, 0)}
              />
            </div>
          ))}
        </div>

        <button
          type="button"
          className="similar-events-arrow similar-events-arrow--right"
          onClick={() => scrollBy(1)}
          disabled={!canScrollRight}
          aria-label="Nächste Events"
          data-testid="organizer-events-next"
        >
          <ChevronRight size={20} />
        </button>
      </div>
    </section>
  );
}
