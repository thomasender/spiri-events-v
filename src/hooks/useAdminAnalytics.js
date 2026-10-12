import { useCallback, useEffect, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../lib/firebase';

// Admin-only GA4 report. The numbers come from a callable Cloud Function that
// re-checks the admin role and talks to the Google Analytics Data API itself.
export function useAdminAnalytics(days, enabled = true) {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(Boolean(enabled));
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await httpsCallable(functions, 'adminAnalyticsReport')({ days });
      setReport(result.data ?? null);
    } catch (err) {
      console.error('Loading analytics failed:', err);
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    if (enabled) load();
  }, [enabled, load]);

  return { report, loading, error, reload: load };
}
