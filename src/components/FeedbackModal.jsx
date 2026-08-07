import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Send, CheckCircle2, MessageSquare, Camera, ImagePlus, Loader2 } from 'lucide-react';
import {
  MAX_FEEDBACK_DESCRIPTION_LENGTH,
  MAX_FEEDBACK_NAME_LENGTH,
  MAX_FEEDBACK_EMAIL_LENGTH,
  useFeedback,
  validateFeedback,
} from '../hooks/useFeedback';
import './FeedbackModal.css';

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

export default function FeedbackModal({ open, onClose, pageUrl, pageTitle }) {
  const { submitting, uploadProgress, error, submitFeedback, reset } = useFeedback();
  const [description, setDescription] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [screenshot, setScreenshot] = useState(null);
  const [screenshotPreview, setScreenshotPreview] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [success, setSuccess] = useState(false);
  const fileInputRef = useRef(null);
  const previewUrlRef = useRef(null);

  useEffect(() => {
    if (!open) {
      setDescription('');
      setName('');
      setEmail('');
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = null;
      }
      setScreenshot(null);
      setScreenshotPreview(null);
      setFieldErrors({});
      setSuccess(false);
      reset();
    }
  }, [open, reset]);

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

  const handleSelectFile = (file) => {
    if (!file) return;
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      setFieldErrors((prev) => ({ ...prev, screenshot: 'Nur JPEG, PNG und WebP sind erlaubt.' }));
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setFieldErrors((prev) => ({
        ...prev,
        screenshot: `Bild ist zu groß (max. ${Math.round(MAX_IMAGE_BYTES / 1024 / 1024)} MB).`,
      }));
      return;
    }
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next.screenshot;
      return next;
    });
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    const newPreview = URL.createObjectURL(file);
    previewUrlRef.current = newPreview;
    setScreenshot(file);
    setScreenshotPreview(newPreview);
  };

  const handleRemoveScreenshot = () => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    setScreenshot(null);
    setScreenshotPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errors = validateFeedback({ description, name, email });
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    try {
      await submitFeedback({
        description,
        name,
        email,
        screenshot,
        pageUrl,
        pageTitle,
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
      data-testid="feedback-modal-overlay"
    >
      <div
        className="modal-content feedback-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="feedback-modal-title"
        data-testid="feedback-modal"
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
          <div className="feedback-success" data-testid="feedback-success">
            <CheckCircle2 size={48} className="feedback-success-icon" aria-hidden="true" />
            <h2 id="feedback-modal-title">Danke für dein Feedback!</h2>
            <p>
              Wir haben deine Nachricht erhalten und schauen sie uns an. Eine Antwort ist nicht
              vorgesehen, aber dein Feedback hilft uns, die Plattform besser zu machen.
            </p>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleClose}
              data-testid="feedback-close-success"
            >
              Schließen
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate>
            <header className="feedback-modal-header">
              <MessageSquare size={24} className="feedback-modal-icon" aria-hidden="true" />
              <h2 id="feedback-modal-title">Feedback geben</h2>
            </header>
            <p className="feedback-modal-intro">
              Sag uns, was dir auffällt — Lob, Ideen oder Probleme. Dein Feedback ist anonym und
              hilft uns sehr.
            </p>

            <div className="form-group">
              <label htmlFor="feedback-description">
                Dein Feedback{' '}
                <span className="required-mark" aria-hidden="true">
                  *
                </span>
              </label>
              <textarea
                id="feedback-description"
                value={description}
                onChange={(e) =>
                  setDescription(e.target.value.slice(0, MAX_FEEDBACK_DESCRIPTION_LENGTH))
                }
                placeholder="Was möchtest du uns mitteilen?"
                rows={5}
                disabled={submitting}
                data-testid="feedback-description"
                aria-required="true"
                aria-invalid={Boolean(fieldErrors.description)}
                aria-describedby={
                  fieldErrors.description ? 'feedback-description-error' : undefined
                }
                maxLength={MAX_FEEDBACK_DESCRIPTION_LENGTH}
              />
              <div className="feedback-modal-row-meta">
                <span
                  id="feedback-description-error"
                  className="error-text"
                  data-testid="feedback-description-error"
                  hidden={!fieldErrors.description}
                >
                  {fieldErrors.description}
                </span>
                <span className="feedback-modal-count">
                  {description.length} / {MAX_FEEDBACK_DESCRIPTION_LENGTH}
                </span>
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="feedback-name">Name (optional)</label>
              <input
                id="feedback-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value.slice(0, MAX_FEEDBACK_NAME_LENGTH))}
                placeholder="Wie dürfen wir dich nennen?"
                disabled={submitting}
                data-testid="feedback-name"
                maxLength={MAX_FEEDBACK_NAME_LENGTH}
                aria-invalid={Boolean(fieldErrors.name)}
              />
              {fieldErrors.name && (
                <span className="error-text" data-testid="feedback-name-error">
                  {fieldErrors.name}
                </span>
              )}
            </div>

            <div className="form-group">
              <label htmlFor="feedback-email">E-Mail (optional)</label>
              <input
                id="feedback-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value.slice(0, MAX_FEEDBACK_EMAIL_LENGTH))}
                placeholder="Falls du eine Antwort möchtest"
                disabled={submitting}
                data-testid="feedback-email"
                maxLength={MAX_FEEDBACK_EMAIL_LENGTH}
                aria-invalid={Boolean(fieldErrors.email)}
              />
              {fieldErrors.email && (
                <span className="error-text" data-testid="feedback-email-error">
                  {fieldErrors.email}
                </span>
              )}
              <span className="feedback-modal-hint">
                Bleibt anonym, wenn du das Feld leer lässt.
              </span>
            </div>

            <div className="form-group">
              <label>Screenshot (optional)</label>
              {!screenshotPreview ? (
                <button
                  type="button"
                  className="feedback-screenshot-add"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={submitting}
                  data-testid="feedback-screenshot-add"
                >
                  <ImagePlus size={20} aria-hidden="true" />
                  <span>Bild hinzufügen</span>
                </button>
              ) : (
                <div
                  className="feedback-screenshot-preview"
                  data-testid="feedback-screenshot-preview"
                >
                  <img src={screenshotPreview} alt="Screenshot Vorschau" />
                  <button
                    type="button"
                    className="feedback-screenshot-remove"
                    onClick={handleRemoveScreenshot}
                    disabled={submitting}
                    aria-label="Screenshot entfernen"
                  >
                    <X size={16} aria-hidden="true" />
                  </button>
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => handleSelectFile(e.target.files?.[0])}
                style={{ display: 'none' }}
                data-testid="feedback-screenshot-input"
              />
              {fieldErrors.screenshot && (
                <span className="error-text" data-testid="feedback-screenshot-error">
                  {fieldErrors.screenshot}
                </span>
              )}
              {uploadProgress > 0 && uploadProgress < 100 && (
                <span
                  className="feedback-modal-progress"
                  data-testid="feedback-upload-progress"
                  aria-live="polite"
                >
                  <Loader2 size={14} className="spin" aria-hidden="true" />
                  Bild wird hochgeladen… {uploadProgress}%
                </span>
              )}
            </div>

            {pageUrl && (
              <p className="feedback-modal-context" data-testid="feedback-page-context">
                <Camera size={14} aria-hidden="true" />
                <span>
                  Seite: <code>{pageUrl}</code>
                </span>
              </p>
            )}

            {error && (
              <div className="feedback-modal-error" role="alert" data-testid="feedback-error">
                {error}
              </div>
            )}

            <div className="feedback-modal-footer">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleClose}
                disabled={submitting}
                data-testid="feedback-cancel"
              >
                Abbrechen
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={submitting}
                data-testid="feedback-submit"
              >
                <Send size={16} aria-hidden="true" />
                <span>{submitting ? 'Wird gesendet…' : 'Feedback senden'}</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
