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
