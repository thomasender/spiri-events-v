import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Heart } from 'lucide-react';
import SeoMeta from '../components/SeoMeta';
import EventCard from '../components/EventCard';
import { useAllEvents } from '../hooks/useEvents';
import { useRegionEvents } from '../hooks/useRegion';
import { useFavorites } from '../hooks/useFavorites';
import { useCategoryRegistry } from '../hooks/useCategoryRegistry';
import { resolveEventColor } from '../utils/categoryColors';
import { getPrimaryCategory } from '../utils/eventFormat';
import { buildFavoriteEvents } from '../utils/favoriteEvents';
import '../components/EventsSection.css';
import './FavoritesPage.css';

export default function FavoritesPage() {
  const { ready, isSignedIn, favoriteIds } = useFavorites();
  const { events: allEvents, loading } = useAllEvents({ regionScoped: true, allActive: true });
  // Favourites of every active region; events of inactive regions stay hidden.
  const events = useRegionEvents(allEvents, { allActive: true });
  const { colorByName } = useCategoryRegistry();
  const favoriteEvents = useMemo(
    () => buildFavoriteEvents(events, favoriteIds),
    [events, favoriteIds]
  );

  let body;
  if (!ready || loading) {
    body = <div className="loading-spinner"></div>;
  } else if (!isSignedIn) {
    body = (
      <div className="favorites-empty" data-testid="favorites-login-hint">
        <p>Melde dich an, um deine Lieblings-Events zu speichern und hier wiederzufinden.</p>
        <Link to="/login" state={{ from: '/favoriten' }} className="btn btn-primary">
          Anmelden oder registrieren
        </Link>
      </div>
    );
  } else if (favoriteEvents.length === 0) {
    body = (
      <div className="favorites-empty" data-testid="favorites-empty">
        <p>
          Du hast noch keine Favoriten. Tippe im Kalender auf das Herz bei einem Event, um es hier
          zu speichern.
        </p>
        <Link to="/" className="btn btn-primary">
          Zum Kalender
        </Link>
      </div>
    );
  } else {
    body = (
      <div className="events-section-grid" data-testid="favorites-grid">
        {favoriteEvents.map((event) => (
          <EventCard
            key={event.id}
            event={event}
            categoryColor={resolveEventColor(
              { ...event, category: getPrimaryCategory(event) },
              colorByName
            )}
          />
        ))}
      </div>
    );
  }

  return (
    <>
      <SeoMeta title="Meine Favoriten" path="/favoriten" noindex />
      <div className="page-container favorites-page" data-testid="favorites-page">
        <header className="favorites-header">
          <Heart size={28} className="favorites-icon" aria-hidden="true" />
          <h1>Meine Favoriten</h1>
        </header>
        {body}
      </div>
    </>
  );
}
