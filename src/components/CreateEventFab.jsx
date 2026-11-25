import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { useRegion } from '../hooks/useRegion';
import './CreateEventFab.css';

// Everybody goes straight into the wizard: guests and members whose e-mail is
// not confirmed yet fill it in and are asked to log in / confirm only at the end
// (docs/guest-event-draft.md).
export default function CreateEventFab() {
  const { comingSoon, regionId } = useRegion();
  // On a coming-soon region page the event belongs to that region.
  const addEventPath = comingSoon && regionId ? `/admin/new?region=${regionId}` : '/admin/new';

  return (
    <Link
      to={addEventPath}
      className="create-event-fab"
      aria-label="Event erstellen"
      data-testid="create-event-fab"
    >
      <Plus size={22} aria-hidden="true" />
      <span className="create-event-fab-label">Event erstellen</span>
    </Link>
  );
}
