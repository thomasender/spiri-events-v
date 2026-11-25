import { formCustomTime } from '../utils/customSeriesUpdates';

// "Beginn" and optional "Ende" of one date of a `custom` series (Trello 6afd86b4).
// Without an own value the row shows the time from above. The row of the event's
// own date (`fixed`) always has the time from above and is not editable here.
export default function CustomDateTimeInputs({
  index,
  date,
  customTimes,
  defaults,
  fixed = false,
  invalid = false,
  onChange,
}) {
  const shown = fixed
    ? { time: defaults.time || '', endTime: defaults.endTime || '' }
    : formCustomTime(customTimes, date, defaults);
  return (
    <>
      <label className="custom-date-time">
        <span>Beginn</span>
        <input
          type="time"
          value={shown.time}
          onChange={(e) => onChange(date, 'time', e.target.value)}
          disabled={fixed}
          aria-label={`Beginn Termin ${index + 1}`}
          data-testid={`custom-time-input-${index}`}
        />
      </label>
      <label className="custom-date-time">
        <span>Ende</span>
        <input
          type="time"
          value={shown.endTime}
          onChange={(e) => onChange(date, 'endTime', e.target.value)}
          disabled={fixed}
          className={invalid ? 'input-error' : ''}
          aria-label={`Ende Termin ${index + 1} (optional)`}
          data-testid={`custom-end-time-input-${index}`}
        />
      </label>
    </>
  );
}
