import { useCallback, useEffect, useState } from 'react';
import { collectionGroup, doc, onSnapshot, query, updateDoc, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { isRenderableEntry, normalizeDirectoryEntry } from '../utils/directory';

// Live list of every profile that opted into the directory. Reads the
// public `publicProfile` mirror (never the private user doc), so only
// public-safe fields reach this page. The dataset is small, so filtering and
// searching happen client-side (see utils/directory.js).
export function useDirectory() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const q = query(collectionGroup(db, 'publicProfile'), where('listedInDirectory', '==', true));
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
        console.error('useDirectory error:', err);
        setError(err.message || 'Verzeichnis konnte nicht geladen werden.');
        setLoading(false);
      }
    );
    return unsubscribe;
  }, []);

  // Admin moderation: hide a listing from (or restore it to) the directory.
  // The profile itself stays reachable via its own URL.
  const setHidden = useCallback(async (uid, hidden) => {
    await updateDoc(doc(db, 'users', uid, 'publicProfile', 'data'), {
      directoryHidden: hidden === true,
    });
  }, []);

  return { entries, loading, error, setHidden };
}
