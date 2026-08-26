import './EventChip.css';

export default function EventChip({ event, onClick }) {
  const isFree = event.contribution === 'free';
  const isDonation = event.contribution === 'donation';

  const variant = isFree
    ? 'event-chip--free'
    : isDonation
      ? 'event-chip--donation'
      : 'event-chip--fee';

  return (
    <button
      className={`event-chip ${variant}`}
      onClick={(e) => {
        e.stopPropagation();
        onClick(event);
      }}
      title={event.title}
    >
      <span className="event-chip-dot"></span>
      <span className="event-chip-title">{event.title}</span>
    </button>
  );
}
