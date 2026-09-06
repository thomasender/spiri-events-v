import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { CATEGORY_COLOR_PALETTE } from '../utils/categoryColors';
import './CategoryColorPickerDialog.css';

export default function CategoryColorPickerDialog({
  open,
  categoryLabel,
  usedColors,
  onSelect,
  onClose,
}) {
  useEffect(() => {
    if (!open) return undefined;
    const handleEscape = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  const isUsed = (color) => usedColors instanceof Set && usedColors.has(color);

  return createPortal(
    <div
      className="modal-overlay fade-enter"
      onClick={onClose}
      data-testid="category-color-picker-overlay"
    >
      <div
        className="modal-content category-color-picker"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="category-color-picker-title"
        data-testid="category-color-picker"
      >
        <button
          type="button"
          className="modal-close"
          onClick={onClose}
          aria-label="Schließen"
          data-testid="category-color-picker-close"
        >
          <X size={24} />
        </button>

        <header className="category-color-picker-header">
          <h2 id="category-color-picker-title">Farbe für neue Kategorie wählen</h2>
          {categoryLabel && (
            <p className="category-color-picker-subtitle">
              Bitte wähle eine Farbe für die neue Kategorie{' '}
              <strong data-testid="category-color-picker-name">{categoryLabel}</strong>.
            </p>
          )}
          {!categoryLabel && (
            <p className="category-color-picker-subtitle">
              Bitte wähle eine Farbe für die neue Kategorie.
            </p>
          )}
        </header>

        <ul
          className="category-color-picker-swatches"
          role="radiogroup"
          aria-label="Verfügbare Farben"
        >
          {CATEGORY_COLOR_PALETTE.map((entry) => {
            const disabled = isUsed(entry.value);
            return (
              <li key={entry.value}>
                <button
                  type="button"
                  role="radio"
                  aria-checked="false"
                  aria-disabled={disabled}
                  disabled={disabled}
                  title={disabled ? `${entry.label} — wird bereits verwendet` : entry.label}
                  className={`category-color-picker-swatch${
                    disabled ? ' category-color-picker-swatch--disabled' : ''
                  }`}
                  style={{ backgroundColor: entry.value }}
                  onClick={() => {
                    if (!disabled) onSelect(entry.value);
                  }}
                  data-testid={`category-color-swatch-${entry.value.replace('#', '')}`}
                  data-color={entry.value}
                >
                  <span className="category-color-picker-swatch-label">{entry.label}</span>
                </button>
              </li>
            );
          })}
        </ul>

        <p className="category-color-picker-hint">
          Bereits verwendete Farben sind ausgegraut und können nicht erneut ausgewählt werden.
        </p>

        <div className="category-color-picker-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onClose}
            data-testid="category-color-picker-cancel"
          >
            Abbrechen
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
