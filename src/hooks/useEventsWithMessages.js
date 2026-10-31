import { useState, useEffect } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from './useAuth';
import { getStaffAccess } from '../utils/staffRoles';
import { staffEventQuerySpecs, subscribeEventQueries } from '../lib/staffEventQueries';
import { messageIsUnreadFor, responsibleStaffUid } from '../utils/staffNotifications';
import { latestStaffMessage } from '../utils/rejectionTemplates';

export function useEventsWithMessages() {
  const { user, role, staffRegionIds } = useAuth();
  const regionKey = Array.isArray(staffRegionIds) ? staffRegionIds.join(',') : '';
  const [events, setEvents] = useState([]);
  const [unreadCountByEvent, setUnreadCountByEvent] = useState({});
  const [hasMessagesByEvent, setHasMessagesByEvent] = useState({});
  // For each pending event with messages, the display name of the admin who
  // first wrote into the thread (so the Review tab can show
  // "In Klärung mit Anna Schmidt"). Falls back to null when no admin message
  // exists yet (which can happen if the creator spoke first).
  const [inKlaerungAuthorNameByEvent, setInKlaerungAuthorNameByEvent] = useState({});
  // Newest staff message per pending event ({ id, text, kind }), the reason a
  // rejection in the Review tab needs (Trello 6ae46ad6). Missing = none yet.
  const [lastStaffMessageByEvent, setLastStaffMessageByEvent] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setEvents([]);
      setUnreadCountByEvent({});
      setHasMessagesByEvent({});
      setInKlaerungAuthorNameByEvent({});
      setLastStaffMessageByEvent({});
      setLoading(false);
      return undefined;
    }

    setLoading(true);

    // Pending events whose conversation this person takes part in:
    // Super-Admin all, a Regions-Moderator:in those of her regions plus her
    // own, everyone else their own.
    const access = getStaffAccess(role, regionKey ? regionKey.split(',') : []);
    const specs = staffEventQuerySpecs({ access, uid: user.uid, status: 'pending' });

    const messageUnsubscribers = [];

    const eventsUnsub = subscribeEventQueries(
      specs,
      (docs) => {
        messageUnsubscribers.forEach((u) => {
          try {
            u();
          } catch {
            // ignore
          }
        });
        messageUnsubscribers.length = 0;

        if (docs.length === 0) {
          setEvents([]);
          setUnreadCountByEvent({});
          setHasMessagesByEvent({});
          setInKlaerungAuthorNameByEvent({});
          setLastStaffMessageByEvent({});
          setLoading(false);
          return;
        }

        const perEventUnread = {};
        const perEventHasMessages = {};
        const perEventFirstAdmin = {};
        const perEventLastStaff = {};
        const recompute = () => {
          const list = docs
            .filter((e) => perEventHasMessages[e.id])
            .sort((a, b) => {
              const aUnread = perEventUnread[a.id] || 0;
              const bUnread = perEventUnread[b.id] || 0;
              if (aUnread !== bUnread) return bUnread - aUnread;
              return a.date > b.date ? 1 : -1;
            });
          setEvents(list);
          setUnreadCountByEvent({ ...perEventUnread });
          setHasMessagesByEvent({ ...perEventHasMessages });
          setInKlaerungAuthorNameByEvent({ ...perEventFirstAdmin });
          setLastStaffMessageByEvent({ ...perEventLastStaff });
          setLoading(false);
        };

        docs.forEach((event) => {
          const messagesRef = collection(db, 'events', event.id, 'messages');
          const unsub = onSnapshot(
            messagesRef,
            (snap) => {
              let firstAdminName = null;
              const messages = snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
              const hasAny = messages.length > 0;
              // An organizer's reply only reaches the staff member who started
              // the conversation, not every admin (vX7TgrWN).
              const ctx = {
                viewerUid: user.uid,
                viewerIsOwner: event.createdBy === user.uid,
                responsibleUid: responsibleStaffUid(messages),
              };
              const unread = messages.filter((m) => messageIsUnreadFor(m, ctx)).length;
              messages.forEach((data) => {
                // Remember the first admin message so the review tab can
                // show "In Klärung mit [Name]". We only care about the
                // first occurrence — additional admins joining later still
                // show the originator.
                if (data.authorRole === 'Admin' && firstAdminName == null) {
                  firstAdminName = data.authorName || null;
                }
              });
              perEventUnread[event.id] = unread;
              perEventHasMessages[event.id] = hasAny;
              perEventFirstAdmin[event.id] = firstAdminName;
              const lastStaff = latestStaffMessage(messages);
              if (lastStaff) {
                perEventLastStaff[event.id] = {
                  id: lastStaff.id,
                  text: lastStaff.text,
                  kind: lastStaff.kind ?? null,
                };
              } else {
                delete perEventLastStaff[event.id];
              }
              recompute();
            },
            () => {
              perEventUnread[event.id] = 0;
              perEventHasMessages[event.id] = false;
              perEventFirstAdmin[event.id] = null;
              delete perEventLastStaff[event.id];
              recompute();
            }
          );
          messageUnsubscribers.push(unsub);
        });
      },
      (err) => {
        console.warn('useEventsWithMessages events error:', err);
        setEvents([]);
        setUnreadCountByEvent({});
        setHasMessagesByEvent({});
        setInKlaerungAuthorNameByEvent({});
        setLastStaffMessageByEvent({});
        setLoading(false);
      }
    );

    return () => {
      messageUnsubscribers.forEach((u) => {
        try {
          u();
        } catch {
          // ignore
        }
      });
      try {
        eventsUnsub();
      } catch {
        // ignore
      }
    };
  }, [user, role, regionKey]);

  return {
    events,
    unreadCountByEvent,
    hasMessagesByEvent,
    inKlaerungAuthorNameByEvent,
    lastStaffMessageByEvent,
    loading,
  };
}
