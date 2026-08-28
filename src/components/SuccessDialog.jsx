import { useEffect } from 'react';
import { CheckCircle2, X } from 'lucide-react';
import './SuccessDialog.css';

export default function SuccessDialog({
  isOpen,
  title,
  message,
  details,
  confirmLabel = 'Verstanden',
  onConfirm,
}) {
  useEffect(() => {
    if (!isOpen) return undefined;
    document.body.style.overflow = 'hidden';
    const handleEscape = (e) => {
      if (e.key === 'Escape') onConfirm?.();
    };
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [isOpen, onConfirm]);

  if (!isOpen) return null;

  return (
    <div className="confirm-overlay fade-enter" onClick={onConfirm}>
      <div
        className="confirm-dialog success-dialog"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="success-dialog-title"
        data-testid="success-dialog"
      >
        <button className="confirm-close" onClick={onConfirm} aria-label="Schließen">
          <X size={20} />
        </button>

        <CheckCircle2
          size={48}
          className="success-dialog-icon"
          aria-hidden="true"
          data-testid="success-dialog-icon"
        />
        <h2 id="success-dialog-title">{title}</h2>
        <p className="success-dialog-message">{message}</p>
        {details && (
          <p className="success-dialog-details" data-testid="success-dialog-details">
            {details}
          </p>
        )}

        <div className="confirm-actions">
          <button
            onClick={onConfirm}
            className="btn btn-primary confirm-confirm"
            data-testid="success-dialog-confirm"
          >
            <span>{confirmLabel}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
