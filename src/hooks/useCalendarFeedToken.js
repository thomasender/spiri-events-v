import { useCallback, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../lib/firebase';

// The calendar export (.ics download and subscription) is for signed-in users.
// Calendar apps cannot send a login, so the URLs carry a personal secret token
// that the callable getCalendarFeedToken issues (functions/src/calendarFeedToken.ts).

/** data: {} returns (and on first use creates) the token, { regenerate: true } replaces it. */
export async function requestCalendarFeedToken(data = {}) {
  const result = await httpsCallable(functions, 'getCalendarFeedToken')(data);
  const token = result?.data?.token;
  if (typeof token !== 'string' || !token) throw new Error('No calendar token');
  return token;
}

/** Starts the .ics download (the server answers with Content-Disposition: attachment). */
export function startCalendarDownload(url) {
  window.location.assign(url);
}

/** Deletes the token, so every calendar link of the user stops working (account deletion). */
export async function revokeCalendarFeedToken() {
  await httpsCallable(functions, 'getCalendarFeedToken')({ revoke: true });
}

// The token is only requested on demand (load / regenerate), never on mount,
// and is remembered per uid so a change of user never shows a stale token.
export function useCalendarFeedToken(uid) {
  const [state, setState] = useState({ uid: null, token: null, loading: false, error: null });
  const current = state.uid === uid ? state : { token: null, loading: false, error: null };

  const run = useCallback(
    async (data) => {
      if (!uid) return null;
      setState((prev) => ({
        uid,
        token: prev.uid === uid ? prev.token : null,
        loading: true,
        error: null,
      }));
      try {
        const token = await requestCalendarFeedToken(data);
        setState({ uid, token, loading: false, error: null });
        return token;
      } catch (error) {
        setState((prev) => ({ ...prev, uid, loading: false, error }));
        return null;
      }
    },
    [uid]
  );

  const load = useCallback(() => run({}), [run]);
  const regenerate = useCallback(() => run({ regenerate: true }), [run]);

  return {
    token: uid ? current.token : null,
    loading: uid ? current.loading : false,
    error: uid ? current.error : null,
    load,
    regenerate,
  };
}
