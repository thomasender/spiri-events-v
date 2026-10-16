import { useCallback, useEffect, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../lib/firebase';

/**
 * Super-Admin only: current Regions-Moderator:innen and changing them via the
 * callables from functions/src/adminModerators.ts (they re-check the role and
 * write an audit log entry). `setRegions(uid, [])` revokes the role.
 */
export function useRegionModerators(enabled) {
  const [moderators, setModerators] = useState([]);
  const [loading, setLoading] = useState(Boolean(enabled));
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await httpsCallable(functions, 'adminListRegionModerators')();
      setModerators(result.data?.moderators ?? []);
    } catch (err) {
      console.error('Loading moderators failed:', err);
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (enabled) load();
  }, [enabled, load]);

  const setRegions = useCallback(
    async (uid, regionIds) => {
      const result = await httpsCallable(functions, 'adminSetRegionModerator')({ uid, regionIds });
      await load();
      return result.data;
    },
    [load]
  );

  return { moderators, loading, error, reload: load, setRegions };
}
