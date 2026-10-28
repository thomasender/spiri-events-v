import './OnlineDot.css';

// Green = online. Renders nothing when offline or `null` (status not shared): no red dot.
// Meant to sit inside a `position: relative` avatar wrapper.
export default function OnlineDot({ status, className = '' }) {
  if (status !== 'online') return null;
  const label = 'Online';
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
