import { useEffect, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { STATIC_REGIONS, mergeRegions } from '../utils/regions';

// Loads `regions` once per page load and shares the result between all
// callers. Starts with the static register, so the UI never waits; a failed
// load or an empty collection simply keeps the static register.
// `refreshRegions()` loads them again (e.g. after a Super-Admin switched a
// region on or off in the "Regionen" tab) and updates every mounted caller.
let cached = null;
let inflight = null;
const listeners = new Set();

function load() {
  if (inflight) return inflight;
  inflight = getDocs(collection(db, 'regions'))
    .then((snap) => {
      cached = mergeRegions(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    })
    .catch(() => {
      // A failed refresh keeps what we already had.
      cached = cached ?? STATIC_REGIONS;
    })
    .then(() => listeners.forEach((fn) => fn(cached)));
  return inflight;
}

/** Reloads the regions from Firestore; resolves once every caller has them. */
export function refreshRegions() {
  inflight = null;
  return load();
}

export function useRegions() {
  const [regions, setRegions] = useState(cached ?? STATIC_REGIONS);
  const [loaded, setLoaded] = useState(cached !== null);
  useEffect(() => {
    const onLoaded = (next) => {
      setRegions(next);
      setLoaded(true);
    };
    listeners.add(onLoaded);
    if (cached) onLoaded(cached);
    else load();
    return () => listeners.delete(onLoaded);
  }, []);
  return { regions, loading: !loaded };
}

// Test helper.
export function _resetRegionsCache() {
  cached = null;
  inflight = null;
  listeners.clear();
}
