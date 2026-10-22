import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FieldPath,
  collection,
  deleteDoc,
  deleteField,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from './useAuth';
import { useProfile } from './useProfile';
import {
  CHAT_MAX_LOADED,
  CHAT_PAGE_SIZE,
  CHAT_ROOM_ID,
  chatAuthorName,
  chatPhotoUrl,
  cooldownRemainingMs,
  validateChatText,
} from '../utils/chat';
import { sanitizeReactions } from '../utils/reactions';

const messagesPath = ['chat_rooms', CHAT_ROOM_ID, 'messages'];

function toMillis(value) {
  return value && typeof value.toMillis === 'function' ? value.toMillis() : null;
}

function isPermissionError(err) {
  return err?.code === 'permission-denied';
}

// Live messages of the chat room (newest `limit`, oldest first) plus send,
// delete and report. The rules are the real gate; see firestore.rules.
export function useChat() {
  const { user } = useAuth();
  const { profile } = useProfile(user?.uid);
  const uid = user?.uid ?? null;
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sending, setSending] = useState(false);
  const [windowSize, setWindowSize] = useState(CHAT_PAGE_SIZE);
  const [ban, setBan] = useState(null);
  const lastSentAt = useRef(0);

  useEffect(() => {
    if (!uid) {
      setMessages([]);
      setLoading(false);
      return undefined;
    }
    const q = query(
      collection(db, ...messagesPath),
      orderBy('createdAt', 'desc'),
      limit(windowSize)
    );
    return onSnapshot(
      q,
      (snapshot) => {
        const items = snapshot.docs
          .map((d) => {
            // `estimate` shows a just-sent message right away, before the
            // server has stamped it.
            const data = d.data({ serverTimestamps: 'estimate' });
            return {
              id: d.id,
              text: data.text ?? '',
              authorUid: data.authorUid ?? '',
              authorName: data.authorName ?? '',
              authorPhotoURL: data.authorPhotoURL ?? null,
              createdAt: toMillis(data.createdAt),
              reactions: sanitizeReactions(data.reactions),
              pending: d.metadata.hasPendingWrites,
            };
          })
          .reverse();
        setMessages(items);
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.error('useChat error:', err);
        setError(err);
        setLoading(false);
      }
    );
  }, [uid, windowSize]);

  // Own mute/ban entry, so the input can explain why sending is blocked.
  useEffect(() => {
    if (!uid) {
      setBan(null);
      return undefined;
    }
    return onSnapshot(
      doc(db, 'chat_bans', uid),
      (snap) => setBan(snap.exists() ? snap.data() : null),
      () => setBan(null)
    );
  }, [uid]);

  const canLoadMore = messages.length >= windowSize && windowSize < CHAT_MAX_LOADED;
  const loadOlder = useCallback(() => {
    setWindowSize((size) => Math.min(CHAT_MAX_LOADED, size + CHAT_PAGE_SIZE));
  }, []);

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
        // Message and cooldown marker go out together; the rules require both.
        const batch = writeBatch(db);
        batch.set(doc(collection(db, ...messagesPath)), {
          text: checked.text,
          authorUid: user.uid,
          authorName,
          authorPhotoURL,
          createdAt: serverTimestamp(),
        });
        batch.set(doc(db, 'chat_rooms', CHAT_ROOM_ID, 'members', user.uid), {
          lastMessageAt: serverTimestamp(),
        });
        await batch.commit();
      };

      setSending(true);
      try {
        try {
          await attempt();
        } catch (err) {
          // Right after verifying the e-mail the ID token may still say
          // "unverified": refresh it once and retry.
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
    [user, authorName, authorPhotoURL]
  );

  const remove = useCallback(async (messageId) => {
    await deleteDoc(doc(db, ...messagesPath, messageId));
  }, []);

  // One reaction per person: `emoji` replaces mine, null removes it.
  const react = useCallback(
    async (messageId, emoji) => {
      if (!uid) throw new Error('Bitte melde dich an.');
      await updateDoc(
        doc(db, ...messagesPath, messageId),
        new FieldPath('reactions', uid),
        emoji ?? deleteField()
      );
    },
    [uid]
  );

  const report = useCallback(
    async (message) => {
      if (!user) throw new Error('Bitte melde dich an.');
      await setDoc(doc(db, 'chat_reports', `${message.id}_${user.uid}`), {
        messageId: message.id,
        messageText: String(message.text).slice(0, 2000),
        messageAuthorUid: message.authorUid,
        messageAuthorName: String(message.authorName).slice(0, 80),
        reportedBy: user.uid,
        status: 'open',
        createdAt: serverTimestamp(),
      });
    },
    [user]
  );

  return useMemo(
    () => ({
      messages,
      loading,
      error,
      sending,
      ban,
      canLoadMore,
      loadOlder,
      send,
      remove,
      report,
      react,
    }),
    [messages, loading, error, sending, ban, canLoadMore, loadOlder, send, remove, report, react]
  );
}
