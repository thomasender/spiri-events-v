import './CancelledBadge.css';

// "Abgesagt" label for a cancelled event or a cancelled date of a series.
export default function CancelledBadge({ className = '' }) {
  return (
    <span className={`cancelled-badge ${className}`.trim()} data-testid="cancelled-badge">
      Abgesagt
    </span>
  );
}
