import { useEffect, useRef, useState } from 'react';
import { Paperclip, Save, X } from 'lucide-react';
import {
  ATTACHMENT_MAX_COUNT,
  CATEGORY_MAX,
  DESCRIPTION_MAX,
  NOTE_MAX,
  attachmentProblem,
  formatFileSize,
  formatLedgerCreator,
} from '../utils/ledger';
import LedgerAttachmentLink from './LedgerAttachmentLink';
import FileDropZone from './FileDropZone';
import './DonorEditDialog.css';

function todayVienna() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Vienna' }).format(new Date());
}

function emptyDraft() {
  return {
    type: 'expense',
    date: todayVienna(),
    amount: '',
    description: '',
    category: '',
    note: '',
  };
}

function draftFromEntry(entry) {
  if (!entry) return emptyDraft();
  return {
    type: entry.type,
    date: entry.date,
    amount: String(entry.amount).replace('.', ','),
    description: entry.description ?? '',
    category: entry.category ?? '',
    note: entry.note ?? '',
  };
}

// Admin dialog for one ledger entry. Reuses the donor dialog styles. Entries
// that came in through Mollie can be edited like manual ones.
export default function LedgerEditDialog({ open, mode, entry, categories = [], onSave, onClose }) {
  const [draft, setDraft] = useState(emptyDraft());
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [newFiles, setNewFiles] = useState([]);
  const [removed, setRemoved] = useState([]);
  const fileInput = useRef(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setSubmitting(false);
    setDraft(draftFromEntry(entry));
    setNewFiles([]);
    setRemoved([]);
  }, [open, entry]);

  if (!open) return null;

  const isCreate = mode === 'create';
  const existing = (entry?.attachments ?? []).filter((a) => !removed.includes(a.path));
  const attachmentCount = existing.length + newFiles.length;

  function addFiles(picked) {
    if (submitting || picked.length === 0) return;
    const problem = picked.map(attachmentProblem).find(Boolean);
    if (problem) return setError(problem);
    if (attachmentCount + picked.length > ATTACHMENT_MAX_COUNT) {
      return setError(`Höchstens ${ATTACHMENT_MAX_COUNT} Belege pro Buchung.`);
    }
    setNewFiles((prev) => [...prev, ...picked]);
    setError(null);
  }

  function updateField(field, value) {
    setDraft((prev) => ({ ...prev, [field]: value }));
    setError(null);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      await onSave(draft, { newFiles, removed });
    } catch (err) {
      setError(err?.message ?? 'Speichern fehlgeschlagen.');
      setSubmitting(false);
    }
  }

  function handleClose() {
    if (!submitting) onClose();
  }

  return (
    <div
      className="donor-edit-dialog-backdrop"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div
        className="donor-edit-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ledger-edit-dialog-title"
        data-testid="ledger-edit-dialog"
      >
        <header className="donor-edit-dialog-header">
          <h2 id="ledger-edit-dialog-title" className="donor-edit-dialog-title">
            {isCreate ? 'Neue Buchung' : 'Buchung bearbeiten'}
          </h2>
          <button
            type="button"
            className="donor-edit-dialog-close"
            onClick={handleClose}
            aria-label="Schließen"
            disabled={submitting}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        {!isCreate && entry?.source === 'mollie' && (
          <p className="donor-edit-dialog-source-note" data-testid="ledger-edit-source-note">
            Automatisch durch eine Mollie-Spende angelegt — kann jederzeit bearbeitet oder gelöscht
            werden.
            {entry.molliePaymentId ? (
              <>
                {' '}
                <span className="donor-edit-dialog-source-meta">
                  Mollie-ID: <code>{entry.molliePaymentId}</code>
                </span>
              </>
            ) : null}
          </p>
        )}

        {!isCreate && (
          <p className="donor-edit-dialog-source-meta" data-testid="ledger-edit-creator">
            {formatLedgerCreator(entry)}
          </p>
        )}

        <form className="donor-edit-dialog-form" onSubmit={handleSubmit}>
          <div className="donor-edit-dialog-field">
            <span className="donor-edit-dialog-label">Art</span>
            <div className="donor-edit-dialog-frequency-row">
              {[
                { id: 'income', label: 'Einnahme' },
                { id: 'expense', label: 'Ausgabe' },
              ].map((option) => (
                <label
                  key={option.id}
                  className={`donor-edit-dialog-frequency-option${draft.type === option.id ? ' is-selected' : ''}`}
                >
                  <input
                    type="radio"
                    name="ledger-type"
                    value={option.id}
                    checked={draft.type === option.id}
                    onChange={() => updateField('type', option.id)}
                    disabled={submitting}
                    data-testid={`ledger-edit-type-${option.id}`}
                  />
                  <span>{option.label}</span>
                </label>
              ))}
            </div>
          </div>

          <label className="donor-edit-dialog-field">
            <span className="donor-edit-dialog-label">Datum</span>
            <input
              type="date"
              value={draft.date}
              onChange={(e) => updateField('date', e.target.value)}
              disabled={submitting}
              required
              data-testid="ledger-edit-date"
            />
          </label>

          <label className="donor-edit-dialog-field">
            <span className="donor-edit-dialog-label">Betrag in Euro</span>
            <div className="donor-edit-dialog-amount-wrapper">
              <input
                type="text"
                inputMode="decimal"
                value={draft.amount}
                onChange={(e) => updateField('amount', e.target.value)}
                placeholder="z.B. 25,50"
                disabled={submitting}
                data-testid="ledger-edit-amount"
              />
              <span className="donor-edit-dialog-amount-suffix">€</span>
            </div>
          </label>

          <label className="donor-edit-dialog-field">
            <span className="donor-edit-dialog-label">Beschreibung</span>
            <input
              type="text"
              value={draft.description}
              onChange={(e) => updateField('description', e.target.value)}
              maxLength={DESCRIPTION_MAX}
              placeholder="z.B. Raummiete Oktober"
              disabled={submitting}
              data-testid="ledger-edit-description"
            />
          </label>

          <label className="donor-edit-dialog-field">
            <span className="donor-edit-dialog-label">Kategorie (optional)</span>
            <input
              type="text"
              list="ledger-category-options"
              value={draft.category}
              onChange={(e) => updateField('category', e.target.value)}
              maxLength={CATEGORY_MAX}
              placeholder="z.B. Miete, Werbung, Spenden"
              disabled={submitting}
              data-testid="ledger-edit-category"
            />
            <datalist id="ledger-category-options">
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </label>

          <label className="donor-edit-dialog-field">
            <span className="donor-edit-dialog-label">Notiz (optional)</span>
            <textarea
              value={draft.note}
              onChange={(e) => updateField('note', e.target.value)}
              rows={2}
              maxLength={NOTE_MAX}
              disabled={submitting}
              data-testid="ledger-edit-note"
            />
          </label>

          <FileDropZone
            className="donor-edit-dialog-field ledger-edit-dropzone"
            multiple
            disabled={submitting}
            onFiles={addFiles}
            data-testid="ledger-edit-dropzone"
          >
            <span className="donor-edit-dialog-label">Belege (optional)</span>
            {(existing.length > 0 || newFiles.length > 0) && (
              <ul className="ledger-edit-attachments" data-testid="ledger-edit-attachments">
                {existing.map((a) => (
                  <li key={a.path}>
                    <LedgerAttachmentLink attachment={a} />
                    <button
                      type="button"
                      className="ledger-edit-attachment-remove"
                      onClick={() => setRemoved((prev) => [...prev, a.path])}
                      disabled={submitting}
                      aria-label={`${a.name} entfernen`}
                    >
                      <X size={14} aria-hidden="true" />
                    </button>
                  </li>
                ))}
                {newFiles.map((file, index) => (
                  <li key={`${file.name}-${index}`}>
                    <span className="ledger-attachment is-new">
                      <Paperclip size={12} aria-hidden="true" />
                      <span>
                        {file.name} ({formatFileSize(file.size)})
                      </span>
                    </span>
                    <button
                      type="button"
                      className="ledger-edit-attachment-remove"
                      onClick={() => setNewFiles((prev) => prev.filter((_, i) => i !== index))}
                      disabled={submitting}
                      aria-label={`${file.name} entfernen`}
                    >
                      <X size={14} aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <input
              ref={fileInput}
              type="file"
              accept="image/*,application/pdf"
              multiple
              hidden
              onChange={(e) => {
                addFiles([...e.target.files]);
                e.target.value = '';
              }}
              data-testid="ledger-edit-file-input"
            />
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => fileInput.current?.click()}
              disabled={submitting || attachmentCount >= ATTACHMENT_MAX_COUNT}
              data-testid="ledger-edit-add-file"
            >
              <Paperclip size={16} aria-hidden="true" />
              <span>Beleg hinzufügen</span>
            </button>
            <span className="donor-edit-dialog-source-meta">
              Foto oder PDF, bis 10 MB – oder hierher ziehen
            </span>
          </FileDropZone>

          {error && (
            <p className="donor-edit-dialog-error" role="alert" data-testid="ledger-edit-error">
              {error}
            </p>
          )}

          <div className="donor-edit-dialog-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleClose}
              disabled={submitting}
              data-testid="ledger-edit-cancel"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={submitting}
              data-testid="ledger-edit-save"
            >
              <Save size={16} aria-hidden="true" />
              <span>{isCreate ? 'Anlegen' : 'Speichern'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
