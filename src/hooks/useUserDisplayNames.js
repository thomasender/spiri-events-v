import { useEffect, useState, useMemo } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';

const PUBLIC_PROFILE_DOC_ID = 'data';

// Resolves a list of user UIDs to display names via their public profile
// subdoc (`users/{uid}/publicProfile/data.displayName`). Returns a stable map
// `{ [uid]: displayName }`; UIDs without a profile resolve to null.
//
// We subscribe per-UID (instead of issuing one big collectionGroup query)
// because:
//   - the Review tab only ever resolves a handful of admins at a time
//     (each pending event's approver + the first reviewer in the message
//     thread), so N+1 snapshots is cheap;
//   - `displayName` is on the public profile subdoc, not on the admin doc,
//     and the security rules only let the owner read the parent `users`
//     doc — so a single query against the parent collection would fail
//     with "Missing or insufficient permissions" for admins.
export function useUserDisplayNames(uids) {
  const uniqueUids = useMemo(() => {
    const set = new Set((uids || []).filter((u) => typeof u === 'string' && u.length > 0));
    return Array.from(set);
  }, [uids]);

  const [namesByUid, setNamesByUid] = useState({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (uniqueUids.length === 0) {
      setNamesByUid({});
      setLoading(false);
      return undefined;
    }

    setLoading(true);
    const current = {};
    const unsubs = uniqueUids.map((uid) => {
      const ref = doc(db, 'users', uid, 'publicProfile', PUBLIC_PROFILE_DOC_ID);
      return onSnapshot(
        ref,
        (snap) => {
          current[uid] = snap.exists() ? snap.data().displayName || null : null;
          setNamesByUid({ ...current });
        },
        () => {
          current[uid] = null;
          setNamesByUid({ ...current });
        }
      );
    });

    // Mark loading false on the next tick — Firestore resolves each subscription
    // independently and we want the UI to react to the first wave of names
    // rather than blocking until every uid (or its absence) has answered.
    const handle = setTimeout(() => setLoading(false), 50);

    return () => {
      unsubs.forEach((u) => {
        try {
          u();
        } catch {
          // ignore
        }
      });
      clearTimeout(handle);
    };
  }, [uniqueUids]);

  return { namesByUid, loading };
}