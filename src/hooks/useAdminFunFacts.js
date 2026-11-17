import { useCallback, useEffect, useRef, useState } from 'react';
import { callable } from '../lib/firebase';

// Super-Admin tab "Fun Facts". The numbers come from the callable adminFunFacts,
// which re-checks the role, keeps the result for 6 hours (app_stats/fun_facts)
// and recomputes on `force` ("Aktualisieren", at most once a minute). Only the
// answer to the latest request is shown.
export function useAdminFunFacts(enabled = true) {
  const [facts, setFacts] = useState(null);
  const [loading, setLoading] = useState(Boolean(enabled));
  const [error, setError] = useState(null);
  const latest = useRef(0);

  const load = useCallback(async (force = false) => {
    const id = ++latest.current;
    setLoading(true);
    setError(null);
    try {
      const result = await callable('adminFunFacts')(force ? { force: true } : {});
      if (id === latest.current) setFacts(result.data ?? null);
    } catch (err) {
      console.error('Loading fun facts failed:', err);
      if (id === latest.current) setError(err);
    } finally {
      if (id === latest.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (enabled) load();
  }, [enabled, load]);

  const refresh = useCallback(() => load(true), [load]);

  return { facts, loading, error, refresh };
}
