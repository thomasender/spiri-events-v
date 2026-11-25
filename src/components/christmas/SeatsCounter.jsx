// Anonymous seat counter: only the totals, never names.
export default function SeatsCounter({ taken, capacity, light = false }) {
  const free = Math.max(0, capacity - taken);
  const pct = Math.min(100, Math.round((taken / capacity) * 100));
  const level = free === 0 ? 'full' : pct >= 85 ? 'low' : 'ok';
  return (
    <div
      className={`xmas-seats xmas-seats--${level}${light ? ' xmas-seats--light' : ''}`}
      data-testid="xmas-seats"
    >
      <div
        className="xmas-seats-bar"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={capacity}
        aria-valuenow={Math.min(taken, capacity)}
        aria-label="Belegte Plätze"
      >
        <span style={{ width: `${pct}%` }} />
      </div>
      <p>
        <strong>
          {taken} von {capacity}
        </strong>{' '}
        Plätzen belegt ·{' '}
        {free === 0 ? 'aktuell ausgebucht' : `noch ${free} ${free === 1 ? 'Platz' : 'Plätze'} frei`}
      </p>
    </div>
  );
}
