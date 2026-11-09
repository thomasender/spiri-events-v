import { resolveRegionId } from './regions';

// Which edits of an approved event need a new review (Trello 6af0678b).
// Changing the title, the description, the photos (cover, organizer's
// profile photo) or moving the event into another region sends the event
// back to the moderators. Everything else (date, place, price, link, the
// series, ...) is saved right away and the event stays public.
//
// firestore.rules (isOwnerApprovedPatch) enforces the same split for the
// event's owner; tests/components/eventReviewFields.spec.ts keeps both lists
// in sync.

// Fields whose change needs a review. `organizer.photoURL` is checked
// separately (the organizer map itself carries the name, which is free).
export const REVIEW_REQUIRED_FIELDS = Object.freeze([
  'title',
  'description',
  'imageUrl',
  'imageThumbUrl',
  'regionId',
]);

// Form fields an owner may change on an approved event without a review.
export const FREE_EDIT_FIELDS = Object.freeze([
  'date',
  'time',
  'endTime',
  'endDate',
  'place',
  'city',
  'bezirk',
  'isOnline',
  'contribution',
  'fee',
  'feeMax',
  'priceCurrency',
  'feeNote',
  'firstSessionFree',
  'link',
  'kontakt',
  'registration',
  'category',
  'organizer',
  'recurrence',
  'recurrenceEndDate',
  'customDates',
  'imageFocalPoint',
  'imageZoom',
]);

// Every field the rules let an owner write while the event stays approved:
// the form fields above, the position derived from the Ort (useEvents), the
// Instagram settings, series exceptions and cancellations.
export const OWNER_APPROVED_PATCH_FIELDS = Object.freeze([
  ...FREE_EDIT_FIELDS,
  'lat',
  'lng',
  'exceptionDates',
  'instagramConsent',
  'instagramHandleOverride',
  'instagramImage',
  'cancelled',
  'cancelledDates',
  'updatedAt',
]);

// A change of these moves the event on the radius map: useEvents recomputes
// lat / lng from them, so they are sent together.
const POSITION_FIELDS = ['city', 'bezirk', 'isOnline'];

// Old events lack fields the form fills with empty defaults ('', null, [],
// false): those count as "unchanged".
const isEmpty = (v) => v == null || v === '' || v === false || (Array.isArray(v) && v.length === 0);
const normalize = (v) => (isEmpty(v) ? null : v);
const same = (a, b) => JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));

const organizerName = (organizer) => {
  if (!organizer) return '';
  if (typeof organizer.name === 'string' && organizer.name.trim()) return organizer.name.trim();
  return [organizer.firstName || '', organizer.lastName || '']
    .map((s) => s.trim())
    .filter(Boolean)
    .join(' ');
};

/**
 * Compares a stored event with the payload of the edit form.
 *
 * @param before the stored event
 * @param after the form payload (EventForm buildEventData)
 * @param options.coverChanged a new cover was picked or the cover removed
 * @returns `needsReview`, the changed review fields (`reviewFields`) and
 *   `patch`: only the changed free fields, for a save that keeps the event
 *   approved (the full payload would count empty defaults as changes).
 */
export function reviewEditChanges(before, after, { coverChanged = false } = {}) {
  const reviewFields = [];
  if ((before?.title || '').trim() !== (after?.title || '').trim()) reviewFields.push('title');
  if (!same(before?.description, after?.description)) reviewFields.push('description');
  if (coverChanged || !same(before?.imageUrl, after?.imageUrl)) reviewFields.push('imageUrl');
  if (coverChanged || !same(before?.imageThumbUrl, after?.imageThumbUrl)) {
    reviewFields.push('imageThumbUrl');
  }
  if (resolveRegionId(before) !== resolveRegionId(after)) reviewFields.push('regionId');
  if (!same(before?.organizer?.photoURL, after?.organizer?.photoURL)) {
    reviewFields.push('organizer.photoURL');
  }

  const patch = {};
  for (const field of FREE_EDIT_FIELDS) {
    if (field === 'organizer' || !(field in (after || {}))) continue;
    if (!same(before?.[field], after[field])) patch[field] = after[field];
  }
  if (after?.organizer && organizerName(before?.organizer) !== organizerName(after.organizer)) {
    patch.organizer = {
      ...after.organizer,
      // Unchanged here (else the edit needs a review); the stored value keeps
      // the rules' "photo stays" check exact.
      photoURL: before?.organizer?.photoURL ?? null,
    };
    if (patch.organizer.email === undefined) delete patch.organizer.email;
  }
  if (POSITION_FIELDS.some((field) => field in patch)) {
    for (const field of POSITION_FIELDS) patch[field] = after[field];
    // The region helps placing the Ort; it is unchanged here, so sending the
    // stored value is no change for the rules.
    if (before?.regionId && before.regionId === after.regionId) patch.regionId = after.regionId;
  }

  return { needsReview: reviewFields.length > 0, reviewFields, patch };
}
