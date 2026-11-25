/**
 * Anonymous "what is already being brought" list of the Weihnachtsfeier page.
 *
 * Registrations (`site_pages/weihnachtsfeier/registrations/*`) are readable by
 * admins only. This trigger rebuilds `site_pages/weihnachtsfeier/summary/bring`
 * = { items, persons, registrations, attendees } (attendees = opt-in only) after every registration change, so the public
 * page can show what is covered without ever exposing names or contacts. The
 * Opt-in people only: `attendees` lists registrations with showPublic === true. The summary doc is written only here (Admin SDK); the rules forbid client writes.
 */
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

if (getApps().length === 0) {
  initializeApp();
}

export interface BringItem {
  label: string;
  count: number;
}

/** Counts items case-insensitively (first spelling wins), most often first. */
export function buildBringSummary(registrations: Array<{ bring?: unknown }>): BringItem[] {
  const counts = new Map<string, BringItem>();
  for (const reg of registrations) {
    if (!Array.isArray(reg.bring)) continue;
    for (const raw of reg.bring) {
      if (typeof raw !== 'string') continue;
      const label = raw.trim().slice(0, 80);
      if (!label) continue;
      const key = label.toLowerCase();
      const entry = counts.get(key) ?? { label, count: 0 };
      entry.count += 1;
      counts.set(key, entry);
    }
  }
  return [...counts.values()].sort(
    (a, b) => b.count - a.count || a.label.localeCompare(b.label, 'de')
  );
}

export interface Attendee {
  name: string;
  photoURL: string | null;
  photoFocalPoint: { x: number; y: number } | null;
  photoZoom: number | null;
}

export interface ProfilePhoto {
  photoURL?: unknown;
  photoFocalPoint?: unknown;
  photoZoom?: unknown;
}

const PHOTO_URL_RE =
  /^(https:\/\/(firebasestorage\.googleapis\.com|[a-z0-9-]+\.googleusercontent\.com)|http:\/\/(127\.0\.0\.1|localhost):[0-9]+)\/.*/;

const photoUrlOf = (value: unknown): string | null =>
  typeof value === 'string' && value.length <= 1000 && PHOTO_URL_RE.test(value) ? value : null;

function focalPointOf(value: unknown): { x: number; y: number } | null {
  const v = value as { x?: unknown; y?: unknown } | null;
  if (!v || typeof v.x !== 'number' || typeof v.y !== 'number') return null;
  if (![v.x, v.y].every((n) => Number.isFinite(n) && n >= 0 && n <= 1)) return null;
  return { x: v.x, y: v.y };
}

const zoomOf = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(3, Math.max(1, value)) : null;

/**
 * Only people who ticked "others may see that I am coming", oldest registration first.
 * Signed-in people (registration `uid`) show the photo, focal point and zoom of their
 * profile as it is now; others fall back to the photo URL stored with the registration.
 */
export function buildAttendees(
  registrations: Array<{
    showPublic?: unknown;
    name?: unknown;
    photoURL?: unknown;
    uid?: unknown;
  }>,
  profiles: Map<string, ProfilePhoto> = new Map()
): Attendee[] {
  const out: Attendee[] = [];
  for (const reg of registrations) {
    if (reg.showPublic !== true || typeof reg.name !== 'string') continue;
    const name = reg.name.trim().slice(0, 60);
    if (!name) continue;
    const profile = typeof reg.uid === 'string' ? profiles.get(reg.uid) : undefined;
    const profileUrl = photoUrlOf(profile?.photoURL);
    const photoURL = profileUrl ?? photoUrlOf(reg.photoURL);
    out.push({
      name,
      photoURL,
      photoFocalPoint: profileUrl ? focalPointOf(profile?.photoFocalPoint) : null,
      photoZoom: profileUrl ? zoomOf(profile?.photoZoom) : null,
    });
    if (out.length >= 80) break;
  }
  return out;
}

/** Total head count of all registrations (invalid values count as 0). */
export function countPersons(registrations: Array<{ persons?: unknown }>): number {
  return registrations.reduce((sum, reg) => {
    const n = Number(reg.persons);
    return sum + (Number.isInteger(n) && n > 0 && n <= 10 ? n : 0);
  }, 0);
}

export const onChristmasRegistrationWritten = onDocumentWritten(
  { region: 'europe-west3', document: 'site_pages/weihnachtsfeier/registrations/{regId}' },
  async () => {
    const db = getFirestore();
    const snap = await db
      .collection('site_pages/weihnachtsfeier/registrations')
      .orderBy('createdAt', 'asc')
      .get();
    const regs = snap.docs.map((d) => d.data());
    // Profile photos (with the focal point the person chose) of the opted-in members.
    const uids = [
      ...new Set(
        regs
          .filter((r) => r.showPublic === true && typeof r.uid === 'string' && r.uid)
          .map((r) => r.uid as string)
      ),
    ].slice(0, 80);
    const profiles = new Map<string, ProfilePhoto>();
    if (uids.length > 0) {
      const docs = await db.getAll(...uids.map((uid) => db.doc(`users/${uid}`)));
      docs.forEach((d, i) => {
        if (d.exists) profiles.set(uids[i], d.data() as ProfilePhoto);
      });
    }
    await db.doc('site_pages/weihnachtsfeier/summary/bring').set({
      items: buildBringSummary(regs),
      persons: countPersons(regs),
      registrations: regs.length,
      attendees: buildAttendees(regs, profiles),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
);
