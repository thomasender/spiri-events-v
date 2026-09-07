import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import ColorPicker from './ColorPicker';
import { normalizeCategoryInput, isValidCategoryInput } from '../utils/categoryInput';
import './CategoryEditDialog.css';

// Modal for creating or editing a single category. Rendered via
// createPortal so it overlays any underlying admin tab UI. Local state
// holds the in-progress name + color so the parent can stay simple and
// this dialog can be reused for both add and edit flows.
export default function CategoryEditDialog({
  open,
  mode = 'create',
  initialName = '',
  initialColor = '#c48e6a',
  nameExists,
  onSave,
  onClose,
}) {
  const [name, setName] = useState(initialName);
  const [color, setColor] = useState(initialColor);
  const [error, setError] = useState('');
  const [hexValid, setHexValid] = useState(true);

  useEffect(() => {
    if (!open) return undefined;
    setName(initialName);
    setColor(initialColor);
    setError('');
    setHexValid(true);
    const handleEscape = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [open, initialName, initialColor, onClose]);

  if (!open) return null;

  const normalizedName = normalizeCategoryInput(name);
  const nameOk = isValidCategoryInput(normalizedName);
  const colorOk = /^#[0-9a-fA-F]{6}$/.test(color);
  const duplicate = mode === 'create' && nameExists && nameExists(normalizedName);
  const canSave = nameOk && colorOk && hexValid && !duplicate;

  const handleSave = async () => {
    if (!canSave) return;
    try {
      await onSave({ name: normalizedName, color });
      onClose();
    } catch (err) {
      setError(err.message || 'Speichern fehlgeschlagen.');
    }
  };

  return createPortal(
    <div className="modal-overlay fade-enter" onClick={onClose} data-testid="category-edit-overlay">
      <div
        className="modal-content category-edit-dialog"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="category-edit-title"
        data-testid="category-edit-dialog"
      >
        <button
          type="button"
          className="modal-close"
          onClick={onClose}
          aria-label="Schließen"
          data-testid="category-edit-close"
        >
          <X size={24} />
        </button>

        <header className="category-edit-dialog-header">
          <h2 id="category-edit-title">
            {mode === 'create' ? 'Neue Kategorie' : 'Kategorie bearbeiten'}
          </h2>
        </header>

        <div className="category-edit-dialog-body">
          <div className="form-group">
            <label htmlFor="category-edit-name" className="category-edit-dialog-label">
              Name
            </label>
            <input
              id="category-edit-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="z.B. Yoga, Pilates, Qi Gong"
              maxLength={40}
              autoFocus="off"
              aria-invalid={!nameOk || Boolean(duplicate)}
              data-testid="category-edit-name"
            />
            {!nameOk && name.length > 0 && (
              <p
                className="category-edit-dialog-error"
                data-testid="category-edit-name-error"
                role="alert"
              >
                Name muss 2–40 Zeichen haben.
              </p>
            )}
            {duplicate && (
              <p
                className="category-edit-dialog-error"
                data-testid="category-edit-duplicate-error"
                role="alert"
              >
                Eine Kategorie mit diesem Namen existiert bereits.
              </p>
            )}
          </div>

          <div className="form-group">
            <span className="category-edit-dialog-label">Farbe</span>
            <ColorPicker
              value={color}
              onChange={setColor}
              onValidityChange={setHexValid}
              id="category-edit-color"
            />
          </div>

          {error && (
            <p
              className="category-edit-dialog-error"
              data-testid="category-edit-error"
              role="alert"
            >
              {error}
            </p>
          )}
        </div>

        <div className="category-edit-dialog-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onClose}
            data-testid="category-edit-cancel"
          >
            Abbrechen
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleSave}
            disabled={!canSave}
            data-testid="category-edit-save"
          >
            {mode === 'create' ? 'Anlegen' : 'Speichern'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
