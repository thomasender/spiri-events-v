import './EventChip.css'

export default function EventChip({ event, onClick }) {
  const isFree = event.contribution === 'free'

  return (
    <button
      className={`event-chip ${isFree ? 'event-chip--free' : 'event-chip--fee'}`}
      onClick={(e) => {
        e.stopPropagation()
        onClick(event)
      }}
      title={event.title}
    >
      <span className="event-chip-dot"></span>
      <span className="event-chip-title">{event.title}</span>
    </button>
  )
}
