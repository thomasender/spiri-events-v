import { useCallback, useSyncExternalStore } from 'react';
import { getSnapshot, setFavorite, subscribe } from '../lib/favoritesStore';

export function useFavorites() {
  const { ready, uid, ids } = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const isFavorite = useCallback((eventId) => ids.has(eventId), [ids]);
  const toggleFavorite = useCallback(
    (eventId) => setFavorite(eventId, !getSnapshot().ids.has(eventId)),
    []
  );

  return { ready, isSignedIn: !!uid, favoriteIds: ids, isFavorite, toggleFavorite };
}
