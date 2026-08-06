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
  onChangeOccurrence,
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

  const formatDateShort = (dateStr) => {
    if (!dateStr) return '';
    const [year, month, day] = dateStr.split('-');
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString('de-DE', {
      day: 'numeric',
      month: 'long',
    });
  };

  return (
    <div className="confirm-overlay fade-enter" onClick={onCancel}>
      <div className="recurring-delete-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <AlertTriangle size={24} className="warning-icon" />
          <h2>Termin löschen</h2>
        </div>

        <p className="dialog-message">
          &ldquo;{eventTitle}&rdquo; ist eine wiederholende Veranstaltung.
        </p>

        {occurrenceDate && (
          <div className="occurrence-info">
            <Calendar size={16} />
            <span>Du hast den Termin vom {formatDate(occurrenceDate)} ausgewählt</span>
            {onChangeOccurrence && (
              <button
                className="occurrence-change-btn"
                onClick={onChangeOccurrence}
                title="Anderen Termin auswählen"
              >
                Ändern
              </button>
            )}
          </div>
        )}

        <div className="delete-options">
          <button className="delete-option-btn" onClick={onDeleteThisOnly} disabled={loading}>
            <div className="option-title">Nur diesen Termin löschen</div>
            <div className="option-desc">
              {occurrenceDate
                ? `Der Termin am ${formatDateShort(occurrenceDate)} wird gelöscht. Alle anderen Termine bleiben bestehen.`
                : 'Nur dieser eine Termin wird gelöscht.'}
            </div>
          </button>

          <button className="delete-option-btn" onClick={onDeleteThisAndFuture} disabled={loading}>
            <div className="option-title">Diesen und alle folgenden Termine löschen</div>
            <div className="option-desc">
              {occurrenceDate
                ? `Alle Termine ab ${formatDateShort(occurrenceDate)} werden gelöscht. Frühere Termine bleiben bestehen.`
                : 'Alle Termine ab dem Serienstart werden gelöscht.'}
            </div>
          </button>

          <button
            className="delete-option-btn delete-option-btn--danger"
            onClick={onDeleteAll}
            disabled={loading}
          >
            <div className="option-title">Gesamte Serie löschen</div>
            <div className="option-desc">
              Alle Termine dieser Serie werden unwiderruflich gelöscht.
            </div>
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
