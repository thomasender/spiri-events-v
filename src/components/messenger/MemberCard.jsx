import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { MessageCircle, User, X } from 'lucide-react';
import AvatarImage from '../AvatarImage';
import { useAuth } from '../../hooks/useAuth';
import { useMemberInfo } from '../../hooks/useMemberInfo';
import { useMessengerAccess } from '../../hooks/useChatSettings';
import { useAcceptsDirectMessages } from '../../hooks/useMessenger';
import './MemberCard.css';

// Small card for a person in the chat: write them a private message or open their profile.
export default function MemberCard({ uid, fallbackName, fallbackPhotoURL, onClose }) {
  const { user } = useAuth();
  const info = useMemberInfo(uid);
  const { available: messengerOpen } = useMessengerAccess();
  const accepts = useAcceptsDirectMessages(uid);
  const closeRef = useRef(null);
  const name = info?.name || fallbackName || 'Mitglied';
  const photoURL = info?.photoURL || fallbackPhotoURL || null;
  const isSelf = user?.uid === uid;

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="member-card-overlay" onClick={onClose} data-testid="member-card-overlay">
      <div
        className="member-card"
        role="dialog"
        aria-modal="true"
        aria-label={name}
        onClick={(e) => e.stopPropagation()}
        data-testid="member-card"
      >
        <button
          ref={closeRef}
          type="button"
          className="member-card-close"
          onClick={onClose}
          aria-label="Schließen"
        >
          <X size={18} aria-hidden="true" />
        </button>
        {photoURL ? (
          <AvatarImage src={photoURL} alt="" className="member-card-avatar" />
        ) : (
          <span className="member-card-avatar member-card-avatar--fallback" aria-hidden="true">
            {name.trim().charAt(0).toUpperCase()}
          </span>
        )}
        <h2 className="member-card-name">{name}</h2>
        <div className="member-card-actions">
          {messengerOpen && !isSelf && info?.exists !== false && (
            <>
              {accepts ? (
                <Link
                  to={`/postfach/${uid}`}
                  className="btn btn-primary"
                  onClick={onClose}
                  data-testid="member-card-message"
                >
                  <MessageCircle size={18} aria-hidden="true" /> Nachricht senden
                </Link>
              ) : (
                <p className="member-card-note" data-testid="member-card-no-dm">
                  {name} nimmt aktuell keine Privatnachrichten an.
                </p>
              )}
            </>
          )}
          {info?.slug && (
            <Link to={`/${info.slug}`} className="btn btn-secondary" onClick={onClose}>
              <User size={18} aria-hidden="true" /> Profil ansehen
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
