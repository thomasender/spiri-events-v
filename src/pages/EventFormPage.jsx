import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useEventById } from '../hooks/useEvents';
import { useAuth } from '../hooks/useAuth';
import EventForm from '../components/EventForm';
import EventFormWizard from '../components/EventFormWizard';
import EmailVerificationBanner from '../components/EmailVerificationBanner';
import SeoMeta from '../components/SeoMeta';
import '../components/EventFormWizard.css';

export default function EventFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, canCreateEvents } = useAuth();
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

  if (!checkedAuth || eventLoading) {
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
