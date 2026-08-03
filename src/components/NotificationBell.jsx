import { useState, useRef, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useUnreadMessageCount } from '../hooks/useUnreadMessageCount';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import './NotificationBell.css';

function formatDate(dateStr) {
  if (!dateStr) return '';
  const [year, month, day] = dateStr.split('-');
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString('de-DE', {
    day: 'numeric',
    month: 'short',
  });
}

function usePendingEventsForUser() {
  const { user, role } = useAuth();
  const [events, setEvents] = useState([]);

  useEffect(() => {
    if (!user) {
      setEvents([]);
      return undefined;
    }

    const eventsRef = collection(db, 'events');
    let q;
    if (role === 'Admin') {
      q = query(eventsRef, where('status', '==', 'pending'));
    } else {
      q = query(eventsRef, where('status', '==', 'pending'), where('createdBy', '==', user.uid));
    }

    const unsub = onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }));
      setEvents(items);
    });
    return unsub;
  }, [user, role]);

  return events;
}

export default function NotificationBell() {
  const { user } = useAuth();
  const { count } = useUnreadMessageCount();
  const pendingEvents = usePendingEventsForUser();
  const [open, setOpen] = useState(false);
  const [eventsWithUnread, setEventsWithUnread] = useState([]);
  const dropdownRef = useRef(null);
  const buttonRef = useRef(null);
  const location = useLocation();

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!user) {
      setEventsWithUnread([]);
      return undefined;
    }
    if (pendingEvents.length === 0) {
      setEventsWithUnread([]);
      return undefined;
    }

    const unsubs = [];
    const perEventHasUnread = {};

    const recompute = () => {
      const list = pendingEvents
        .filter((e) => perEventHasUnread[e.id])
        .sort((a, b) => (a.date > b.date ? 1 : -1));
      setEventsWithUnread(list);
    };

    pendingEvents.forEach((event) => {
      const messagesRef = collection(db, 'events', event.id, 'messages');
      const unsub = onSnapshot(messagesRef, (snap) => {
        let hasUnread = false;
        snap.docs.forEach((docSnap) => {
          const data = docSnap.data();
          if (data.authorUid !== user.uid && data.readByRecipient !== true) {
            hasUnread = true;
          }
        });
        perEventHasUnread[event.id] = hasUnread;
        recompute();
      });
      unsubs.push(unsub);
    });

    return () => {
      unsubs.forEach((u) => {
        try {
          u();
        } catch {
          // ignore
        }
      });
    };
  }, [pendingEvents, user]);

  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (e) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target) &&
        !buttonRef.current?.contains(e.target)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('touchstart', onPointer);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('touchstart', onPointer);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  if (!user) return null;

  const hasUnread = count > 0;

  return (
    <div className="notification-bell-wrapper">
      <button
        ref={buttonRef}
        type="button"
        className={`notification-bell nav-link${hasUnread ? ' notification-bell--has-unread' : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={hasUnread ? `Benachrichtigungen (${count} ungelesen)` : 'Benachrichtigungen'}
        data-testid="notification-bell"
      >
        <Bell size={18} aria-hidden="true" />
        <span className="notification-bell-label">Nachrichten</span>
        {hasUnread && (
          <span className="notification-bell-badge" data-testid="notification-bell-badge">
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>

      {open && (
        <div
          ref={dropdownRef}
          className="notification-dropdown"
          role="dialog"
          aria-label="Benachrichtigungen"
          data-testid="notification-dropdown"
        >
          <header className="notification-dropdown-header">
            <h3>Nachrichten</h3>
            {hasUnread && <span className="notification-dropdown-count">{count} ungelesen</span>}
          </header>
          {eventsWithUnread.length === 0 ? (
            <p className="notification-dropdown-empty">Keine ungelesenen Nachrichten.</p>
          ) : (
            <ul className="notification-dropdown-list">
              {eventsWithUnread.map((event) => (
                <li key={event.id}>
                  <Link
                    to={`/event/${event.slug || event.id}`}
                    className="notification-dropdown-item"
                    onClick={() => setOpen(false)}
                  >
                    <span className="notification-dropdown-item-title">{event.title}</span>
                    <span className="notification-dropdown-item-meta">
                      {formatDate(event.date)}
                      {event.bezirk ? ` • ${event.bezirk}` : ''}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
