import { useEffect, useMemo, useState } from 'react';
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from './useAuth';
import { useProfile } from './useProfile';
import {
  ONLINE_BEAT_MS,
  ONLINE_TICK_MS,
  onlineStatusOf,
  onlineUidsFrom,
} from '../utils/onlineStatus';

// Who is online right now: the set of uids with a fresh heartbeat, plus
// `statusOf(uid, shares)` -> 'online' | 'offline' | null (null = no dot).
// Only verified members may read presence (rules), so for everyone else this
// stays empty and no dot is ever shown, not even a red one.
export function useOnlineStatus() {
  const { user } = useAuth();
  const viewerCanSee = Boolean(user?.emailVerified);
  const [entries, setEntries] = useState([]);
  const [ready, setReady] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!viewerCanSee) {
      setEntries([]);
      setReady(false);
      return undefined;
    }
    return onSnapshot(
      collection(db, 'presence'),
      (snap) => {
        setEntries(
          snap.docs.map((d) => {
            const data = d.data({ serverTimestamps: 'estimate' });
            return {
              uid: d.id,
              lastSeenMs: data.lastSeen?.toMillis ? data.lastSeen.toMillis() : null,
            };
          })
        );
        setNow(Date.now());
        setReady(true);
      },
      () => {
        setEntries([]);
        setReady(false);
      }
    );
  }, [viewerCanSee]);

  // Beats that stop (closed tab) must drop out without a new snapshot.
  useEffect(() => {
    if (!viewerCanSee) return undefined;
    const timer = setInterval(() => setNow(Date.now()), ONLINE_TICK_MS);
    return () => clearInterval(timer);
  }, [viewerCanSee]);

  const onlineUids = useMemo(() => onlineUidsFrom(entries, now), [entries, now]);
  const statusOf = (uid, shares) =>
    onlineStatusOf({ uid, shares, onlineUids, viewerCanSee: viewerCanSee && ready });
  return { onlineUids, statusOf, ready: viewerCanSee && ready };
}

// Sends the heartbeat for the signed-in person while they opted in. Mounted
// once in the app shell. Opting out, logging out and closing the tab remove
// the heartbeat; a hidden tab stops beating and drops offline after 2 minutes.
export function useOnlineBeacon() {
  const { user } = useAuth();
  const { profile } = useProfile(user?.uid);
  const uid = user?.uid ?? null;
  const shares = profile?.showOnlineStatus === true;

  useEffect(() => {
    if (!uid || !shares) return undefined;
    const ref = doc(db, 'presence', uid);
    const beat = () => {
      if (document.visibilityState === 'hidden') return;
      setDoc(ref, { lastSeen: serverTimestamp() }).catch(() => {});
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') beat();
    };
    const leave = () => {
      deleteDoc(ref).catch(() => {});
    };
    beat();
    const timer = setInterval(beat, ONLINE_BEAT_MS);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('pagehide', leave);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pagehide', leave);
      leave();
    };
  }, [uid, shares]);
}
