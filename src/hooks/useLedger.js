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
import { db, getStorageInstance } from '../lib/firebase';
import { useAuth } from './useAuth';
import {
  ATTACHMENT_MAX_COUNT,
  attachmentPath,
  attachmentProblem,
  validateLedgerFields,
} from '../utils/ledger';

// The Storage SDK is loaded on first use (lib/firebase.js).
const loadStorageSdk = () => Promise.all([import('firebase/storage'), getStorageInstance()]);

async function uploadAttachments(entryId, files) {
  const [{ ref, uploadBytes }, storage] = await loadStorageSdk();
  const uploaded = [];
  try {
    for (const file of files) {
      const problem = attachmentProblem(file);
      if (problem) throw new Error(problem);
      const path = attachmentPath(entryId, file);
      await uploadBytes(ref(storage, path), file, { contentType: file.type });
      uploaded.push({ path, name: file.name, size: file.size, contentType: file.type });
    }
  } catch (err) {
    await removeFiles(uploaded.map((a) => a.path));
    throw err;
  }
  return uploaded;
}

// Best effort: a leftover file is harmless, a failed cleanup must not block the books.
async function removeFiles(paths) {
  const [{ ref, deleteObject }, storage] = await loadStorageSdk();
  await Promise.all(
    paths.map((path) =>
      deleteObject(ref(storage, path)).catch((err) => console.warn('ledger file cleanup:', err))
    )
  );
}

/** Short-lived access to one receipt (the storage rules admit Super-Admins only). */
export async function attachmentUrl(attachment) {
  const [{ ref, getDownloadURL }, storage] = await loadStorageSdk();
  return getDownloadURL(ref(storage, attachment.path));
}

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
    async (input, newFiles = []) => {
      if (!isAdmin) throw new Error('Nur Admins können Buchungen anlegen.');
      if (!user?.uid) throw new Error('Nicht angemeldet.');
      const fields = validateLedgerFields(input);
      if (newFiles.length > ATTACHMENT_MAX_COUNT) {
        throw new Error(`Höchstens ${ATTACHMENT_MAX_COUNT} Belege pro Buchung.`);
      }
      const id = `ledger_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const attachments = await uploadAttachments(id, newFiles);
      try {
        await setDoc(doc(db, 'ledger', id), {
          ...fields,
          attachments,
          source: 'manual',
          createdBy: user.uid,
          createdByName: user.displayName || user.email || user.uid,
          ...(user.email ? { createdByEmail: user.email } : {}),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        await removeFiles(attachments.map((a) => a.path));
        throw err;
      }
      return id;
    },
    [isAdmin, user]
  );

  const updateEntry = useCallback(
    async (entry, input, { newFiles = [], removed = [] } = {}) => {
      if (!isAdmin) throw new Error('Nur Admins können Buchungen ändern.');
      const fields = validateLedgerFields(input);
      const kept = (entry.attachments ?? []).filter((a) => !removed.includes(a.path));
      if (kept.length + newFiles.length > ATTACHMENT_MAX_COUNT) {
        throw new Error(`Höchstens ${ATTACHMENT_MAX_COUNT} Belege pro Buchung.`);
      }
      const added = await uploadAttachments(entry.id, newFiles);
      try {
        await updateDoc(doc(db, 'ledger', entry.id), {
          ...fields,
          attachments: [...kept, ...added],
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        await removeFiles(added.map((a) => a.path));
        throw err;
      }
      await removeFiles(removed);
    },
    [isAdmin]
  );

  const deleteEntry = useCallback(
    async (entry) => {
      if (!isAdmin) throw new Error('Nur Admins können Buchungen löschen.');
      await deleteDoc(doc(db, 'ledger', entry.id));
      await removeFiles((entry.attachments ?? []).map((a) => a.path));
    },
    [isAdmin]
  );

  return { entries, loading, error, isAdmin, addEntry, updateEntry, deleteEntry };
}
