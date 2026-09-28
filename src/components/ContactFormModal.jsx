import { useEffect, useState, useCallback } from 'react';
import { X, Send, CheckCircle2, Mail } from 'lucide-react';
import {
  MAX_FEEDBACK_DESCRIPTION_LENGTH,
  MAX_FEEDBACK_NAME_LENGTH,
  MAX_FEEDBACK_EMAIL_LENGTH,
  validateFeedback,
  useFeedback,
} from '../hooks/useFeedback';
import './ContactFormModal.css';

const MAX_CONTACT_SUBJECT_LENGTH = 120;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function buildContactDescription(subject, message) {
  const trimmedSubject = subject.trim();
  const trimmedMessage = message.trim();
  if (!trimmedSubject) return trimmedMessage;
  return `Betreff: ${trimmedSubject}\n\n${trimmedMessage}`;
}

export default function ContactFormModal({
  open,
  onClose,
  defaultSubject = '',
  recipientEmail,
  pageUrl,
}) {
  const { submitting, error, submitFeedback, reset } = useFeedback();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState(defaultSubject);
  const [message, setMessage] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!open) {
      setName('');
      setEmail('');
      setSubject(defaultSubject);
      setMessage('');
      setFieldErrors({});
      setSuccess(false);
      reset();
    } else {
      setSubject((current) => current || defaultSubject);
    }
  }, [open, defaultSubject, reset]);

  useEffect(() => {
    if (!open) return undefined;
    const handleEscape = (e) => {
      if (e.key === 'Escape' && !submitting) onClose();
    };
    document.addEventListener('keydown', handleEscape);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [open, submitting, onClose]);

  const validate = useCallback(() => {
    const errors = {};

    const trimmedName = name.trim();
    if (!trimmedName) {
      errors.name = 'Bitte gib deinen Namen an.';
    } else if (trimmedName.length > MAX_FEEDBACK_NAME_LENGTH) {
      errors.name = `Name darf maximal ${MAX_FEEDBACK_NAME_LENGTH} Zeichen lang sein.`;
    }

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      errors.email = 'Bitte gib eine E-Mail-Adresse an.';
    } else if (trimmedEmail.length > MAX_FEEDBACK_EMAIL_LENGTH) {
      errors.email = `E-Mail darf maximal ${MAX_FEEDBACK_EMAIL_LENGTH} Zeichen lang sein.`;
    } else if (!EMAIL_REGEX.test(trimmedEmail)) {
      errors.email = 'Bitte gib eine gültige E-Mail-Adresse an.';
    }

    const trimmedSubject = subject.trim();
    if (!trimmedSubject) {
      errors.subject = 'Bitte gib einen Betreff an.';
    } else if (trimmedSubject.length > MAX_CONTACT_SUBJECT_LENGTH) {
      errors.subject = `Betreff darf maximal ${MAX_CONTACT_SUBJECT_LENGTH} Zeichen lang sein.`;
    }

    const descriptionErrors = validateFeedback({
      description: message,
      name,
      email,
    });
    if (descriptionErrors.description) {
      errors.message = descriptionErrors.description;
    }

    return errors;
  }, [name, email, subject, message]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errors = validate();
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    try {
      await submitFeedback({
        description: buildContactDescription(subject, message).slice(
          0,
          MAX_FEEDBACK_DESCRIPTION_LENGTH
        ),
        name: name.trim(),
        email: email.trim(),
        pageUrl: (pageUrl || '').slice(0, 500) || null,
        pageTitle: (typeof document !== 'undefined' ? document.title : '') || '',
      });
      setSuccess(true);
    } catch {
      // error already shown via hook state
    }
  };

  const handleClose = useCallback(() => {
    if (submitting) return;
    onClose();
  }, [submitting, onClose]);

  if (!open) return null;

  return (
    <div
      className="modal-overlay fade-enter"
      onClick={handleClose}
      data-testid="contact-modal-overlay"
    >
      <div
        className="modal-content contact-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="contact-modal-title"
        data-testid="contact-modal"
      >
        <button
          type="button"
          className="modal-close"
          onClick={handleClose}
          aria-label="Schließen"
          disabled={submitting}
        >
          <X size={24} />
        </button>

        {success ? (
          <div className="contact-success" data-testid="contact-success">
            <CheckCircle2 size={48} className="contact-success-icon" aria-hidden="true" />
            <h2 id="contact-modal-title">Danke für deine Nachricht!</h2>
            <p>
              Wir haben deine Nachricht erhalten und melden uns bald bei dir zurück. Schreib uns
              gerne jederzeit wieder über dieses Formular.
            </p>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleClose}
              data-testid="contact-close-success"
            >
              Schließen
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate>
            <header className="contact-modal-header">
              <Mail size={24} className="contact-modal-icon" aria-hidden="true" />
              <h2 id="contact-modal-title">Schreib uns</h2>
            </header>
            <p className="contact-modal-intro">
              Wir freuen uns auf deine Nachricht. Füll die Felder aus und wir melden uns bei dir
              zurück.
            </p>

            <div className="form-group">
              <label htmlFor="contact-name">
                Name{' '}
                <span className="required-mark" aria-hidden="true">
                  *
                </span>
              </label>
              <input
                id="contact-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value.slice(0, MAX_FEEDBACK_NAME_LENGTH))}
                placeholder="Wie dürfen wir dich nennen?"
                disabled={submitting}
                data-testid="contact-name"
                maxLength={MAX_FEEDBACK_NAME_LENGTH}
                aria-required="true"
                aria-invalid={Boolean(fieldErrors.name)}
                aria-describedby={fieldErrors.name ? 'contact-name-error' : undefined}
              />
              <span
                id="contact-name-error"
                className="error-text"
                data-testid="contact-name-error"
                hidden={!fieldErrors.name}
              >
                {fieldErrors.name}
              </span>
            </div>

            <div className="form-group">
              <label htmlFor="contact-email">
                E-Mail{' '}
                <span className="required-mark" aria-hidden="true">
                  *
                </span>
              </label>
              <input
                id="contact-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value.slice(0, MAX_FEEDBACK_EMAIL_LENGTH))}
                placeholder="deine@email.at"
                disabled={submitting}
                data-testid="contact-email"
                maxLength={MAX_FEEDBACK_EMAIL_LENGTH}
                aria-required="true"
                aria-invalid={Boolean(fieldErrors.email)}
                aria-describedby={fieldErrors.email ? 'contact-email-error' : undefined}
              />
              <span
                id="contact-email-error"
                className="error-text"
                data-testid="contact-email-error"
                hidden={!fieldErrors.email}
              >
                {fieldErrors.email}
              </span>
            </div>

            <div className="form-group">
              <label htmlFor="contact-subject">
                Betreff{' '}
                <span className="required-mark" aria-hidden="true">
                  *
                </span>
              </label>
              <input
                id="contact-subject"
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value.slice(0, MAX_CONTACT_SUBJECT_LENGTH))}
                placeholder="Worum geht es?"
                disabled={submitting}
                data-testid="contact-subject"
                maxLength={MAX_CONTACT_SUBJECT_LENGTH}
                aria-required="true"
                aria-invalid={Boolean(fieldErrors.subject)}
                aria-describedby={fieldErrors.subject ? 'contact-subject-error' : undefined}
              />
              <span
                id="contact-subject-error"
                className="error-text"
                data-testid="contact-subject-error"
                hidden={!fieldErrors.subject}
              >
                {fieldErrors.subject}
              </span>
            </div>

            <div className="form-group">
              <label htmlFor="contact-message">
                Deine Nachricht{' '}
                <span className="required-mark" aria-hidden="true">
                  *
                </span>
              </label>
              <textarea
                id="contact-message"
                value={message}
                onChange={(e) =>
                  setMessage(e.target.value.slice(0, MAX_FEEDBACK_DESCRIPTION_LENGTH))
                }
                placeholder="Was möchtest du uns mitteilen?"
                rows={5}
                disabled={submitting}
                data-testid="contact-message"
                aria-required="true"
                aria-invalid={Boolean(fieldErrors.message)}
                aria-describedby={fieldErrors.message ? 'contact-message-error' : undefined}
                maxLength={MAX_FEEDBACK_DESCRIPTION_LENGTH}
              />
              <div className="contact-modal-row-meta">
                <span
                  id="contact-message-error"
                  className="error-text"
                  data-testid="contact-message-error"
                  hidden={!fieldErrors.message}
                >
                  {fieldErrors.message}
                </span>
                <span className="contact-modal-count">
                  {message.length} / {MAX_FEEDBACK_DESCRIPTION_LENGTH}
                </span>
              </div>
            </div>

            {error && (
              <div className="contact-modal-error" role="alert" data-testid="contact-error">
                {error}
              </div>
            )}

            <div className="contact-modal-footer">
              {recipientEmail && (
                <span className="contact-modal-hint">
                  Oder direkt per E-Mail an{' '}
                  <a href={`mailto:${recipientEmail}`} className="contact-modal-hint-link">
                    {recipientEmail}
                  </a>
                </span>
              )}
              <div className="contact-modal-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleClose}
                  disabled={submitting}
                  data-testid="contact-cancel"
                >
                  Abbrechen
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={submitting}
                  data-testid="contact-submit"
                >
                  <Send size={16} aria-hidden="true" />
                  <span>{submitting ? 'Wird gesendet…' : 'Nachricht senden'}</span>
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
