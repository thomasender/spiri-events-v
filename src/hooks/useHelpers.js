import { useState, useEffect, useCallback } from 'react';
import {
  collection,
  doc,
  onSnapshot,
  deleteDoc,
  writeBatch,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from './useAuth';

const HELPER_DESCRIPTION_MAX = 120;
const ORDER_STEP = 100;

function compareHelpersByOrder(a, b) {
  const aHasOrder = typeof a.order === 'number';
  const bHasOrder = typeof b.order === 'number';
  if (aHasOrder && !bHasOrder) return -1;
  if (!aHasOrder && bHasOrder) return 1;
  if (aHasOrder && bHasOrder && a.order !== b.order) return a.order - b.order;
  return a.name.localeCompare(b.name, 'de');
}

function nextOrderForNewHelper(helpers) {
  let max = -1;
  for (const h of helpers) {
    if (typeof h.order === 'number' && h.order > max) max = h.order;
  }
  return max < 0 ? 0 : max + ORDER_STEP;
}

function normalizeOptionalString(value, max) {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

function validateHelperFields(input, { isCreate } = {}) {
  const errors = [];
  const name = (input.name ?? '').trim();
  if (!name) {
    errors.push('Bitte gib einen Namen an.');
  } else if (name.length > 80) {
    errors.push('Der Name darf höchstens 80 Zeichen lang sein.');
  }

  const profileSlug = normalizeOptionalString(input.profileSlug, 120);
  if (profileSlug && !profileSlug.match(/^\/[A-Za-z0-9._/-]+$/)) {
    errors.push(
      'Der Profil-Link muss mit „/„ anfangen und darf nur Buchstaben, Zahlen, Punkte, Unterstriche, Bindestriche und Slashes enthalten.'
    );
  }

  const website = normalizeOptionalString(input.website, 300);
  if (website && !website.match(/^https?:\/\//)) {
    errors.push('Die Website muss mit http:// oder https:// beginnen.');
  }

  const photoURL = normalizeOptionalString(input.photoURL, 500);
  if (photoURL && !(photoURL.match(/^https?:\/\//) || photoURL.match(/^\/[^/].*/))) {
    errors.push('Das Foto muss eine vollständige URL oder ein Pfad im Projekt sein.');
  }

  const description = normalizeOptionalString(input.description, HELPER_DESCRIPTION_MAX);
  if (description && description.length > HELPER_DESCRIPTION_MAX) {
    errors.push(`Die Beschreibung darf höchstens ${HELPER_DESCRIPTION_MAX} Zeichen lang sein.`);
  }

  if (errors.length && !isCreate) {
    // On update we only re-validate fields the caller actually passed.
    const providedKeys = Object.keys(input);
    const providedErrors = errors.filter(() => providedKeys.length > 0);
    if (!providedErrors.length) return { name, profileSlug, website, photoURL, description };
  }

  if (errors.length) {
    throw new Error(errors[0]);
  }

  return { name, profileSlug, website, photoURL, description };
}

// Live subscription to the `helpers` collection. Admins add people who help
// run the tribe (web hosting, design, photography, event hosting, etc.). The
// list is rendered publicly on the "Über uns" page.
export function useHelpers() {
  const { user, role } = useAuth();
  const isAdmin = role === 'Admin';
  const [helpers, setHelpers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    const unsubscribe = onSnapshot(
      collection(db, 'helpers'),
      (snapshot) => {
        const items = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        }));
        items.sort(compareHelpersByOrder);
        setHelpers(items);
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.error('useHelpers error:', err);
        setError(err.message);
        setLoading(false);
      }
    );
    return unsubscribe;
  }, []);

  const addHelper = useCallback(
    async (input) => {
      if (!isAdmin) throw new Error('Nur Admins können Helfer anlegen.');
      if (!user?.uid) throw new Error('Nicht angemeldet.');
      const fields = validateHelperFields(input, { isCreate: true });
      const id = `helper_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const order = nextOrderForNewHelper(helpers);
      await setDoc(doc(db, 'helpers', id), {
        ...fields,
        order,
        createdBy: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return id;
    },
    [isAdmin, user, helpers]
  );

  const updateHelper = useCallback(
    async (id, input) => {
      if (!isAdmin) throw new Error('Nur Admins können Helfer ändern.');
      const fields = validateHelperFields(input, { isCreate: false });
      await setDoc(
        doc(db, 'helpers', id),
        { ...fields, updatedAt: serverTimestamp() },
        { merge: true }
      );
    },
    [isAdmin]
  );

  const deleteHelper = useCallback(
    async (id) => {
      if (!isAdmin) throw new Error('Nur Admins können Helfer löschen.');
      await deleteDoc(doc(db, 'helpers', id));
    },
    [isAdmin]
  );

  const reorderHelpers = useCallback(
    async (orderedIds) => {
      if (!isAdmin) throw new Error('Nur Admins können Helfer sortieren.');
      if (!Array.isArray(orderedIds)) {
        throw new Error('Ungültige Reihenfolge.');
      }
      const knownIds = new Set(helpers.map((h) => h.id));
      const seen = new Set();
      for (const id of orderedIds) {
        if (!knownIds.has(id)) throw new Error(`Unbekannter Helfer: ${id}`);
        if (seen.has(id)) throw new Error(`Doppelter Helfer: ${id}`);
        seen.add(id);
      }
      const batch = writeBatch(db);
      orderedIds.forEach((id, index) => {
        batch.update(doc(db, 'helpers', id), {
          order: index * ORDER_STEP,
          updatedAt: serverTimestamp(),
        });
      });
      await batch.commit();
    },
    [isAdmin, helpers]
  );

  return {
    helpers,
    loading,
    error,
    isAdmin,
    addHelper,
    updateHelper,
    deleteHelper,
    reorderHelpers,
  };
}

export { HELPER_DESCRIPTION_MAX };
