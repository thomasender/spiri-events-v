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
  updateDoc,
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

// Signed in: the doc id is the uid (a second registration is refused by the rules, the
// person can withdraw and register again). Guests get a random id.
export async function submitChristmasRegistration(input, uid = null) {
  const { ok, errors, value } = validateRegistration(input);
  if (!ok) throw Object.assign(new Error('invalid'), { errors });
  if (uid) {
    await setDoc(doc(registrationsRef(), uid), { ...value, uid, createdAt: serverTimestamp() });
  } else {
    await addDoc(registrationsRef(), { ...value, createdAt: serverTimestamp() });
  }
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
  const [summary, setSummary] = useState({
    items: [],
    persons: 0,
    registrations: 0,
    attendees: [],
  });
  useEffect(() => {
    const unsubscribe = onSnapshot(
      doc(db, 'site_pages', CHRISTMAS_PAGE_ID, 'summary', 'bring'),
      (snap) => {
        const data = snap.data() || {};
        const list = data.items;
        setSummary({
          items: Array.isArray(list)
            ? list.filter((x) => x && typeof x.label === 'string' && Number(x.count) > 0)
            : [],
          persons: Number.isInteger(data.persons) && data.persons > 0 ? data.persons : 0,
          registrations: Number.isInteger(data.registrations) ? data.registrations : 0,
          attendees: Array.isArray(data.attendees)
            ? data.attendees.filter((a) => a && typeof a.name === 'string')
            : [],
        });
      },
      () => setSummary({ items: [], persons: 0, registrations: 0, attendees: [] })
    );
    return unsubscribe;
  }, []);
  return summary;
}

/** The signed-in person's own registration (doc id = uid), or null. */
export function useMyChristmasRegistration(uid) {
  const [state, setState] = useState({ loading: Boolean(uid), registration: null });
  useEffect(() => {
    if (!uid) {
      setState({ loading: false, registration: null });
      return undefined;
    }
    return onSnapshot(
      doc(registrationsRef(), uid),
      (snap) =>
        setState({
          loading: false,
          registration: snap.exists() ? { id: snap.id, ...snap.data() } : null,
        }),
      () => setState({ loading: false, registration: null })
    );
  }, [uid]);
  return state;
}

export async function withdrawChristmasRegistration(uid) {
  await deleteDoc(doc(registrationsRef(), uid));
}

export async function setMyChristmasShowPublic(uid, showPublic) {
  await updateDoc(doc(registrationsRef(), uid), { showPublic: Boolean(showPublic) });
}
