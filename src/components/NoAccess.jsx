import { Link } from 'react-router-dom';
import { Lock } from 'lucide-react';

/**
 * Friendly "Kein Zugriff" state for admin areas the signed-in person may not
 * open (e.g. a Regions-Moderator:in following a link to the Theme editor).
 * Shown instead of an empty page; the data behind it is protected by the
 * Firestore rules and the callables anyway.
 */
export default function NoAccess({
  message = 'Dieser Bereich ist nur für das Kernteam freigeschaltet. Wenn du glaubst, dass du hier Zugriff haben solltest, melde dich bitte beim Team.',
  backTo = '/admin',
  backLabel = 'Zurück zur Verwaltung',
}) {
  return (
    <div className="event-list-empty" data-testid="no-access" role="alert">
      <div className="empty-icon">
        <Lock size={48} aria-hidden="true" />
      </div>
      <h2>Kein Zugriff</h2>
      <p>{message}</p>
      <Link to={backTo} className="btn btn-primary">
        {backLabel}
      </Link>
    </div>
  );
}
