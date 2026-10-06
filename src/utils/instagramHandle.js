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
