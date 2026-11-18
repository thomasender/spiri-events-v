import { useCallback } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { findDuplicateCandidates } from '../utils/duplicateEvents';

// Looks for approved events on the start day of a new event that look like the same event
// (Trello 6afdc0ce). One Firestore query; any failure returns [] so saving is never blocked.
export function useDuplicateCheck() {
  const findDuplicates = useCallback(async (draft) => {
    if (!draft?.date) return [];
    try {
      const snap = await getDocs(
        query(
          collection(db, 'events'),
          where('status', '==', 'approved'),
          where('date', '==', draft.date)
        )
      );
      const events = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      return findDuplicateCandidates(draft, events);
    } catch (err) {
      console.warn('Duplicate check skipped:', err?.code || err?.message);
      return [];
    }
  }, []);

  return { findDuplicates };
}
