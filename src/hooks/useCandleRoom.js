import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from './useAuth';
import { useProfile } from './useProfile';
import { useChatSettings } from './useChatSettings';
import {
  chatAuthorName,
  chatPhotoUrl,
  cooldownRemainingMs,
  isUnsentMessage,
  validateChatText,
} from '../utils/chat';
import {
  CANDLE_ROOM_COLLECTION,
  CANDLE_ROOM_PAGE_SIZE,
  candleNewsIds,
  candleRoomActiveSince,
  canReadCandleRoom,
  readCandleRoomSeen,
} from '../utils/candleRoom';

function toMillis(value) {
  return value && typeof value.toMillis === 'function' ? value.toMillis() : null;
}

function isPermissionError(err) {
  return err?.code === 'permission-denied';
}

// Live messages of one event's Kerzenraum (newest page, oldest first) plus send
// and delete. Reading works without login (see firestore.rules); `enabled`
// is the feature flag as seen by the UI.
export function useCandleRoom(eventId, enabled) {
  const { user } = useAuth();
  const { profile } = useProfile(user?.uid);
  const uid = user?.uid ?? null;
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(Boolean(enabled));
  const [error, setError] = useState(null);
  const [sending, setSending] = useState(false);
  const [ban, setBan] = useState(null);
  const lastSentAt = useRef(0);

  useEffect(() => {
    if (!enabled || !eventId) {
      setMessages([]);
      setLoading(false);
      return undefined;
    }
    setLoading(true);
    const q = query(
      collection(db, CANDLE_ROOM_COLLECTION, eventId, 'messages'),
      orderBy('createdAt', 'desc'),
      limit(CANDLE_ROOM_PAGE_SIZE)
    );
    return onSnapshot(
      q,
      (snapshot) => {
        setMessages(
          snapshot.docs
            .map((d) => {
              const data = d.data({ serverTimestamps: 'estimate' });
              return {
                id: d.id,
                text: data.text ?? '',
                authorUid: data.authorUid ?? '',
                authorName: data.authorName ?? '',
                authorPhotoURL: data.authorPhotoURL ?? null,
                createdAt: toMillis(data.createdAt),
                reactions: {},
                pending: isUnsentMessage(d),
              };
            })
            .reverse()
        );
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.error('useCandleRoom error:', err);
        setError(err);
        setLoading(false);
      }
    );
  }, [eventId, enabled]);

  useEffect(() => {
    if (!uid || !enabled) {
      setBan(null);
      return undefined;
    }
    return onSnapshot(
      doc(db, 'chat_bans', uid),
      (snap) => setBan(snap.exists() ? snap.data() : null),
      () => setBan(null)
    );
  }, [uid, enabled]);

  const authorName = chatAuthorName(profile, user);
  const authorPhotoURL = chatPhotoUrl(profile?.photoURL || user?.photoURL);

  const send = useCallback(
    async (raw) => {
      if (!user) throw new Error('Bitte melde dich an.');
      const checked = validateChatText(raw);
      if (!checked.ok) throw new Error(checked.error);
      const wait = cooldownRemainingMs(lastSentAt.current);
      if (wait > 0) {
        throw new Error(`Bitte warte kurz (${Math.ceil(wait / 1000)} s), bevor du erneut sendest.`);
      }

      const attempt = async () => {
        // Message, cooldown marker and room summary go out together; the rules require all three.
        const batch = writeBatch(db);
        const ref = doc(collection(db, CANDLE_ROOM_COLLECTION, eventId, 'messages'));
        batch.set(ref, {
          text: checked.text,
          authorUid: user.uid,
          authorName,
          authorPhotoURL,
          createdAt: serverTimestamp(),
        });
        batch.set(doc(db, CANDLE_ROOM_COLLECTION, eventId, 'members', user.uid), {
          lastMessageAt: serverTimestamp(),
        });
        batch.set(doc(db, CANDLE_ROOM_COLLECTION, eventId), {
          lastMessageAt: serverTimestamp(),
          lastMessageId: ref.id,
        });
        await batch.commit();
      };

      setSending(true);
      try {
        try {
          await attempt();
        } catch (err) {
          if (!isPermissionError(err)) throw err;
          await user.getIdToken(true);
          await attempt();
        }
        lastSentAt.current = Date.now();
      } catch (err) {
        if (isPermissionError(err)) {
          throw new Error(
            'Senden nicht möglich. Bestätige deine E-Mail-Adresse oder warte einen Moment, falls du gerade schon etwas geschickt hast.'
          );
        }
        throw err;
      } finally {
        setSending(false);
      }
    },
    [user, authorName, authorPhotoURL, eventId]
  );

  const remove = useCallback(
    async (messageId) => {
      await deleteDoc(doc(db, CANDLE_ROOM_COLLECTION, eventId, 'messages', messageId));
    },
    [eventId]
  );

  return useMemo(
    () => ({ messages, loading, error, sending, ban, send, remove }),
    [messages, loading, error, sending, ban, send, remove]
  );
}

// One listener for the whole calendar: { [eventId]: lastMessageAtMs } of every
// room with a message in the last 10 days.
export function useCandleRoomActivity(enabled) {
  const [activity, setActivity] = useState({});

  useEffect(() => {
    if (!enabled) {
      setActivity({});
      return undefined;
    }
    const q = query(
      collection(db, CANDLE_ROOM_COLLECTION),
      where('lastMessageAt', '>', Timestamp.fromMillis(candleRoomActiveSince()))
    );
    return onSnapshot(
      q,
      (snap) => {
        const next = {};
        snap.docs.forEach((d) => {
          const at = toMillis(d.data().lastMessageAt);
          if (at) next[d.id] = at;
        });
        setActivity(next);
      },
      (err) => {
        console.error('useCandleRoomActivity error:', err);
        setActivity({});
      }
    );
  }, [enabled]);

  return activity;
}

// For the calendar cards: a Set of event ids whose Kerzenraum has messages
// this browser has not seen yet. Empty unless the chat flag lets this person read rooms.
export function useCandleRoomNews() {
  const { role } = useAuth();
  const { mode } = useChatSettings();
  const enabled = canReadCandleRoom({ mode, isAdmin: role === 'Admin' });
  const activity = useCandleRoomActivity(enabled);
  return useMemo(() => candleNewsIds(activity, readCandleRoomSeen), [activity]);
}
