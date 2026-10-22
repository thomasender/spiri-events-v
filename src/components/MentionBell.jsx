import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { useMentionNotifications } from '../hooks/useMentionNotifications';
import { CANDLE_ROOM_NAME } from '../utils/candleRoom';
import { formatChatTime } from '../utils/chat';
import { describeMention, mentionLink } from '../utils/mentions';
import './MentionBell.css';

// Bell next to the Postfach: who mentioned me in the Lagerfeuer or a Kerzenraum.
// In-app only, no e-mail. `variant="row"` is the entry in the phone menu.
export default function MentionBell({ uid, variant = 'icon', onNavigate }) {
  const { items, unreadCount, markRead, markAllRead } = useMentionNotifications(uid);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onPointer = (e) => {
      if (!wrapRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('touchstart', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('touchstart', onPointer);
    };
  }, [open]);

  const label = unreadCount > 0 ? `Erwähnungen (${unreadCount} ungelesen)` : 'Erwähnungen';

  const follow = (mention) => {
    setOpen(false);
    onNavigate?.();
    if (!mention.read) markRead(mention.id).catch(() => {});
  };

  return (
    <div className={`mention-bell mention-bell--${variant}`} ref={wrapRef}>
      <button
        type="button"
        className={`mention-bell-button${variant === 'icon' ? ' nav-link nav-link--icon' : ' nav-link'}`}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={label}
        title={variant === 'icon' ? 'Erwähnungen' : undefined}
        onClick={() => setOpen((o) => !o)}
        data-testid="mention-bell"
      >
        <span className="nav-link-admin-icon">
          <Bell size={18} aria-hidden="true" />
          {unreadCount > 0 && (
            <span className="nav-link-badge" data-testid="mention-unread-badge" aria-hidden="true">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </span>
        <span>Erwähnungen</span>
      </button>
      {open && (
        <div className="mention-panel" data-testid="mention-panel">
          <div className="mention-panel-head">
            <strong>Erwähnungen</strong>
            {unreadCount > 0 && (
              <button
                type="button"
                className="mention-read-all"
                onClick={() => markAllRead().catch(() => {})}
                data-testid="mention-read-all"
              >
                Alle gelesen
              </button>
            )}
          </div>
          {items.length === 0 ? (
            <p className="mention-empty" data-testid="mention-empty">
              Noch hat dich niemand erwähnt.
            </p>
          ) : (
            <ul className="mention-list">
              {items.map((m) => (
                <li key={m.id}>
                  <Link
                    to={mentionLink(m)}
                    className={`mention-item${m.read ? '' : ' mention-item--unread'}`}
                    onClick={() => follow(m)}
                    data-testid="mention-item"
                  >
                    <span className="mention-item-title">
                      {describeMention(m, CANDLE_ROOM_NAME)}
                    </span>
                    {m.excerpt && <span className="mention-item-excerpt">{m.excerpt}</span>}
                    {m.createdAt && (
                      <time className="mention-item-time">{formatChatTime(m.createdAt)}</time>
                    )}
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
