import { useEffect } from 'react';
import { Calendar, AlertTriangle } from 'lucide-react';
import './RecurringDeleteDialog.css';

export default function RecurringDeleteDialog({
  isOpen,
  eventTitle,
  occurrenceDate,
  onDeleteThisOnly,
  onDeleteThisAndFuture,
  onDeleteAll,
  onCancel,
  loading = false,
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

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const [year, month, day] = dateStr.split('-');
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString('de-DE', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  };

  return (
    <div className="confirm-overlay fade-enter" onClick={onCancel}>
      <div className="recurring-delete-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <AlertTriangle size={24} className="warning-icon" />
          <h2>Wiederholendes Event löschen</h2>
        </div>

        <p className="dialog-message">
          &ldquo;{eventTitle}&rdquo; findet regelmäßig statt. Was möchtest du löschen?
        </p>

        {occurrenceDate && (
          <div className="occurrence-info">
            <Calendar size={16} />
            <span>Du bist auf dem Event vom {formatDate(occurrenceDate)}</span>
          </div>
        )}

        <div className="delete-options">
          <button className="delete-option-btn" onClick={onDeleteThisOnly} disabled={loading}>
            <div className="option-title">Nur dieses Event</div>
            <div className="option-desc">
              Lösche nur dieses eine Event am{' '}
              {occurrenceDate ? formatDate(occurrenceDate) : 'ausgewählten Datum'}
            </div>
          </button>

          <button className="delete-option-btn" onClick={onDeleteThisAndFuture} disabled={loading}>
            <div className="option-title">Dieses und alle zukünftigen Events</div>
            <div className="option-desc">Lösche dieses Event und alle folgenden Wiederholungen</div>
          </button>

          <button
            className="delete-option-btn delete-option-btn--danger"
            onClick={onDeleteAll}
            disabled={loading}
          >
            <div className="option-title">Ganze Serie löschen</div>
            <div className="option-desc">Lösche die gesamte wiederholende Event-Serie</div>
          </button>
        </div>

        <div className="dialog-actions">
          <button onClick={onCancel} className="btn btn-secondary" disabled={loading}>
            Abbrechen
          </button>
        </div>
      </div>
    </div>
  );
}
