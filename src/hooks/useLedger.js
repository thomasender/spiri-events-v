import { useState, useEffect, useCallback } from 'react';
import {
  collection,
  doc,
  onSnapshot,
  deleteDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from './useAuth';
import { validateLedgerFields } from '../utils/ledger';

// Live subscription to the income/expense ledger (Super-Admins only, the
// rules deny everybody else). Entries written by the Mollie webhook
// (`source: 'mollie'`) and manual ones are edited the same way.
export function useLedger() {
  const { user, role } = useAuth();
  const isAdmin = role === 'Admin';
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(isAdmin);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isAdmin) return undefined;
    const unsubscribe = onSnapshot(
      collection(db, 'ledger'),
      (snapshot) => {
        setEntries(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.error('useLedger error:', err);
        setError(err.message);
        setLoading(false);
      }
    );
    return unsubscribe;
  }, [isAdmin]);

  const addEntry = useCallback(
    async (input) => {
      if (!isAdmin) throw new Error('Nur Admins können Buchungen anlegen.');
      if (!user?.uid) throw new Error('Nicht angemeldet.');
      const fields = validateLedgerFields(input);
      const id = `ledger_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      await setDoc(doc(db, 'ledger', id), {
        ...fields,
        source: 'manual',
        createdBy: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return id;
    },
    [isAdmin, user]
  );

  const updateEntry = useCallback(
    async (id, input) => {
      if (!isAdmin) throw new Error('Nur Admins können Buchungen ändern.');
      const fields = validateLedgerFields(input);
      await updateDoc(doc(db, 'ledger', id), { ...fields, updatedAt: serverTimestamp() });
    },
    [isAdmin]
  );

  const deleteEntry = useCallback(
    async (id) => {
      if (!isAdmin) throw new Error('Nur Admins können Buchungen löschen.');
      await deleteDoc(doc(db, 'ledger', id));
    },
    [isAdmin]
  );

  return { entries, loading, error, isAdmin, addEntry, updateEntry, deleteEntry };
}
