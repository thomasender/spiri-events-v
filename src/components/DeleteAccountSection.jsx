import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { authErrorMessage } from '../hooks/useAuth';
import ConfirmDialog from './ConfirmDialog';
import './ProfileForm.css';

export default function DeleteAccountSection({ onDelete }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const navigate = useNavigate();

  const handleConfirm = async () => {
    setError('');

    if (!password) {
      setError('Bitte gib dein Passwort ein.');
      setConfirmOpen(false);
      return;
    }

    setDeleting(true);
    try {
      await onDelete(password);
      setConfirmOpen(false);
      navigate('/');
    } catch (err) {
      console.error('Account delete failed:', err.code, err.message);
      setError(authErrorMessage(err));
      setConfirmOpen(false);
    } finally {
      setDeleting(false);
    }
  };

  const handleTrigger = () => {
    if (!password) {
      setError('Bitte gib dein Passwort ein.');
      return;
    }
    setConfirmOpen(true);
  };

  return (
    <div className="profile-card profile-danger-card" data-testid="delete-account-card">
      <h2 className="profile-card-title">Konto löschen</h2>
      <p className="profile-card-hint">
        Wenn du dein Konto löschst, werden dein Profil und dein Profilfoto dauerhaft entfernt.
        Bereits erstellte Events bleiben mit dem Vermerk „Unbekannt“ bestehen.
      </p>

      <div className="profile-danger-zone">
        <p className="danger-title">Achtung: Diese Aktion kann nicht rückgängig gemacht werden.</p>
        <p className="danger-text">
          Gib dein Passwort ein und bestätige die Löschung, um dein Konto dauerhaft zu entfernen.
        </p>

        <div className="form-group">
          <label htmlFor="delete-account-password">Aktuelles Passwort</label>
          <input
            id="delete-account-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            placeholder="••••••••"
            data-testid="delete-account-password"
          />
        </div>

        {error && (
          <p className="submit-error" data-testid="delete-account-error">
            {error}
          </p>
        )}

        <div className="form-actions">
          <button
            type="button"
            className="btn btn-subtle-danger"
            onClick={handleTrigger}
            disabled={deleting}
            data-testid="delete-account-trigger"
            aria-label="Konto löschen"
          >
            <Trash2 size={18} />
          </button>
        </div>
      </div>

      <ConfirmDialog
        isOpen={confirmOpen}
        title="Konto wirklich löschen?"
        message="Dein Konto, dein Profil und dein Profilfoto werden dauerhaft gelöscht. Bereits erstellte Events bleiben erhalten, werden aber ohne Veranstalter-Namen angezeigt."
        confirmLabel="Ja, endgültig löschen"
        cancelLabel="Abbrechen"
        onConfirm={handleConfirm}
        onCancel={() => setConfirmOpen(false)}
        loading={deleting}
        danger
      />
    </div>
  );
}
