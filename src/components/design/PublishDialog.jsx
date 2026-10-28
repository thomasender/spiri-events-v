import { useEffect, useRef, useState } from 'react';
import { Loader2, Rocket } from 'lucide-react';
import { LAYOUT_TOKENS_BY_NAME, describeValue } from '../../utils/layoutTokens';
import { listChanges, useLayoutState } from '../../lib/layoutStore';
import { publishLayoutDraft } from '../../hooks/useLayoutSettings';

// Final step: show exactly what goes live, ask for a short note for the log,
// then write the live document + history entry in one batch.
export default function PublishDialog({ user, onClose, onPublished }) {
  const layout = useLayoutState();
  const changes = listChanges(layout);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const noteRef = useRef(null);

  useEffect(() => {
    noteRef.current?.focus();
    const onKey = (e) => e.key === 'Escape' && !busy && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  const publish = async () => {
    setBusy(true);
    setError(null);
    try {
      await publishLayoutDraft({ user, note });
      onPublished();
    } catch (err) {
      setError(err.message || 'Veröffentlichen fehlgeschlagen.');
      setBusy(false);
    }
  };

  return (
    <div className="dm-backdrop" data-design-ui>
      <div className="dm-dialog" role="dialog" aria-modal="true" aria-labelledby="dm-publish-title">
        <h2 id="dm-publish-title">Änderungen veröffentlichen</h2>
        <p className="dm-hint">
          Das wirkt <strong>sofort für alle Besucher</strong> der Website. Im Verlauf kannst du es
          jederzeit wieder rückgängig machen.
        </p>

        <ul className="dm-changes">
          {changes.map((c) => {
            const token = LAYOUT_TOKENS_BY_NAME[c.token];
            return (
              <li key={c.token}>
                <span className="dm-changes-label">{c.label}</span>
                <span className="dm-changes-values">
                  {describeValue(token, c.from)} → <strong>{describeValue(token, c.to)}</strong>
                </span>
              </li>
            );
          })}
        </ul>

        <label className="dm-field">
          <span>Kurze Notiz (optional)</span>
          <input
            ref={noteRef}
            type="text"
            maxLength={200}
            value={note}
            placeholder="z. B. Karten luftiger gemacht"
            onChange={(e) => setNote(e.target.value)}
          />
        </label>

        {error && (
          <p className="dm-error" role="alert">
            {error}
          </p>
        )}

        <div className="dm-dialog-actions">
          <button type="button" className="dm-btn" onClick={onClose} disabled={busy}>
            Abbrechen
          </button>
          <button
            type="button"
            className="dm-btn dm-btn--primary"
            onClick={publish}
            disabled={busy || !changes.length}
          >
            {busy ? (
              <Loader2 size={14} className="dm-spin" aria-hidden="true" />
            ) : (
              <Rocket size={14} aria-hidden="true" />
            )}
            Jetzt veröffentlichen
          </button>
        </div>
      </div>
    </div>
  );
}
