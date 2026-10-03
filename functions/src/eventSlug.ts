// Pure helpers for keeping event URLs (slugs) unique. No Firebase imports so
// they can be unit-tested directly.

/**
 * Strips a collision counter ("-2") that follows the yyyymmdd date suffix, so
 * a renamed slug becomes "…-20261102-3" instead of "…-20261102-2-2".
 */
export function slugBase(slug: string): string {
  return slug.replace(/(-\d{8})-\d+$/, '$1');
}

/**
 * Returns the first slug, starting with `slug` itself, for which `isTaken`
 * resolves false. Collisions get "-2", "-3", … appended to the slug base.
 */
export async function findFreeSlug(
  slug: string,
  isTaken: (candidate: string) => Promise<boolean>
): Promise<string> {
  if (!(await isTaken(slug))) return slug;
  const base = slugBase(slug);
  let counter = 2;
  let candidate = `${base}-${counter}`;
  while (await isTaken(candidate)) {
    counter += 1;
    candidate = `${base}-${counter}`;
  }
  return candidate;
}
