import { useCallback, useEffect, useMemo, useState } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useRegions } from './useRegions';
import {
  DISTRICT_COLORS_DOC_PATH,
  autoDistrictColors,
  districtColorKey,
  getDistrictColor,
  sanitizeDistrictOverrides,
} from '../utils/districtColors';
import { getAllDistricts } from '../utils/regions';

// Colours of the district markings. Reads `app_settings/districtColors` (public read) through ONE
// shared listener, however many cards use the hook. Until Firestore answers (or when it fails /
// the doc does not exist) the code defaults and automatic colours apply, so nothing waits.
let overrides = {};
let loaded = false;
let unsubscribe = null;
const listeners = new Set();

function publish(next, isLoaded) {
  overrides = next;
  loaded = isLoaded;
  listeners.forEach((fn) => fn());
}

function subscribe() {
  if (unsubscribe) return;
  unsubscribe = onSnapshot(
    doc(db, ...DISTRICT_COLORS_DOC_PATH),
    (snap) => publish(snap.exists() ? sanitizeDistrictOverrides(snap.data()) : {}, true),
    () => publish({}, true)
  );
}

function release() {
  if (listeners.size > 0 || !unsubscribe) return;
  unsubscribe();
  unsubscribe = null;
}

// Automatic colours depend only on the active districts: computed once per regions list.
const autoCache = new WeakMap();
function autoFor(regions) {
  let entry = autoCache.get(regions);
  if (!entry) {
    const names = getAllDistricts(regions.filter((r) => r.active));
    entry = { names, colors: autoDistrictColors(names) };
    autoCache.set(regions, entry);
  }
  return entry;
}

/**
 * Admin only (the rules enforce it): replaces the whole override doc. A district missing from
 * `next` is back at its default / automatic colour.
 */
export async function saveDistrictColors(next) {
  await setDoc(doc(db, ...DISTRICT_COLORS_DOC_PATH), sanitizeDistrictOverrides(next));
}

export function useDistrictColors() {
  const [, force] = useState(0);
  const { regions } = useRegions();

  useEffect(() => {
    const fn = () => force((n) => n + 1);
    listeners.add(fn);
    subscribe();
    return () => {
      listeners.delete(fn);
      release();
    };
  }, []);

  const current = overrides;
  const auto = useMemo(() => autoFor(regions), [regions]);

  const colorFor = useCallback(
    (name) => {
      if (!name) return null;
      const key = districtColorKey(name);
      if (auto.colors[key] && !(key in current)) return auto.colors[key];
      return getDistrictColor(name, current, auto.names);
    },
    [current, auto]
  );

  return {
    overrides: current,
    loading: !loaded,
    colorFor,
    /** Districts of the active regions (names as stored; no Umgebung / Online). */
    activeDistricts: auto.names,
    /** Automatic colour per active district (without overrides). */
    autoColors: auto.colors,
  };
}
