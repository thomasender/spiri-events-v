export function isAdmin(role) {
  return role === 'Admin';
}

export function isEventOwner(user, event) {
  if (!user?.uid || !event?.createdBy) return false;
  return user.uid === event.createdBy;
}

export function canEditEvent(user, event, role) {
  return Boolean(user) && (isEventOwner(user, event) || isAdmin(role));
}

export function canDeleteEvent(user, event, role) {
  return Boolean(user) && (isEventOwner(user, event) || isAdmin(role));
}

// An admin deleting someone else's event must give a reason, which is emailed
// to the owner. Owners (admins included) deleting their own event need none.
export function requiresDeleteReason(user, event, role) {
  return Boolean(user) && isAdmin(role) && Boolean(event?.createdBy) && !isEventOwner(user, event);
}
