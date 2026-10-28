/**
 * Loads the regions a Super-Admin created in Verwaltung -> "Zuordnung"
 * (`regions/{id}.custom == true`) into the region register of this instance
 * (registerCustomRegionDocs in regions.ts). Cloud Functions instances are
 * long-lived, so the result is cached for a short time; the instance that
 * creates a region refreshes it immediately.
 */
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { registerCustomRegionDocs } from './regions';

if (getApps().length === 0) {
  initializeApp();
}

const CACHE_MS = 30_000;
let loadedAt = 0;
let inflight: Promise<void> | null = null;

async function load(): Promise<void> {
  try {
    const snap = await getFirestore().collection('regions').where('custom', '==', true).get();
    registerCustomRegionDocs(snap.docs.map((d) => ({ ...d.data(), id: d.id })));
    loadedAt = Date.now();
  } catch {
    // Keep what this instance already knows; static regions keep working.
  }
}

/** Makes sure the custom regions are registered (cached for 30 s). */
export async function ensureCustomRegions(force = false): Promise<void> {
  if (!force && Date.now() - loadedAt < CACHE_MS) return;
  inflight ??= load().finally(() => {
    inflight = null;
  });
  await inflight;
}
