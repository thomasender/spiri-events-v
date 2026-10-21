import './OnlineDot.css';

// Green = online, red = offline. Renders nothing for `null` (status not shared).
// Meant to sit inside a `position: relative` avatar wrapper.
export default function OnlineDot({ status, className = '' }) {
  if (status !== 'online' && status !== 'offline') return null;
  const label = status === 'online' ? 'Online' : 'Offline';
  return (
    <span
      className={`online-dot online-dot--${status} ${className}`.trim()}
      role="img"
      aria-label={label}
      title={label}
      data-testid="online-dot"
      data-status={status}
    />
  );
}
