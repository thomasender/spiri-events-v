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
