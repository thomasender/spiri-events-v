import { Link } from 'react-router-dom';
import { Mail } from 'lucide-react';
import { useEventsWithUnreadMessages } from '../hooks/useEventsWithUnreadMessages';
import './MessagesTab.css';

function formatDate(dateStr) {
  if (!dateStr) return '';
  const [year, month, day] = dateStr.split('-');
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString('de-DE', {
    day: 'numeric',
    month: 'short',
  });
}

export default function MessagesTab() {
  const { events, loading } = useEventsWithUnreadMessages();

  if (loading) {
    return <div className="loading-spinner" data-testid="messages-tab-loading"></div>;
  }

  if (events.length === 0) {
    return (
      <div className="messages-tab-empty" data-testid="messages-tab-empty">
        <Mail size={32} aria-hidden="true" />
        <h2>Keine ungelesenen Nachrichten</h2>
        <p>Wenn das Admin-Team dir zu einem Event schreibt, findest du die Nachricht hier.</p>
      </div>
    );
  }

  return (
    <ul className="messages-tab-list" data-testid="messages-tab-list">
      {events.map((event) => (
        <li key={event.id}>
          <Link
            to={`/event/${event.slug || event.id}`}
            className="messages-tab-item"
            data-testid="messages-tab-item"
          >
            <span className="messages-tab-item-title">{event.title}</span>
            <span className="messages-tab-item-meta">
              {formatDate(event.date)}
              {event.bezirk ? ` • ${event.bezirk}` : ''}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
