import { Link } from 'react-router-dom';
import AvatarImage from '../AvatarImage';
import { formatChatTime } from '../../utils/chat';
import { isThreadUnread, otherUid } from '../../utils/messenger';

export function MemberAvatar({ info, className = 'messenger-avatar' }) {
  if (info?.photoURL) {
    return <AvatarImage src={info.photoURL} alt="" className={className} loading="lazy" />;
  }
  return (
    <span className={`${className} ${className}--fallback`} aria-hidden="true">
      {(info?.name || '?').trim().charAt(0).toUpperCase()}
    </span>
  );
}

// The inbox: my conversations, newest first. `infos` maps uid -> member info.
export default function ThreadList({ threads, infos, me, activeUid, online, loading }) {
  if (loading) return <p className="messenger-empty">Lade…</p>;
  if (threads.length === 0) {
    return (
      <p className="messenger-empty" data-testid="messenger-empty">
        Noch keine Unterhaltungen. Klicke im Lagerfeuer auf eine Person und wähle „Nachricht
        senden“.
      </p>
    );
  }
  return (
    <ul className="messenger-threads" aria-label="Unterhaltungen">
      {threads.map((thread) => {
        const other = otherUid(thread, me);
        const info = infos[other];
        const unread = isThreadUnread(thread, me);
        const mine = thread.lastMessageBy === me;
        return (
          <li key={thread.id}>
            <Link
              to={`/postfach/${other}`}
              className={`messenger-thread${other === activeUid ? ' messenger-thread--active' : ''}${
                unread ? ' messenger-thread--unread' : ''
              }`}
              aria-current={other === activeUid ? 'page' : undefined}
              data-testid="messenger-thread"
            >
              <span className="messenger-avatar-wrap">
                <MemberAvatar info={info} />
                {online?.has(other) && (
                  <span className="messenger-online" title="Gerade im Chat">
                    <span className="visually-hidden">online</span>
                  </span>
                )}
              </span>
              <span className="messenger-thread-body">
                <span className="messenger-thread-top">
                  <span className="messenger-thread-name">{info?.name ?? '…'}</span>
                  <time className="messenger-thread-time">
                    {formatChatTime(thread.lastMessageAt)}
                  </time>
                </span>
                <span className="messenger-thread-snippet">
                  {mine ? 'Du: ' : ''}
                  {thread.lastMessageText}
                </span>
              </span>
              {unread && (
                <span className="messenger-unread-dot" data-testid="messenger-unread">
                  <span className="visually-hidden">ungelesen</span>
                </span>
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
