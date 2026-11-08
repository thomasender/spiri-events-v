import { useCallback, useEffect, useRef, useState } from 'react';
import { callable } from '../lib/firebase';

// Admin-only GA4 report. The numbers come from a callable Cloud Function that
// re-checks the admin role and talks to the Google Analytics Data API itself.
// `reload()` asks the function to skip its 10-minute cache, so "Aktualisieren"
// really fetches fresh numbers. Only the answer to the latest request is shown:
// switching the range or filter while a slower request is still running must
// not let that older answer overwrite the new one.
export function useAdminAnalytics(days, region = null, enabled = true, host = null) {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(Boolean(enabled));
  const [error, setError] = useState(null);
  const latest = useRef(0);

  const load = useCallback(
    async (refresh = false) => {
      const id = ++latest.current;
      setLoading(true);
      setError(null);
      try {
        const result = await callable('adminAnalyticsReport')({
          days,
          ...(region ? { region } : {}),
          ...(host ? { host } : {}),
          ...(refresh ? { refresh: true } : {}),
        });
        if (id === latest.current) setReport(result.data ?? null);
      } catch (err) {
        console.error('Loading analytics failed:', err);
        if (id === latest.current) setError(err);
      } finally {
        if (id === latest.current) setLoading(false);
      }
    },
    [days, region, host]
  );

  useEffect(() => {
    if (enabled) load();
  }, [enabled, load]);

  const reload = useCallback(() => load(true), [load]);

  return { report, loading, error, reload };
}
