import { useEffect, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../lib/firebase';

// Anonymous number of users who saved the event as favorite. The callable only
// answers the organizer and admins; for everyone else `enabled` stays false.
export function useEventFavoriteCount(eventId, enabled) {
  const [count, setCount] = useState(null);

  useEffect(() => {
    if (!enabled || !eventId) return undefined;
    let cancelled = false;
    httpsCallable(
      functions,
      'getEventFavoriteCount'
    )({ eventId })
      .then((result) => {
        if (!cancelled) setCount(result.data?.count ?? null);
      })
      .catch((err) => console.error('Loading favorite count failed:', err));
    return () => {
      cancelled = true;
    };
  }, [eventId, enabled]);

  return count;
}
