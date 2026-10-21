import { Flag, Trash2 } from 'lucide-react';
import AvatarImage from '../AvatarImage';
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

export default function ChatMessage({ message, own, canDelete, canReport, onDelete, onReport }) {
  const emojiOnly = isEmojiOnly(message.text);
  return (
    <li
      className={`chat-message${own ? ' chat-message--own' : ''}${
        message.pending ? ' chat-message--pending' : ''
      }`}
      data-testid="chat-message"
    >
      {message.authorPhotoURL ? (
        <AvatarImage src={message.authorPhotoURL} alt="" className="chat-avatar" loading="lazy" />
      ) : (
        <span className="chat-avatar chat-avatar--fallback" aria-hidden="true">
          {(message.authorName || '?').trim().charAt(0).toUpperCase()}
        </span>
      )}
      <div className="chat-bubble-wrap">
        <div className="chat-meta">
          <span className="chat-author">{message.authorName}</span>
          <time className="chat-time">{formatChatTime(message.createdAt)}</time>
        </div>
        <div className={`chat-bubble${emojiOnly ? ' chat-bubble--emoji' : ''}`}>
          <MessageText text={message.text} />
        </div>
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
