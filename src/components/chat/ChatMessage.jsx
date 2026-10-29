import { Flag, Trash2 } from 'lucide-react';
import AvatarImage from '../AvatarImage';
import { MemberBadgeFrame } from '../MemberBadge';
import MessageReactions from './MessageReactions';
import { formatChatTime, isEmojiOnly, splitChatLinks } from '../../utils/chat';
import { splitMentions } from '../../utils/mentions';

// Links first, then "@Name" inside the plain parts (only names listed in `mentions`).
function MessageText({ text, mentions, me }) {
  return splitChatLinks(text).map((part, i) => {
    if (part.type === 'link') {
      return (
        <a key={i} href={part.href} target="_blank" rel="noopener noreferrer nofollow ugc">
          {part.value}
        </a>
      );
    }
    return splitMentions(part.value, mentions).map((piece, j) =>
      piece.type === 'mention' ? (
        <span
          key={`${i}-${j}`}
          className={`chat-mention${piece.uid === me ? ' chat-mention--me' : ''}`}
          data-testid="chat-mention"
        >
          {piece.value}
        </span>
      ) : (
        <span key={`${i}-${j}`}>{piece.value}</span>
      )
    );
  });
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
  isTarget = false,
}) {
  const mentionsMe = Boolean(me) && Boolean(message.mentions?.[me]) && !own;
  const emojiOnly = isEmojiOnly(message.text);
  const openMember = !own && onOpenMember ? () => onOpenMember(message) : null;
  return (
    <li
      id={`msg-${message.id}`}
      className={`chat-message${own ? ' chat-message--own' : ''}${
        message.pending ? ' chat-message--pending' : ''
      }${mentionsMe ? ' chat-message--mentions-me' : ''}${isTarget ? ' chat-message--target' : ''}`}
      data-testid="chat-message"
    >
      {/* Own messages sit on the right without an avatar, like in common messengers. */}
      {!own &&
        (() => {
          // Badge from the live member list by uid, not from the message copy.
          const avatar = (
            <MemberBadgeFrame uid={message.authorUid}>
              {message.authorPhotoURL ? (
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
              )}
            </MemberBadgeFrame>
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
            <MessageText text={message.text} mentions={message.mentions} me={me} />
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
