import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail } from 'lucide-react';
import { useEventsWithMessages } from '../hooks/useEventsWithMessages';
import { getEventFallbackImage } from '../utils/eventFallbacks';
import './MessagesTab.css';

const MESSAGES_ANCHOR = 'event-messages';

function formatDate(dateStr) {
  if (!dateStr) return '';
  const [year, month, day] = dateStr.split('-');
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString('de-DE', {
    day: 'numeric',
    month: 'short',
  });
}

function MessagesTabItem({ event, unreadCount }) {
  const fallbackImage = getEventFallbackImage(event);
  const [imageError, setImageError] = useState(false);
  const imageSrc = event.imageUrl && !imageError ? event.imageUrl : fallbackImage;
  const hasUnread = unreadCount > 0;
  return (
    <Link
      to={`/event/${event.slug || event.id}#${MESSAGES_ANCHOR}`}
      className={hasUnread ? 'messages-tab-item messages-tab-item--unread' : 'messages-tab-item'}
      data-testid="messages-tab-item"
      aria-label={
        hasUnread
          ? `${event.title} – ${unreadCount} ungelesene Nachricht${unreadCount > 1 ? 'en' : ''}`
          : event.title
      }
    >
      <span className="messages-tab-item-image-wrapper">
        <img
          src={imageSrc}
          alt=""
          className="messages-tab-item-image"
          data-testid="messages-tab-item-image"
          onError={() => setImageError(true)}
        />
      </span>
      <span className="messages-tab-item-body">
        <span className="messages-tab-item-title">{event.title}</span>
        <span className="messages-tab-item-meta">
          {formatDate(event.date)}
          {event.bezirk ? ` • ${event.bezirk}` : ''}
        </span>
      </span>
      {hasUnread && (
        <span
          className="messages-tab-item-badge"
          data-testid="messages-tab-item-badge"
          aria-hidden="true"
        >
          {unreadCount > 9 ? '9+' : unreadCount}
        </span>
      )}
    </Link>
  );
}

export default function MessagesTab() {
  const { events, unreadCountByEvent, loading } = useEventsWithMessages();

  if (loading) {
    return <div className="loading-spinner" data-testid="messages-tab-loading"></div>;
  }

  if (events.length === 0) {
    return (
      <div className="messages-tab-empty" data-testid="messages-tab-empty">
        <Mail size={32} aria-hidden="true" />
        <h2>Keine Nachrichten</h2>
        <p>Wenn das Admin-Team dir zu einem Event schreibt, findest du die Nachricht hier.</p>
      </div>
    );
  }

  return (
    <ul className="messages-tab-list" data-testid="messages-tab-list">
      {events.map((event) => (
        <li key={event.id}>
          <MessagesTabItem event={event} unreadCount={unreadCountByEvent[event.id] || 0} />
        </li>
      ))}
    </ul>
  );
}
