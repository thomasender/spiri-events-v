import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { CalendarPlus, Heart, X } from 'lucide-react';
import './LoginPromptModal.css';

// Features that are only available with an account; each gets its own wording.
const VARIANTS = {
  favorites: {
    Icon: Heart,
    title: 'Melde dich an, um Favoriten zu speichern',
    text: 'Mit einem kostenlosen Konto kannst du Events als Favoriten merken und jederzeit unter „Meine Favoriten“ wiederfinden.',
  },
  calendar: {
    Icon: CalendarPlus,
    title: 'Melde dich an, um Events in deinen Kalender zu übernehmen',
    text: 'Mit einem kostenlosen Konto kannst du einzelne Events herunterladen oder den ganzen Kalender in deiner Kalender-App (z. B. Google, Apple oder Outlook) abonnieren.',
  },
};

export default function LoginPromptModal({
  open,
  onClose,
  returnTo,
  onLogin,
  variant = 'favorites',
}) {
  const { Icon, title, text } = VARIANTS[variant] ?? VARIANTS.favorites;
  useEffect(() => {
    if (!open) return undefined;
    const handleEscape = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="modal-overlay fade-enter" onClick={onClose} data-testid="login-prompt-overlay">
      <div
        className="modal-content login-prompt-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="login-prompt-title"
        data-testid="login-prompt-modal"
      >
        <button type="button" className="modal-close" onClick={onClose} aria-label="Schließen">
          <X size={24} />
        </button>
        <header className="login-prompt-header">
          <Icon size={24} className="login-prompt-icon" aria-hidden="true" />
          <h2 id="login-prompt-title">{title}</h2>
        </header>
        <p className="login-prompt-text">{text}</p>
        <div className="login-prompt-actions">
          <Link
            to="/login"
            state={{ from: returnTo }}
            className="btn btn-primary"
            onClick={onLogin}
            data-testid="login-prompt-login"
          >
            Anmelden oder registrieren
          </Link>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Abbrechen
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
