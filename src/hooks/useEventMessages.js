import { useState, useEffect, useCallback } from 'react';
import {
  collection,
  addDoc,
  doc,
  getDocs,
  deleteDoc,
  updateDoc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from './useAuth';
import {
  sanitizeHtml,
  isHtmlEmpty,
  getPlainTextLength,
  MAX_MESSAGE_LENGTH,
} from '../utils/sanitize';

export function useEventMessages(eventId) {
  const { user, role } = useAuth();
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    setLoading(true);
    setMessages([]);

    if (!eventId) {
      setLoading(false);
      return undefined;
    }

    const messagesRef = collection(db, 'events', eventId, 'messages');
    const q = query(messagesRef, orderBy('createdAt', 'asc'));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const items = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        }));
        setMessages(items);
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.error('useEventMessages error:', err);
        setError(err.message);
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [eventId]);

  const sendMessage = useCallback(
    async (text) => {
      if (!user || !eventId) {
        throw new Error('Nicht angemeldet oder Event fehlt.');
      }
      const clean = sanitizeHtml(text || '');
      if (isHtmlEmpty(clean)) {
        throw new Error('Nachricht darf nicht leer sein.');
      }
      if (getPlainTextLength(clean) > MAX_MESSAGE_LENGTH) {
        throw new Error(`Nachricht darf maximal ${MAX_MESSAGE_LENGTH} Zeichen lang sein.`);
      }

      setSending(true);
      try {
        const messagesRef = collection(db, 'events', eventId, 'messages');
        await addDoc(messagesRef, {
          text: clean,
          authorUid: user.uid,
          authorRole: role || 'User',
          authorName: user.displayName || user.email || 'Unbekannt',
          createdAt: serverTimestamp(),
          readByRecipient: false,
        });
      } finally {
        setSending(false);
      }
    },
    [user, role, eventId]
  );

  const markAsRead = useCallback(
    async (messageId) => {
      if (!user || !eventId) return;
      const ref = doc(db, 'events', eventId, 'messages', messageId);
      try {
        await updateDoc(ref, { readByRecipient: true });
      } catch (err) {
        console.warn('Failed to mark message as read:', err);
      }
    },
    [user, eventId]
  );

  const editMessage = useCallback(
    async (messageId, text) => {
      if (!user || !eventId) {
        throw new Error('Nicht angemeldet oder Event fehlt.');
      }
      const clean = sanitizeHtml(text || '');
      if (isHtmlEmpty(clean)) {
        throw new Error('Nachricht darf nicht leer sein.');
      }
      if (getPlainTextLength(clean) > MAX_MESSAGE_LENGTH) {
        throw new Error(`Nachricht darf maximal ${MAX_MESSAGE_LENGTH} Zeichen lang sein.`);
      }
      const ref = doc(db, 'events', eventId, 'messages', messageId);
      await updateDoc(ref, { text: clean, editedAt: serverTimestamp() });
    },
    [user, eventId]
  );

  const deleteMessage = useCallback(
    async (messageId) => {
      if (!user || !eventId) {
        throw new Error('Nicht angemeldet oder Event fehlt.');
      }
      await deleteDoc(doc(db, 'events', eventId, 'messages', messageId));
    },
    [user, eventId]
  );

  return {
    messages,
    loading,
    error,
    sending,
    sendMessage,
    editMessage,
    deleteMessage,
    markAsRead,
    MAX_MESSAGE_LENGTH,
  };
}

export async function deleteAllEventMessages(eventId) {
  if (!eventId) return;
  const messagesRef = collection(db, 'events', eventId, 'messages');
  const snapshot = await getDocs(messagesRef);
  await Promise.all(snapshot.docs.map((docSnap) => deleteDoc(docSnap.ref)));
}
