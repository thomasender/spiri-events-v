import { seatStatus } from '../../lib/christmasPage';

// Never a number: nothing while there is plenty of room, "few places left" from
// 60 people on, "fully booked (waiting list)" when full.
export default function SeatsHint({ persons }) {
  const status = seatStatus(persons);
  if (status === 'open') return null;
  return (
    <p className={`xmas-seats-hint xmas-seats-hint--${status}`} data-testid="xmas-seats-hint">
      {status === 'few'
        ? 'Nur noch wenige Plätze frei'
        : 'Aktuell ausgebucht – du kannst dich auf die Warteliste setzen'}
    </p>
  );
}
