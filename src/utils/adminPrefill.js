// Test convenience for admins: the mandatory fields of the create-event wizard
// come pre-filled (tomorrow, 12:00, "Sonstiges", Bludenz, ...). Only for the
// Admin role, never for moderators or users.
const pad = (n) => String(n).padStart(2, '0');

export function getTomorrowIso(now = new Date()) {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function shouldPrefillForAdmin(role) {
  return role === 'Admin';
}

// Returns formData with the empty mandatory fields filled; filled ones are kept.
export function applyAdminPrefill(formData, { now = new Date() } = {}) {
  const next = { ...formData };
  if (!next.date) next.date = getTomorrowIso(now);
  if (!next.time) next.time = '12:00';
  if (!next.category) next.category = 'Sonstiges';
  if (!next.isOnline && !next.city && !next.bezirk) {
    next.city = 'Bludenz';
    next.bezirk = 'Bludenz';
  }
  return next;
}
