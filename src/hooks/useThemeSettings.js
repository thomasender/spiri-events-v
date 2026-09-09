import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from './useAuth';
import {
  HEX_PATTERN,
  THEME_DEFAULTS,
  THEME_DOC_PATH,
  THEME_VARIABLES,
  THEME_VARIABLES_BY_NAME,
} from '../utils/themeDefaults';

const ACTIVE_THEME_DOC_PATH = ['app_settings', 'activeTheme'];
const THEMES_COLLECTION = 'themes';

const THEME_NAME_MIN = 1;
const THEME_NAME_MAX = 50;
const THEME_DESC_MAX = 200;

function sanitizeValues(values) {
  // Strip unknown keys and fall back to the bundled default for missing tokens.
  const next = { ...THEME_DEFAULTS };
  for (const variable of THEME_VARIABLES) {
    const value = values?.[variable.name];
    if (typeof value === 'string') next[variable.name] = value;
  }
  return next;
}

function compareThemesByName(a, b) {
  const aName = typeof a.name === 'string' ? a.name : '';
  const bName = typeof b.name === 'string' ? b.name : '';
  const byName = aName.localeCompare(bName, 'de');
  if (byName !== 0) return byName;
  return a.id.localeCompare(b.id);
}

// useThemeSettings
//
// Three orthogonal concerns share one hook because the admin UI needs to
// render them together and cross-reference them (e.g. "is this saved theme
// the active one?"):
//
//   1. The LIVE theme — `app_settings/theme` doc. Subscribed and applied to
//      `:root` so every `var(--…)` reference in CSS picks up the latest
//      values. Public read; only the explicit "Aktivieren" path writes here.
//
//   2. Saved themes — `themes/{themeId}` collection. Admin-only CRUD; each
//      is a named snapshot of variable values plus metadata
//      (`name`, `description`, `createdBy`, `updatedAt`, …).
//
//   3. The editor — local in-memory state the admin mutates with the color
//      pickers. The editor is *always* sandboxed: every change updates the
//      editor and the local preview only. Nothing leaves the browser until
//      the admin explicitly clicks "Aktivieren" (publish to the live theme
//      doc), "Als neues Theme speichern" (snapshot the editor into a new
//      saved theme), or "Speichern" (update the loaded saved theme).
//
// The "what's loaded into the editor" state is tracked as `editorBase.kind`
// — `'active'` means the editor mirrors the live theme; `'saved'` means it
// was loaded from `themes/{id}` and won't auto-resync on external changes.
// `isModified` / `modifiedCount` compare the editor against the loaded
// base, not against the bundled defaults, so admins see edits against a
// saved theme flagged the same way as edits against the active theme.
export function useThemeSettings() {
  const { user, role } = useAuth();
  const isAdmin = role === 'Admin';

  // ── Live theme state ──────────────────────────────────────────────
  const [activeValues, setActiveValues] = useState(() => ({ ...THEME_DEFAULTS }));
  const [activeThemeId, setActiveThemeId] = useState(null);
  const [activeThemeName, setActiveThemeName] = useState(null);
  const [activeLoaded, setActiveLoaded] = useState(false);
  const [activeError, setActiveError] = useState(null);

  // ── Saved theme registry ──────────────────────────────────────────
  const [themes, setThemes] = useState([]);
  const [themesLoaded, setThemesLoaded] = useState(false);
  const [themesError, setThemesError] = useState(null);

  // ── Editor state ─────────────────────────────────────────────────
  const [editorValues, setEditorValues] = useState(() => ({ ...THEME_DEFAULTS }));
  const [editorBase, setEditorBase] = useState({ kind: 'active' });
  const [editorInitialized, setEditorInitialized] = useState(false);

  // Live subscription to the active theme doc. Falls back to the bundled
  // defaults if the doc is missing or empty so the UI keeps the static look
  // until an admin activates a saved theme.
  useEffect(() => {
    const ref = doc(db, ...THEME_DOC_PATH);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const data = snap.exists() ? snap.data() : {};
        setActiveValues(sanitizeValues(data));
        setActiveError(null);
        setActiveLoaded(true);
      },
      (err) => {
        console.error('useThemeSettings active error:', err);
        setActiveError(err.message);
        setActiveLoaded(true);
      }
    );
    return unsub;
  }, []);

  // Pointer doc that names the saved theme currently live on the website.
  // Optional — admins can publish ad-hoc values without a saved theme.
  useEffect(() => {
    const ref = doc(db, ...ACTIVE_THEME_DOC_PATH);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const data = snap.exists() ? snap.data() : {};
        setActiveThemeId(typeof data.themeId === 'string' ? data.themeId : null);
        setActiveThemeName(typeof data.name === 'string' ? data.name : null);
      },
      () => {
        // Missing doc is the normal "no saved theme is active" case.
        setActiveThemeId(null);
        setActiveThemeName(null);
      }
    );
    return unsub;
  }, []);

  // Live subscription to the saved-themes collection.
  useEffect(() => {
    const ref = collection(db, THEMES_COLLECTION);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const items = snap.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
          values: sanitizeValues(docSnap.data().values),
        }));
        items.sort(compareThemesByName);
        setThemes(items);
        setThemesError(null);
        setThemesLoaded(true);
      },
      (err) => {
        console.error('useThemeSettings themes error:', err);
        setThemesError(err.message);
        setThemesLoaded(true);
      }
    );
    return unsub;
  }, []);

  // Mirror the active values onto `:root`. This is what every other client
  // sees: the live website, the admin UI on other tabs, anonymous visitors.
  // The editor's in-memory state never feeds into `:root` so a sandboxed
  // edit can't leak to anyone else until the admin clicks "Aktivieren".
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    for (const variable of THEME_VARIABLES) {
      const value = activeValues[variable.name];
      if (typeof value === 'string') {
        root.style.setProperty(variable.name, value);
      }
    }
  }, [activeValues]);

  // Seed the editor once the active values have loaded the first time. We
  // intentionally don't re-seed on subsequent active-value changes — the
  // editor is a deliberate draft, not a live mirror — but the very first
  // load has to initialize from *something* so the color pickers have a
  // starting point.
  useEffect(() => {
    if (editorInitialized) return;
    if (!activeLoaded) return;
    setEditorValues(activeValues);
    setEditorBase({ kind: 'active' });
    setEditorInitialized(true);
  }, [editorInitialized, activeLoaded, activeValues]);

  // ── Editor mutations (purely local — never touch Firestore) ───────

  const validateValue = useCallback((name, value) => {
    if (!THEME_VARIABLES_BY_NAME[name]) {
      throw new Error(`Unbekannte Theme-Variable: ${name}`);
    }
    if (typeof value !== 'string' || !value.trim()) {
      throw new Error('Ungültiger Wert.');
    }
    const trimmed = value.trim();
    const looksLikeHex = trimmed.startsWith('#');
    if (looksLikeHex && !HEX_PATTERN.test(trimmed)) {
      throw new Error('Ungültige Farbe (Format: #RRGGBB).');
    }
    return trimmed;
  }, []);

  const updateVariable = useCallback(
    (name, value) => {
      const trimmed = validateValue(name, value);
      setEditorValues((prev) => ({ ...prev, [name]: trimmed }));
    },
    [validateValue]
  );

  const resetToDefault = useCallback((name) => {
    const meta = THEME_VARIABLES_BY_NAME[name];
    if (!meta) throw new Error(`Unbekannte Theme-Variable: ${name}`);
    setEditorValues((prev) => ({ ...prev, [name]: meta.defaultValue }));
  }, []);

  const resetAllToDefaults = useCallback(() => {
    setEditorValues({ ...THEME_DEFAULTS });
  }, []);

  // Replaces the editor contents with a fresh snapshot. The `kind` decides
  // what "fresh" means and sets up the source for `isModified` comparisons.
  const loadIntoEditor = useCallback(
    (kind, themeId = null) => {
      if (kind === 'active') {
        setEditorValues({ ...activeValues });
        setEditorBase({ kind: 'active' });
        return;
      }
      if (kind === 'saved') {
        const theme = themes.find((t) => t.id === themeId);
        if (!theme) throw new Error(`Unbekanntes Theme: ${themeId}`);
        setEditorValues({ ...theme.values });
        setEditorBase({ kind: 'saved', themeId: theme.id, name: theme.name });
        return;
      }
      throw new Error(`Unbekannter Editor-Quelltyp: ${kind}`);
    },
    [activeValues, themes]
  );

  const resetEditorToBase = useCallback(() => {
    if (editorBase.kind === 'active') {
      setEditorValues({ ...activeValues });
    } else {
      const theme = themes.find((t) => t.id === editorBase.themeId);
      setEditorValues(theme ? { ...theme.values } : { ...activeValues });
    }
  }, [editorBase, activeValues, themes]);

  // The base the editor is compared against. When the editor was loaded
  // from a saved theme, "modified" means "different from the saved theme
  // we loaded" — NOT different from the bundled defaults — so admins get
  // accurate dirty-state for any kind of edit.
  const editorBaseValues = useMemo(() => {
    if (editorBase.kind === 'active') return activeValues;
    const theme = themes.find((t) => t.id === editorBase.themeId);
    return theme ? theme.values : activeValues;
  }, [editorBase, themes, activeValues]);

  const isModified = useCallback(
    (name) => {
      const base = editorBaseValues[name];
      const current = editorValues[name];
      return base !== current;
    },
    [editorValues, editorBaseValues]
  );

  const modifiedCount = useMemo(
    () => THEME_VARIABLES.filter((v) => editorValues[v.name] !== editorBaseValues[v.name]).length,
    [editorValues, editorBaseValues]
  );

  const groupedVariables = useMemo(() => {
    const groups = new Map();
    for (const variable of THEME_VARIABLES) {
      if (!groups.has(variable.group)) groups.set(variable.group, []);
      groups.get(variable.group).push(variable);
    }
    return Array.from(groups.entries()).map(([group, variables]) => ({ group, variables }));
  }, []);

  // ── Saved-themes CRUD ─────────────────────────────────────────────

  const buildValues = useCallback(() => sanitizeValues(editorValues), [editorValues]);

  const saveAsNewTheme = useCallback(
    async ({ name, description } = {}) => {
      if (!isAdmin) throw new Error('Nur Admins können Themes speichern.');
      const trimmedName = (name || '').trim();
      if (trimmedName.length < THEME_NAME_MIN || trimmedName.length > THEME_NAME_MAX) {
        throw new Error(
          `Theme-Name muss zwischen ${THEME_NAME_MIN} und ${THEME_NAME_MAX} Zeichen lang sein.`
        );
      }
      const trimmedDesc = (description || '').trim();
      if (trimmedDesc.length > THEME_DESC_MAX) {
        throw new Error(`Beschreibung darf maximal ${THEME_DESC_MAX} Zeichen lang sein.`);
      }
      const values = buildValues();
      const ref = doc(collection(db, THEMES_COLLECTION));
      await setDoc(ref, {
        name: trimmedName,
        description: trimmedDesc || null,
        values,
        createdBy: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
      });
      // Switch the editor over to the freshly saved theme so subsequent
      // "Speichern" calls update it instead of starting a new draft.
      setEditorValues(values);
      setEditorBase({ kind: 'saved', themeId: ref.id, name: trimmedName });
      return ref.id;
    },
    [isAdmin, user, buildValues]
  );

  const saveLoadedTheme = useCallback(async () => {
    if (!isAdmin) throw new Error('Nur Admins können Themes speichern.');
    if (editorBase.kind !== 'saved') {
      throw new Error('Kein gespeichertes Theme geladen — verwende „Als neues Theme speichern".');
    }
    const values = buildValues();
    const ref = doc(db, THEMES_COLLECTION, editorBase.themeId);
    await updateDoc(ref, {
      values,
      updatedAt: serverTimestamp(),
      updatedBy: user.uid,
    });
  }, [isAdmin, user, editorBase, buildValues]);

  const renameTheme = useCallback(
    async (themeId, newName) => {
      if (!isAdmin) throw new Error('Nur Admins können Themes umbenennen.');
      const trimmed = (newName || '').trim();
      if (trimmed.length < THEME_NAME_MIN || trimmed.length > THEME_NAME_MAX) {
        throw new Error(
          `Theme-Name muss zwischen ${THEME_NAME_MIN} und ${THEME_NAME_MAX} Zeichen lang sein.`
        );
      }
      const ref = doc(db, THEMES_COLLECTION, themeId);
      await updateDoc(ref, {
        name: trimmed,
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
      });
      if (editorBase.kind === 'saved' && editorBase.themeId === themeId) {
        setEditorBase({ ...editorBase, name: trimmed });
      }
    },
    [isAdmin, user, editorBase]
  );

  const deleteTheme = useCallback(
    async (themeId) => {
      if (!isAdmin) throw new Error('Nur Admins können Themes löschen.');
      const ref = doc(db, THEMES_COLLECTION, themeId);
      await deleteDoc(ref);
      // If we deleted the active saved theme, clear the active pointer so
      // the admin UI stops claiming a theme that's gone.
      if (activeThemeId === themeId) {
        await deleteDoc(doc(db, ...ACTIVE_THEME_DOC_PATH)).catch(() => {});
      }
      // If we deleted the theme that's currently loaded into the editor,
      // bounce the editor back to the live theme so the admin doesn't see
      // a stale reference.
      if (editorBase.kind === 'saved' && editorBase.themeId === themeId) {
        setEditorValues({ ...activeValues });
        setEditorBase({ kind: 'active' });
      }
    },
    [isAdmin, activeThemeId, editorBase, activeValues]
  );

  // ── Activation ────────────────────────────────────────────────────

  // Publish the *current editor* values to the live theme doc. Optionally
  // also point the active-theme doc at a saved theme so it shows up as
  // "aktiv" in the library. Pass `null` (the default) for "publish without
  // claiming any saved theme" — useful when the admin tweaks an unsaved
  // draft and just wants the result live.
  const activateEditor = useCallback(
    async (linkedThemeId = null) => {
      if (!isAdmin) throw new Error('Nur Admins können Themes aktivieren.');
      const values = buildValues();
      const batch = writeBatch(db);
      batch.set(
        doc(db, ...THEME_DOC_PATH),
        {
          ...values,
          updatedAt: serverTimestamp(),
          updatedBy: user.uid,
        },
        { merge: true }
      );
      if (linkedThemeId) {
        const theme = themes.find((t) => t.id === linkedThemeId);
        batch.set(doc(db, ...ACTIVE_THEME_DOC_PATH), {
          themeId: linkedThemeId,
          name: theme?.name || '',
          activatedAt: serverTimestamp(),
          activatedBy: user.uid,
        });
      } else {
        batch.delete(doc(db, ...ACTIVE_THEME_DOC_PATH));
      }
      await batch.commit();
    },
    [isAdmin, user, themes, buildValues]
  );

  // Convenience helper used by the "Aktivieren" button on a saved theme's
  // row in the library: copy the saved theme's values to the live doc and
  // mark it active. Does NOT mutate the editor — the editor stays where
  // the admin left it.
  const activateSavedTheme = useCallback(
    async (themeId) => {
      if (!isAdmin) throw new Error('Nur Admins können Themes aktivieren.');
      const theme = themes.find((t) => t.id === themeId);
      if (!theme) throw new Error(`Unbekanntes Theme: ${themeId}`);
      const values = sanitizeValues(theme.values);
      const batch = writeBatch(db);
      batch.set(
        doc(db, ...THEME_DOC_PATH),
        {
          ...values,
          updatedAt: serverTimestamp(),
          updatedBy: user.uid,
        },
        { merge: true }
      );
      batch.set(doc(db, ...ACTIVE_THEME_DOC_PATH), {
        themeId: theme.id,
        name: theme.name,
        activatedAt: serverTimestamp(),
        activatedBy: user.uid,
      });
      await batch.commit();
    },
    [isAdmin, user, themes]
  );

  const loading = !activeLoaded || !themesLoaded;
  const error = activeError || themesError;

  return {
    // Live theme state
    activeValues,
    activeThemeId,
    activeThemeName,

    // Saved-themes registry
    themes,

    // Editor state
    editorValues,
    editorBase,
    editorBaseValues,

    // Editor mutation helpers (local only)
    updateVariable,
    resetToDefault,
    resetAllToDefaults,
    loadIntoEditor,
    resetEditorToBase,

    // Saved-theme CRUD
    saveAsNewTheme,
    saveLoadedTheme,
    renameTheme,
    deleteTheme,

    // Activation
    activateEditor,
    activateSavedTheme,

    // Shape retained from the pre-saved-themes hook so the existing
    // ThemeTab render path keeps working without renames.
    settings: editorValues,
    groupedVariables,
    loading,
    error,
    isAdmin,
    isModified,
    modifiedCount,
  };
}
