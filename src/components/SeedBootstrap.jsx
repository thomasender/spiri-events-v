import { useEffect } from 'react';
import { seedCategoriesIfEmpty } from '../utils/seedCategories';
import { seedThemeIfMissing } from '../utils/seedTheme';

// Mounts once at app start and idempotently seeds the categories
// collection and the theme document if they are empty / missing. Errors
// are logged but never thrown so a network blip can't break the whole app
// — the category picker falls back to the synchronous `CATEGORY_COLORS`
// lookup and the theme falls back to the bundled `:root` defaults.
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

    seedThemeIfMissing()
      .then((result) => {
        if (!cancelled && result.seeded) {
          console.info(`Seeded ${result.count} theme variables.`);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.warn('Theme seed failed (non-fatal):', err.message);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
