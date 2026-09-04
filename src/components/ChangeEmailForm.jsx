import { useState } from 'react';
import { authErrorMessage } from '../hooks/useAuth';
import './ProfileForm.css';

const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((email || '').trim());

function GoogleIcon() {
  return (
    <svg
      className="google-icon"
      viewBox="0 0 48 48"
      aria-hidden="true"
      focusable="false"
      width="18"
      height="18"
    >
      <path
        fill="#FFC107"
        d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"
      />
      <path
        fill="#FF3D00"
        d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571l6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"
      />
    </svg>
  );
}

export default function ChangeEmailForm({ currentEmail, onChangeEmail, isGoogleUser = false }) {
  const [newEmail, setNewEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    const trimmed = newEmail.trim();
    if (!isValidEmail(trimmed)) {
      setError('Bitte gib eine gültige E-Mail-Adresse ein.');
      return;
    }
    if (trimmed === currentEmail) {
      setError('Die neue E-Mail-Adresse ist identisch mit der aktuellen.');
      return;
    }
    if (!isGoogleUser && !password) {
      setError('Bitte gib dein aktuelles Passwort ein.');
      return;
    }

    setSaving(true);
    try {
      await onChangeEmail(trimmed, isGoogleUser ? null : password);
      setPassword('');
      setNewEmail('');
      setSuccess(
        'Bestätigungs-E-Mail gesendet. Bitte öffne den Link in deiner neuen E-Mail-Adresse, um die Änderung abzuschließen.'
      );
      setTimeout(() => setSuccess(''), 6000);
    } catch (err) {
      console.error('Email change failed:', err.code, err.message);
      setError(authErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="profile-card" data-testid="change-email-card">
      <h2 className="profile-card-title">E-Mail-Adresse ändern</h2>
      <p className="profile-card-hint">
        Aktuelle E-Mail: <strong data-testid="current-email">{currentEmail}</strong>
      </p>

      <form onSubmit={handleSubmit} className="profile-form" data-testid="change-email-form">
        <div className="form-group">
          <label htmlFor="change-email-new">Neue E-Mail-Adresse</label>
          <input
            id="change-email-new"
            type="email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            autoComplete="email"
            placeholder="neue@email.de"
            data-testid="change-email-new"
          />
        </div>

        {isGoogleUser ? (
          <p className="profile-card-hint" data-testid="change-email-google-notice">
            Du bist mit Google angemeldet. Beim Klick auf „E-Mail ändern“ öffnet sich ein
            Google-Anmeldefenster, um dich zu bestätigen.
          </p>
        ) : (
          <div className="form-group">
            <label htmlFor="change-email-password">Aktuelles Passwort</label>
            <input
              id="change-email-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              placeholder="••••••••"
              data-testid="change-email-password"
            />
          </div>
        )}

        {error && (
          <p className="submit-error" data-testid="change-email-error">
            {error}
          </p>
        )}
        {success && (
          <p className="success-text" data-testid="change-email-success">
            {success}
          </p>
        )}

        <div className="form-actions">
          <button
            type="submit"
            className={`btn ${isGoogleUser ? 'btn-google' : 'btn-primary'}`}
            disabled={saving}
            data-testid="change-email-submit"
          >
            {isGoogleUser && <GoogleIcon />}
            <span>{saving ? 'Wird gespeichert…' : 'E-Mail ändern'}</span>
          </button>
        </div>
      </form>
    </div>
  );
}
