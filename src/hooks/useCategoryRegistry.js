import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  collection,
  doc,
  onSnapshot,
  deleteDoc,
  writeBatch,
  query,
  where,
  serverTimestamp,
  getDocs,
  setDoc,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from './useAuth';
import { normalizeCategoryInput, isValidCategoryInput } from '../utils/categoryInput';

// Sort comparator used everywhere we render the category list. Categories
// with an explicit `order` value (a non-negative integer) sort first, in
// ascending order; categories without one sort to the end, then by German
// locale name as a stable tiebreaker. Returning a stable tiebreak is
// important so React doesn't churn on background snapshot reflows.
function compareCategoriesByOrder(a, b) {
  const aHasOrder = typeof a.order === 'number';
  const bHasOrder = typeof b.order === 'number';
  if (aHasOrder && !bHasOrder) return -1;
  if (!aHasOrder && bHasOrder) return 1;
  if (aHasOrder && bHasOrder && a.order !== b.order) return a.order - b.order;
  return a.name.localeCompare(b.name, 'de');
}

// Sparseness step used when reordering so that future inserts have room
// to land between existing items without renumbering everything. Steps
// of 100 give ~5 doublings before collision.
const ORDER_STEP = 100;

function nextOrderForNewCategory(categories) {
  let max = -1;
  for (const cat of categories) {
    if (typeof cat.order === 'number' && cat.order > max) max = cat.order;
  }
  return max < 0 ? 0 : max + ORDER_STEP;
}

// Live subscription to the `categories` registry. Sorted by the
// admin-defined `order` field (ascending), with the German-locale name as
// a tiebreaker; categories without an `order` value sort to the end so
// freshly-added items don't silently appear at the top. Exposes admin CRUD
// helpers that enforce auth and the same name/color validation the rules
// enforce server-side.
export function useCategoryRegistry() {
  const { user, role } = useAuth();
  const isAdmin = role === 'Admin';
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    const unsubscribe = onSnapshot(
      collection(db, 'categories'),
      (snapshot) => {
        const items = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        }));
        items.sort(compareCategoriesByOrder);
        setCategories(items);
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.error('useCategoryRegistry error:', err);
        setError(err.message);
        setLoading(false);
      }
    );
    return unsubscribe;
  }, []);

  // Quick lookup map: category name → color. Used by event display code
  // that needs a synchronous fallback before the snapshot arrives.
  const colorByName = useMemo(() => {
    const map = new Map();
    for (const cat of categories) {
      map.set(cat.name, cat.color);
    }
    return map;
  }, [categories]);

  const nameExists = useCallback(
    (name) => {
      const normalized = name.trim().toLowerCase();
      return categories.some((cat) => cat.name.toLowerCase() === normalized);
    },
    [categories]
  );

  // Create a new category. Admin only. Generates a deterministic id from
  // the name so re-running the same name produces the same doc (and the
  // upsert is idempotent).
  const addCategory = useCallback(
    async ({ name, color }) => {
      if (!isAdmin) throw new Error('Nur Admins können Kategorien anlegen.');
      const normalizedName = normalizeCategoryInput(name);
      if (!isValidCategoryInput(normalizedName)) {
        throw new Error('Ungültiger Kategoriename (2–40 Zeichen).');
      }
      if (nameExists(normalizedName)) {
        throw new Error('Eine Kategorie mit diesem Namen existiert bereits.');
      }
      if (!/^#[0-9a-fA-F]{6}$/.test(color)) {
        throw new Error('Ungültige Farbe (Format: #RRGGBB).');
      }
      const id = normalizedName.toLowerCase();
      const order = nextOrderForNewCategory(categories);
      await setDoc(doc(db, 'categories', id), {
        name: normalizedName,
        color,
        order,
        createdBy: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return id;
    },
    [isAdmin, nameExists, user, categories]
  );

  // Update an existing category. If the name changes, cascade the rename
  // to all approved+pending events that reference the old name.
  const updateCategory = useCallback(
    async (id, { name, color }) => {
      if (!isAdmin) throw new Error('Nur Admins können Kategorien ändern.');
      const normalizedName = normalizeCategoryInput(name);
      if (!isValidCategoryInput(normalizedName)) {
        throw new Error('Ungültiger Kategoriename (2–40 Zeichen).');
      }
      if (!/^#[0-9a-fA-F]{6}$/.test(color)) {
        throw new Error('Ungültige Farbe (Format: #RRGGBB).');
      }
      const ref = doc(db, 'categories', id);
      const current = categories.find((cat) => cat.id === id);
      const oldName = current?.name;

      // Cascade rename to events that reference the old name.
      const batch = writeBatch(db);
      batch.update(ref, {
        name: normalizedName,
        color,
        updatedAt: serverTimestamp(),
      });
      if (oldName && oldName !== normalizedName) {
        const eventsQ = query(collection(db, 'events'), where('category', '==', oldName));
        const eventsSnap = await getDocs(eventsQ);
        eventsSnap.forEach((eventDoc) => {
          batch.update(eventDoc.ref, {
            category: normalizedName,
            updatedAt: serverTimestamp(),
          });
        });
      }
      await batch.commit();
    },
    [isAdmin, categories]
  );

  const deleteCategory = useCallback(
    async (id) => {
      if (!isAdmin) throw new Error('Nur Admins können Kategorien löschen.');
      await deleteDoc(doc(db, 'categories', id));
    },
    [isAdmin]
  );

  // Persist a new ordering for the registry. Accepts the full list of
  // category ids in the desired top-to-bottom order and writes a fresh
  // `order` value (multiples of ORDER_STEP) for each. Categories the caller
  // omits are left untouched and keep their existing order so the admin can
  // move a subset without renumbering the whole list. Throws when the caller's
  // list contains unknown or duplicate ids.
  const reorderCategories = useCallback(
    async (orderedIds) => {
      if (!isAdmin) throw new Error('Nur Admins können Kategorien sortieren.');
      if (!Array.isArray(orderedIds)) {
        throw new Error('Ungültige Reihenfolge.');
      }
      const knownIds = new Set(categories.map((cat) => cat.id));
      const seen = new Set();
      for (const id of orderedIds) {
        if (!knownIds.has(id)) {
          throw new Error(`Unbekannte Kategorie: ${id}`);
        }
        if (seen.has(id)) {
          throw new Error(`Doppelte Kategorie: ${id}`);
        }
        seen.add(id);
      }
      const batch = writeBatch(db);
      orderedIds.forEach((id, index) => {
        batch.update(doc(db, 'categories', id), {
          order: index * ORDER_STEP,
          updatedAt: serverTimestamp(),
        });
      });
      await batch.commit();
    },
    [isAdmin, categories]
  );

  return {
    categories,
    colorByName,
    nameExists,
    loading,
    error,
    isAdmin,
    addCategory,
    updateCategory,
    deleteCategory,
    reorderCategories,
  };
}
