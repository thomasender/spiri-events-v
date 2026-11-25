import { useCallback, useEffect, useState } from 'react';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import {
  CHRISTMAS_PAGE_ID,
  mergeContent,
  sanitizeContent,
  validateRegistration,
} from '../lib/christmasPage';

const pageRef = () => doc(db, 'site_pages', CHRISTMAS_PAGE_ID);
const registrationsRef = () => collection(db, 'site_pages', CHRISTMAS_PAGE_ID, 'registrations');

/**
 * Live subscription to the Weihnachtsfeier page doc. `exists` is false while
 * nothing was saved yet (defaults are shown), `denied` when the rules refuse the
 * read: that is what a visitor gets while the page is not published.
 */
export function useChristmasPage() {
  const [state, setState] = useState({
    loading: true,
    exists: false,
    published: false,
    content: mergeContent(null),
    denied: false,
  });

  useEffect(() => {
    const unsubscribe = onSnapshot(
      pageRef(),
      (snap) => {
        const data = snap.exists() ? snap.data() : null;
        setState({
          loading: false,
          exists: snap.exists(),
          published: data?.published === true,
          content: mergeContent(data?.content),
          denied: false,
        });
      },
      (err) => {
        if (err?.code !== 'permission-denied') console.warn('useChristmasPage:', err);
        setState((prev) => ({ ...prev, loading: false, denied: true }));
      }
    );
    return unsubscribe;
  }, []);

  return state;
}

export async function saveChristmasContent({ content, published, uid }) {
  await setDoc(pageRef(), {
    published: Boolean(published),
    content: sanitizeContent(content),
    updatedAt: serverTimestamp(),
    updatedBy: uid,
  });
}

export async function submitChristmasRegistration(input) {
  const { ok, errors, value } = validateRegistration(input);
  if (!ok) throw Object.assign(new Error('invalid'), { errors });
  await addDoc(registrationsRef(), { ...value, createdAt: serverTimestamp() });
}

/** Admin only: all registrations, newest first. */
export function useChristmasRegistrations(enabled) {
  const [state, setState] = useState({ loading: true, list: [], error: null });

  useEffect(() => {
    if (!enabled) return undefined;
    const unsubscribe = onSnapshot(
      query(registrationsRef(), orderBy('createdAt', 'desc')),
      (snap) =>
        setState({
          loading: false,
          list: snap.docs.map((d) => ({ id: d.id, ...d.data() })),
          error: null,
        }),
      (err) => setState({ loading: false, list: [], error: err?.message || 'Fehler' })
    );
    return unsubscribe;
  }, [enabled]);

  const remove = useCallback((id) => deleteDoc(doc(registrationsRef(), id)), []);
  return { ...state, remove };
}

/**
 * Anonymous "already brought" counts ([{ label, count }]), kept up to date by a Cloud
 * Function; readable once the page is published (and by admins). Empty on any error.
 */
export function useChristmasBringSummary() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    const unsubscribe = onSnapshot(
      doc(db, 'site_pages', CHRISTMAS_PAGE_ID, 'summary', 'bring'),
      (snap) => {
        const list = snap.data()?.items;
        setItems(
          Array.isArray(list)
            ? list.filter((x) => x && typeof x.label === 'string' && Number(x.count) > 0)
            : []
        );
      },
      () => setItems([])
    );
    return unsubscribe;
  }, []);
  return items;
}
