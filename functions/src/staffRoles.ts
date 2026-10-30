/**
 * Staff roles stored in `admin_users/{uid}` (written only via the Admin SDK):
 *
 *   { role: 'Admin' }                                  Super-Admin (unchanged)
 *   { role: 'RegionModerator', regionIds: ['tirol'] }  Regions-Moderator:in
 *
 * Mirrors firestore.rules (isAdminViaFirestore / isRegionModerator): the role
 * strings must match exactly and a moderator needs a list of region ids.
 * Server-side checks read the doc, never a token claim, so revoking a
 * moderator (deleting the doc) takes effect on the next call.
 */
import { HttpsError } from 'firebase-functions/v2/https';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { DEFAULT_REGION_ID, REGION_IDS, isRegionId } from './regions';

if (getApps().length === 0) {
  initializeApp();
}

export const SUPER_ADMIN_ROLE = 'Admin';
export const REGION_MODERATOR_ROLE = 'RegionModerator';

export type StaffRole = { kind: 'superAdmin' } | { kind: 'regionModerator'; regionIds: string[] };

/**
 * Role doc -> StaffRole, or null for "no staff rights". Unknown region ids are
 * dropped; a moderator doc without any valid region grants nothing.
 */
export function parseStaffRole(doc: unknown): StaffRole | null {
  if (!doc || typeof doc !== 'object') return null;
  const data = doc as Record<string, unknown>;
  if (data.role === SUPER_ADMIN_ROLE) return { kind: 'superAdmin' };
  if (data.role === REGION_MODERATOR_ROLE && Array.isArray(data.regionIds)) {
    const regionIds = REGION_IDS.filter((id) => (data.regionIds as unknown[]).includes(id));
    return regionIds.length > 0 ? { kind: 'regionModerator', regionIds } : null;
  }
  return null;
}

/**
 * Validates the region list for a moderator: only ids from REGION_IDS (the
 * nine Bundeslaender plus the Allgäu), no duplicates. `[]` is allowed
 * (= revoke). Returns the ids in the canonical REGION_IDS order so equal sets
 * compare equal.
 */
export function validateModeratorRegionIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    throw new HttpsError('invalid-argument', 'regionIds must be a list.');
  }
  if (raw.length > REGION_IDS.length) {
    throw new HttpsError('invalid-argument', 'Too many regions.');
  }
  if (!raw.every(isRegionId)) {
    throw new HttpsError('invalid-argument', 'Unknown region.');
  }
  if (new Set(raw).size !== raw.length) {
    throw new HttpsError('invalid-argument', 'Duplicate region.');
  }
  return REGION_IDS.filter((id) => raw.includes(id));
}

/**
 * Moderation regions of a directory profile (`users/{uid}/publicProfile/data`),
 * same semantics as firestore.rules: no profile -> no region; profile without
 * `directoryRegionIds` (saved before regions existed) -> Vorarlberg.
 * Returns null when the stored value is malformed (not a list, unknown ids):
 * such a profile matches no moderator.
 */
export function profileModerationRegionIds(
  profile: Record<string, unknown> | null | undefined
): string[] | null {
  if (!profile) return [];
  if (!('directoryRegionIds' in profile)) return [DEFAULT_REGION_ID];
  const raw = profile.directoryRegionIds;
  if (!Array.isArray(raw) || !raw.every(isRegionId)) return null;
  return Array.from(new Set(raw));
}

/** Profile is listed in at least one of the moderator's regions (read access). */
export function profileVisibleToModerator(
  profile: Record<string, unknown> | null | undefined,
  moderatorRegionIds: readonly string[]
): boolean {
  const ids = profileModerationRegionIds(profile);
  return ids !== null && ids.some((id) => moderatorRegionIds.includes(id));
}

/**
 * Profile lies ENTIRELY in the moderator's regions (write access). Listings
 * that also appear in a foreign region stay read-only for her, as do
 * profiles with an empty or malformed region list.
 */
export function profileEditableByModerator(
  profile: Record<string, unknown> | null | undefined,
  moderatorRegionIds: readonly string[]
): boolean {
  const ids = profileModerationRegionIds(profile);
  return ids !== null && ids.length > 0 && ids.every((id) => moderatorRegionIds.includes(id));
}

export async function readRoleDoc(uid: string): Promise<Record<string, unknown> | null> {
  const snap = await getFirestore().collection('admin_users').doc(uid).get();
  return snap.exists ? (snap.data() ?? {}) : null;
}

export type RoleDocReader = (uid: string) => Promise<Record<string, unknown> | null>;

/** Any staff role (Super-Admin or moderator), else throws. */
export async function assertStaff(
  uid: string | undefined,
  readDoc: RoleDocReader = readRoleDoc
): Promise<StaffRole> {
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Must be signed in.');
  }
  const role = parseStaffRole(await readDoc(uid));
  if (!role) {
    throw new HttpsError('permission-denied', 'Admins only.');
  }
  return role;
}

/** Super-Admin only (role 'Admin' in admin_users), else throws. */
export async function assertSuperAdmin(
  uid: string | undefined,
  readDoc: RoleDocReader = readRoleDoc
): Promise<void> {
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Must be signed in.');
  }
  const role = parseStaffRole(await readDoc(uid));
  if (role?.kind !== 'superAdmin') {
    throw new HttpsError('permission-denied', 'Admins only.');
  }
}
