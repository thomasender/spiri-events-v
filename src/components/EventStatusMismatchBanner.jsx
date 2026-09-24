import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { CheckCircle2, FileText, Info, Trash2, X } from 'lucide-react';
import { useEventById } from '../hooks/useEvents';
import './EventStatusMismatchBanner.css';

const STATUS_COPY = {
  approved: {
    icon: CheckCircle2,
    title: 'Event wurde bereits freigegeben',
    body: (event) =>
      `„${event.title}" wurde in der Zwischenzeit freigegeben und ist jetzt öffentlich sichtbar.`,
    primary: (event) =>
      event.slug ? { to: `/event/${event.slug}`, label: 'Event ansehen' } : null,
    secondary: { to: '/admin', label: 'Zur Verwaltung' },
  },
  trashed: {
    icon: Trash2,
    title: 'Event ist im Papierkorb',
    body: (event) =>
      `„${event.title}" wurde in den Papierkorb verschoben und wird nach 30 Tagen endgültig gelöscht.`,
    primary: { to: '/admin?tab=trash', label: 'Zum Papierkorb' },
    secondary: { to: '/admin', label: 'Zur Verwaltung' },
  },
  draft: {
    icon: FileText,
    title: 'Event ist wieder ein Entwurf',
    body: (event) =>
      `„${event.title}" wurde wieder in die Entwürfe zurückgesetzt. Die einreichende Person kann es erneut einreichen.`,
    primary: { to: '/admin?tab=drafts', label: 'Zu den Entwürfen' },
    secondary: { to: '/admin', label: 'Zur Verwaltung' },
  },
};

function StatusBanner({ event, copy, onDismiss }) {
  const Icon = copy.icon;
  const primary = typeof copy.primary === 'function' ? copy.primary(event) : copy.primary;
  const secondary = typeof copy.secondary === 'function' ? copy.secondary(event) : copy.secondary;
  return (
    <div
      className={`event-status-mismatch-banner event-status-mismatch-banner--${event.status}`}
      role="status"
      data-testid="event-status-mismatch-banner"
      data-status={event.status}
    >
      <div className="event-status-mismatch-banner-icon" aria-hidden="true">
        <Icon size={20} />
      </div>
      <div className="event-status-mismatch-banner-body">
        <p className="event-status-mismatch-banner-title">{copy.title}</p>
        <p className="event-status-mismatch-banner-text">{copy.body(event)}</p>
        <div className="event-status-mismatch-banner-actions">
          {primary && (
            <Link to={primary.to} className="btn btn-primary">
              {primary.label}
            </Link>
          )}
          <Link to={secondary.to} className="btn btn-secondary">
            {secondary.label}
          </Link>
        </div>
      </div>
      <button
        type="button"
        className="event-status-mismatch-banner-dismiss"
        onClick={onDismiss}
        aria-label="Hinweis schließen"
        data-testid="event-status-mismatch-banner-dismiss"
      >
        <X size={18} />
      </button>
    </div>
  );
}

function NotFoundBanner({ onDismiss }) {
  return (
    <div
      className="event-status-mismatch-banner event-status-mismatch-banner--missing"
      role="status"
      data-testid="event-status-mismatch-banner"
      data-status="missing"
    >
      <div className="event-status-mismatch-banner-icon" aria-hidden="true">
        <Info size={20} />
      </div>
      <div className="event-status-mismatch-banner-body">
        <p className="event-status-mismatch-banner-title">Event nicht gefunden</p>
        <p className="event-status-mismatch-banner-text">
          Dieses Event existiert nicht (mehr). Möglicherweise wurde es endgültig gelöscht.
        </p>
        <div className="event-status-mismatch-banner-actions">
          <Link to="/admin" className="btn btn-primary">
            Zur Verwaltung
          </Link>
        </div>
      </div>
      <button
        type="button"
        className="event-status-mismatch-banner-dismiss"
        onClick={onDismiss}
        aria-label="Hinweis schließen"
        data-testid="event-status-mismatch-banner-dismiss"
      >
        <X size={18} />
      </button>
    </div>
  );
}

export default function EventStatusMismatchBanner({ eventId }) {
  const { event, loading } = useEventById(eventId);
  const [dismissed, setDismissed] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  if (dismissed || loading) return null;

  const handleDismiss = () => {
    setDismissed(true);
    navigate(location.pathname + location.search, { replace: true });
  };

  if (!event) {
    return <NotFoundBanner onDismiss={handleDismiss} />;
  }

  const copy = STATUS_COPY[event.status];
  if (!copy) return null;

  return <StatusBanner event={event} copy={copy} onDismiss={handleDismiss} />;
}
