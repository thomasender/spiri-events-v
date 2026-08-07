import './StatusBadge.css';

export default function StatusBadge({ status }) {
  if (status === 'approved') {
    return (
      <span className="status-badge status-badge--approved">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path
            d="M10 3L4.5 8.5L2 6"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        Genehmigt
      </span>
    );
  }

  if (status === 'draft') {
    return (
      <span className="status-badge status-badge--draft">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path
            d="M2.5 2.5H7L9.5 5V9.5H2.5V2.5Z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <path d="M7 2.5V5H9.5" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
          <path d="M4.25 7.25H7.75" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        Entwurf
      </span>
    );
  }

  return (
    <span className="status-badge status-badge--pending">
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
        <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.5" />
        <path d="M6 3.5V6L7.5 7.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      Ausstehend
    </span>
  );
}
