import { useCallback, useEffect, useState } from 'react';
import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { callable, db } from '../lib/firebase';
import { useAuth } from './useAuth';
import { getStaffAccess } from '../utils/staffRoles';
import { canUsePreEntries, parsePreEntrySettings } from '../utils/preEntries';

// Live view of the flag + defaults app_settings/preEntries (Trello 6afb1116).
// A missing doc means off with the built-in defaults.
export function usePreEntrySettings() {
  const [settings, setSettings] = useState(() => parsePreEntrySettings(null));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return onSnapshot(
      doc(db, 'app_settings', 'preEntries'),
      (snap) => {
        setSettings(parsePreEntrySettings(snap.exists() ? snap.data() : null));
        setLoading(false);
      },
      () => {
        setSettings(parsePreEntrySettings(null));
        setLoading(false);
      }
    );
  }, []);

  return { settings, loading };
}

// Whether the signed-in staff member may use the feature under the flag.
export function usePreEntryAccess() {
  const { user, role, staffRegionIds } = useAuth();
  const access = getStaffAccess(role, staffRegionIds);
  const { settings, loading } = usePreEntrySettings();
  return {
    available: Boolean(user) && canUsePreEntries(settings.mode, access),
    isSuperAdmin: access.isSuperAdmin,
    settings,
    loading,
  };
}

/** Super-Admin: writes flag, defaults and templates (firestore.rules validate them). */
export async function savePreEntrySettings(patch, uid) {
  await setDoc(
    doc(db, 'app_settings', 'preEntries'),
    { ...patch, updatedAt: serverTimestamp(), updatedBy: uid ?? null },
    { merge: true }
  );
}

/** Calls preEntryAdmin({ action, ...payload }) and returns its data. */
export async function preEntryAdmin(action, payload = {}) {
  const result = await callable('preEntryAdmin')({ action, ...payload });
  return result.data;
}

/** Calls preEntryOrganizer({ action, token, ...payload }) and returns its data. */
export async function preEntryOrganizer(action, token, payload = {}) {
  const result = await callable('preEntryOrganizer')({ action, token, ...payload });
  return result.data;
}

// The overview list (server-only data, loaded through the callable).
export function usePreEntryList(enabled) {
  const [rows, setRows] = useState([]);
  const [serverNow, setServerNow] = useState(() => Date.now());
  const [loading, setLoading] = useState(Boolean(enabled));
  const [error, setError] = useState(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await preEntryAdmin('list');
      setRows(Array.isArray(data?.rows) ? data.rows : []);
      setServerNow(typeof data?.now === 'number' ? data.now : Date.now());
    } catch (err) {
      console.error('Loading pre-entries failed:', err);
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (enabled) reload();
  }, [enabled, reload]);

  return { rows, serverNow, loading, error, reload };
}
