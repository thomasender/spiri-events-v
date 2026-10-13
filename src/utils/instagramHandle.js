const HANDLE_PATTERN = /^[A-Za-z0-9._]{1,30}$/;

/**
 * "@name", "name", "instagram.com/name/" or a full profile URL -> "@name".
 * Returns null when no valid handle can be derived. Mirrors
 * functions/src/instagram/instagramContent.ts (normalizeInstagramHandle).
 */
export function normalizeInstagramHandle(input) {
  let value = typeof input === 'string' ? input.trim() : '';
  if (!value) return null;
  const urlMatch = /^(?:https?:\/\/)?(?:[\w-]+\.)?instagram\.com\/([^/?#\s]+)/i.exec(value);
  if (urlMatch) value = urlMatch[1];
  else if (/[/\s]/.test(value)) return null;
  value = value.replace(/^@+/, '');
  return HANDLE_PATTERN.test(value) ? `@${value}` : null;
}

/**
 * Event-level handle override typed by the organizer: returns "@name" when it
 * is valid AND differs from the profile handle, else null (= use the profile).
 */
export function resolveInstagramHandleOverride(input, profileHandle) {
  const override = normalizeInstagramHandle(input);
  if (!override) return null;
  const profile = normalizeInstagramHandle(profileHandle);
  return profile && profile.toLowerCase() === override.toLowerCase() ? null : override;
}

/**
 * True when the signed-in user edits an event someone else created (e.g. an
 * admin editing an organizer's event).
 */
export function isEditingForeignEvent(event, user) {
  return Boolean(event?.createdBy) && event.createdBy !== user?.uid;
}

/**
 * The profile Instagram handle the consent field shows and the override is
 * compared against: always the event creator's, never the editor's. New
 * events and the editor's own events use the editor's (private) profile; for
 * someone else's event only the creator's public profile is readable, so it
 * is the publicly shared handle there or '' (the server still falls back to
 * the creator's private profile, see functions/src/instagramDeps.ts).
 */
export function resolveOrganizerProfileHandle({ event, user, ownProfile, organizerPublicProfile }) {
  const source = isEditingForeignEvent(event, user) ? organizerPublicProfile : ownProfile;
  const handle = source?.socialMedia?.instagram;
  return typeof handle === 'string' ? handle : '';
}

/**
 * Update patch for an existing event's `instagramHandleOverride`: {} when it
 * is unchanged (or consent is off, which leaves the stored value alone), else
 * the new "@name" or null (= use the creator's profile handle).
 */
export function buildInstagramHandleOverridePatch({ consent, input, organizerHandle, stored }) {
  if (!consent) return {};
  const next = resolveInstagramHandleOverride(input, organizerHandle);
  const previous = normalizeInstagramHandle(stored);
  return next === previous ? {} : { instagramHandleOverride: next };
}
