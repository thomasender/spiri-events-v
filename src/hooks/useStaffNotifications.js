import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { callable, db } from '../lib/firebase';

const MAX_NOTES = 50;

/**
 * The own team notes (`staff_notifications`, Trello 6afc59ed): moderator
 * applications, the three-day reminder, new moderators. Staff only; the
 * functions write them, the recipient may only set `readAt`.
 */
export function useStaffNotifications(uid, enabled = true) {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(Boolean(uid && enabled));

  useEffect(() => {
    if (!uid || !enabled) {
      setNotifications([]);
      setLoading(false);
      return undefined;
    }
    setLoading(true);
    const q = query(
      collection(db, 'staff_notifications'),
      where('recipientUid', '==', uid),
      orderBy('createdAt', 'desc'),
      limit(MAX_NOTES)
    );
    return onSnapshot(
      q,
      (snap) => {
        setNotifications(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      (err) => {
        console.warn('useStaffNotifications error:', err?.code || err);
        setNotifications([]);
        setLoading(false);
      }
    );
  }, [uid, enabled]);

  const unreadIds = useMemo(
    () => notifications.filter((n) => n.readAt == null).map((n) => n.id),
    [notifications]
  );

  const markAllRead = useCallback(async () => {
    await Promise.all(
      unreadIds.map((id) =>
        updateDoc(doc(db, 'staff_notifications', id), { readAt: serverTimestamp() })
      )
    );
  }, [unreadIds]);

  return { notifications, loading, unreadCount: unreadIds.length, markAllRead };
}

/** Live status of one application ('open' | 'invited' | 'done'), null while unknown. */
export function useModeratorApplication(applicationId) {
  const [application, setApplication] = useState(null);
  useEffect(() => {
    if (!applicationId) {
      setApplication(null);
      return undefined;
    }
    return onSnapshot(
      doc(db, 'moderator_applications', applicationId),
      (snap) => setApplication(snap.exists() ? snap.data() : null),
      (err) => {
        console.warn('useModeratorApplication error:', err?.code || err);
        setApplication(null);
      }
    );
  }, [applicationId]);
  return application;
}

/** "Jetzt <Name> als Moderator hinzufügen" (functions/src/moderatorInvites.ts). */
export async function inviteModeratorApplicant(applicationId, regionId) {
  const result = await callable('inviteModeratorApplicant')(
    regionId ? { applicationId, regionId } : { applicationId }
  );
  return result.data;
}
