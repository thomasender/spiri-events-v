import { useEffect, useMemo, useState } from 'react';
import { collection, getCountFromServer, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useRegion } from './useRegion';

const CACHE_KEY = 'tribe:largestRegion';
const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

// The count changes slowly: one aggregate read per open region per day is enough.
function readCache(key, now = Date.now()) {
  try {
    const c = JSON.parse(window.localStorage.getItem(CACHE_KEY) ?? 'null');
    if (c && c.key === key && now - c.at < CACHE_MAX_AGE_MS && now >= c.at && c.regionId) {
      return { regionId: c.regionId, count: c.count };
    }
  } catch {
    // ignore: no cache, the counts are read again
  }
  return null;
}

function writeCache(key, best, now = Date.now()) {
  try {
    window.localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ key, at: now, regionId: best.region.id, count: best.count })
    );
  } catch {
    // ignore: the cache is a convenience only
  }
}

/**
 * The open region with the most approved events: `{ region, count }`, or null
 * while loading or when no count can be read. Public data, one aggregate read
 * per open region, cached in the browser for a day; used for the "Andere
 * Regionen erkunden" link.
 */
export function useLargestRegion() {
  const { regions } = useRegion();
  const key = useMemo(() => regions.map((r) => r.id).join(','), [regions]);
  const [result, setResult] = useState({ key: null, best: null });

  useEffect(() => {
    let cancelled = false;
    const cached = readCache(key);
    const cachedRegion = cached && regions.find((r) => r.id === cached.regionId);
    if (cachedRegion) {
      setResult({ key, best: { region: cachedRegion, count: cached.count } });
      return undefined;
    }
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
      if (best) writeCache(key, best);
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
