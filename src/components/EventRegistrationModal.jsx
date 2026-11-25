import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { CheckCircle2, ClipboardCheck, Send, X } from 'lucide-react';
import {
  REGISTRATION_CONTACT_MAX,
  REGISTRATION_NAME_MAX,
  contactType,
  readPendingRegistration,
  registrationErrorMessage,
  savePendingRegistration,
  sendEventRegistration,
  validateRegistrationForm,
} from '../lib/eventRegistration';
import { getCustomOccurrenceTime, getNextUpcomingOccurrence } from '../utils/eventOccurrences';
import { describeOccurrence } from '../utils/occurrenceDescription';
import './EventRegistrationModal.css';

function initialValues(user) {
  if (user) return { name: user.displayName ?? '', contact: user.email ?? '' };
  const pending = readPendingRegistration();
  return { name: pending?.name ?? '', contact: pending?.email ?? '' };
}

/**
 * "Zum Event anmelden": name + e-mail or phone, prefilled for signed-in members
 * and editable. The organizer is informed by mail (docs/event-registration.md);
 * a guest is then invited to create an account with the same data.
 */
export default function EventRegistrationModal({ open, onClose, event, user, occurrenceDate }) {
  const [form, setForm] = useState(() => ({ ...initialValues(user), website: '' }));
  const [fieldErrors, setFieldErrors] = useState({});
  const [status, setStatus] = useState('idle'); // idle | sending | done
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (!open) return;
    setForm({ ...initialValues(user), website: '' });
    setFieldErrors({});
    setStatus('idle');
    setError('');
    setResult(null);
    // Only when the dialog opens: a later auth refresh must not wipe what was typed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const sending = status === 'sending';
  const handleClose = useCallback(() => {
    if (!sending) onClose();
  }, [sending, onClose]);

  useEffect(() => {
    if (!open) return undefined;
    const handleEscape = (e) => {
      if (e.key === 'Escape') handleClose();
    };
    document.addEventListener('keydown', handleEscape);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [open, handleClose]);

  if (!open || !event) return null;

  // The date the guest looked at; a list link carries none, so a series falls back to its next date.
  const chosenDate = occurrenceDate || getNextUpcomingOccurrence(event) || event.date;
  const when = describeOccurrence(chosenDate, getCustomOccurrenceTime(event, chosenDate).time);

  const set = (key) => (e) => setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errors = validateRegistrationForm(form);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;
    setStatus('sending');
    setError('');
    try {
      const data = await sendEventRegistration({
        eventId: event.id,
        name: form.name,
        contact: form.contact,
        occurrenceDate: chosenDate,
        website: form.website,
      });
      const type = contactType(form.contact);
      if (!user) {
        savePendingRegistration({
          eventId: event.id,
          eventTitle: event.title,
          name: form.name.trim(),
          email: type === 'email' ? form.contact.trim() : '',
        });
      }
      setResult({ ...data, contactType: type });
      setStatus('done');
    } catch (err) {
      setError(registrationErrorMessage(err));
      setStatus('idle');
    }
  };

  const returnTo =
    typeof window !== 'undefined' ? `${window.location.pathname}${window.location.search}` : '/';
  const accountState = (authMode) => ({
    authMode,
    email: result?.contactType === 'email' ? form.contact.trim() : '',
    displayName: form.name.trim(),
    registrationEventTitle: event.title,
    from: returnTo,
  });

  return createPortal(
    <div
      className="modal-overlay fade-enter"
      onClick={handleClose}
      data-testid="event-registration-overlay"
    >
      <div
        className="modal-content event-registration-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="event-registration-title"
        data-testid="event-registration-modal"
      >
        <button
          type="button"
          className="modal-close"
          onClick={handleClose}
          aria-label="Schließen"
          disabled={sending}
        >
          <X size={24} />
        </button>

        {status === 'done' ? (
          <div className="event-registration-success" data-testid="event-registration-success">
            <CheckCircle2
              size={48}
              className="event-registration-success-icon"
              aria-hidden="true"
            />
            <h2 id="event-registration-title">Anmeldung gesendet</h2>
            {result?.organizerNotified ? (
              <p>
                Wir haben die Veranstaltenden von <strong>{event.title}</strong> informiert. Sie
                melden sich bei Bedarf direkt bei dir.
              </p>
            ) : (
              <p className="event-registration-warning" data-testid="event-registration-no-mail">
                Wir konnten die Veranstaltenden leider nicht per E-Mail erreichen. Bitte melde dich
                zusätzlich direkt über die Kontaktangaben beim Event.
              </p>
            )}
            {result?.confirmationSent && <p>Eine Bestätigung ist per E-Mail an dich unterwegs.</p>}
            {user && result?.favorite && <p>Das Event findest du jetzt in deinen Favoriten.</p>}

            {!user ? (
              <div className="event-registration-cta" data-testid="event-registration-guest-cta">
                <p>
                  Mit einem kostenlosen Konto findest du das Event in deinen Favoriten wieder.
                  {result?.contactType === 'email'
                    ? ' Name und E-Mail sind schon ausgefüllt, es fehlt nur noch ein Passwort.'
                    : ' Dein Name ist schon ausgefüllt.'}
                </p>
                <div className="event-registration-actions">
                  <Link
                    to="/login"
                    state={accountState('register')}
                    className="btn btn-primary"
                    onClick={onClose}
                    data-testid="event-registration-create-account"
                  >
                    Konto erstellen
                  </Link>
                  <Link
                    to="/login"
                    state={accountState('login')}
                    className="btn btn-secondary"
                    onClick={onClose}
                    data-testid="event-registration-login"
                  >
                    Ich habe schon ein Konto
                  </Link>
                </div>
                <button type="button" className="link-btn" onClick={onClose}>
                  Nein danke
                </button>
              </div>
            ) : (
              <button type="button" className="btn btn-primary" onClick={onClose}>
                Schließen
              </button>
            )}
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate>
            <header className="event-registration-header">
              <ClipboardCheck size={24} className="event-registration-icon" aria-hidden="true" />
              <h2 id="event-registration-title">Zum Event anmelden</h2>
            </header>
            <p className="event-registration-intro">
              Du meldest dich an für: <strong>{event.title}</strong>
              {when ? `, ${when}` : ''}. Wir schicken deinen Namen und deine Kontaktangabe an die
              Veranstaltenden. Das ist eine Benachrichtigung, keine Platzreservierung.
            </p>

            <div className="form-group">
              <label htmlFor="event-registration-name">Name</label>
              <input
                id="event-registration-name"
                type="text"
                value={form.name}
                onChange={set('name')}
                maxLength={REGISTRATION_NAME_MAX}
                autoComplete="name"
                disabled={sending}
                aria-invalid={Boolean(fieldErrors.name)}
                aria-describedby={fieldErrors.name ? 'event-registration-name-error' : undefined}
                data-testid="event-registration-name"
              />
              {fieldErrors.name && (
                <span id="event-registration-name-error" className="error-text">
                  {fieldErrors.name}
                </span>
              )}
            </div>

            <div className="form-group">
              <label htmlFor="event-registration-contact">E-Mail oder Telefonnummer</label>
              <input
                id="event-registration-contact"
                type="text"
                inputMode="email"
                value={form.contact}
                onChange={set('contact')}
                maxLength={REGISTRATION_CONTACT_MAX}
                autoComplete="email"
                placeholder="deine@email.at oder +43 664 1234567"
                disabled={sending}
                aria-invalid={Boolean(fieldErrors.contact)}
                aria-describedby={
                  fieldErrors.contact ? 'event-registration-contact-error' : undefined
                }
                data-testid="event-registration-contact"
              />
              {fieldErrors.contact && (
                <span id="event-registration-contact-error" className="error-text">
                  {fieldErrors.contact}
                </span>
              )}
            </div>

            {/* Honeypot: invisible for people, bots fill it in. */}
            <div className="event-registration-hp" aria-hidden="true">
              <label htmlFor="event-registration-website">Website</label>
              <input
                id="event-registration-website"
                tabIndex={-1}
                autoComplete="off"
                value={form.website}
                onChange={set('website')}
              />
            </div>

            {error && (
              <p className="error-text" role="alert" data-testid="event-registration-error">
                {error}
              </p>
            )}

            <p className="event-registration-privacy">
              Mehr dazu in der{' '}
              <a href="/datenschutz" target="_blank" rel="noopener noreferrer">
                Datenschutzerklärung
              </a>
              .
            </p>

            <div className="event-registration-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleClose}
                disabled={sending}
              >
                Abbrechen
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={sending}
                data-testid="event-registration-submit"
              >
                <Send size={16} aria-hidden="true" />
                <span>{sending ? 'Wird gesendet…' : 'Anmeldung senden'}</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>,
    document.body
  );
}
