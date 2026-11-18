import { useEffect } from 'react';
import { ExternalLink, X } from 'lucide-react';
import { formatEventDateShort } from '../utils/eventFormat';
import './ConfirmDialog.css';
import './DuplicateEventDialog.css';

function timeLabel(event) {
  if (!event.time) return '';
  return event.endTime ? `${event.time} – ${event.endTime} Uhr` : `${event.time} Uhr`;
}

function placeLabel(event) {
  if (event.isOnline) return 'Online';
  return [event.place, event.city].filter(Boolean).join(', ');
}

/**
 * Shown before a new event is saved when similar approved events exist (Trello 6afdc0ce).
 * `candidates` are event objects (id, slug, title, date, time, endTime, place, city).
 */
export default function DuplicateEventDialog({
  isOpen,
  candidates = [],
  onSubmitAnyway,
  onSaveDraft,
  onBack,
  onDiscard,
  loading = false,
}) {
  useEffect(() => {
    if (isOpen) document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="confirm-overlay fade-enter" onClick={onBack}>
      <div
        className="confirm-dialog duplicate-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="duplicate-dialog-title"
        onClick={(e) => e.stopPropagation()}
      >
        <button className="confirm-close" onClick={onBack} aria-label="Schließen" type="button">
          <X size={20} />
        </button>

        <h2 id="duplicate-dialog-title">Gibt es dieses Event schon?</h2>
        <p>
          {candidates.length === 1
            ? 'Wir haben ein Event gefunden, das deinem sehr ähnlich ist:'
            : 'Wir haben Events gefunden, die deinem sehr ähnlich sind:'}
        </p>

        <ul className="duplicate-list">
          {candidates.map((event) => (
            <li key={event.id} className="duplicate-item" data-testid="duplicate-candidate">
              <a
                className="duplicate-item-title"
                href={`/event/${event.slug || event.id}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <span>{event.title}</span>
                <ExternalLink size={14} aria-hidden="true" />
              </a>
              <span className="duplicate-item-meta">
                {[formatEventDateShort(event.date), timeLabel(event), placeLabel(event)]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </li>
          ))}
        </ul>

        <div className="duplicate-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={onSubmitAnyway}
            disabled={loading}
          >
            Mein Event ist anders, trotzdem einreichen
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onSaveDraft}
            disabled={loading}
          >
            Als Entwurf speichern
          </button>
          <button type="button" className="btn btn-secondary" onClick={onBack} disabled={loading}>
            Zurück und ändern
          </button>
          <button type="button" className="btn btn-danger" onClick={onDiscard} disabled={loading}>
            Mein Event verwerfen
          </button>
        </div>
      </div>
    </div>
  );
}
