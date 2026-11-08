import { useEffect, useState } from 'react';
import { Save, X } from 'lucide-react';
import ConfirmDialog from './ConfirmDialog';
import RichTextEditorLazy from './RichTextEditorLazy';
import {
  FAQ_ANSWER_TEXT_MAX,
  FAQ_QUESTION_MAX,
  FAQ_TOPIC_MAX,
  FAQ_DEFAULT_TOPIC,
  validateFaqInput,
} from '../utils/faqs';
import './FaqTab.css';

function draftFromFaq(faq) {
  return {
    question: faq?.question ?? '',
    answerHtml: faq?.answerHtml ?? '',
    topic: faq?.topic ?? '',
    // New entries are published right away unless the admin unticks it.
    published: faq ? faq.published === true : true,
  };
}

// Admin dialog for one FAQ entry: question, answer (rich text), topic (free
// text with suggestions from the topics already in use) and the
// "Veröffentlicht" switch. Validation mirrors firestore.rules.
export default function FaqEditDialog({ open, mode, faq, topicSuggestions = [], onSave, onClose }) {
  const [draft, setDraft] = useState(draftFromFaq(null));
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setSubmitting(false);
    setDraft(draftFromFaq(faq));
  }, [open, faq]);

  if (!open) return null;

  const isCreate = mode === 'create';

  function updateField(field, value) {
    setDraft((prev) => ({ ...prev, [field]: value }));
    setError(null);
  }

  function isDirty() {
    const original = draftFromFaq(isCreate ? null : faq);
    return Object.keys(original).some((key) => draft[key] !== original[key]);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (submitting) return;
    let fields;
    try {
      fields = validateFaqInput(draft);
    } catch (err) {
      setError(err.message);
      return;
    }
    setSubmitting(true);
    try {
      await onSave(fields);
    } catch (err) {
      setError(err?.message ?? 'Speichern fehlgeschlagen.');
      setSubmitting(false);
      return;
    }
    setSubmitting(false);
  }

  function handleCloseRequest() {
    if (submitting) return;
    if (isDirty()) {
      setConfirmCancel(true);
      return;
    }
    onClose();
  }

  return (
    <div
      className="faq-edit-dialog-backdrop"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleCloseRequest();
      }}
    >
      <div
        className="faq-edit-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="faq-edit-dialog-title"
        data-testid="faq-edit-dialog"
      >
        <header className="faq-edit-dialog-header">
          <h2 id="faq-edit-dialog-title" className="faq-edit-dialog-title">
            {isCreate ? 'Neue Frage anlegen' : 'Frage bearbeiten'}
          </h2>
          <button
            type="button"
            className="faq-edit-dialog-close"
            onClick={handleCloseRequest}
            aria-label="Schließen"
            disabled={submitting}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        <form className="faq-edit-dialog-form" onSubmit={handleSubmit} noValidate>
          <label className="faq-edit-dialog-field">
            <span className="faq-edit-dialog-label">Frage *</span>
            <input
              type="text"
              value={draft.question}
              onChange={(e) => updateField('question', e.target.value)}
              maxLength={FAQ_QUESTION_MAX}
              autoFocus
              disabled={submitting}
              data-testid="faq-edit-question"
            />
            <span className="faq-edit-dialog-hint">
              {draft.question.length}/{FAQ_QUESTION_MAX} Zeichen
            </span>
          </label>

          <div className="faq-edit-dialog-field">
            <span className="faq-edit-dialog-label">Antwort *</span>
            <RichTextEditorLazy
              value={draft.answerHtml}
              onChange={(html) => updateField('answerHtml', html)}
              placeholder="Schreibe hier die Antwort…"
              maxLength={FAQ_ANSWER_TEXT_MAX}
              testId="faq-edit-answer"
              eventId="faq"
            />
          </div>

          <label className="faq-edit-dialog-field">
            <span className="faq-edit-dialog-label">Thema</span>
            <input
              type="text"
              value={draft.topic}
              onChange={(e) => updateField('topic', e.target.value)}
              maxLength={FAQ_TOPIC_MAX}
              list="faq-topic-suggestions"
              placeholder={`z.B. ${topicSuggestions[0] ?? 'Über die Plattform'}`}
              disabled={submitting}
              data-testid="faq-edit-topic"
            />
            <datalist id="faq-topic-suggestions">
              {topicSuggestions.map((topic) => (
                <option key={topic} value={topic} />
              ))}
            </datalist>
            <span className="faq-edit-dialog-hint">
              Fragen mit demselben Thema stehen zusammen. Leer = „{FAQ_DEFAULT_TOPIC}“.
            </span>
          </label>

          <label className="faq-edit-dialog-check">
            <input
              type="checkbox"
              checked={draft.published}
              onChange={(e) => updateField('published', e.target.checked)}
              disabled={submitting}
              data-testid="faq-edit-published"
            />
            <span>Veröffentlicht (auf der FAQ-Seite für alle sichtbar)</span>
          </label>

          {error && (
            <p className="faq-edit-dialog-error" role="alert" data-testid="faq-edit-error">
              {error}
            </p>
          )}

          <div className="faq-edit-dialog-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleCloseRequest}
              disabled={submitting}
              data-testid="faq-edit-cancel"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={submitting}
              data-testid="faq-edit-save"
            >
              <Save size={16} aria-hidden="true" />
              <span>{isCreate ? 'Anlegen' : 'Speichern'}</span>
            </button>
          </div>
        </form>
      </div>

      <ConfirmDialog
        isOpen={confirmCancel}
        title="Änderungen verwerfen?"
        confirmLabel="Verwerfen"
        cancelLabel="Weiter bearbeiten"
        onConfirm={() => {
          setConfirmCancel(false);
          onClose();
        }}
        onCancel={() => setConfirmCancel(false)}
      >
        <p>Du hast noch nicht gespeicherte Änderungen. Wirklich verwerfen?</p>
      </ConfirmDialog>
    </div>
  );
}
