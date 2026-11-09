import { useState, useEffect, useCallback } from 'react';
import {
  collection,
  doc,
  onSnapshot,
  deleteDoc,
  query,
  where,
  writeBatch,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from './useAuth';
import { useStaffRole } from './useStaffRole';
import { FAQ_ORDER_STEP, faqTopicLabel, nextFaqOrder, validateFaqInput } from '../utils/faqs';

// Live subscription to the FAQ entries (`faqs/{id}`). Platform-wide: no
// regionId. The public page (`/faq`) reads only published entries, the admin
// tab (`{ includeDrafts: true }`) the whole collection, which the rules allow
// Super-Admins only. Sorting and grouping happen on the client
// (utils/faqs.js), so no composite index is needed.
export function useFaqs({ includeDrafts = false } = {}) {
  const { user } = useAuth();
  const { isSuperAdmin } = useStaffRole();
  const canEdit = isSuperAdmin;
  const [faqs, setFaqs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (includeDrafts && !canEdit) {
      setFaqs([]);
      setLoading(false);
      return undefined;
    }
    setLoading(true);
    const source = includeDrafts
      ? collection(db, 'faqs')
      : query(collection(db, 'faqs'), where('published', '==', true));
    const unsubscribe = onSnapshot(
      source,
      (snapshot) => {
        setFaqs(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })));
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.error('useFaqs error:', err);
        setError(err.message);
        setLoading(false);
      }
    );
    return unsubscribe;
  }, [includeDrafts, canEdit]);

  const addFaq = useCallback(
    async (input) => {
      if (!canEdit) throw new Error('Nur Super-Admins können FAQs anlegen.');
      if (!user?.uid) throw new Error('Nicht angemeldet.');
      const fields = validateFaqInput(input);
      const id = `faq_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      await setDoc(doc(db, 'faqs', id), {
        ...fields,
        order: nextFaqOrder(faqs),
        createdBy: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return id;
    },
    [canEdit, user, faqs]
  );

  const updateFaq = useCallback(
    async (id, input) => {
      if (!canEdit) throw new Error('Nur Super-Admins können FAQs ändern.');
      const fields = validateFaqInput(input);
      const current = faqs.find((faq) => faq.id === id);
      const patch = { ...fields, updatedAt: serverTimestamp() };
      // A question moved to another topic goes to the end of the list, so it
      // lands at the end of its new topic instead of pulling that topic up.
      if (current && faqTopicLabel(current) !== faqTopicLabel(fields)) {
        patch.order = nextFaqOrder(faqs);
      }
      await setDoc(doc(db, 'faqs', id), patch, { merge: true });
    },
    [canEdit, faqs]
  );

  const deleteFaq = useCallback(
    async (id) => {
      if (!canEdit) throw new Error('Nur Super-Admins können FAQs löschen.');
      await deleteDoc(doc(db, 'faqs', id));
    },
    [canEdit]
  );

  const reorderFaqs = useCallback(
    async (orderedIds) => {
      if (!canEdit) throw new Error('Nur Super-Admins können FAQs sortieren.');
      if (!Array.isArray(orderedIds)) throw new Error('Ungültige Reihenfolge.');
      const knownIds = new Set(faqs.map((faq) => faq.id));
      const seen = new Set();
      for (const id of orderedIds) {
        if (!knownIds.has(id)) throw new Error(`Unbekannte Frage: ${id}`);
        if (seen.has(id)) throw new Error(`Doppelte Frage: ${id}`);
        seen.add(id);
      }
      const batch = writeBatch(db);
      orderedIds.forEach((id, index) => {
        batch.update(doc(db, 'faqs', id), {
          order: index * FAQ_ORDER_STEP,
          updatedAt: serverTimestamp(),
        });
      });
      await batch.commit();
    },
    [canEdit, faqs]
  );

  return { faqs, loading, error, canEdit, addFaq, updateFaq, deleteFaq, reorderFaqs };
}
