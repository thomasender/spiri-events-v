import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { REGION_MIGRATION_MARKER, isRegionMigrationComplete } from '../utils/regionQueries';

// One live listener on `app_settings/regionMigration` per page load, shared by
// every caller (1 read, then only changes). Live on purpose: when
// `migrate-region-ids.mjs --revert` deletes the marker, open tabs fall back to
// the full query before the script removes any regionId.
// State: null = not known yet, true = complete, false = missing / not complete
// / unreadable (an error always means the safe full query).
// The last value seen is remembered per browser (`HINT_KEY`) and used until
// the listener answers, so a returning visitor's lists start without waiting
// for this read. A wrong hint corrects itself as soon as the marker arrives.
const HINT_KEY = 'tribe:regionMigrationComplete';

function readHint() {
  try {
    const raw = window.localStorage.getItem(HINT_KEY);
    return raw === 'true' ? true : raw === 'false' ? false : null;
  } catch {
    return null;
  }
}

function writeHint(value) {
  try {
    window.localStorage.setItem(HINT_KEY, String(value));
  } catch {
    // private mode / blocked storage: no hint next time, nothing else changes
  }
}

let state = null;
let started = false;
const listeners = new Set();

function setState(next, { remember = true } = {}) {
  if (remember) writeHint(next);
  if (state === next) return;
  state = next;
  listeners.forEach((fn) => fn(next));
}

function start() {
  if (started) return;
  started = true;
  if (state === null) state = readHint();
  try {
    onSnapshot(
      doc(db, REGION_MIGRATION_MARKER.collection, REGION_MIGRATION_MARKER.id),
      (snap) => setState(isRegionMigrationComplete(snap.exists() ? snap.data() : null)),
      // Unreadable (offline, rules): the safe full query, but keep the hint.
      () => setState(false, { remember: false })
    );
  } catch {
    setState(false, { remember: false });
  }
}

/**
 * `true` once the regionId migration is marked complete (region-scoped queries
 * are safe), `false` if not, `null` while unknown. With `enabled: false` the
 * marker is not read and the result is `false` (the full query).
 */
export function useRegionMigrationComplete({ enabled = true } = {}) {
  const [value, setValue] = useState(() => (enabled ? (state ?? readHint()) : false));
  useEffect(() => {
    if (!enabled) {
      setValue(false);
      return undefined;
    }
    listeners.add(setValue);
    start();
    setValue(state);
    return () => listeners.delete(setValue);
  }, [enabled]);
  return enabled ? value : false;
}

// Test helper.
export function _resetRegionMigrationMarker() {
  state = null;
  started = false;
  listeners.clear();
}
