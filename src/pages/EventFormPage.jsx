import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useEventById } from '../hooks/useEvents';
import { useAuth } from '../hooks/useAuth';
import EventForm from '../components/EventForm';
import EventFormWizard from '../components/EventFormWizard';
import EmailVerificationBanner from '../components/EmailVerificationBanner';
import SeoMeta from '../components/SeoMeta';
import NoAccess from '../components/NoAccess';
import { canEditEvent } from '../utils/eventPermissions';
import '../components/EventFormWizard.css';

export default function EventFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, role, loading: authLoading, canCreateEvents } = useAuth();
  const { event, loading: eventLoading, error } = useEventById(id);
  const [checkedAuth, setCheckedAuth] = useState(false);

  const isEdit = Boolean(id);

  useEffect(() => {
    if (!user && checkedAuth) {
      navigate('/login');
    } else if (user) {
      setCheckedAuth(true);
    } else {
      setCheckedAuth(true);
    }
  }, [user, checkedAuth, navigate]);

  if (!checkedAuth || eventLoading || (isEdit && authLoading)) {
    return <div className="loading-spinner"></div>;
  }

  if (!user) {
    return <div className="loading-spinner"></div>;
  }

  if (isEdit && (error || !event)) {
    navigate('/admin');
    return null;
  }

  if (!isEdit && !canCreateEvents) {
    return (
      <div className="event-form-page" data-testid="event-create-blocked">
        <SeoMeta title="Event erstellen" path="/admin/new" noindex />
        <div className="event-form-container">
          <h1>Event erstellen</h1>
          <EmailVerificationBanner />
          <div className="event-form-actions">
            <button type="button" className="btn btn-secondary" onClick={() => navigate('/admin')}>
              Zurück zur Verwaltung
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Content edits: owner or Super-Admin only. A Regions-Moderator:in can
  // read events of her region but only review them, so a direct link to the
  // form gets a clear "Kein Zugriff" instead of a form that cannot save.
  if (isEdit && !canEditEvent(user, event, role)) {
    return (
      <div className="event-form-page" data-testid="event-edit-blocked">
        <SeoMeta title="Event bearbeiten" path={`/admin/edit/${id}`} noindex />
        <NoAccess message="Dieses Event kann nur die Person bearbeiten, die es erstellt hat, oder ein Super-Admin. Freigeben, zurückschicken oder löschen kannst du es im Bereich „Review“." />
      </div>
    );
  }

  if (isEdit) {
    return (
      <>
        <SeoMeta title="Event bearbeiten" path={id ? `/admin/edit/${id}` : '/admin'} noindex />
        <EventForm event={event} />
      </>
    );
  }

  return (
    <>
      <SeoMeta title="Neues Event" path="/admin/new" noindex />
      <EventFormWizard />
    </>
  );
}
