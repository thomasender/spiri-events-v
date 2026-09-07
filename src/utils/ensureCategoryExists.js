import {
  collection,
  doc,
  getDocs,
  query,
  where,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { normalizeCategoryInput } from './categoryInput';
import { FALLBACK_CATEGORY_COLOR, CATEGORY_COLORS } from './categoryColors';

// Idempotently ensures a category with `name` exists in the `categories`
// registry. Returns `{ created: boolean, id }` so callers can react if
// needed. Safe to call concurrently: the deterministic id makes duplicate
// writes land on the same doc with identical data.
//
// Color selection order:
//   1. The canonical seed color if `name` matches one of the 7 seeds.
//   2. Otherwise `FALLBACK_CATEGORY_COLOR` so new categories start with a
//      muted placeholder that admins can recolor via the Kategorien tab.
//
// No-op for empty / whitespace names — those should never reach Firestore
// but we guard here for defense in depth.
export async function ensureCategoryExists(name) {
  const normalized = normalizeCategoryInput(name);
  if (!normalized) return { created: false, id: null };

  const id = normalized.toLowerCase();
  const existing = await getDocs(
    query(collection(db, 'categories'), where('name', '==', normalized))
  );
  if (!existing.empty) {
    return { created: false, id: existing.docs[0].id };
  }

  const seedColor = CATEGORY_COLORS[normalized];
  const color = seedColor || FALLBACK_CATEGORY_COLOR;
  await setDoc(doc(db, 'categories', id), {
    name: normalized,
    color,
    createdBy: 'system',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return { created: true, id };
}
