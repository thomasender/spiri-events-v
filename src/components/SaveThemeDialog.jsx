import { useEffect, useId, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, X } from 'lucide-react';
import './SaveThemeDialog.css';

// Modal dialog used when the admin clicks "Als neues Theme speichern".
// Captures the new theme's `name` (1–50 chars, required) and optional
// `description` (≤200 chars). On submit the dialog calls `onSave({ name,
// description })` and only resolves with the new theme id when the hook
// returns; closes on Escape / backdrop click / Cancel.
export default function SaveThemeDialog({
  open,
  defaultName = '',
  loading = false,
  onSave,
  onClose,
}) {
  const titleId = useId();
  const [name, setName] = useState(defaultName);
  const [description, setDescription] = useState('');
  const [error, setError] = useState(null);

  // Reset the form every time the dialog (re)opens so the admin doesn't
  // see a stale draft from a previous attempt. We intentionally only
  // depend on `open` here — including `defaultName`/`onClose` in the
  // deps would re-run this effect on every parent re-render (parent
  // passes a fresh `() => setSaveDialogOpen(false)` each render) and
  // overwrite whatever the admin has just typed.
  useEffect(() => {
    if (!open) return undefined;
    setName(defaultName || '');
    setDescription('');
    setError(null);
    document.body.style.overflow = 'hidden';
    const onKey = (e) => {
      if (e.key === 'Escape' && !loading) onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;
    setError(null);
    try {
      await onSave({ name: name.trim(), description: description.trim() });
    } catch (err) {
      setError(err.message || 'Speichern fehlgeschlagen.');
    }
  };

  return createPortal(
    <div
      className="save-theme-overlay fade-enter"
      onClick={() => !loading && onClose?.()}
      role="presentation"
      data-testid="save-theme-overlay"
    >
      <form
        className="save-theme-dialog"
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-testid="save-theme-dialog"
      >
        <button
          type="button"
          className="save-theme-close"
          onClick={() => !loading && onClose?.()}
          aria-label="Schließen"
          disabled={loading}
          data-testid="save-theme-close"
        >
          <X size={20} aria-hidden="true" />
        </button>

        <header className="save-theme-header">
          <h2 id={titleId}>Als neues Theme speichern</h2>
          <p>
            Speichert die aktuelle Editor-Konfiguration als neues Theme in der Theme-Bibliothek. Du
            kannst es danach jederzeit laden, umbenennen, löschen oder aktivieren.
          </p>
        </header>

        <div className="save-theme-body">
          <label className="save-theme-field">
            <span className="save-theme-label">
              Name{' '}
              <span className="save-theme-required" aria-hidden="true">
                *
              </span>
            </span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={50}
              autoFocus
              required
              disabled={loading}
              data-testid="save-theme-name"
            />
            <span className="save-theme-hint">
              {name.length}/50 Zeichen — kurz und aussagekräftig, z.B. &bdquo;Waldfrühling&ldquo;
            </span>
          </label>

          <label className="save-theme-field">
            <span className="save-theme-label">Beschreibung (optional)</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={200}
              rows={3}
              disabled={loading}
              data-testid="save-theme-description"
            />
            <span className="save-theme-hint">
              {description.length}/200 Zeichen — hilft Admins, das Theme später wiederzufinden.
            </span>
          </label>

          {error && (
            <div className="save-theme-error" role="alert" data-testid="save-theme-error">
              {error}
            </div>
          )}
        </div>

        <div className="save-theme-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => !loading && onClose?.()}
            disabled={loading}
            data-testid="save-theme-cancel"
          >
            Abbrechen
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={loading || !name.trim()}
            data-testid="save-theme-confirm"
          >
            {loading && (
              <Loader2
                size={16}
                className="spin"
                aria-hidden="true"
                data-testid="save-theme-spinner"
              />
            )}
            <span>Speichern</span>
          </button>
        </div>
      </form>
    </div>,
    document.body
  );
}
