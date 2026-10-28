import { useEffect, useState } from 'react';
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { db } from '../lib/firebase';

export const DESIGN_SESSIONS_COLLECTION = 'design_sessions';
export const HEARTBEAT_MS = 30_000;
// Two missed heartbeats: a closed tab or lost connection stops counting as "working".
export const STALE_MS = 90_000;

const toMillis = (ts) => ts?.toMillis?.() ?? Date.now();

/**
 * Announces that this admin is in the Design-Modus (one doc per admin, refreshed
 * every 30 s, removed on exit) and returns the other admins who are in it right
 * now, so they can coordinate before overwriting each other's publish.
 */
export function useDesignPresence(user) {
  const [others, setOthers] = useState([]);
  const uid = user?.uid;
  const name = user?.displayName || user?.email || 'Unbekannt';

  useEffect(() => {
    if (!uid) return undefined;
    const ref = doc(db, DESIGN_SESSIONS_COLLECTION, uid);
    const beat = () =>
      setDoc(ref, { uid, name, lastSeen: serverTimestamp() }).catch((err) =>
        console.error('useDesignPresence heartbeat error:', err)
      );
    beat();
    const timer = setInterval(beat, HEARTBEAT_MS);
    // Best effort: a hard close just ages out after STALE_MS.
    const leave = () => deleteDoc(ref).catch(() => {});
    window.addEventListener('pagehide', leave);
    return () => {
      clearInterval(timer);
      window.removeEventListener('pagehide', leave);
      leave();
    };
  }, [uid, name]);

  useEffect(() => {
    if (!uid) return undefined;
    let sessions = [];
    const recompute = () => {
      const now = Date.now();
      setOthers(
        sessions
          .filter((s) => s.uid !== uid && now - toMillis(s.lastSeen) < STALE_MS)
          .map((s) => s.name || 'Unbekannt')
      );
    };
    const unsub = onSnapshot(
      collection(db, DESIGN_SESSIONS_COLLECTION),
      (snap) => {
        sessions = snap.docs.map((d) => d.data());
        recompute();
      },
      (err) => console.error('useDesignPresence listen error:', err)
    );
    // Re-evaluate without a snapshot: a crashed tab never writes again.
    const tick = setInterval(recompute, HEARTBEAT_MS / 2);
    return () => {
      unsub();
      clearInterval(tick);
    };
  }, [uid]);

  return others;
}
