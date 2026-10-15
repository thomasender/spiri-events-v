import { useEffect, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import DeleteReasonField from './DeleteReasonField';
import './ConfirmDialog.css';

/**
 * Generic confirm dialog. With `reasonRequired` it also shows a required
 * "Grund" textarea; the confirm button stays disabled until a non-empty
 * reason is entered and `onConfirm` receives the trimmed reason.
 */
export default function ConfirmDialog(props) {
  const { isOpen } = props;
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  // Mounted only while open, so the reason resets every time the dialog opens.
  return <ConfirmDialogContent {...props} />;
}

function ConfirmDialogContent({
  title,
  message,
  children,
  confirmLabel = 'Bestätigen',
  cancelLabel = 'Abbrechen',
  onConfirm,
  onCancel,
  loading = false,
  danger = false,
  reasonRequired = false,
  hideActions = false,
}) {
  const [reason, setReason] = useState('');
  const trimmedReason = reason.trim();
  const confirmDisabled = loading || (reasonRequired && trimmedReason.length === 0);

  const handleConfirm = () => {
    if (confirmDisabled) return;
    if (reasonRequired) {
      onConfirm(trimmedReason);
    } else {
      onConfirm();
    }
  };

  return (
    <div className="confirm-overlay fade-enter" onClick={onCancel}>
      <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
        <button className="confirm-close" onClick={onCancel}>
          <X size={20} />
        </button>

        <h2>{title}</h2>
        {children ? <div className="confirm-dialog-body">{children}</div> : <p>{message}</p>}

        {reasonRequired && (
          <DeleteReasonField value={reason} onChange={setReason} disabled={loading} />
        )}

        {!hideActions && (
          <div className="confirm-actions">
            <button onClick={onCancel} className="btn btn-secondary" disabled={loading}>
              {cancelLabel}
            </button>
            <button
              onClick={handleConfirm}
              className={`btn ${danger ? 'btn-danger' : 'btn-primary'} confirm-confirm`}
              disabled={confirmDisabled}
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
        )}
      </div>
    </div>
  );
}
