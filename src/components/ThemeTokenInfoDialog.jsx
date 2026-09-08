import { useEffect, useId } from 'react';
import { createPortal } from 'react-dom';
import { Info, X } from 'lucide-react';
import './ThemeTokenInfoDialog.css';

// Modal-style info popup shown when the admin clicks the info icon next
// to a theme variable. Renders via `createPortal` so it escapes any
// stacking context the admin tab creates. Closes on backdrop click,
// close button, or Escape.
export default function ThemeTokenInfoDialog({ token, onClose }) {
  const titleId = useId();

  useEffect(() => {
    if (!token) return undefined;
    document.body.style.overflow = 'hidden';
    const handleKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', handleKey);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKey);
    };
  }, [token, onClose]);

  if (!token) return null;

  return createPortal(
    <div
      className="theme-info-overlay fade-enter"
      onClick={onClose}
      role="presentation"
      data-testid="theme-info-overlay"
    >
      <div
        className="theme-info-dialog"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-testid="theme-info-dialog"
      >
        <button
          type="button"
          className="theme-info-close"
          onClick={onClose}
          aria-label="Schließen"
          data-testid="theme-info-close"
        >
          <X size={20} aria-hidden="true" />
        </button>

        <header className="theme-info-header">
          <Info size={20} aria-hidden="true" />
          <h2 id={titleId}>{token.label}</h2>
        </header>

        <dl className="theme-info-meta">
          <dt>CSS-Variable</dt>
          <dd>
            <code data-testid="theme-info-name">{token.name}</code>
          </dd>
          <dt>Standardwert</dt>
          <dd>
            <code data-testid="theme-info-default">{token.defaultValue}</code>
            <span
              className="theme-info-swatch"
              aria-hidden="true"
              style={{ backgroundColor: token.defaultValue }}
              data-testid="theme-info-default-swatch"
            />
          </dd>
          <dt>Aktueller Wert</dt>
          <dd>
            <code data-testid="theme-info-current">{token.currentValue}</code>
            <span
              className="theme-info-swatch"
              aria-hidden="true"
              style={{ backgroundColor: token.currentValue }}
              data-testid="theme-info-current-swatch"
            />
          </dd>
        </dl>

        <section className="theme-info-usage">
          <h3>{token.unused ? 'Hinweis' : 'Verwendung'}</h3>
          {token.unused ? (
            <p>
              Diese Variable ist aktuell nirgendwo im Code per <code>var(...)</code> referenziert —
              sie bleibt für künftige Design-Erweiterungen reserviert. Eine Änderung hat momentan
              keine sichtbare Auswirkung.
            </p>
          ) : (
            <ul data-testid="theme-info-usage-list">
              {token.usedIn.map((line, index) => (
                <li key={index}>{line}</li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>,
    document.body
  );
}
