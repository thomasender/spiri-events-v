import { useEffect, useState, useMemo } from 'react';
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  doc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { deleteImageByUrl } from '../lib/imageUpload';

export function useFeedbackList({ enabled = true } = {}) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!enabled) {
      setItems([]);
      setLoading(false);
      setError(null);
      return undefined;
    }

    setLoading(true);
    const feedbackRef = collection(db, 'feedback');
    const q = query(feedbackRef, orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const docs = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        }));
        setItems(docs);
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.error('useFeedbackList error:', err);
        setError(err.message);
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [enabled]);

  const markAsRead = async (id) => {
    if (!id) return;
    try {
      await updateDoc(doc(db, 'feedback', id), {
        status: 'read',
        readAt: serverTimestamp(),
      });
    } catch (err) {
      console.warn('Failed to mark feedback as read:', err);
    }
  };

  const archive = async (id) => {
    if (!id) return;
    try {
      await updateDoc(doc(db, 'feedback', id), {
        status: 'archived',
        archivedAt: serverTimestamp(),
      });
    } catch (err) {
      console.warn('Failed to archive feedback:', err);
    }
  };

  const remove = async (id) => {
    if (!id) return;
    const item = items.find((it) => it.id === id);
    if (item?.screenshotUrl) {
      await deleteImageByUrl(item.screenshotUrl);
    }
    try {
      await deleteDoc(doc(db, 'feedback', id));
    } catch (err) {
      console.warn('Failed to delete feedback:', err);
      throw err;
    }
  };

  const counts = useMemo(() => {
    const result = { total: items.length, new: 0, read: 0, archived: 0 };
    for (const item of items) {
      const status = item.status || 'new';
      if (result[status] !== undefined) result[status] += 1;
    }
    return result;
  }, [items]);

  return { items, loading, error, counts, markAsRead, archive, remove };
}

export function useUnreadFeedbackCount(enabled = true) {
  const { counts, loading } = useFeedbackList({ enabled });
  return { count: enabled ? counts.new : 0, loading };
}

export function useHasFeedback(enabled = true) {
  const { counts, loading } = useFeedbackList({ enabled });
  return { hasFeedback: enabled ? counts.total > 0 : false, loading };
}
