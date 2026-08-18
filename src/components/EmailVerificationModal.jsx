import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { Mail, X } from 'lucide-react';
import { useAuth, authErrorMessage } from '../hooks/useAuth';
import './EmailVerificationModal.css';

export default function EmailVerificationModal({ open, onClose }) {
  const { user, resendVerificationEmail, refreshEmailVerified } = useAuth();
  const [sending, setSending] = useState(false);
  const [checking, setChecking] = useState(false);
  const [sentMessage, setSentMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) {
      setSentMessage('');
      setError('');
      setSending(false);
      setChecking(false);
      return undefined;
    }
    const handleEscape = (e) => {
      if (e.key === 'Escape' && !sending && !checking) onClose();
    };
    document.addEventListener('keydown', handleEscape);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [open, onClose, sending, checking]);

  if (!open || !user || user.emailVerified) return null;

  const handleResend = async () => {
    setError('');
    setSentMessage('');
    setSending(true);
    try {
      await resendVerificationEmail();
      setSentMessage('Verifizierungs-E-Mail wurde erneut gesendet.');
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setSending(false);
    }
  };

  const handleCheckAgain = async () => {
    setError('');
    setSentMessage('');
    setChecking(true);
    try {
      await refreshEmailVerified();
    } finally {
      setChecking(false);
    }
  };

  const handleClose = () => {
    if (sending || checking) return;
    onClose();
  };

  return createPortal(
    <div
      className="modal-overlay fade-enter"
      onClick={handleClose}
      data-testid="email-verification-modal-overlay"
    >
      <div
        className="modal-content email-verification-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="email-verification-modal-title"
        data-testid="email-verification-modal"
      >
        <button
          type="button"
          className="modal-close"
          onClick={handleClose}
          aria-label="Schließen"
          disabled={sending || checking}
        >
          <X size={24} />
        </button>

        <header className="email-verification-modal-header">
          <Mail size={24} className="email-verification-modal-icon" aria-hidden="true" />
          <h2 id="email-verification-modal-title">Bitte bestätige deine E-Mail-Adresse</h2>
        </header>

        <p className="email-verification-modal-intro">
          Um Events zu erstellen, musst du zuerst deine E-Mail-Adresse bestätigen. Wir haben dir
          eine Verifizierungs-E-Mail an{' '}
          <strong data-testid="email-verification-modal-email">{user.email}</strong> gesendet.
          Klicke auf den Link in der E-Mail, um deine Adresse zu bestätigen.
        </p>

        {(sentMessage || error) && (
          <p
            className={
              sentMessage
                ? 'email-verification-modal-feedback email-verification-modal-feedback--success'
                : 'email-verification-modal-feedback email-verification-modal-feedback--error'
            }
            data-testid="email-verification-modal-feedback"
            role={error ? 'alert' : 'status'}
          >
            {sentMessage || error}
          </p>
        )}

        <div className="email-verification-modal-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleResend}
            disabled={sending || checking}
            data-testid="email-verification-modal-resend"
          >
            {sending ? 'Wird gesendet…' : 'Verifizierungs-E-Mail erneut senden'}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleCheckAgain}
            disabled={sending || checking}
            data-testid="email-verification-modal-refresh"
          >
            {checking ? 'Prüfe…' : 'Ich habe bestätigt – erneut prüfen'}
          </button>
          <Link
            to="/profil"
            className="btn btn-secondary"
            onClick={handleClose}
            data-testid="email-verification-modal-profile"
          >
            Zur Profilverwaltung
          </Link>
        </div>
      </div>
    </div>,
    document.body
  );
}
