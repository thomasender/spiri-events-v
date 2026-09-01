import { useState, useEffect } from 'react';
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
  Timestamp,
  getFirestore,
  getDocs,
  arrayUnion,
  getDoc,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { findUniqueSlug } from '../lib/slug';
import { normalizeCurrency } from '../utils/currency';
import { useAuth } from './useAuth';
import { auth } from '../lib/firebase';
import { getApp } from 'firebase/app';

export const KATEGORIEN = [
  'Yoga',
  'Breathwork',
  'Meditation',
  'Tanz',
  'Singen',
  'Soundhealing',
  'Sonstiges',
];

export const BEZIRKE = ['Bregenz', 'Dornbirn', 'Feldkirch', 'Bludenz', 'Grenznahe'];

export const ONLINE_LOCATION = 'Online';

function normalizeCategory(event) {
  if (event.category) return event.category;
  if (Array.isArray(event.categories) && event.categories.length > 0) {
    return event.categories[0];
  }
  return 'Sonstiges';
}

function normalizeEvents(events) {
  return events.map((event) => {
    const isOnline = Boolean(event.isOnline);
    return {
      ...event,
      category: normalizeCategory(event),
      bezirk: isOnline ? '' : event.bezirk || '',
      isOnline,
      status: event.status || 'pending',
      organizer: event.organizer || { firstName: '', lastName: '', email: '' },
      kontakt: event.kontakt || '',
      priceCurrency: normalizeCurrency(event.priceCurrency),
    };
  });
}

export function useEvents(user) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    setEvents([]);

    if (!user) {
      setLoading(false);
      return;
    }

    const q = query(collection(db, 'events'), where('createdBy', '==', user.uid));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const eventData = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        const normalized = normalizeEvents(eventData);
        normalized.sort((a, b) => (a.date > b.date ? 1 : -1));
        setEvents(normalized);
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.error('useEvents error:', err);
        setError(err.message);
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [user]);

  const addEvent = async (eventData, status = 'pending') => {
    const slug = await findUniqueSlug(eventData.title, eventData.place, eventData.date);
    return addDoc(collection(db, 'events'), {
      ...eventData,
      slug,
      status,
      createdBy: user.uid,
      createdAt: serverTimestamp(),
    });
  };

  const updateEvent = async (id, eventData) => {
    const ref = doc(db, 'events', id);
    return updateDoc(ref, {
      ...eventData,
      updatedAt: serverTimestamp(),
    });
  };

  const submitForReview = async (id) => {
    if (auth.currentUser) {
      await auth.currentUser.getIdToken(true);
    }
    const ref = doc(db, 'events', id);
    return updateDoc(ref, {
      status: 'pending',
      updatedAt: serverTimestamp(),
    });
  };

  const revertToDraft = async (id) => {
    if (auth.currentUser) {
      await auth.currentUser.getIdToken(true);
    }
    const ref = doc(db, 'events', id);
    return updateDoc(ref, {
      status: 'draft',
      updatedAt: serverTimestamp(),
    });
  };

  const deleteEvent = async (id) => {
    if (auth.currentUser) {
      await auth.currentUser.getIdToken(true);
    }
    const ref = doc(db, 'events', id);
    return deleteDoc(ref);
  };

  const duplicateEvent = async (sourceId) => {
    if (auth.currentUser) {
      await auth.currentUser.getIdToken(true);
    }
    const sourceRef = doc(db, 'events', sourceId);
    const sourceSnap = await getDoc(sourceRef);
    if (!sourceSnap.exists()) {
      throw new Error('Event zum Duplizieren nicht gefunden');
    }
    const source = sourceSnap.data();
    const duplicatedTitle = `${source.title} (Kopie)`;
    const slug = await findUniqueSlug(duplicatedTitle, source.place, source.date);
    const duplicateData = {
      title: duplicatedTitle,
      date: source.date,
      endDate: source.endDate || '',
      time: source.time || '',
      endTime: source.endTime || '',
      place: source.place || '',
      contribution: source.contribution || 'free',
      fee: source.fee ?? null,
      priceCurrency: normalizeCurrency(source.priceCurrency),
      description: source.description || '',
      link: source.link || '',
      recurrence: source.recurrence || 'none',
      recurrenceEndDate: source.recurrenceEndDate || '',
      customDates: Array.isArray(source.customDates) ? [...source.customDates] : [],
      exceptionDates: [],
      category: source.category || 'Sonstiges',
      bezirk: source.bezirk || '',
      isOnline: Boolean(source.isOnline),
      organizer: source.organizer
        ? { ...source.organizer }
        : { firstName: '', lastName: '', email: '', photoURL: null },
      kontakt: source.kontakt || '',
      imageUrl: source.imageUrl || null,
      status: 'draft',
      slug,
      createdBy: user.uid,
      createdAt: serverTimestamp(),
    };
    const newRef = await addDoc(collection(db, 'events'), duplicateData);
    return newRef.id;
  };

  return {
    events,
    loading,
    addEvent,
    updateEvent,
    deleteEvent,
    duplicateEvent,
    submitForReview,
    revertToDraft,
  };
}

