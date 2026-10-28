import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { getEventQueries } from '../lib/staffEventQueries';
import EventCard from './EventCard';
import { resolveEventColor } from '../utils/categoryColors';
import { useCategoryRegistry } from '../hooks/useCategoryRegistry';
import { getPrimaryCategory } from '../utils/eventFormat';
import { filterEventsForRegion, resolveRegionId } from '../utils/regions';
import { useRegion } from '../hooks/useRegion';
import { useRegionMigrationComplete } from '../hooks/useRegionMigrationMarker';
import { buildPublicEventQueryPlan, queryPlanKey } from '../utils/regionQueries';
import { usePublicEvents } from '../hooks/useEvents';
import {
  filterOnlineEventsForRegions,
  onlineEligibilityEnabled,
} from '../utils/onlineEventEligibility';
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
    regionId: resolveRegionId(event),
    status: event.status || 'approved',
    organizer: event.organizer || { name: '', email: '' },
    kontakt: event.kontakt || '',
    registration: event.registration || '',
  };
}

export default function SimilarEvents({ currentEvent }) {
  const category = currentEvent ? getPrimaryCategory(currentEvent) : null;
  const currentId = currentEvent?.id;
  const currentBezirk = currentEvent?.isOnline ? '' : currentEvent?.bezirk || '';
  const hasCurrentBezirk = Boolean(currentBezirk);
  const { colorByName } = useCategoryRegistry();
  const { regions } = useRegion();
  const activeKey = regions.map((r) => r.id).join(',');
  const currentRegionId = currentEvent ? resolveRegionId(currentEvent) : null;
  // Only the shown event's region (+ online events) once the regionId
  // migration is marked complete; before that every approved event. The
  // region comes from the event, so there is no need to wait for the register.
  const markerComplete = useRegionMigrationComplete();
  const planKey = queryPlanKey(
    buildPublicEventQueryPlan({ markerComplete, regionId: currentRegionId })
  );
  const sliderRef = useRef(null);
  const [candidates, setCandidates] = useState([]);
  const [loading, setLoading] = useState(true);
  // Two or more active regions: online events only where their organiser is
  // listed. Their `onlineRegionIds` come from the cached public list (this
  // component reads Firestore directly, which has no such field).
  const anchorOnline = onlineEligibilityEnabled(regions.length);
  const { events: publicList } = usePublicEvents({ enabled: anchorOnline });
  const events = useMemo(() => {
    if (!anchorOnline) return candidates.slice(0, SIMILAR_EVENTS_LIMIT);
    const byId = new Map(
      publicList.filter((e) => Array.isArray(e.onlineRegionIds)).map((e) => [e.id, e])
    );
    const annotated = candidates.map((e) =>
      byId.has(e.id) ? { ...e, onlineRegionIds: byId.get(e.id).onlineRegionIds } : e
    );
    return filterOnlineEventsForRegions(annotated, [currentRegionId]).slice(
      0,
      SIMILAR_EVENTS_LIMIT
    );
  }, [anchorOnline, candidates, publicList, currentRegionId]);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  useEffect(() => {
    if (!category) {
      setCandidates([]);
      setLoading(false);
      return;
    }
    if (planKey === 'pending') return;

    let cancelled = false;
    setLoading(true);

    getEventQueries(JSON.parse(planKey).queries)
      .then((docs) => {
        if (cancelled) return;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayIso = today.toISOString().split('T')[0];

        // Same region as the shown event (plus online events); never inactive regions.
        const inRegion = filterEventsForRegion(docs.map(normalizeSimilarEvent), {
          regionId: currentRegionId,
          activeRegionIds: activeKey ? activeKey.split(',') : [],
        });
        const normalized = inRegion
          .filter((event) => event.category === category)
          .filter((event) => event.id !== currentId)
          .filter((event) => {
            const referenceDate = event.endDate || event.date;
            return referenceDate && referenceDate >= todayIso;
          })
          .sort((a, b) => {
            if (hasCurrentBezirk) {
              const aSame = a.bezirk === currentBezirk ? 1 : 0;
              const bSame = b.bezirk === currentBezirk ? 1 : 0;
              if (aSame !== bSame) return bSame - aSame;
            }
            return a.date > b.date ? 1 : a.date < b.date ? -1 : 0;
          });

        setCandidates(normalized);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('SimilarEvents: failed to load events', err);
        setCandidates([]);
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [category, currentId, currentBezirk, hasCurrentBezirk, currentRegionId, activeKey, planKey]);

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

  const categoryColor = resolveEventColor(
    { category, categoryColor: currentEvent?.categoryColor },
    colorByName
  );

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
