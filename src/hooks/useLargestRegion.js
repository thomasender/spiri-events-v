import { useEffect, useMemo, useState } from 'react';
import { collection, getCountFromServer, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useRegion } from './useRegion';

/**
 * The open region with the most approved events: `{ region, count }`, or null
 * while loading or when no count can be read. Public data, one aggregate read
 * per open region; used for the "Andere Regionen erkunden" link.
 */
export function useLargestRegion() {
  const { regions } = useRegion();
  const key = useMemo(() => regions.map((r) => r.id).join(','), [regions]);
  const [result, setResult] = useState({ key: null, best: null });

  useEffect(() => {
    let cancelled = false;
    Promise.all(
      regions.map((region) =>
        getCountFromServer(
          query(
            collection(db, 'events'),
            where('status', '==', 'approved'),
            where('regionId', '==', region.id)
          )
        )
          .then((snap) => ({ region, count: snap.data().count }))
          .catch(() => null)
      )
    ).then((counts) => {
      if (cancelled) return;
      const best = counts
        .filter(Boolean)
        .reduce((top, c) => (!top || c.count > top.count ? c : top), null);
      setResult({ key, best });
    });
    return () => {
      cancelled = true;
    };
    // `key` stands for the list of open regions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return result.key === key ? result.best : null;
}
