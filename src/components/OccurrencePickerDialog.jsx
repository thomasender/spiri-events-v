import { useEffect, useState } from 'react';
import { Calendar } from 'lucide-react';
import { getEventOccurrences } from '../utils/eventOccurrences';
import './OccurrencePickerDialog.css';

export default function OccurrencePickerDialog({
  isOpen,
  event,
  initialOccurrenceDate,
  onConfirm,
  onCancel,
}) {
  const [selectedDate, setSelectedDate] = useState(null);

  useEffect(() => {
    if (isOpen) {
      setSelectedDate(initialOccurrenceDate || null);
    }
  }, [isOpen, initialOccurrenceDate]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen || !event) return null;

  const allOccurrences = getEventOccurrences(event);
  const upcomingOccurrences = allOccurrences.filter((o) => {
    const [y, m, d] = o.date.split('-');
    const occDate = new Date(y, m - 1, d);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return occDate >= today;
  });

  const formatDateShort = (dateStr) => {
    const [year, month, day] = dateStr.split('-');
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString('de-DE', {
      weekday: 'short',
      day: 'numeric',
      month: 'long',
    });
  };

  const formatTime = (dateStr, time) => {
    if (!time) return null;
    const [year, month, day] = dateStr.split('-');
    const d = new Date(year, month - 1, day);
    const [h, min] = time.split(':');
    d.setHours(parseInt(h, 10), parseInt(min, 10));
    return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  };

  const handleConfirm = () => {
    if (selectedDate) {
      onConfirm(selectedDate);
    }
  };

  return (
    <div className="confirm-overlay fade-enter" onClick={onCancel}>
      <div className="occurrence-picker-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <Calendar size={24} />
          <h2>Termin auswählen</h2>
        </div>

        <p className="dialog-message">
          Welchen Termin von &ldquo;{event.title}&rdquo; möchtest du löschen?
        </p>

        <div className="occurrence-list">
          {upcomingOccurrences.length === 0 ? (
            <p className="no-occurrences">Keine anstehenden Termine gefunden.</p>
          ) : (
            upcomingOccurrences.slice(0, 20).map((occ) => {
              const isSelected = selectedDate === occ.date;
              const timeStr = formatTime(occ.date, occ.time);
              return (
                <button
                  key={occ.date}
                  className={`occurrence-option ${isSelected ? 'occurrence-option--selected' : ''}`}
                  onClick={() => setSelectedDate(occ.date)}
                >
                  <span className="occurrence-date">{formatDateShort(occ.date)}</span>
                  {timeStr && <span className="occurrence-time">{timeStr}</span>}
                  {isSelected && <span className="occurrence-check">✓</span>}
                </button>
              );
            })
          )}
        </div>

        <div className="dialog-actions">
          <button onClick={onCancel} className="btn btn-secondary">
            Abbrechen
          </button>
          <button onClick={handleConfirm} className="btn btn-primary" disabled={!selectedDate}>
            Weiter
          </button>
        </div>
      </div>
    </div>
  );
}
