import { useState, useEffect, useMemo, useRef } from 'react';
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
import { findUniqueSlug, resolveSlugForApproval } from '../lib/slug';
import { BEZIRKE, ONLINE_LOCATION, pickEventRegionId, resolveRegionId } from '../utils/regions';
import { normalizeCurrency } from '../utils/currency';
import { deleteImageByUrl } from '../lib/imageUpload';
import { compareEventsByDateTime } from '../utils/eventSort';
import { useAuth } from './useAuth';
import { auth } from '../lib/firebase';
import { getApp } from 'firebase/app';
import { ensureCategoryExists } from '../utils/ensureCategoryExists';
import { buildTrashUpdate, buildRestoreUpdate } from '../utils/trashUpdates';
import { getStaffAccess } from '../utils/staffRoles';
import { staffEventQuerySpecs, subscribeEventQueries } from '../lib/staffEventQueries';
import { buildPublicEventQueryPlan, queryPlanKey } from '../utils/regionQueries';
import { useRegion } from './useRegion';
import { useRegionMigrationComplete } from './useRegionMigrationMarker';

export const KATEGORIEN = [
  'Yoga',
  'Breathwork',
  'Meditation',
  'Tanz',
  'Singen',
  'Soundhealing',
  'Sonstiges',
];

export { BEZIRKE, ONLINE_LOCATION };

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
      regionId: resolveRegionId(event),
      status: event.status || 'pending',
      organizer: event.organizer || { name: '', email: '' },
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
        normalized.sort(compareEventsByDateTime);
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
    const slug = await findUniqueSlug(
      eventData.title,
      eventData.category,
      eventData.bezirk,
      eventData.date,
      user.uid
    );
    return addDoc(collection(db, 'events'), {
      ...eventData,
      // Every new event carries its region (form value or the default).
      regionId: pickEventRegionId(eventData.regionId),
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

  // Admin takes an approved event offline again: it goes back to the owner's
  // drafts. `unpublishedBy` lets the notification function skip the owner
  // email when an admin unpublishes their own event.
  const unpublishEvent = async (id) => {
    if (auth.currentUser) {
      await auth.currentUser.getIdToken(true);
    }
    const ref = doc(db, 'events', id);
    return updateDoc(ref, {
      status: 'draft',
      unpublishedBy: user.uid,
      unpublishedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  };

  // Moves the event to the trash. `reason` is set when an admin deletes
  // another user's event; the notification function puts it in the owner's
  // "Dein Event wurde gelöscht" email.
  const deleteEvent = async (id, { reason } = {}) => {
    if (auth.currentUser) {
      await auth.currentUser.getIdToken(true);
    }
    const ref = doc(db, 'events', id);
    return updateDoc(ref, buildTrashUpdate(user?.uid, reason));
  };

  const restoreEvent = async (id) => {
    if (auth.currentUser) {
      await auth.currentUser.getIdToken(true);
    }
    const ref = doc(db, 'events', id);
    return updateDoc(ref, buildRestoreUpdate());
  };

  const permanentDeleteEvent = async (id) => {
    if (auth.currentUser) {
      await auth.currentUser.getIdToken(true);
    }
    const ref = doc(db, 'events', id);
    const snap = await getDoc(ref);
    if (!snap.exists()) return;

    const eventData = snap.data();
    if (eventData.imageUrl) {
      await deleteImageByUrl(eventData.imageUrl);
      await deleteImageByUrl(eventData.imageThumbUrl);
    }

    const messagesRef = collection(db, 'events', id, 'messages');
    const messagesSnapshot = await getDocs(messagesRef);
    await Promise.all(messagesSnapshot.docs.map((docSnap) => deleteDoc(docSnap.ref)));

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
    const slug = await findUniqueSlug(
      duplicatedTitle,
      source.category || 'Sonstiges',
      source.bezirk || '',
      source.date,
      user.uid
    );
    const duplicateData = {
      title: duplicatedTitle,
      date: source.date,
      endDate: source.endDate || '',
      time: source.time || '',
      endTime: source.endTime || '',
      place: source.place || '',
      contribution: source.contribution || 'free',
      fee: source.fee ?? null,
      feeMax: source.feeMax ?? null,
      priceCurrency: normalizeCurrency(source.priceCurrency),
      firstSessionFree: source.firstSessionFree === true,
      description: source.description || '',
      link: source.link || '',
      recurrence: source.recurrence || 'none',
      recurrenceEndDate: source.recurrenceEndDate || '',
      customDates: Array.isArray(source.customDates) ? [...source.customDates] : [],
      exceptionDates: [],
      category: source.category || 'Sonstiges',
      bezirk: source.bezirk || '',
      city: source.city || '',
      isOnline: Boolean(source.isOnline),
      regionId: pickEventRegionId(null, source),
      organizer: source.organizer
        ? { ...source.organizer }
        : { name: '', email: '', photoURL: null },
      kontakt: source.kontakt || '',
      imageUrl: source.imageUrl || null,
      imageThumbUrl: source.imageThumbUrl || null,
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
    restoreEvent,
    permanentDeleteEvent,
    duplicateEvent,
    submitForReview,
    revertToDraft,
    unpublishEvent,
    approveEvent: (eventId) => approveEventAsAdmin(eventId, user.uid),
  };
}

const isMissingRegionId = (value) => value === undefined || value === null || value === '';

async function approveEventAsAdmin(eventId, adminUid) {
  if (auth.currentUser) {
    await auth.currentUser.getIdToken(true);
  }
  const freshDb = getFirestore(getApp());
  const ref = doc(freshDb, 'events', eventId);

  const messagesRef = collection(freshDb, 'events', eventId, 'messages');
  const messagesSnapshot = await getDocs(messagesRef);
  await Promise.all(messagesSnapshot.docs.map((docSnap) => deleteDoc(docSnap.ref)));

  // Read the event first so we can ensure its category exists in the
  // registry before marking it approved. Done outside the update so a
  // missing/renamed category can't fail the approval transaction.
  const eventSnap = await getDoc(ref);
  const eventData = eventSnap.exists() ? eventSnap.data() : null;

  // Two events must never share a public URL: if another approved event
  // already owns this slug, the newly approved one gets a free variant.
  const slug = await resolveSlugForApproval(eventId, eventData?.slug);

  await updateDoc(ref, {
    ...(slug && slug !== eventData?.slug ? { slug } : {}),
    status: 'approved',
    approvedBy: adminUid,
    approvedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  // An event without regionId (written by an app version from before regions,
  // e.g. a stale cached bundle) would be missing from the region-scoped public
  // queries once the migration marker is set. Give it the region it is read
  // as anyway. Separate and best-effort: the rules let only Super-Admins add
  // a regionId, and approval must not depend on it.
  if (eventData && isMissingRegionId(eventData.regionId)) {
    try {
      await updateDoc(ref, { regionId: resolveRegionId(eventData) });
    } catch (err) {
      console.warn('Setting the default regionId during approval failed:', err);
    }
  }

  if (eventData?.category) {
    try {
      await ensureCategoryExists(eventData.category);
    } catch (err) {
      // Don't block approval on category seed failure — admin can
      // create it manually via the Kategorien tab.
      console.warn('ensureCategoryExists failed during approval:', err);
    }
  }
}

// Review queue: Super-Admin all pending events, a Regions-Moderator:in the
// pending events of her regions, everyone else their own.
export function usePendingEvents() {
  const { user, role, staffRegionIds } = useAuth();
  const [pendingEvents, setPendingEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const regionKey = Array.isArray(staffRegionIds) ? staffRegionIds.join(',') : '';

  useEffect(() => {
    setLoading(true);
    setPendingEvents([]);

    const access = getStaffAccess(role, regionKey ? regionKey.split(',') : []);
    const specs = staffEventQuerySpecs({
      access,
      uid: user?.uid,
      status: 'pending',
      includeOwn: false,
    });

    return subscribeEventQueries(
      specs,
      (eventData) => {
        const normalized = normalizeEvents(eventData);
        normalized.sort(compareEventsByDateTime);
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
  }, [user, role, regionKey]);

  const approveEvent = (eventId) => approveEventAsAdmin(eventId, user.uid);

  return { pendingEvents, loading, approveEvent };
}

/**
 * The query plan for the current region (see utils/regionQueries.js), or the
 * full query when `regionScoped` is off. `null` = wait (marker or, once the
 * marker is set, the region register not loaded yet; the region on `/` can
 * change when it arrives, and a resubscribe would read a region twice).
 */
export function useRegionEventQueryPlan({ regionScoped = false, allActive = false } = {}) {
  const { regionId, regions, combinedRegions, isNational, loading: regionsLoading } = useRegion();
  const markerComplete = useRegionMigrationComplete({ enabled: regionScoped });
  // Combined view: the regions it covers; favourites (`allActive`): every active region.
  const activeKey = (isNational && !allActive ? combinedRegions : regions)
    .map((r) => r.id)
    .join(',');
  const waitForRegions = regionScoped && markerComplete === true && regionsLoading;
  const plan = useMemo(
    () =>
      waitForRegions
        ? null
        : buildPublicEventQueryPlan({
            markerComplete: regionScoped ? markerComplete : false,
            regionId,
            isNational: isNational || allActive,
            activeRegionIds: activeKey ? activeKey.split(',') : [],
          }),
    [waitForRegions, regionScoped, markerComplete, regionId, isNational, allActive, activeKey]
  );
  return plan;
}

/**
 * Approved events. Without options: every approved event (admin tabs).
 * `{ regionScoped: true }` (public lists): only the current region's events
 * plus online events, or with `allActive` / in the combined view those of the
 * active regions, once the regionId migration is marked complete; before that
 * the same full query as always. Callers keep filtering with useRegionEvents.
 */
export function useAllEvents({ regionScoped = false, allActive = false } = {}) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // A failing region query (e.g. an index still building) falls back to the
  // full query for the rest of the page load instead of an empty calendar.
  const [scopedFailed, setScopedFailed] = useState(false);
  const plan = useRegionEventQueryPlan({ regionScoped: regionScoped && !scopedFailed, allActive });
  const planKey = queryPlanKey(plan);
  const lastModeRef = useRef(null);

  useEffect(() => {
    if (planKey === 'pending') return undefined;
    const { mode, queries } = JSON.parse(planKey);
    // Switching from one region's queries to another's: don't show the old
    // region's list meanwhile. After the full query the old list is a
    // superset (the client filter still applies), so it may stay until the
    // new answer arrives.
    if (lastModeRef.current !== null && lastModeRef.current !== 'all') {
      setLoading(true);
      setEvents([]);
    }
    lastModeRef.current = mode;

    return subscribeEventQueries(
      queries,
      (eventData) => {
        const normalized = normalizeEvents(eventData);
        normalized.sort(compareEventsByDateTime);
        setEvents(normalized);
        setLoading(false);
        setError(null);
      },
      (err) => {
        if (mode !== 'all') {
          console.warn('Region query failed, loading all events instead:', err);
          setScopedFailed(true);
          return;
        }
        setError(err.message);
        setLoading(false);
      }
    );
  }, [planKey]);

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
            regionId: resolveRegionId(data),
            status: data.status || 'pending',
            organizer: data.organizer || { name: '', email: '' },
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
