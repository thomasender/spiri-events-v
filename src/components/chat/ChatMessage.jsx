import { Flag, Trash2 } from 'lucide-react';
import AvatarImage from '../AvatarImage';
import MessageReactions from './MessageReactions';
import { formatChatTime, isEmojiOnly, splitChatLinks } from '../../utils/chat';

function MessageText({ text }) {
  return splitChatLinks(text).map((part, i) =>
    part.type === 'link' ? (
      <a key={i} href={part.href} target="_blank" rel="noopener noreferrer nofollow ugc">
        {part.value}
      </a>
    ) : (
      <span key={i}>{part.value}</span>
    )
  );
}

export default function ChatMessage({
  message,
  own,
  canDelete,
  canReport,
  onDelete,
  onReport,
  onOpenMember,
  me,
  canReact = false,
  onReact,
  onReactError,
}) {
  const emojiOnly = isEmojiOnly(message.text);
  const openMember = !own && onOpenMember ? () => onOpenMember(message) : null;
  return (
    <li
      className={`chat-message${own ? ' chat-message--own' : ''}${
        message.pending ? ' chat-message--pending' : ''
      }`}
      data-testid="chat-message"
    >
      {/* Own messages sit on the right without an avatar, like in common messengers. */}
      {!own &&
        (() => {
          const avatar = message.authorPhotoURL ? (
            <AvatarImage
              src={message.authorPhotoURL}
              alt=""
              className="chat-avatar"
              loading="lazy"
            />
          ) : (
            <span className="chat-avatar chat-avatar--fallback" aria-hidden="true">
              {(message.authorName || '?').trim().charAt(0).toUpperCase()}
            </span>
          );
          return openMember ? (
            <button
              type="button"
              className="chat-member-button"
              onClick={openMember}
              aria-label={`${message.authorName} ansehen`}
              tabIndex={-1}
            >
              {avatar}
            </button>
          ) : (
            avatar
          );
        })()}
      <div className="chat-bubble-wrap">
        <div className="chat-meta">
          {openMember ? (
            <button type="button" className="chat-author chat-author-button" onClick={openMember}>
              {message.authorName}
            </button>
          ) : (
            <span className="chat-author">{message.authorName}</span>
          )}
          <time className="chat-time">{formatChatTime(message.createdAt)}</time>
        </div>
        <MessageReactions
          reactions={message.reactions}
          me={me}
          canReact={canReact && !message.pending && Boolean(onReact)}
          onReact={(emoji) => onReact(message, emoji)}
          onError={onReactError}
          text={message.text}
          align={own ? 'end' : 'start'}
        >
          <div
            className={`chat-bubble${own ? ' chat-bubble--own' : ''}${
              emojiOnly ? ' chat-bubble--emoji' : ''
            }`}
          >
            <MessageText text={message.text} />
          </div>
        </MessageReactions>
        {!message.pending && (canReport || canDelete) && (
          <div className="chat-actions">
            {canReport && (
              <button
                type="button"
                className="chat-action"
                onClick={() => onReport(message)}
                aria-label={`Nachricht von ${message.authorName} melden`}
                title="Melden"
              >
                <Flag size={14} aria-hidden="true" />
                <span>Melden</span>
              </button>
            )}
            {canDelete && (
              <button
                type="button"
                className="chat-action chat-action--danger"
                onClick={() => onDelete(message)}
                aria-label="Nachricht löschen"
                title="Löschen"
              >
                <Trash2 size={14} aria-hidden="true" />
                <span>Löschen</span>
              </button>
            )}
          </div>
        )}
      </div>
    </li>
  );
}
