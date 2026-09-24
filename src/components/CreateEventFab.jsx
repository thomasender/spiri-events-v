import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import EmailVerificationModal from './EmailVerificationModal';
import './CreateEventFab.css';

export default function CreateEventFab() {
  const { user, canCreateEvents } = useAuth();
  const navigate = useNavigate();
  const [verificationModalOpen, setVerificationModalOpen] = useState(false);

  // Three branches mirror the original inline create-event CTA so the
  // mobile FAB offers the same affordances as the desktop/tablet CTA:
  //   - signed-in & verified → route to /admin/new
  //   - signed-in but not verified → prompt via the verification modal
  //   - anonymous → send to /login (the nav itself also offers this)
  const handleClick = (event) => {
    if (canCreateEvents) return; // <Link> handles navigation
    if (user) {
      event.preventDefault();
      setVerificationModalOpen(true);
      return;
    }
    event.preventDefault();
    navigate('/login');
  };

  const fabProps = {
    className: 'create-event-fab',
    'aria-label': 'Event erstellen',
    'data-testid': 'create-event-fab',
    onClick: handleClick,
  };

  return (
    <>
      {canCreateEvents ? (
        <Link to="/admin/new" {...fabProps}>
          <Plus size={22} aria-hidden="true" />
          <span className="create-event-fab-label">Event erstellen</span>
        </Link>
      ) : (
        <button type="button" {...fabProps}>
          <Plus size={22} aria-hidden="true" />
          <span className="create-event-fab-label">Event erstellen</span>
        </button>
      )}
      <EmailVerificationModal
        open={verificationModalOpen}
        onClose={() => setVerificationModalOpen(false)}
      />
    </>
  );
}
