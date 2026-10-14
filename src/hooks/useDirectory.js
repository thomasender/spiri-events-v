import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { collectionGroup, doc, onSnapshot, query, updateDoc, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { isRenderableEntry, normalizeDirectoryEntry } from '../utils/directory';
import { buildDirectoryQueryPlan, queryPlanKey } from '../utils/regionQueries';
import { useRegion } from './useRegion';
import { useRegionMigrationComplete } from './useRegionMigrationMarker';

// Live list of every profile that opted into the directory. Reads the
// public `publicProfile` mirror (never the private user doc), so only
// public-safe fields reach this page. The dataset is small, so filtering and
// searching happen client-side (see utils/directory.js).
// `{ regionScoped: true }`: once the regionId migration is marked complete only
// the profiles listed in the current region (combined view: any active region)
// are loaded (`directoryRegionIds` array-contains / array-contains-any); before
// that every listed profile, as always. Callers keep filtering with
// useRegionDirectoryEntries.
export function useDirectory({ regionScoped = false } = {}) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { regionId, regions, isNational, loading: regionsLoading } = useRegion();
  // A failing region query (e.g. an index still building) falls back to the
  // full query for the rest of the page load.
  const [scopedFailed, setScopedFailed] = useState(false);
  const scoped = regionScoped && !scopedFailed;
  const markerComplete = useRegionMigrationComplete({ enabled: scoped });
  const activeKey = regions.map((r) => r.id).join(',');
  const waitForRegions = scoped && markerComplete === true && regionsLoading;
  const planKey = queryPlanKey(
    useMemo(
      () =>
        waitForRegions
          ? null
          : buildDirectoryQueryPlan({
              markerComplete: scoped ? markerComplete : false,
              regionId,
              isNational,
              activeRegionIds: activeKey ? activeKey.split(',') : [],
            }),
      [waitForRegions, scoped, markerComplete, regionId, isNational, activeKey]
    )
  );

  const lastModeRef = useRef(null);

  useEffect(() => {
    if (planKey === 'pending') return undefined;
    const { mode, constraints } = JSON.parse(planKey);
    // Another region's query: don't show the previous region's list meanwhile.
    if (lastModeRef.current !== null && lastModeRef.current !== 'all') {
      setLoading(true);
      setEntries([]);
    }
    lastModeRef.current = mode;
    if (!constraints) {
      setEntries([]);
      setLoading(false);
      return undefined;
    }
    const q = query(
      collectionGroup(db, 'publicProfile'),
      ...constraints.map(([field, op, value]) => where(field, op, value))
    );
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const next = snapshot.docs
          .map((docSnap) =>
            normalizeDirectoryEntry(docSnap.ref.parent.parent?.id || '', docSnap.data())
          )
          .filter(isRenderableEntry);
        setEntries(next);
        setError(null);
        setLoading(false);
      },
      (err) => {
        if (mode !== 'all') {
          console.warn('Directory region query failed, loading all listings instead:', err);
          setScopedFailed(true);
          return;
        }
        console.error('useDirectory error:', err);
        setError(err.message || 'Verzeichnis konnte nicht geladen werden.');
        setLoading(false);
      }
    );
    return unsubscribe;
  }, [planKey]);

  // Admin moderation: hide a listing from (or restore it to) the directory.
  // The profile itself stays reachable via its own URL.
  const setHidden = useCallback(async (uid, hidden) => {
    await updateDoc(doc(db, 'users', uid, 'publicProfile', 'data'), {
      directoryHidden: hidden === true,
    });
  }, []);

  return { entries, loading, error, setHidden };
}
