import { useEffect, useState } from 'react';
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import {
  afterPublish,
  getState,
  listChanges,
  markPublishedLoaded,
  setPublished,
} from '../lib/layoutStore';
import { LAYOUT_DOC_PATH, LAYOUT_HISTORY_COLLECTION } from '../utils/layoutTokens';

const HISTORY_LIMIT = 30;

// Keeps the layout store in sync with `app_settings/layout` for every visitor.
// Mounted once near the top of the tree (see LayoutApplier).
export function useLayoutSync() {
  useEffect(() => {
    const ref = doc(db, ...LAYOUT_DOC_PATH);
    return onSnapshot(
      ref,
      (snap) => setPublished(snap.exists() ? snap.data() : {}),
      (err) => {
        // Cached / stylesheet defaults stay in place; the site must not break.
        console.error('useLayoutSync error:', err);
        markPublishedLoaded();
      }
    );
  }, []);
}

/**
 * Publishes the current draft: writes the live document and one history entry
 * in a single batch, so the log can never miss a publish.
 */
export async function publishLayoutDraft({ user, note = '' }) {
  if (!user) throw new Error('Nicht angemeldet.');
  const state = getState();
  if (!state.draft) throw new Error('Es gibt keine Änderungen zum Veröffentlichen.');
  const values = state.draft;
  const changes = listChanges(state).map(({ token, from, to }) => ({ token, from, to }));

  const batch = writeBatch(db);
  // A full replace (no merge): tokens reset to their default disappear from the doc.
  batch.set(doc(db, ...LAYOUT_DOC_PATH), {
    ...values,
    updatedAt: serverTimestamp(),
    updatedBy: user.uid,
  });
  batch.set(doc(collection(db, LAYOUT_HISTORY_COLLECTION)), {
    values,
    changes,
    note: note.trim().slice(0, 200),
    publishedBy: user.uid,
    publishedByName: user.displayName || user.email || '',
    publishedAt: serverTimestamp(),
  });
  await batch.commit();
  afterPublish(values);
}

/** Newest-first publish log. Only subscribes while `enabled`. */
export function useLayoutHistory(enabled) {
  const [entries, setEntries] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!enabled) return undefined;
    const q = query(
      collection(db, LAYOUT_HISTORY_COLLECTION),
      orderBy('publishedAt', 'desc'),
      limit(HISTORY_LIMIT)
    );
    return onSnapshot(
      q,
      (snap) => {
        setEntries(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setError(null);
      },
      (err) => setError(err.message)
    );
  }, [enabled]);

  return { entries, error };
}
