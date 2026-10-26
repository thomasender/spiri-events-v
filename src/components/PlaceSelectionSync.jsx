import { useEffect, useRef } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { useRegion } from '../hooks/useRegion';
import { normalizeSelection, reconcileSelections } from '../utils/placeSelection';

/**
 * Renders nothing. Keeps the remembered place + radius ("Wo bist du?") in step with the
 * profile of a signed-in user (`users/{uid}.placeSelection`): on sign-in the newer of browser
 * and profile wins, afterwards every change in this browser is written to the profile. Without
 * an account (or without a `users/{uid}` document yet) the choice stays in the browser only.
 * A failed read or write is ignored: the choice then simply stays local.
 */
export default function PlaceSelectionSync() {
  const { placeSelection, setPlaceSelection } = useRegion();
  const uidRef = useRef(null);
  const syncedAt = useRef(0);
  const latest = useRef(placeSelection);
  useEffect(() => {
    latest.current = placeSelection;
  }, [placeSelection]);

  useEffect(() => {
    let cancelled = false;
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      uidRef.current = null;
      if (!user) return;
      try {
        const ref = doc(db, 'users', user.uid);
        const snap = await getDoc(ref);
        if (cancelled || !snap.exists()) return;
        const remote = normalizeSelection(snap.data().placeSelection);
        const { selection, writeProfile, writeLocal } = reconcileSelections(latest.current, remote);
        if (writeLocal) setPlaceSelection(selection, { keepTime: true });
        if (writeProfile && selection) await updateDoc(ref, { placeSelection: selection });
        syncedAt.current = selection?.updatedAt ?? 0;
        uidRef.current = user.uid;
      } catch {
        // stays local
      }
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [setPlaceSelection]);

  useEffect(() => {
    const uid = uidRef.current;
    if (!uid || !placeSelection || placeSelection.updatedAt <= syncedAt.current) return;
    syncedAt.current = placeSelection.updatedAt;
    updateDoc(doc(db, 'users', uid), { placeSelection }).catch(() => {});
  }, [placeSelection]);

  return null;
}
