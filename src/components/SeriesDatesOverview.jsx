import { useState } from 'react';
import { getSeriesStartDates } from '../utils/eventOccurrences';
import { parseEventDate } from '../utils/eventFormat';
import './SeriesDatesOverview.css';

const COLLAPSED_COUNT = 8;

const formatSeriesDate = (ymd) =>
  parseEventDate(ymd).toLocaleDateString('de-DE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

// "Deine Termine (N)": every date of a weekly / biweekly / monthly series with an
// end date, so single dates (cancellations) can be taken out. The first date
// (`date`) cannot be removed: move the start date instead. `fromDate` hides
// earlier dates (edit form: only upcoming ones; past exceptions stay as stored).
// For multi-day series only the start day is listed.
export default function SeriesDatesOverview({
  date,
  recurrence,
  recurrenceEndDate,
  exceptionDates,
  onChange,
  fromDate = '',
}) {
  const [expanded, setExpanded] = useState(false);
  const all = getSeriesStartDates({ date, recurrence, recurrenceEndDate });
  if (all.length === 0) return null;

  const exceptions = Array.isArray(exceptionDates) ? exceptionDates : [];
  const shown = all.filter((d) => !fromDate || d >= fromDate);
  if (shown.length === 0) return null;
  const removedCount = shown.filter((d) => exceptions.includes(d)).length;
  const visible = expanded ? shown : shown.slice(0, COLLAPSED_COUNT);

  const remove = (d) => onChange([...new Set([...exceptions, d])].sort());
  const restore = (d) => onChange(exceptions.filter((e) => e !== d));

  return (
    <div className="form-group series-dates" data-testid="series-dates">
      <h3 className="series-dates-title">
        Deine Termine ({shown.length - removedCount}
        {removedCount > 0 ? `, ${removedCount} entfernt` : ''})
      </h3>
      <p className="series-dates-hint">
        Fällt ein Termin aus? Entferne ihn hier, dann erscheint er nicht im Kalender.
      </p>
      <ul className="series-dates-list">
        {visible.map((d) => {
          const removed = exceptions.includes(d);
          const isFirst = d === date;
          return (
            <li
              key={d}
              className={`series-dates-item${removed ? ' series-dates-item-removed' : ''}`}
            >
              <span className="series-dates-label">{formatSeriesDate(d)}</span>
              {isFirst ? (
                <span className="series-dates-note">
                  Erster Termin. Verschiebe dazu das Startdatum.
                </span>
              ) : removed ? (
                <button
                  type="button"
                  className="series-dates-btn"
                  onClick={() => restore(d)}
                  aria-label={`${formatSeriesDate(d)} wiederherstellen`}
                >
                  Wiederherstellen
                </button>
              ) : (
                <button
                  type="button"
                  className="series-dates-btn series-dates-remove"
                  onClick={() => remove(d)}
                  aria-label={`${formatSeriesDate(d)} entfernen`}
                >
                  ✕
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {shown.length > COLLAPSED_COUNT && (
        <button
          type="button"
          className="series-dates-btn series-dates-toggle"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? 'Weniger anzeigen' : `Alle anzeigen (${shown.length})`}
        </button>
      )}
    </div>
  );
}
