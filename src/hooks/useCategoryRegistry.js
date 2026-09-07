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

// Live subscription to the `categories` registry. Sorted alphabetically
// (German locale). Exposes admin CRUD helpers that enforce auth and the
// same name/color validation the rules enforce server-side.
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
        items.sort((a, b) => a.name.localeCompare(b.name, 'de'));
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
      await setDoc(doc(db, 'categories', id), {
        name: normalizedName,
        color,
        createdBy: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return id;
    },
    [isAdmin, nameExists, user]
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
  };
}
