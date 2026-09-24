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

const ORDER_STEP = 100;

function compareDonorsByOrder(a, b) {
  const aHasOrder = typeof a.order === 'number';
  const bHasOrder = typeof b.order === 'number';
  if (aHasOrder && !bHasOrder) return -1;
  if (!aHasOrder && bHasOrder) return 1;
  if (aHasOrder && bHasOrder && a.order !== b.order) return a.order - b.order;
  return (a.createdAt?.seconds ?? 0) - (b.createdAt?.seconds ?? 0);
}

function nextOrderForNewDonor(donors) {
  let max = -1;
  for (const d of donors) {
    if (typeof d.order === 'number' && d.order > max) max = d.order;
  }
  return max < 0 ? 0 : max + ORDER_STEP;
}

function normalizeOptionalString(value, max) {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

function validateDonorFields(input, { isCreate } = {}) {
  const errors = [];

  // Anonymous donor: name is null. Named donor: name is a non-empty trimmed
  // string up to 80 chars.
  let name = null;
  if (input.name !== undefined && input.name !== null) {
    const trimmed = String(input.name).trim();
    if (trimmed.length > 80) {
      errors.push('Der Name darf höchstens 80 Zeichen lang sein.');
    } else if (trimmed.length > 0) {
      name = trimmed;
    }
  }

  // Amount: null when the donor hides it; otherwise a non-negative number.
  let amount = null;
  if (input.amount !== undefined && input.amount !== null && input.amount !== '') {
    const parsed =
      typeof input.amount === 'number'
        ? input.amount
        : Number(String(input.amount).replace(',', '.'));
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1_000_000) {
      errors.push('Der Betrag muss zwischen 0 und 1.000.000 € liegen.');
    } else {
      amount = Math.round(parsed * 100) / 100;
    }
  }

  let frequency = null;
  if (input.frequency !== undefined && input.frequency !== null && input.frequency !== '') {
    if (input.frequency !== 'one-time' && input.frequency !== 'monthly') {
      errors.push('Die Frequenz muss „einmalig oder „monatlich sein.');
    } else {
      frequency = input.frequency;
    }
  }

  const note = normalizeOptionalString(input.note, 120);

  if (errors.length && !isCreate) {
    // Allow partial updates where the caller didn't touch invalid fields.
    const providedKeys = Object.keys(input);
    const stillRelevant = errors.some(() => providedKeys.length > 0);
    if (!stillRelevant) {
      return { name, amount, frequency, note };
    }
  }

  if (errors.length) {
    throw new Error(errors[0]);
  }

  return { name, amount, frequency, note };
}

// Live subscription to the `donors` collection. Admins maintain a list of
// previous donors that is shown publicly on the "Über uns" page so the
// community can see who is already contributing. Each donor is either named
// (name + optional amount + optional frequency) or anonymous (name = null,
// optional amount still allowed). Privacy note: admins should only add a
// donor after the donor has explicitly opted in to being listed.
export function useDonors() {
  const { user, role } = useAuth();
  const isAdmin = role === 'Admin';
  const [donors, setDonors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    const unsubscribe = onSnapshot(
      collection(db, 'donors'),
      (snapshot) => {
        const items = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        }));
        items.sort(compareDonorsByOrder);
        setDonors(items);
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.error('useDonors error:', err);
        setError(err.message);
        setLoading(false);
      }
    );
    return unsubscribe;
  }, []);

  const addDonor = useCallback(
    async (input) => {
      if (!isAdmin) throw new Error('Nur Admins können Spender anlegen.');
      if (!user?.uid) throw new Error('Nicht angemeldet.');
      const fields = validateDonorFields(input, { isCreate: true });
      const id = `donor_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const order = nextOrderForNewDonor(donors);
      await setDoc(doc(db, 'donors', id), {
        ...fields,
        order,
        createdBy: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return id;
    },
    [isAdmin, user, donors]
  );

  const updateDonor = useCallback(
    async (id, input) => {
      if (!isAdmin) throw new Error('Nur Admins können Spender ändern.');
      const fields = validateDonorFields(input, { isCreate: false });
      await setDoc(
        doc(db, 'donors', id),
        { ...fields, updatedAt: serverTimestamp() },
        { merge: true }
      );
    },
    [isAdmin]
  );

  const deleteDonor = useCallback(
    async (id) => {
      if (!isAdmin) throw new Error('Nur Admins können Spender löschen.');
      await deleteDoc(doc(db, 'donors', id));
    },
    [isAdmin]
  );

  const reorderDonors = useCallback(
    async (orderedIds) => {
      if (!isAdmin) throw new Error('Nur Admins können Spender sortieren.');
      if (!Array.isArray(orderedIds)) {
        throw new Error('Ungültige Reihenfolge.');
      }
      const knownIds = new Set(donors.map((d) => d.id));
      const seen = new Set();
      for (const id of orderedIds) {
        if (!knownIds.has(id)) throw new Error(`Unbekannter Spender: ${id}`);
        if (seen.has(id)) throw new Error(`Doppelter Spender: ${id}`);
        seen.add(id);
      }
      const batch = writeBatch(db);
      orderedIds.forEach((id, index) => {
        batch.update(doc(db, 'donors', id), {
          order: index * ORDER_STEP,
          updatedAt: serverTimestamp(),
        });
      });
      await batch.commit();
    },
    [isAdmin, donors]
  );

  return {
    donors,
    loading,
    error,
    isAdmin,
    addDonor,
    updateDonor,
    deleteDonor,
    reorderDonors,
  };
}
