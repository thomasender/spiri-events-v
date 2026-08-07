import { useState, useEffect, useRef } from 'react';
import { Send, MessageSquare, ShieldCheck } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useEventMessages } from '../hooks/useEventMessages';
import './EventMessages.css';

function formatTime(timestamp) {
  if (!timestamp) return '';
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return date.toLocaleString('de-DE', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function EventMessages({ eventId }) {
  const { user, role } = useAuth();
  const { messages, loading, sending, sendMessage, markAsRead } = useEventMessages(eventId);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const listRef = useRef(null);
  const markedRef = useRef(new Set());

  useEffect(() => {
    if (!user || messages.length === 0) return;
    messages.forEach((msg) => {
      if (
        msg.authorUid !== user.uid &&
        msg.readByRecipient !== true &&
        !markedRef.current.has(msg.id)
      ) {
        markedRef.current.add(msg.id);
        markAsRead(msg.id);
      }
    });
  }, [messages, user, markAsRead]);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages.length]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const trimmed = text.trim();
    if (!trimmed) return;
    try {
      await sendMessage(trimmed);
      setText('');
    } catch (err) {
      setError(err.message || 'Nachricht konnte nicht gesendet werden.');
    }
  };

  return (
    <section
      className="event-messages"
      id="event-messages"
      data-testid="event-messages"
      aria-label="Nachrichten"
    >
      <header className="event-messages-header">
        <MessageSquare size={20} aria-hidden="true" />
        <h2>Nachrichten</h2>
        {role === 'Admin' && (
          <span className="event-messages-hint">
            <ShieldCheck size={14} aria-hidden="true" />
            Admin-Nachricht
          </span>
        )}
      </header>

      <div className="event-messages-thread" ref={listRef} data-testid="event-messages-thread">
        {loading ? (
          <div className="event-messages-empty">Nachrichten werden geladen…</div>
        ) : messages.length === 0 ? (
          <div className="event-messages-empty">
            Noch keine Nachrichten. Schreibe die erste Nachricht, falls du etwas klären möchtest.
          </div>
        ) : (
          <ul className="event-messages-list">
            {messages.map((msg) => {
              const isMine = msg.authorUid === user?.uid;
              const isAdmin = msg.authorRole === 'Admin';
              return (
                <li
                  key={msg.id}
                  className={[
                    'event-message',
                    isMine ? 'event-message--mine' : 'event-message--theirs',
                    isAdmin ? 'event-message--admin' : 'event-message--user',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  data-testid="event-message"
                >
                  <div className="event-message-meta">
                    <span className="event-message-author">
                      {isAdmin ? 'Admin' : msg.authorName || 'Veranstalter'}
                    </span>
                    <span className="event-message-time">{formatTime(msg.createdAt)}</span>
                  </div>
                  <p className="event-message-text">{msg.text}</p>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <form className="event-messages-composer" onSubmit={handleSubmit}>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={
            role === 'Admin'
              ? 'Beschreibe, was am Event geändert werden soll…'
              : 'Schreibe eine Antwort an das Admin-Team…'
          }
          rows={3}
          disabled={sending}
          data-testid="event-message-input"
          maxLength={2000}
        />
        <div className="event-messages-composer-footer">
          <span className="event-messages-count">{text.length} / 2000</span>
          {error && <span className="event-messages-error">{error}</span>}
          <button
            type="submit"
            className="btn btn-primary btn-sm"
            disabled={sending || !text.trim()}
            data-testid="event-message-send"
          >
            <Send size={16} aria-hidden="true" />
            <span>{sending ? 'Wird gesendet…' : 'Senden'}</span>
          </button>
        </div>
      </form>
    </section>
  );
}
