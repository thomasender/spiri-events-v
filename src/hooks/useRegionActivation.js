import { useCallback, useEffect, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../lib/firebase';
import { refreshRegions } from './useRegions';

/**
 * Super-Admin only: activation status of every region (moderator and
 * upcoming event counts, computed on the server) and switching a region on
 * or off via the callables from functions/src/adminRegions.ts. The server
 * checks the role and the conditions again; after a change the shared
 * `useRegions` cache is reloaded so the whole page sees the new state.
 */
export function useRegionActivation(enabled) {
  const [statuses, setStatuses] = useState([]);
  const [minUpcomingEvents, setMinUpcomingEvents] = useState(15);
  const [loading, setLoading] = useState(Boolean(enabled));
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await httpsCallable(functions, 'adminListRegionActivation')();
      setStatuses(result.data?.regions ?? []);
      if (typeof result.data?.minUpcomingEvents === 'number') {
        setMinUpcomingEvents(result.data.minUpcomingEvents);
      }
    } catch (err) {
      console.error('Loading region status failed:', err);
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (enabled) load();
  }, [enabled, load]);

  const setActive = useCallback(
    async (regionId, active, override = false) => {
      const result = await httpsCallable(
        functions,
        'adminSetRegionActive'
      )({ regionId, active, override });
      await Promise.all([refreshRegions(), load()]);
      return result.data;
    },
    [load]
  );

  return { statuses, minUpcomingEvents, loading, error, reload: load, setActive };
}
