import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from './useAuth';
import { getStaffAccess } from '../utils/staffRoles';

// `app_settings/importVisibility` = { moderatorsSeeInReview: boolean } (missing = false).
// Readable by everyone (generic app_settings read), written by Super-Admins only.
export function useModeratorsSeeInReview(enabled = true) {
  const [value, setValue] = useState(false);
  useEffect(() => {
    if (!enabled) return undefined;
    return onSnapshot(
      doc(db, 'app_settings', 'importVisibility'),
      (snap) => setValue(snap.exists() && snap.data()?.moderatorsSeeInReview === true),
      () => setValue(false)
    );
  }, [enabled]);
  return enabled ? value : false;
}

/** The viewer-specific options for `filterCuratedForReview`. */
export function useReviewVisibility(enabled = true) {
  const { role, staffRegionIds } = useAuth();
  const isSuperAdmin = getStaffAccess(role, staffRegionIds).isSuperAdmin;
  // A Super-Admin sees everything; the doc is only needed for moderators.
  const moderatorsSeeInReview = useModeratorsSeeInReview(enabled && !isSuperAdmin);
  return { isSuperAdmin, moderatorsSeeInReview };
}