export function usePendingEvents() {
  const { user, role } = useAuth();
  const [pendingEvents, setPendingEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    setPendingEvents([]);

    let q;
    if (role === 'Admin') {
      q = query(collection(db, 'events'), where('status', '==', 'pending'));
    } else {
      q = query(
        collection(db, 'events'),
        where('status', '==', 'pending'),
        where('createdBy', '==', user.uid)
      );
    }

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const eventData = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        const normalized = normalizeEvents(eventData);
        normalized.sort((a, b) => (a.date > b.date ? 1 : -1));
        setPendingEvents(normalized);
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.error('usePendingEvents error:', err);
        setError(err.message);
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [user, role]);

  const approveEvent = async (eventId) => {
    if (auth.currentUser) {
      await auth.currentUser.getIdToken(true);
    }
    const freshDb = getFirestore(getApp());
    const ref = doc(freshDb, 'events', eventId);

    const messagesRef = collection(freshDb, 'events', eventId, 'messages');
    const messagesSnapshot = await getDocs(messagesRef);
    await Promise.all(messagesSnapshot.docs.map((docSnap) => deleteDoc(docSnap.ref)));

    return updateDoc(ref, {
      status: 'approved',
      approvedBy: user.uid,
      approvedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  };

  return { pendingEvents, loading, approveEvent };
}

export function useAllEvents() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const q = query(collection(db, 'events'), where('status', '==', 'approved'));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const eventData = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        const normalized = normalizeEvents(eventData);
        normalized.sort((a, b) => (a.date > b.date ? 1 : -1));
        setEvents(normalized);
        setLoading(false);
        setError(null);
      },
      (err) => {
        setError(err.message);
        setLoading(false);
      }
    );

    return unsubscribe;
  }, []);

  return { events, loading, error };
}

export function useEventById(eventId) {
  const [event, setEvent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!eventId) {
      setLoading(false);
      return;
    }

    const docRef = doc(db, 'events', eventId);
    const unsubscribe = onSnapshot(
      docRef,
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          const isOnline = Boolean(data.isOnline);
          const normalized = {
            id: docSnap.id,
            ...data,
            category: normalizeCategory(data),
            bezirk: isOnline ? '' : data.bezirk || '',
            isOnline,
            status: data.status || 'pending',
            organizer: data.organizer || { firstName: '', lastName: '', email: '' },
            kontakt: data.kontakt || '',
            priceCurrency: normalizeCurrency(data.priceCurrency),
          };
          setEvent(normalized);
        } else {
          setEvent(null);
        }
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.error('useEventById error:', err);
        setError(err.message);
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [eventId]);

  return { event, loading, error };
}
