import { useEffect } from 'react';
import { History, X } from 'lucide-react';
import { useLayoutHistory } from '../../hooks/useLayoutSettings';
import { LAYOUT_TOKENS_BY_NAME, describeValue } from '../../utils/layoutTokens';
import { loadDraft } from '../../lib/layoutStore';

const formatDate = (ts) => {
  const d = ts?.toDate?.();
  return d ? d.toLocaleString('de-AT', { dateStyle: 'medium', timeStyle: 'short' }) : 'gerade eben';
};

// Publish log. "Als Entwurf laden" puts an old state into the draft — it does
// not publish anything, so restoring is always a deliberate second step.
export default function HistoryDialog({ onClose, onRestored }) {
  const { entries, error } = useLayoutHistory(true);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="dm-backdrop" data-design-ui>
      <div
        className="dm-dialog dm-dialog--wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dm-history-title"
      >
        <header className="dm-popover-head">
          <h2 id="dm-history-title">
            <History size={16} aria-hidden="true" /> Verlauf
          </h2>
          <button type="button" className="dm-icon-btn" onClick={onClose} aria-label="Schließen">
            <X size={16} aria-hidden="true" />
          </button>
        </header>

        {error && (
          <p className="dm-error" role="alert">
            Verlauf konnte nicht geladen werden: {error}
          </p>
        )}
        {!error && !entries.length && <p className="dm-hint">Noch nichts veröffentlicht.</p>}

        <ol className="dm-history">
          {entries.map((entry) => (
            <li key={entry.id} className="dm-history-item">
              <div className="dm-history-meta">
                <strong>{formatDate(entry.publishedAt)}</strong>
                <span>{entry.publishedByName || 'Unbekannt'}</span>
              </div>
              {entry.note && <p className="dm-history-note">{entry.note}</p>}
              <ul className="dm-changes dm-changes--small">
                {(entry.changes || []).slice(0, 6).map((c) => {
                  const token = LAYOUT_TOKENS_BY_NAME[c.token];
                  return (
                    <li key={c.token}>
                      <span className="dm-changes-label">{token?.label || c.token}</span>
                      <span className="dm-changes-values">
                        {token ? describeValue(token, c.from) : c.from} →{' '}
                        <strong>{token ? describeValue(token, c.to) : c.to}</strong>
                      </span>
                    </li>
                  );
                })}
                {(entry.changes || []).length > 6 && (
                  <li className="dm-hint">… und {entry.changes.length - 6} weitere</li>
                )}
              </ul>
              <button
                type="button"
                className="dm-btn"
                onClick={() => {
                  loadDraft(entry.values || {});
                  onRestored();
                }}
              >
                Als Entwurf laden
              </button>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
