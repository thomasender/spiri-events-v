import { collection, doc, getDocs, writeBatch, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { SEED_CATEGORIES } from './categoryColors';

// Idempotently bootstraps the `categories` collection with the canonical 7
// seed categories if it is empty. Safe to call on every app mount: a quick
// `getDocs` confirms the collection is empty before writing, and the
// batched writes use deterministic ids so a concurrent boot from another
// tab/visitor overwrites the same docs with identical data.
//
// The anonymous-system path in firestore.rules (which requires
// `createdBy == 'system'` and a name from the canonical seed list) is
// what allows this to run before a user signs in.
export async function seedCategoriesIfEmpty() {
  const snapshot = await getDocs(collection(db, 'categories'));
  if (!snapshot.empty) return { seeded: false, count: snapshot.size };

  const batch = writeBatch(db);
  SEED_CATEGORIES.forEach((seed, index) => {
    batch.set(doc(db, 'categories', seed.id), {
      name: seed.name,
      color: seed.color,
      // `index * 100` leaves room for future inserts to land between
      // existing categories without renumbering everything.
      order: index * 100,
      createdBy: 'system',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });
  await batch.commit();
  return { seeded: true, count: SEED_CATEGORIES.length };
}
