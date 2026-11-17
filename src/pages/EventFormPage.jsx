import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useEventById } from '../hooks/useEvents';
import { useAuth } from '../hooks/useAuth';
import EventForm from '../components/EventForm';
import EventFormWizard from '../components/EventFormWizard';
import SeoMeta from '../components/SeoMeta';
import NoAccess from '../components/NoAccess';
import { canEditEvent } from '../utils/eventPermissions';
import '../components/EventFormWizard.css';

export default function EventFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, role, loading: authLoading } = useAuth();
  const { event, loading: eventLoading, error } = useEventById(id);

  const isEdit = Boolean(id);

  // Editing needs an account (the route is protected); creating does not:
  // guests and members whose e-mail is not confirmed yet fill in the wizard,
  // which asks for the login / confirmation only at the end
  // (docs/guest-event-draft.md).
  useEffect(() => {
    if (isEdit && !authLoading && !user) navigate('/login');
  }, [isEdit, authLoading, user, navigate]);

  if (authLoading || (isEdit && eventLoading)) {
    return <div className="loading-spinner"></div>;
  }

  if (!isEdit) {
    return (
      <>
        <SeoMeta title="Neues Event" path="/admin/new" noindex />
        {/* A new key per account: after a login the wizard starts again from the draft. */}
        <EventFormWizard key={user?.uid ?? 'guest'} />
      </>
    );
  }

  if (!user) {
    return <div className="loading-spinner"></div>;
  }

  if (error || !event) {
    navigate('/admin');
    return null;
  }

  // Content edits: owner or Super-Admin only. A Regions-Moderator:in can
  // read events of her region but only review them, so a direct link to the
  // form gets a clear "Kein Zugriff" instead of a form that cannot save.
  if (!canEditEvent(user, event, role)) {
    return (
      <div className="event-form-page" data-testid="event-edit-blocked">
        <SeoMeta title="Event bearbeiten" path={`/admin/edit/${id}`} noindex />
        <NoAccess message="Dieses Event kann nur die Person bearbeiten, die es erstellt hat, oder ein Super-Admin. Freigeben, zurückschicken oder löschen kannst du es im Bereich „Review“." />
      </div>
    );
  }

  return (
    <>
      <SeoMeta title="Event bearbeiten" path={`/admin/edit/${id}`} noindex />
      <EventForm event={event} />
    </>
  );
}
