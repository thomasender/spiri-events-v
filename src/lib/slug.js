import { collection, collectionGroup, query, where, getDocs } from 'firebase/firestore';
import { db } from './firebase';
import { slugify, generateEventSlug, slugifyName } from './slug-helpers';

// Re-exports so existing callers of `slugify` and `generateSlug` keep working.
// `generateSlug` is intentionally NOT re-exported: the canonical name is now
// `generateEventSlug(title, category, bezirk, date)` and takes the new fields.
export { slugify, generateEventSlug, slugifyName };

// Generates a slug from the new event format:
//   {titleSlug}-{categorySlug}-in-{bezirkSlug}-{yyyymmdd}
// Then checks Firestore for collisions and appends a counter (-2, -3, …) when
// the generated slug is already in use. A slug counts as taken when an
// approved event uses it (public URL) or when one of the creator's own events
// uses it — drafts and pending submissions included, so saving a draft and
// then duplicating it or submitting the same event again cannot produce two
// events with the same URL. Other users' drafts are not readable from the
// client; the `onEventCreatedEnsureUniqueSlug` Cloud Function catches those.
export async function findUniqueSlug(title, category, bezirk, date, ownerUid) {
  let baseSlug = generateEventSlug(title, category, bezirk, date);
  if (!baseSlug) {
    throw new Error('Cannot generate slug from empty inputs');
  }
  let slug = baseSlug;
  let counter = 1;

  while (await slugExists(slug, ownerUid)) {
    counter += 1;
    slug = `${baseSlug}-${counter}`;
  }

  return slug;
}

async function slugExists(slug, ownerUid) {
  try {
    const approved = await getDocs(
      query(collection(db, 'events'), where('slug', '==', slug), where('status', '==', 'approved'))
    );
    if (!approved.empty) return true;
    if (!ownerUid) return false;
    const own = await getDocs(
      query(collection(db, 'events'), where('slug', '==', slug), where('createdBy', '==', ownerUid))
    );
    return !own.empty;
  } catch (err) {
    console.error('slugExists error:', err.code, err.message);
    throw err;
  }
}

// Strips a collision counter ("-2") that follows the yyyymmdd date suffix so
// a renamed slug becomes "…-20261102-3", not "…-20261102-2-2".
function slugBase(slug) {
  return slug.replace(/(-\d{8})-\d+$/, '$1');
}

// Admin-only (reads events of every status). Returns the slug an event should
// carry once it is approved: its current slug, unless another approved event
// already owns that URL — then the next free "-N" variant not used by any
// other event. Already-public URLs are therefore never changed.
export async function resolveSlugForApproval(eventId, slug) {
  if (!slug) return slug;
  const usedByOthers = async (candidate) => {
    const snap = await getDocs(query(collection(db, 'events'), where('slug', '==', candidate)));
    return snap.docs.filter((d) => d.id !== eventId);
  };
  const clashes = await usedByOthers(slug);
  if (!clashes.some((d) => d.data().status === 'approved')) return slug;

  const base = slugBase(slug);
  let counter = 2;
  let candidate = `${base}-${counter}`;
  while ((await usedByOthers(candidate)).length > 0) {
    counter += 1;
    candidate = `${base}-${counter}`;
  }
  return candidate;
}

export function isLegacyId(id) {
  return id && !id.includes('-') && id.length > 15;
}

export async function findUniqueProfileSlug(displayName, currentUid) {
  const baseSlug = slugifyName(displayName) || 'veranstalter';
  let slug = baseSlug;
  let counter = 2;

  while (await profileSlugTakenByOther(slug, currentUid)) {
    slug = `${baseSlug}-${counter}`;
    counter++;
  }

  return slug;
}

async function profileSlugTakenByOther(slug, currentUid) {
  try {
    const q = query(collectionGroup(db, 'publicProfile'), where('slug', '==', slug));
    const snapshot = await getDocs(q);
    return snapshot.docs.some((doc) => {
      const ownerUid = doc.ref.parent.parent?.id;
      return ownerUid && ownerUid !== currentUid;
    });
  } catch (err) {
    console.error('profileSlugTakenByOther error:', err.code, err.message);
    throw err;
  }
}

// True when *another* user's publicProfile mirrors this username. Used by the
// profile form to surface an availability hint as the user types.
//
// Returns false for invalid input — callers validate first and we don't want
// availability UI to mask a format error.
export async function isUsernameAvailable(rawUsername, currentUid) {
  const candidate = typeof rawUsername === 'string' ? rawUsername.trim().toLowerCase() : '';
  if (!candidate) return false;
  try {
    const q = query(collectionGroup(db, 'publicProfile'), where('username', '==', candidate));
    const snapshot = await getDocs(q);
    return !snapshot.docs.some((doc) => {
      const ownerUid = doc.ref.parent.parent?.id;
      return ownerUid && ownerUid !== currentUid;
    });
  } catch (err) {
    console.error('isUsernameAvailable error:', err.code, err.message);
    throw err;
  }
}
