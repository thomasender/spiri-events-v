import { useCallback, useEffect, useMemo, useState } from 'react';
import { doc, onSnapshot, serverTimestamp, setDoc, writeBatch } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from './useAuth';
import {
  HEX_PATTERN,
  THEME_DEFAULTS,
  THEME_DOC_PATH,
  THEME_VARIABLES,
  THEME_VARIABLES_BY_NAME,
} from '../utils/themeDefaults';

// Live subscription to the `app_settings/theme` document. Applies the
// stored values to `:root` via `document.documentElement.style.setProperty`
// so every `var(--...)` reference in every CSS file picks them up live —
// no React re-render, no layout thrashing, no Vite rebuild.
//
// Admin-only mutations:
//   • `updateVariable(name, value)` — write a single token.
//   • `resetToDefault(name)` — restore a single token.
//   • `resetAllToDefaults()` — restore every token at once (atomic batch).
//
// Non-admins can still *read* the theme (it's public), so the live
// `:root`-application effect runs for everyone; only the mutators guard.
export function useThemeSettings() {
  const { user, role } = useAuth();
  const isAdmin = role === 'Admin';

  const [settings, setSettings] = useState(() => ({ ...THEME_DEFAULTS }));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Live subscribe to the theme doc and apply its values to `:root`.
  // Falls back to the bundled defaults if the doc is missing or empty so
  // the UI keeps the static look until an admin pushes real values.
  useEffect(() => {
    setLoading(true);
    const ref = doc(db, ...THEME_DOC_PATH);
    const unsubscribe = onSnapshot(
      ref,
      (snap) => {
        const data = snap.exists() ? snap.data() : {};
        // Only pick up known keys; admins shouldn't be able to inject
        // arbitrary CSS variable names via a stale or tampered doc.
        const next = { ...THEME_DEFAULTS };
        for (const variable of THEME_VARIABLES) {
          if (typeof data[variable.name] === 'string') {
            next[variable.name] = data[variable.name];
          }
        }
        setSettings(next);
        setError(null);
        setLoading(false);
      },
      (err) => {
        console.error('useThemeSettings error:', err);
        setError(err.message);
        setLoading(false);
      }
    );
    return unsubscribe;
  }, []);

  // Mirror the resolved values onto `:root`. Browsers re-evaluate any
  // `var(--name)` reference on the next paint, so this is effectively
  // instantaneous for the user and requires no React re-render of
  // components that consume the variables.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    for (const variable of THEME_VARIABLES) {
      const value = settings[variable.name];
      if (typeof value === 'string') {
        root.style.setProperty(variable.name, value);
      }
    }
  }, [settings]);

  const updateVariable = useCallback(
    async (name, value) => {
      if (!isAdmin) throw new Error('Nur Admins können Theme-Variablen ändern.');
      const meta = THEME_VARIABLES_BY_NAME[name];
      if (!meta) throw new Error(`Unbekannte Theme-Variable: ${name}`);
      if (typeof value !== 'string' || !value.trim()) {
        throw new Error('Ungültiger Wert.');
      }
      const trimmed = value.trim();
      // Solid hex codes are validated against the canonical pattern. Any
      // other valid CSS color value (rgba, named colors, hsl, …) is
      // accepted as-is — the design system already uses rgba() for the
      // soft fills, and admins might want to add new ones.
      const looksLikeHex = trimmed.startsWith('#');
      if (looksLikeHex && !HEX_PATTERN.test(trimmed)) {
        throw new Error('Ungültige Farbe (Format: #RRGGBB).');
      }
      const ref = doc(db, ...THEME_DOC_PATH);
      await setDoc(
        ref,
        {
          [name]: trimmed,
          updatedAt: serverTimestamp(),
          updatedBy: user.uid,
        },
        { merge: true }
      );
    },
    [isAdmin, user]
  );

  const resetToDefault = useCallback(
    async (name) => {
      const meta = THEME_VARIABLES_BY_NAME[name];
      if (!meta) throw new Error(`Unbekannte Theme-Variable: ${name}`);
      return updateVariable(name, meta.defaultValue);
    },
    [updateVariable]
  );

  // Atomic batch — every token resets in a single Firestore write. The
  // admin gets a single snapshot update, so the UI flashes once instead of
  // 22 times.
  const resetAllToDefaults = useCallback(async () => {
    if (!isAdmin) throw new Error('Nur Admins können das Theme zurücksetzen.');
    const ref = doc(db, ...THEME_DOC_PATH);
    const batch = writeBatch(db);
    batch.set(
      ref,
      {
        ...THEME_DEFAULTS,
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
      },
      { merge: true }
    );
    await batch.commit();
  }, [isAdmin, user]);

  // Convenient grouped view for the admin UI. Stable across renders.
  const groupedVariables = useMemo(() => {
    const groups = new Map();
    for (const variable of THEME_VARIABLES) {
      if (!groups.has(variable.group)) groups.set(variable.group, []);
      groups.get(variable.group).push(variable);
    }
    return Array.from(groups.entries()).map(([group, variables]) => ({ group, variables }));
  }, []);

  const isModified = useCallback(
    (name) => settings[name] !== THEME_VARIABLES_BY_NAME[name]?.defaultValue,
    [settings]
  );

  const modifiedCount = useMemo(
    () => THEME_VARIABLES.filter((v) => settings[v.name] !== v.defaultValue).length,
    [settings]
  );

  return {
    settings,
    groupedVariables,
    loading,
    error,
    isAdmin,
    isModified,
    modifiedCount,
    updateVariable,
    resetToDefault,
    resetAllToDefaults,
  };
}
