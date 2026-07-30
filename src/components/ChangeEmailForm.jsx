import { useState } from 'react';
import { authErrorMessage } from '../hooks/useAuth';
import './ProfileForm.css';

const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((email || '').trim());

export default function ChangeEmailForm({ currentEmail, onChangeEmail }) {
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
    if (!password) {
      setError('Bitte gib dein aktuelles Passwort ein.');
      return;
    }

    setSaving(true);
    try {
      await onChangeEmail(trimmed, password);
      setPassword('');
      setNewEmail('');
      setSuccess('E-Mail-Adresse aktualisiert.');
      setTimeout(() => setSuccess(''), 4000);
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
            className="btn btn-primary"
            disabled={saving}
            data-testid="change-email-submit"
          >
            {saving ? 'Wird gespeichert…' : 'E-Mail ändern'}
          </button>
        </div>
      </form>
    </div>
  );
}
