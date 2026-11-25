import { useState } from 'react';
import { ClipboardCheck } from 'lucide-react';
import { canRegisterForEvent } from '../lib/eventRegistration';
import { useEventRegistrationEnabled } from '../hooks/useEventRegistrationSettings';
import EventRegistrationModal from './EventRegistrationModal';
import './EventRegistrationModal.css';

/**
 * "Zum Event anmelden" on the detail page and in the event modal. Shown for every
 * published, upcoming event; with an external "Anmeldung" text it reads
 * "Über Tribe anmelden" and the external way stays visible next to it. Hidden
 * unless an admin switched it on (app_settings/eventRegistration).
 */
export default function EventRegistrationButton({ event, user, occurrenceDate, className = '' }) {
  const [open, setOpen] = useState(false);
  const enabled = useEventRegistrationEnabled();
  if (!enabled || !canRegisterForEvent(event)) return null;
  const label = event.registration?.trim() ? 'Über Tribe anmelden' : 'Zum Event anmelden';
  return (
    <>
      <button
        type="button"
        className={`btn btn-primary event-registration-button ${className}`.trim()}
        onClick={() => setOpen(true)}
        data-testid="event-registration-button"
      >
        <ClipboardCheck size={16} aria-hidden="true" />
        <span>{label}</span>
      </button>
      <EventRegistrationModal
        open={open}
        onClose={() => setOpen(false)}
        event={event}
        user={user}
        occurrenceDate={occurrenceDate}
      />
    </>
  );
}
