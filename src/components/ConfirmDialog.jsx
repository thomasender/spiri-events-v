import { useEffect } from 'react';
import { Loader2, X } from 'lucide-react';
import './ConfirmDialog.css';

export default function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel = 'Bestätigen',
  cancelLabel = 'Abbrechen',
  onConfirm,
  onCancel,
  loading = false,
  danger = false,
}) {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="confirm-overlay fade-enter" onClick={onCancel}>
      <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
        <button className="confirm-close" onClick={onCancel}>
          <X size={20} />
        </button>

        <h2>{title}</h2>
        <p>{message}</p>

        <div className="confirm-actions">
          <button onClick={onCancel} className="btn btn-secondary" disabled={loading}>
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={`btn ${danger ? 'btn-danger' : 'btn-primary'} confirm-confirm`}
            disabled={loading}
          >
            {loading && (
              <Loader2
                size={16}
                className="spin"
                aria-hidden="true"
                data-testid="confirm-dialog-spinner"
              />
            )}
            <span>{confirmLabel}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
