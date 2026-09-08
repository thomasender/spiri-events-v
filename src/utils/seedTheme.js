import { doc, getDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { THEME_DOC_PATH, THEME_DEFAULTS, THEME_VARIABLES } from './themeDefaults';

// Idempotently bootstraps the `app_settings/theme` document with the
// default color values if it doesn't exist yet. Safe to call on every app
// mount: a quick `getDoc` confirms the document is missing before writing.
//
// The write is allowed by `firestore.rules` because we use the
// `createdBy == 'system'` flag and write exactly the canonical default
// values from `themeDefaults.js` (mirroring the categories pattern).
//
// We intentionally use `setDoc` (not `merge`) so a previous run that got
// partially written or that has stale fields gets a fresh, predictable
// shape. This is fine because the only way to deviate from defaults is via
// the admin UI — by the time someone has changed a value, the doc already
// exists and this seeder short-circuits.
export async function seedThemeIfMissing() {
  const ref = doc(db, ...THEME_DOC_PATH);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    return { seeded: false, count: THEME_VARIABLES.length };
  }

  const fields = {};
  for (const variable of THEME_VARIABLES) {
    fields[variable.name] = variable.defaultValue;
  }
  await ref.set({
    ...fields,
    createdBy: 'system',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return { seeded: true, count: THEME_VARIABLES.length };
}

// Re-export the defaults so callers (e.g. tests, the "reset all" admin
// action) don't need to import themeDefaults separately.
export { THEME_DEFAULTS };
