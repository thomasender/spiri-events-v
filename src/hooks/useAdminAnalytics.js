import { useCallback, useEffect, useState } from 'react';
import { callable } from '../lib/firebase';

// Admin-only GA4 report. The numbers come from a callable Cloud Function that
// re-checks the admin role and talks to the Google Analytics Data API itself.
export function useAdminAnalytics(days, region = null, enabled = true, host = null) {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(Boolean(enabled));
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await callable('adminAnalyticsReport')({
        days,
        ...(region ? { region } : {}),
        ...(host ? { host } : {}),
      });
      setReport(result.data ?? null);
    } catch (err) {
      console.error('Loading analytics failed:', err);
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [days, region, host]);

  useEffect(() => {
    if (enabled) load();
  }, [enabled, load]);

  return { report, loading, error, reload: load };
}
