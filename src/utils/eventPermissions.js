import { getStaffAccess, isModeratorForEvent } from './staffRoles.js';

export function isAdmin(role) {
  return role === 'Admin';
}

export function isEventOwner(user, event) {
  if (!user?.uid || !event?.createdBy) return false;
  return user.uid === event.createdBy;
}

// Content edits: owner or Super-Admin. Regions-Moderator:innen only review
// (firestore.rules let them change the status, never the content).
export function canEditEvent(user, event, role) {
  return Boolean(user) && (isEventOwner(user, event) || isAdmin(role));
}

// Delete from the event page (incl. single occurrences of a series, which
// edit the event): owner or Super-Admin. A Regions-Moderator:in moves events
// of her regions to the trash from the Review list instead.
export function canDeleteEvent(user, event, role) {
  return Boolean(user) && (isEventOwner(user, event) || isAdmin(role));
}

// Staff (Super-Admin or Regions-Moderator:in) deleting someone else's event
// must give a reason, which is emailed to the owner. Owners (staff included)
// deleting their own event need none.
export function requiresDeleteReason(user, event, role, staffRegionIds = []) {
  const staff = isAdmin(role) || isModeratorForEvent(getStaffAccess(role, staffRegionIds), event);
  return Boolean(user) && staff && Boolean(event?.createdBy) && !isEventOwner(user, event);
}
