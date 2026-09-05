import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import EventCard from './EventCard';
import { CATEGORY_COLORS } from '../utils/categoryColors';
import { getPrimaryCategory } from '../utils/eventFormat';
import './SimilarEvents.css';

const SIMILAR_EVENTS_LIMIT = 5;
const SCROLL_STEP_FACTOR = 0.8;

function normalizeSimilarEvent(event) {
  const isOnline = Boolean(event.isOnline);
  const category =
    event.category || (Array.isArray(event.categories) ? event.categories[0] : null) || 'Sonstiges';
  return {
    ...event,
    category,
    bezirk: isOnline ? '' : event.bezirk || '',
    isOnline,
    status: event.status || 'approved',
    organizer: event.organizer || { firstName: '', lastName: '', email: '' },
    kontakt: event.kontakt || '',
  };
}

export default function SimilarEvents({ currentEvent }) {
  const category = currentEvent ? getPrimaryCategory(currentEvent) : null;
  const currentId = currentEvent?.id;
  const sliderRef = useRef(null);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  useEffect(() => {
    if (!category) {
      setEvents([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    const q = query(collection(db, 'events'), where('status', '==', 'approved'));

    getDocs(q)
      .then((snapshot) => {
        if (cancelled) return;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayIso = today.toISOString().split('T')[0];

        const normalized = snapshot.docs
          .map((docSnap) => normalizeSimilarEvent({ id: docSnap.id, ...docSnap.data() }))
          .filter((event) => event.category === category)
          .filter((event) => event.id !== currentId)
          .filter((event) => {
            const referenceDate = event.endDate || event.date;
            return referenceDate && referenceDate >= todayIso;
          })
          .sort((a, b) => (a.date > b.date ? 1 : a.date < b.date ? -1 : 0))
          .slice(0, SIMILAR_EVENTS_LIMIT);

        setEvents(normalized);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('SimilarEvents: failed to load events', err);
        setEvents([]);
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [category, currentId]);

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

  const categoryColor = CATEGORY_COLORS[category] || 'var(--text-light)';

  return (
    <section className="similar-events" data-testid="similar-events" aria-label="Ähnliche Events">
      <div className="similar-events-header">
        <h2>Ähnliche Events</h2>
        {category && (
          <span
            className="similar-events-category-badge"
            style={{ backgroundColor: categoryColor }}
            data-testid="similar-events-category-badge"
          >
            {category}
          </span>
        )}
      </div>

      <div className="similar-events-slider-wrapper">
        <button
          type="button"
          className="similar-events-arrow similar-events-arrow--left"
          onClick={() => scrollBy(-1)}
          disabled={!canScrollLeft}
          aria-label="Vorherige ähnliche Events"
          data-testid="similar-events-prev"
        >
          <ChevronLeft size={20} />
        </button>

        <div className="similar-events-slider" ref={sliderRef} data-testid="similar-events-slider">
          {events.map((event) => (
            <div
              className="similar-events-slide"
              key={`${event.id}-${event.date}`}
              data-testid="similar-event-card"
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
          aria-label="Nächste ähnliche Events"
          data-testid="similar-events-next"
        >
          <ChevronRight size={20} />
        </button>
      </div>
    </section>
  );
}
