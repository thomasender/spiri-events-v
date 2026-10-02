import { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from './useAuth';

export function useEventsWithMessages() {
  const { user, role } = useAuth();
  const [events, setEvents] = useState([]);
  const [unreadCountByEvent, setUnreadCountByEvent] = useState({});
  const [hasMessagesByEvent, setHasMessagesByEvent] = useState({});
  // For each pending event with messages, the display name of the admin who
  // first wrote into the thread (so the Review tab can show
  // "In Klärung mit Anna Schmidt"). Falls back to null when no admin message
  // exists yet (which can happen if the creator spoke first).
  const [inKlaerungAuthorNameByEvent, setInKlaerungAuthorNameByEvent] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setEvents([]);
      setUnreadCountByEvent({});
      setHasMessagesByEvent({});
      setInKlaerungAuthorNameByEvent({});
      setLoading(false);
      return undefined;
    }

    setLoading(true);

    const eventsRef = collection(db, 'events');
    let eventsQuery;
    if (role === 'Admin') {
      eventsQuery = query(eventsRef, where('status', '==', 'pending'));
    } else {
      eventsQuery = query(
        eventsRef,
        where('status', '==', 'pending'),
        where('createdBy', '==', user.uid)
      );
    }

    const messageUnsubscribers = [];

    const eventsUnsub = onSnapshot(
      eventsQuery,
      (snapshot) => {
        messageUnsubscribers.forEach((u) => {
          try {
            u();
          } catch {
            // ignore
          }
        });
        messageUnsubscribers.length = 0;

        const docs = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        }));

        if (docs.length === 0) {
          setEvents([]);
          setUnreadCountByEvent({});
          setHasMessagesByEvent({});
          setInKlaerungAuthorNameByEvent({});
          setLoading(false);
          return;
        }

        const perEventUnread = {};
        const perEventHasMessages = {};
        const perEventFirstAdmin = {};
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
          setLoading(false);
        };

        docs.forEach((event) => {
          const messagesRef = collection(db, 'events', event.id, 'messages');
          const unsub = onSnapshot(
            messagesRef,
            (snap) => {
              let unread = 0;
              let hasAny = false;
              let firstAdminName = null;
              snap.docs.forEach((docSnap) => {
                hasAny = true;
                const data = docSnap.data();
                if (data.authorUid !== user.uid && data.readByRecipient !== true) {
                  unread += 1;
                }
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
              recompute();
            },
            () => {
              perEventUnread[event.id] = 0;
              perEventHasMessages[event.id] = false;
              perEventFirstAdmin[event.id] = null;
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
  }, [user, role]);

  return {
    events,
    unreadCountByEvent,
    hasMessagesByEvent,
    inKlaerungAuthorNameByEvent,
    loading,
  };
}
