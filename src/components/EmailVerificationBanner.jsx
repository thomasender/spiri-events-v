import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { authErrorMessage } from '../hooks/useAuth';
import './EmailVerificationBanner.css';

export default function EmailVerificationBanner() {
  const { user, resendVerificationEmail, refreshEmailVerified } = useAuth();
  const [sending, setSending] = useState(false);
  const [checking, setChecking] = useState(false);
  const [sentMessage, setSentMessage] = useState('');
  const [error, setError] = useState('');

  if (!user || user.emailVerified) return null;

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

  return (
    <div
      className="email-verification-banner"
      role="status"
      data-testid="email-verification-banner"
    >
      <div className="email-verification-banner-icon" aria-hidden="true">
        <Mail size={20} />
      </div>
      <div className="email-verification-banner-body">
        <p className="email-verification-banner-title">
          Bitte bestätige deine E-Mail-Adresse, um Events zu erstellen.
        </p>
        <p className="email-verification-banner-text">
          Wir haben dir eine Verifizierungs-E-Mail an{' '}
          <strong data-testid="email-verification-banner-email">{user.email}</strong> gesendet. Erst
          nach dem Klick auf den Link darin kannst du neue Events anlegen.
        </p>
        {(sentMessage || error) && (
          <p
            className={
              sentMessage
                ? 'email-verification-banner-feedback email-verification-banner-feedback--success'
                : 'email-verification-banner-feedback email-verification-banner-feedback--error'
            }
            data-testid="email-verification-banner-feedback"
          >
            {sentMessage || error}
          </p>
        )}
        <div className="email-verification-banner-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleResend}
            disabled={sending || checking}
            data-testid="email-verification-resend"
          >
            {sending ? 'Wird gesendet…' : 'Verifizierungs-E-Mail erneut senden'}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleCheckAgain}
            disabled={sending || checking}
            data-testid="email-verification-refresh"
          >
            {checking ? 'Prüfe…' : 'Ich habe bestätigt – erneut prüfen'}
          </button>
          <Link to="/profil" className="btn btn-secondary">
            Zur Profilverwaltung
          </Link>
        </div>
      </div>
    </div>
  );
}
