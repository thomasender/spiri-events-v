import { useEffect, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { STATIC_REGIONS, mergeRegions } from '../utils/regions';

// Loads `regions` once per page load and shares the result between all
// callers. Starts with the static register, so the UI never waits; a failed
// load or an empty collection simply keeps the static register.
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
      cached = STATIC_REGIONS;
    })
    .then(() => listeners.forEach((fn) => fn(cached)));
  return inflight;
}

export function useRegions() {
  const [regions, setRegions] = useState(cached ?? STATIC_REGIONS);
  useEffect(() => {
    if (cached) {
      setRegions(cached);
      return undefined;
    }
    listeners.add(setRegions);
    load();
    return () => listeners.delete(setRegions);
  }, []);
  return { regions, loading: cached === null };
}

// Test helper.
export function _resetRegionsCache() {
  cached = null;
  inflight = null;
  listeners.clear();
}
