import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { Heart, X } from 'lucide-react';
import './LoginPromptModal.css';

export default function LoginPromptModal({ open, onClose, returnTo, onLogin }) {
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
          <Heart size={24} className="login-prompt-icon" aria-hidden="true" />
          <h2 id="login-prompt-title">Melde dich an, um Favoriten zu speichern</h2>
        </header>
        <p className="login-prompt-text">
          Mit einem kostenlosen Konto kannst du Events als Favoriten merken und jederzeit unter
          „Meine Favoriten“ wiederfinden.
        </p>
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
