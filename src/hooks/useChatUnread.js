import { useEffect, useState } from 'react';
import { collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../lib/firebase';
import {
  LAGERFEUER_ROOM_ID,
  countUnreadChatMessages,
  markLagerfeuerSeen,
  readLagerfeuerSeen,
} from '../utils/chat';

// Enough to show "9+"; one listener on the newest messages only.
const UNREAD_WINDOW = 10;

// Number of messages by others in the Lagerfeuer `roomId` (the person's own; null = none)
// since this person last had it open (per browser and room, localStorage). While `chatOpen`
// (that room is on screen) they count as seen.
export function useChatUnread(enabled, uid, chatOpen, roomId = LAGERFEUER_ROOM_ID) {
  const [messages, setMessages] = useState([]);
  const [seen, setSeen] = useState(0);

  useEffect(() => {
    if (!enabled || !uid || !roomId) {
      setMessages([]);
      return undefined;
    }
    // First time on this browser: start counting from now, not from history.
    if (!readLagerfeuerSeen(uid, roomId)) markLagerfeuerSeen(uid, Date.now(), roomId);
    setSeen(readLagerfeuerSeen(uid, roomId));
    const q = query(
      collection(db, 'chat_rooms', roomId, 'messages'),
      orderBy('createdAt', 'desc'),
      limit(UNREAD_WINDOW)
    );
    return onSnapshot(
      q,
      (snap) =>
        setMessages(
          snap.docs.map((d) => {
            const data = d.data({ serverTimestamps: 'estimate' });
            return {
              authorUid: data.authorUid ?? '',
              createdAt: data.createdAt?.toMillis ? data.createdAt.toMillis() : null,
            };
          })
        ),
      () => setMessages([])
    );
  }, [enabled, uid, roomId]);

  useEffect(() => {
    if (!chatOpen || !uid || !roomId) return;
    const newest = messages.reduce((max, m) => Math.max(max, m.createdAt ?? 0), 0);
    const at = Math.max(newest, Date.now());
    markLagerfeuerSeen(uid, at, roomId);
    setSeen(at);
  }, [chatOpen, uid, roomId, messages]);

  return { count: enabled && uid && roomId ? countUnreadChatMessages(messages, seen, uid) : 0 };
}
