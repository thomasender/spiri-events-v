// Staff roles in `admin_users/{uid}` (written only via the Admin SDK):
//   { role: 'Admin' }                                   Super-Admin
//   { role: 'RegionModerator', regionIds: ['tirol'] }   Regions-Moderator:in
// Server side: functions/src/staffRoles.ts; rules: firestore.rules
// (isAdminViaFirestore / isRegionModerator). Kept free of Firebase imports.
import { REGION_SLUGS, resolveRegionId } from './regions.js';

export const SUPER_ADMIN_ROLE = 'Admin';
export const REGION_MODERATOR_ROLE = 'RegionModerator';

/**
 * Parses a comma separated region list ("steiermark,tirol"). Returns the ids
 * in canonical REGION_SLUGS order, or throws on unknown ids, duplicates or an
 * empty list.
 */
export function parseModeratorRegions(value) {
  const ids = String(value ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (ids.length === 0) throw new Error('--regions needs at least one region id');
  const unknown = ids.filter((id) => !REGION_SLUGS.includes(id));
  if (unknown.length) {
    throw new Error(
      `Unknown region id(s): ${unknown.join(', ')} (valid: ${REGION_SLUGS.join(', ')})`
    );
  }
  if (new Set(ids).size !== ids.length) throw new Error('Duplicate region id in --regions');
  return REGION_SLUGS.filter((id) => ids.includes(id));
}

/**
 * Decides what making a user a region moderator means, given the current
 * admin_users doc (or null) and the user's custom claims. Super-Admins
 * (doc role 'Admin', a doc without moderator role, or claim role 'Admin') are
 * never converted. Same regions again = nothing to do (idempotent).
 */
export function planModeratorPromotion({ currentDoc, claims, regionIds }) {
  if (claims?.role === SUPER_ADMIN_ROLE) {
    return { action: 'refuse', reason: 'user is a Super-Admin (token claim role=Admin)' };
  }
  if (currentDoc && currentDoc.role !== REGION_MODERATOR_ROLE) {
    return {
      action: 'refuse',
      reason: `user already has admin_users role "${currentDoc.role ?? '(none)'}"`,
    };
  }
  const before = Array.isArray(currentDoc?.regionIds) ? currentDoc.regionIds : null;
  if (
    before &&
    before.length === regionIds.length &&
    before.every((id, i) => id === regionIds[i])
  ) {
    return { action: 'unchanged', regionIds };
  }
  return { action: 'write', before, regionIds };
}

const MODERATED_EVENT_STATUSES = ['pending', 'approved', 'trashed'];

/**
 * Client view of a staff role, from `role` + `regionIds` of the own
 * admin_users doc (see useAuth). Mirrors parseStaffRole in
 * functions/src/staffRoles.ts: unknown region ids are dropped and a moderator
 * without any valid region has no staff rights at all.
 */
export function getStaffAccess(role, regionIds) {
  const isSuperAdmin = role === SUPER_ADMIN_ROLE;
  const ids =
    !isSuperAdmin && role === REGION_MODERATOR_ROLE && Array.isArray(regionIds)
      ? REGION_SLUGS.filter((id) => regionIds.includes(id))
      : [];
  const isRegionModerator = ids.length > 0;
  return {
    isSuperAdmin,
    isRegionModerator,
    isStaff: isSuperAdmin || isRegionModerator,
    moderatorRegionIds: ids,
    canModerateRegion: (regionId) => isSuperAdmin || (isRegionModerator && ids.includes(regionId)),
  };
}

/**
 * A moderator may review an event (approve, send back, unpublish, trash,
 * restore, write messages) when it is not a draft and lies in one of her
 * regions. Same condition as isModeratorReviewUpdate in firestore.rules;
 * events without regionId belong to Vorarlberg.
 */
export function isModeratorForEvent(access, event) {
  if (!access?.isRegionModerator || !event) return false;
  if (!MODERATED_EVENT_STATUSES.includes(event.status)) return false;
  return access.moderatorRegionIds.includes(resolveRegionId(event));
}

// Admin tabs per role. AdminPage checks these for the URL too, not only for
// the tab bar: a tab outside the list shows "Kein Zugriff" instead.
export const ADMIN_TABS = [
  'events',
  'drafts',
  'review',
  'messages',
  'feedback',
  'trash',
  'categories',
  'theme',
  'helpers',
  'donors',
  'members',
  'instagram',
  'analytics',
  'moderation',
];
const MODERATOR_TABS = ['events', 'drafts', 'review', 'messages', 'trash', 'members'];
const ORGANIZER_TABS = ['events', 'drafts', 'messages', 'trash'];

export function allowedAdminTabs(access) {
  if (access?.isSuperAdmin) return new Set(ADMIN_TABS);
  if (access?.isRegionModerator) return new Set(MODERATOR_TABS);
  return new Set(ORGANIZER_TABS);
}

/**
 * Plain German message for a failed adminSetRegionModerator /
 * adminListRegionModerators call (functions/src/adminModerators.ts). The
 * server's English message tells the failed-precondition cases apart.
 */
export function moderatorErrorMessage(err) {
  const code = String(err?.code || '').replace(/^functions\//, '');
  const message = String(err?.message || '');
  switch (code) {
    case 'failed-precondition':
      if (/own role/i.test(message)) {
        return 'Deine eigene Rolle kannst du hier nicht ändern.';
      }
      return 'Diese Person ist Super-Admin. Ihre Rolle kann hier nicht geändert werden.';
    case 'invalid-argument':
      if (/uid/i.test(message)) {
        return 'Diese Person konnte nicht gefunden werden. Bitte wähle sie erneut aus.';
      }
      return 'Bitte wähle nur gültige Bundesländer aus, jedes höchstens einmal.';
    case 'not-found':
      return 'Dieses Konto gibt es nicht mehr.';
    case 'permission-denied':
      return 'Nur Super-Admins können Moderator:innen verwalten.';
    case 'unauthenticated':
      return 'Du bist nicht mehr angemeldet. Bitte melde dich erneut an.';
    case 'unavailable':
    case 'deadline-exceeded':
    case 'internal':
      return 'Der Server ist gerade nicht erreichbar. Bitte versuche es in einem Moment erneut.';
    default:
      return 'Das hat leider nicht geklappt. Bitte versuche es erneut.';
  }
}

/**
 * authorRole for a new event message. Staff write as 'Admin' (the rules only
 * know 'Admin' and 'User'); a moderator writing on her own event writes as
 * the organizer, never as staff.
 */
export function messageAuthorRole(access, isEventOwner) {
  if (access?.isSuperAdmin) return SUPER_ADMIN_ROLE;
  if (access?.isRegionModerator && !isEventOwner) return SUPER_ADMIN_ROLE;
  return 'User';
}
