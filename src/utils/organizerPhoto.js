// The organizer photo is copied onto the event when it is saved. When an admin
// edits somebody else's event, the logged-in user's profile is the admin's, so
// it must never replace the photo of the person who created the event.
export function resolveOrganizerPhotoURL({ isEdit, event, user, profile }) {
  const existing = event?.organizer?.photoURL || null;
  if (!isEdit) return profile?.photoURL || null;
  const isOwner = Boolean(user?.uid) && event?.createdBy === user.uid;
  if (!isOwner || !profile) return existing;
  return profile.photoURL || null;
}
