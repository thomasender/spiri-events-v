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
  CHAT_ROOM_ID,
  PRESENCE_BEAT_MS,
  PRESENCE_TICK_MS,
  chatAuthorName,
  chatPhotoUrl,
  onlineMembers,
} from '../utils/chat';

// Live list of the people who have the chat open right now. Pass `enabled`
// false (chat closed for this person) to skip the listener entirely.
export function useChatPresence(enabled) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(Boolean(enabled));
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!enabled) {
      setEntries([]);
      setLoading(false);
      return undefined;
    }
    return onSnapshot(
      collection(db, 'chat_rooms', CHAT_ROOM_ID, 'presence'),
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
  }, [enabled]);

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
// and visible. Errors are ignored on purpose: presence is a nicety.
export function useChatHeartbeat(active) {
  const { user } = useAuth();
  const { profile } = useProfile(user?.uid);
  const uid = user?.uid ?? null;
  const name = chatAuthorName(profile, user);
  const photoURL = chatPhotoUrl(profile?.photoURL || user?.photoURL);

  useEffect(() => {
    if (!active || !uid) return undefined;
    const ref = doc(db, 'chat_rooms', CHAT_ROOM_ID, 'presence', uid);
    const beat = () => {
      if (document.visibilityState === 'hidden') return;
      setDoc(ref, { displayName: name, photoURL, lastSeen: serverTimestamp() }).catch(() => {});
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') beat();
    };
    const leave = () => {
      deleteDoc(ref).catch(() => {});
    };
    beat();
    const timer = setInterval(beat, PRESENCE_BEAT_MS);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('pagehide', leave);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pagehide', leave);
      leave();
    };
  }, [active, uid, name, photoURL]);
}
