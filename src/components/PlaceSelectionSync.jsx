import { useEffect, useRef } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { useRegion } from '../hooks/useRegion';
import { normalizeSelection, reconcileSelections } from '../utils/placeSelection';

/**
 * Renders nothing. Keeps the remembered place + radius ("Wo bist du?") in step with the
 * profile of a signed-in user (`users/{uid}.placeSelection`): on sign-in the newer of browser
 * and profile wins, afterwards every change in this browser is written to the profile. Without
 * an account the choice stays in the browser only; a new account's `users/{uid}` document is
 * waited for (it is created right after sign-up).
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
    let stopWaiting = null;
    const stop = () => {
      stopWaiting?.();
      stopWaiting = null;
    };
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      stop();
      uidRef.current = null;
      if (!user) return;
      const ref = doc(db, 'users', user.uid);
      let done = false;
      // A brand-new account has no `users/{uid}` doc yet when it signs in (registration
      // creates it right after): wait for it, so the place chosen before registering reaches
      // the profile and follows the person to other browsers (NK7os0Tf).
      const reconcile = async (snap) => {
        if (done || cancelled || !snap.exists()) return;
        done = true;
        stop();
        try {
          const remote = normalizeSelection(snap.data().placeSelection);
          const { selection, writeProfile, writeLocal } = reconcileSelections(
            latest.current,
            remote
          );
          if (writeLocal) setPlaceSelection(selection, { keepTime: true });
          if (writeProfile && selection) await updateDoc(ref, { placeSelection: selection });
          syncedAt.current = selection?.updatedAt ?? 0;
          if (!cancelled) uidRef.current = user.uid;
        } catch {
          // stays local
        }
      };
      try {
        stopWaiting = onSnapshot(ref, reconcile, () => stop());
      } catch {
        // stays local
      }
    });
    return () => {
      cancelled = true;
      stop();
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
