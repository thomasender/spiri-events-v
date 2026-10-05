import { useCallback, useEffect, useState } from 'react';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import { db } from '../lib/firebase';

// Admin-only groups ("Listen") of members, e.g. for newsletters or helpers.
// Stored in `member_lists`, which firestore.rules restricts to admins.
export function useMemberLists(enabled) {
  const [lists, setLists] = useState([]);

  useEffect(() => {
    if (!enabled) return undefined;
    return onSnapshot(
      collection(db, 'member_lists'),
      (snap) => {
        const next = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        next.sort((a, b) => String(a.name).localeCompare(String(b.name), 'de'));
        setLists(next);
      },
      (err) => console.error('member_lists listener failed:', err)
    );
  }, [enabled]);

  const createList = useCallback(async (name, memberUids = []) => {
    const ref = await addDoc(collection(db, 'member_lists'), {
      name: name.trim().slice(0, 60),
      memberUids,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return ref.id;
  }, []);

  const setMemberUids = useCallback(async (listId, memberUids) => {
    await updateDoc(doc(db, 'member_lists', listId), {
      memberUids,
      updatedAt: serverTimestamp(),
    });
  }, []);

  const renameList = useCallback(async (listId, name) => {
    await updateDoc(doc(db, 'member_lists', listId), {
      name: name.trim().slice(0, 60),
      updatedAt: serverTimestamp(),
    });
  }, []);

  const deleteList = useCallback(async (listId) => {
    await deleteDoc(doc(db, 'member_lists', listId));
  }, []);

  return { lists, createList, setMemberUids, renameList, deleteList };
}
