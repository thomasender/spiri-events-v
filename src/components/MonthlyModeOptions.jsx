import { getMonthlyWeekdayPhrase } from '../utils/eventOccurrences';

// Sub-choice under "Monatlich": same date every month, or the n-th weekday.
// The texts come live from the start date, so they follow a date change.
export default function MonthlyModeOptions({ recurrence, date, onSelect }) {
  if (recurrence !== 'monthly' && recurrence !== 'monthlyWeekday') return null;
  const day = date ? Number(date.split('-')[2]) : null;
  const weekdayPhrase = getMonthlyWeekdayPhrase(date);

  return (
    <div className="form-group" data-testid="monthly-mode-options">
      <label>Monatlich wiederholen</label>
      <div className="radio-group">
        <label className={`radio-label ${recurrence === 'monthly' ? 'active' : ''}`}>
          <input
            type="radio"
            name="monthlyMode"
            value="monthly"
            checked={recurrence === 'monthly'}
            onChange={() => onSelect('monthly')}
          />
          <span>am gleichen Datum{day ? ` (jeweils am ${day}.)` : ''}</span>
        </label>
        <label className={`radio-label ${recurrence === 'monthlyWeekday' ? 'active' : ''}`}>
          <input
            type="radio"
            name="monthlyMode"
            value="monthlyWeekday"
            checked={recurrence === 'monthlyWeekday'}
            onChange={() => onSelect('monthlyWeekday')}
          />
          <span>am {weekdayPhrase || 'gleichen Wochentag'}</span>
        </label>
      </div>
    </div>
  );
}
