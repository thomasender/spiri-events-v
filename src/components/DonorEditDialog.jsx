import { useEffect, useState } from 'react';
import { Save, X } from 'lucide-react';
import ConfirmDialog from './ConfirmDialog';
import { DEFAULT_REGION_ID, resolveRegionId } from '../utils/regions';
import { currencyName, currencySymbol } from '../lib/donationCurrency';
import './DonorEditDialog.css';

const FREQUENCIES = [
  { id: 'one-time', label: 'Einmalig' },
  { id: 'monthly', label: 'Monatlich' },
];

const NOTE_MAX = 120;

const COMMENT_MAX = 140;

function clampNote(value) {
  return value.slice(0, NOTE_MAX);
}

function clampComment(value) {
  return value.slice(0, COMMENT_MAX);
}

function emptyDraft(regionId = DEFAULT_REGION_ID) {
  return {
    regionId,
    name: '',
    amount: '',
    frequency: '',
    note: '',
    comment: '',
    anonymous: true,
  };
}

function draftFromDonor(donor, regionId) {
  if (!donor) return emptyDraft(regionId);
  return {
    regionId: resolveRegionId(donor),
    name: donor.name ?? '',
    amount: donor.amount != null ? String(donor.amount).replace('.', ',') : '',
    frequency: donor.frequency ?? '',
    note: donor.note ?? '',
    comment: donor.comment ?? '',
    anonymous: !donor.name,
  };
}

