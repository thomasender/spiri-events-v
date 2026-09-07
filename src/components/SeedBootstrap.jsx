import { useEffect } from 'react';
import { seedCategoriesIfEmpty } from '../utils/seedCategories';

// Mounts once at app start and idempotently seeds the categories
// collection if it's empty. Errors are logged but never thrown so a
// network blip can't break the whole app — the picker just falls back
// to the synchronous `CATEGORY_COLORS` lookup until the registry is
// available.
export default function SeedBootstrap() {
  useEffect(() => {
    let cancelled = false;
    seedCategoriesIfEmpty()
      .then((result) => {
        if (!cancelled && result.seeded) {
          console.info(`Seeded ${result.count} default categories.`);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.warn('Category seed failed (non-fatal):', err.message);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
