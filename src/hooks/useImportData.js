import { useEffect, useState } from 'react';
import {
  collection,
  getCountFromServer,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import {
  CANDIDATE_STATUSES,
  IMPORT_CANDIDATES,
  IMPORT_ORGANIZERS,
  IMPORT_OUTREACH,
  IMPORT_RUNS,
} from '../utils/eventImport';

// Live, bounded reads for the import tab (Super-Admin only, see firestore.rules).
function useLiveQuery(makeQuery, deps, enabled) {
  const [state, setState] = useState({ items: [], loading: Boolean(enabled), error: null });
  useEffect(() => {
    if (!enabled) {
      setState({ items: [], loading: false, error: null });
      return undefined;
    }
    setState((s) => ({ ...s, loading: true }));
    return onSnapshot(
      makeQuery(),
      (snap) =>
        setState({
          items: snap.docs.map((d) => ({ id: d.id, ...d.data() })),
          loading: false,
          error: null,
        }),
      (error) => {
        console.error('Import read failed:', error);
        setState({ items: [], loading: false, error });
      }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, ...deps]);
  return state;
}

/** Candidates of one region and status, newest first (index regionId+status+fetchedAt). */
export function useImportCandidates(regionId, status, enabled = true) {
  return useLiveQuery(
    () =>
      query(
        collection(db, IMPORT_CANDIDATES),
        where('regionId', '==', regionId),
        where('status', '==', status),
        orderBy('fetchedAt', 'desc'),
        limit(100)
      ),
    [regionId, status],
    enabled
  );
}

/** All candidates of a region (bounded), to count them per organizer. */
export function useRegionCandidates(regionId, enabled = true) {
  return useLiveQuery(
    () => query(collection(db, IMPORT_CANDIDATES), where('regionId', '==', regionId), limit(500)),
    [regionId],
    enabled
  );
}

/** Organizers of a region by name (index regionId+name). */
export function useImportOrganizers(regionId, enabled = true) {
  return useLiveQuery(
    () =>
      query(
        collection(db, IMPORT_ORGANIZERS),
        where('regionId', '==', regionId),
        orderBy('name'),
        limit(200)
      ),
    [regionId],
    enabled
  );
}

/** Last outreach entry (the log is one doc per mail). */
export function useLastOutreach(organizerId) {
  const { items } = useLiveQuery(
    () =>
      query(
        collection(db, IMPORT_ORGANIZERS, organizerId, IMPORT_OUTREACH),
        orderBy('sentAt', 'desc'),
        limit(1)
      ),
    [organizerId],
    true
  );
  return items[0] ?? null;
}

export function useImportRuns(enabled = true) {
  return useLiveQuery(
    () => query(collection(db, IMPORT_RUNS), orderBy('startedAt', 'desc'), limit(50)),
    [],
    enabled
  );
}

/** Candidate counts per status of a region; `refreshKey` reloads them. */
export function useCandidateCounts(regionId, refreshKey, enabled = true) {
  const [counts, setCounts] = useState({});
  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    Promise.all(
      CANDIDATE_STATUSES.map(async (status) => {
        const snap = await getCountFromServer(
          query(
            collection(db, IMPORT_CANDIDATES),
            where('regionId', '==', regionId),
            where('status', '==', status)
          )
        );
        return [status, snap.data().count];
      })
    )
      .then((entries) => {
        if (!cancelled) setCounts(Object.fromEntries(entries));
      })
      .catch((err) => console.warn('Import counts failed:', err));
    return () => {
      cancelled = true;
    };
  }, [enabled, regionId, refreshKey]);
  return counts;
}
