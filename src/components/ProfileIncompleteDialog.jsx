import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import './ConfirmDialog.css';
import './ProfileIncompleteDialog.css';

export default function ProfileIncompleteDialog({ isOpen, missingFields, onClose }) {
  useEffect(() => {
    if (!isOpen) return undefined;
    document.body.style.overflow = 'hidden';
    const handleEscape = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return createPortal(
    <div
      className="confirm-overlay fade-enter"
      onClick={onClose}
      data-testid="profile-incomplete-dialog-overlay"
    >
      <div
        className="confirm-dialog profile-incomplete-dialog"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-incomplete-dialog-title"
        data-testid="profile-incomplete-dialog"
      >
        <button
          type="button"
          className="confirm-close"
          onClick={onClose}
          aria-label="Schließen"
          data-testid="profile-incomplete-dialog-close"
        >
          <X size={20} />
        </button>

        <h2 id="profile-incomplete-dialog-title">Profil noch nicht vollständig</h2>
        <p className="profile-incomplete-dialog-intro">
          Bevor wir dein Profil öffentlich anzeigen können, fülle bitte diese Felder aus:
        </p>

        {missingFields && missingFields.length > 0 && (
          <ul className="profile-incomplete-fields" data-testid="profile-incomplete-fields">
            {missingFields.map(({ key, label }) => (
              <li key={key} data-testid={`profile-incomplete-field-${key}`}>
                {label}
              </li>
            ))}
          </ul>
        )}

        <div className="confirm-actions">
          <button
            type="button"
            onClick={onClose}
            className="btn btn-primary confirm-confirm"
            data-testid="profile-incomplete-dialog-confirm"
          >
            <span>Verstanden</span>
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
