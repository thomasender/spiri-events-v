import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Heart } from 'lucide-react';
import { useFavorites } from '../hooks/useFavorites';
import { EVENTS, trackEvent } from '../lib/analytics';
import { setPendingFavorite } from '../lib/favoritesStore';
import LoginPromptModal from './LoginPromptModal';
import './FavoriteButton.css';

// Heart toggle for an event series. Lives inside <Link> cards, so it must not
// trigger the link. Signed-out visitors get a login prompt instead.
export default function FavoriteButton({ eventId, className = '' }) {
  const { ready, isSignedIn, isFavorite, toggleFavorite } = useFavorites();
  const location = useLocation();
  const [promptOpen, setPromptOpen] = useState(false);
  const active = isSignedIn && isFavorite(eventId);

  const handleClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!ready) return;
    if (!isSignedIn) {
      setPromptOpen(true);
      return;
    }
    const adding = !active;
    toggleFavorite(eventId)
      .then(() =>
        trackEvent(adding ? EVENTS.FAVORITE_ADD : EVENTS.FAVORITE_REMOVE, { item_id: eventId })
      )
      .catch(() => {});
  };

  return (
    <>
      <button
        type="button"
        className={`favorite-button${active ? ' favorite-button--active' : ''} ${className}`.trim()}
        onClick={handleClick}
        aria-pressed={active}
        aria-label={active ? 'Aus Favoriten entfernen' : 'Zu Favoriten hinzufügen'}
        title={active ? 'Aus Favoriten entfernen' : 'Zu Favoriten hinzufügen'}
        data-testid="favorite-button"
      >
        <Heart size={18} aria-hidden="true" fill={active ? 'currentColor' : 'none'} />
      </button>
      <LoginPromptModal
        open={promptOpen}
        onClose={() => setPromptOpen(false)}
        returnTo={`${location.pathname}${location.search}${location.hash}`}
        onLogin={() => {
          setPendingFavorite(eventId);
          setPromptOpen(false);
        }}
      />
    </>
  );
}
