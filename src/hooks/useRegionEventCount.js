import { useEffect, useState } from 'react';
import { collection, getCountFromServer, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';

/**
 * Number of approved events of one region (null while loading or when the
 * count cannot be read). Public data, one aggregate read; used for the
 * progress bar on the coming-soon page.
 */
export function useRegionEventCount(regionId) {
  const [state, setState] = useState({ regionId: null, count: null });

  useEffect(() => {
    if (!regionId) return undefined;
    let cancelled = false;
    getCountFromServer(
      query(
        collection(db, 'events'),
        where('status', '==', 'approved'),
        where('regionId', '==', regionId)
      )
    )
      .then((snap) => {
        if (!cancelled) setState({ regionId, count: snap.data().count });
      })
      .catch(() => {
        if (!cancelled) setState({ regionId, count: null });
      });
    return () => {
      cancelled = true;
    };
  }, [regionId]);

  return state.regionId === regionId ? state.count : null;
}
