import { useEffect, useState } from 'react';
import { collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../lib/firebase';
import {
  CHAT_ROOM_ID,
  countUnreadChatMessages,
  markLagerfeuerSeen,
  readLagerfeuerSeen,
} from '../utils/chat';

// Enough to show "9+"; one listener on the newest messages only.
const UNREAD_WINDOW = 10;

// Number of Lagerfeuer messages by others since this person last had the chat
// open (per browser, localStorage). While `chatOpen` they count as seen.
export function useChatUnread(enabled, uid, chatOpen) {
  const [messages, setMessages] = useState([]);
  const [seen, setSeen] = useState(0);

  useEffect(() => {
    if (!enabled || !uid) {
      setMessages([]);
      return undefined;
    }
    // First time on this browser: start counting from now, not from history.
    if (!readLagerfeuerSeen(uid)) markLagerfeuerSeen(uid, Date.now());
    setSeen(readLagerfeuerSeen(uid));
    const q = query(
      collection(db, 'chat_rooms', CHAT_ROOM_ID, 'messages'),
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
  }, [enabled, uid]);

  useEffect(() => {
    if (!chatOpen || !uid) return;
    const newest = messages.reduce((max, m) => Math.max(max, m.createdAt ?? 0), 0);
    const at = Math.max(newest, Date.now());
    markLagerfeuerSeen(uid, at);
    setSeen(at);
  }, [chatOpen, uid, messages]);

  return { count: enabled && uid ? countUnreadChatMessages(messages, seen, uid) : 0 };
}
