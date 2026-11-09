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
  LAGERFEUER_ROOM_ID,
  PRESENCE_BEAT_MS,
  PRESENCE_TICK_MS,
  chatAuthorName,
  chatPhotoUrl,
  onlineMembers,
} from '../utils/chat';

// Live list of the people who have the Lagerfeuer `roomId` open right now. Pass `enabled`
// false (chat closed for this person) or no room to skip the listener entirely.
export function useChatPresence(enabled, roomId = LAGERFEUER_ROOM_ID) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(Boolean(enabled));
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!enabled || !roomId) {
      setEntries([]);
      setLoading(false);
      return undefined;
    }
    return onSnapshot(
      collection(db, 'chat_rooms', roomId, 'presence'),
      (snap) => {
        setEntries(
          snap.docs.map((d) => {
            const data = d.data({ serverTimestamps: 'estimate' });
            return {
              uid: d.id,
              name: data.displayName || 'Gast',
              photoURL: data.photoURL ?? null,
              lastSeenMs: data.lastSeen?.toMillis ? data.lastSeen.toMillis() : null,
            };
          })
        );
        setNow(Date.now());
        setLoading(false);
      },
      () => {
        setEntries([]);
        setLoading(false);
      }
    );
  }, [enabled, roomId]);

  // Heartbeats that stop (closed tab) must drop out without a new snapshot.
  useEffect(() => {
    if (!enabled) return undefined;
    const timer = setInterval(() => setNow(Date.now()), PRESENCE_TICK_MS);
    return () => clearInterval(timer);
  }, [enabled]);

  const online = useMemo(() => onlineMembers(entries, now), [entries, now]);
  return { online, count: online.length, loading };
}

// Keeps the signed-in person listed as present while the chat page is open
// and visible, in the room shown (`roomId`). Errors are ignored on purpose: presence is a nicety.
export function useChatHeartbeat(active, roomId = LAGERFEUER_ROOM_ID) {
  const { user } = useAuth();
  const { profile } = useProfile(user?.uid);
  const uid = user?.uid ?? null;
  const name = chatAuthorName(profile, user);
  const photoURL = chatPhotoUrl(profile?.photoURL || user?.photoURL);

  useEffect(() => {
    if (!active || !uid || !roomId) return undefined;
    const ref = doc(db, 'chat_rooms', roomId, 'presence', uid);
    const beat = () => {
      if (document.visibilityState === 'hidden') return;
      setDoc(ref, { displayName: name, photoURL, lastSeen: serverTimestamp() }).catch(() => {});
    };
    const leave = () => {
      deleteDoc(ref).catch(() => {});
    };
    // Switching tab or app, locking the phone or closing the tab on mobile
    // (where `pagehide` often never fires) all hide the page first: leave
    // right away instead of staying listed until the heartbeat goes stale.
    const onVisibility = () => {
      if (document.visibilityState === 'visible') beat();
      else leave();
    };
    beat();
    const timer = setInterval(beat, PRESENCE_BEAT_MS);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', leave);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', leave);
      leave();
    };
  }, [active, uid, roomId, name, photoURL]);
}