// Admin dialog: a donor entry on the "Über uns" page. Admins can mark a
// donor as anonymous (no name shown), with or without an amount, and tag
// the donation as either one-time or monthly. Currency formatting on save
// mirrors what the public list shows. Donor entries written by the
// Mollie webhook carry a `source: 'mollie'` flag and are shown read-only
// metadata here. `regionId` is the region currently shown in the tab (the
// default for a new donor); with more than one entry in `regions` the
// dialog offers a region choice, which also moves an existing donor.
export default function DonorEditDialog({
  open,
  mode,
  donor,
  regionId = DEFAULT_REGION_ID,
  regions = [],
  onSave,
  onClose,
}) {
  const [draft, setDraft] = useState(emptyDraft());
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setDraft(draftFromDonor(donor, regionId));
  }, [open, donor, regionId]);

  if (!open) return null;

  const isCreate = mode === 'create';
  const title = isCreate ? 'Neuen Spender anlegen' : 'Spender bearbeiten';

  function updateField(field, value) {
    setDraft((prev) => ({ ...prev, [field]: value }));
    setError(null);
  }

  function isDirty() {
    if (isCreate) {
      return (
        draft.name.trim().length > 0 ||
        draft.amount.trim().length > 0 ||
        draft.frequency.length > 0 ||
        draft.note.trim().length > 0 ||
        draft.comment.trim().length > 0 ||
        !draft.anonymous ||
        draft.regionId !== regionId
      );
    }
    const original = draftFromDonor(donor, regionId);
    return (
      draft.regionId !== original.regionId ||
      draft.name !== original.name ||
      draft.amount !== original.amount ||
      draft.frequency !== original.frequency ||
      draft.note !== original.note ||
      draft.comment !== original.comment ||
      draft.anonymous !== original.anonymous
    );
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (submitting) return;
    const payload = {
      regionId: draft.regionId,
      name: draft.anonymous ? null : draft.name.trim() || null,
      amount: draft.amount.trim() || null,
      frequency: draft.frequency || null,
      note: clampNote(draft.note).trim() || null,
      comment: clampComment(draft.comment).trim() || null,
    };
    setSubmitting(true);
    try {
      await onSave(payload);
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
      className="donor-edit-dialog-backdrop"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleCloseRequest();
      }}
    >
      <div
        className="donor-edit-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="donor-edit-dialog-title"
        data-testid="donor-edit-dialog"
      >
        <header className="donor-edit-dialog-header">
          <h2 id="donor-edit-dialog-title" className="donor-edit-dialog-title">
            {title}
          </h2>
          <button
            type="button"
            className="donor-edit-dialog-close"
            onClick={handleCloseRequest}
            aria-label="Schließen"
            disabled={submitting}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        {!isCreate && donor?.source === 'mollie' && (
          <p className="donor-edit-dialog-source-note" data-testid="donor-edit-source-note">
            Automatisch durch eine Mollie-Spende angelegt — kann jederzeit bearbeitet oder gelöscht
            werden.
            {donor.molliePaymentId ? (
              <>
                {' '}
                <span className="donor-edit-dialog-source-meta">
                  Mollie-ID: <code>{donor.molliePaymentId}</code>
                </span>
              </>
            ) : null}
          </p>
        )}

        <form className="donor-edit-dialog-form" onSubmit={handleSubmit}>
          {regions.length > 1 && (
            <label className="donor-edit-dialog-field">
              <span className="donor-edit-dialog-label">Region</span>
              <select
                value={draft.regionId}
                onChange={(e) => updateField('regionId', e.target.value)}
                disabled={submitting}
                data-testid="donor-edit-region"
              >
                {regions.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
              <span className="donor-edit-dialog-hint">
                Der Eintrag erscheint auf der „Über uns“-Seite dieser Region.
              </span>
            </label>
          )}

          <label className="donor-edit-dialog-field donor-edit-dialog-field--checkbox">
            <input
              type="checkbox"
              checked={draft.anonymous}
              onChange={(e) => updateField('anonymous', e.target.checked)}
              disabled={submitting}
              data-testid="donor-edit-anonymous"
            />
            <span>Anonym spenden (Name wird nicht angezeigt)</span>
          </label>

          <label className="donor-edit-dialog-field">
            <span className="donor-edit-dialog-label">Name</span>
            <input
              type="text"
              value={draft.name}
              onChange={(e) => updateField('name', e.target.value)}
              maxLength={80}
              disabled={submitting || draft.anonymous}
              placeholder={draft.anonymous ? 'Anonym' : 'z.B. Anna Musterfrau'}
              data-testid="donor-edit-name"
            />
          </label>

          <label className="donor-edit-dialog-field">
            <span className="donor-edit-dialog-label">
              Betrag in {currencyName(donor)} (optional)
            </span>
            <div className="donor-edit-dialog-amount-wrapper">
              <input
                type="text"
                inputMode="decimal"
                value={draft.amount}
                onChange={(e) => updateField('amount', e.target.value)}
                placeholder="z.B. 25"
                disabled={submitting}
                data-testid="donor-edit-amount"
              />
              <span className="donor-edit-dialog-amount-suffix">{currencySymbol(donor)}</span>
            </div>
            <span className="donor-edit-dialog-hint">
              Leer lassen, wenn der Betrag nicht angezeigt werden soll.
            </span>
          </label>

          <div className="donor-edit-dialog-field">
            <span className="donor-edit-dialog-label">Frequenz (optional)</span>
            <div className="donor-edit-dialog-frequency-row">
              {FREQUENCIES.map((option) => (
                <label
                  key={option.id}
                  className={`donor-edit-dialog-frequency-option${draft.frequency === option.id ? ' is-selected' : ''}`}
                >
                  <input
                    type="radio"
                    name="donor-frequency"
                    value={option.id}
                    checked={draft.frequency === option.id}
                    onChange={() => updateField('frequency', option.id)}
                    disabled={submitting}
                    data-testid={`donor-edit-frequency-${option.id}`}
                  />
                  <span>{option.label}</span>
                </label>
              ))}
              <button
                type="button"
                className="donor-edit-dialog-frequency-clear"
                onClick={() => updateField('frequency', '')}
                disabled={submitting || !draft.frequency}
                data-testid="donor-edit-frequency-clear"
              >
                Keine Angabe
              </button>
            </div>
          </div>

          <label className="donor-edit-dialog-field">
            <span className="donor-edit-dialog-label">
              Notiz für interne Verwendung (max. {NOTE_MAX} Zeichen)
            </span>
            <textarea
              value={draft.note}
              onChange={(e) => updateField('note', clampNote(e.target.value))}
              rows={2}
              maxLength={NOTE_MAX}
              disabled={submitting}
              data-testid="donor-edit-note"
            />
            <span className="donor-edit-dialog-hint">Wird nicht öffentlich angezeigt.</span>
          </label>

          <label className="donor-edit-dialog-field">
            <span className="donor-edit-dialog-label">
              Öffentlicher Kommentar (max. {COMMENT_MAX} Zeichen)
            </span>
            <textarea
              value={draft.comment}
              onChange={(e) => updateField('comment', clampComment(e.target.value))}
              rows={2}
              maxLength={COMMENT_MAX}
              disabled={submitting}
              data-testid="donor-edit-comment"
            />
            <span className="donor-edit-dialog-hint">
              Wird auf der „Über uns“-Seite angezeigt. Leeren, um ihn zu löschen.
            </span>
          </label>

          {error && (
            <p className="donor-edit-dialog-error" role="alert" data-testid="donor-edit-error">
              {error}
            </p>
          )}

          <div className="donor-edit-dialog-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleCloseRequest}
              disabled={submitting}
              data-testid="donor-edit-cancel"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={submitting}
              data-testid="donor-edit-save"
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
