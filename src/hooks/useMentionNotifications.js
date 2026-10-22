import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../lib/firebase';

const SHOWN = 20;

function toMillis(value) {
  return value && typeof value.toMillis === 'function' ? value.toMillis() : null;
}

// The bell: the latest mentions of this person (`users/{uid}/mentions`, written by
// the Cloud Functions `onLagerfeuerMention`/`onKerzenraumMention`, never by a client) and how many are unread.
export function useMentionNotifications(uid, enabled = true) {
  const [items, setItems] = useState([]);

  useEffect(() => {
    if (!uid || !enabled) {
      setItems([]);
      return undefined;
    }
    const q = query(
      collection(db, 'users', uid, 'mentions'),
      orderBy('createdAt', 'desc'),
      limit(SHOWN)
    );
    return onSnapshot(
      q,
      (snapshot) =>
        setItems(
          snapshot.docs.map((d) => {
            const data = d.data();
            return {
              id: d.id,
              kind: data.kind === 'event' ? 'event' : 'lagerfeuer',
              eventId: data.eventId ?? null,
              eventSlug: data.eventSlug ?? '',
              eventTitle: data.eventTitle ?? '',
              messageId: data.messageId ?? d.id,
              fromName: data.fromName ?? '',
              excerpt: data.excerpt ?? '',
              read: data.read === true,
              createdAt: toMillis(data.createdAt),
            };
          })
        ),
      (err) => {
        console.warn('useMentionNotifications error:', err?.code || err);
        setItems([]);
      }
    );
  }, [uid, enabled]);

  const unreadCount = useMemo(() => items.filter((m) => !m.read).length, [items]);

  const markRead = useCallback(
    async (id) => {
      if (!uid) return;
      await updateDoc(doc(db, 'users', uid, 'mentions', id), { read: true });
    },
    [uid]
  );

  const markAllRead = useCallback(async () => {
    if (!uid) return;
    const unread = items.filter((m) => !m.read);
    if (unread.length === 0) return;
    const batch = writeBatch(db);
    unread.forEach((m) => batch.update(doc(db, 'users', uid, 'mentions', m.id), { read: true }));
    await batch.commit();
  }, [uid, items]);

  return { items, unreadCount, markRead, markAllRead };
}
