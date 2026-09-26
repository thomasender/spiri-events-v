import { useEffect, useState } from 'react';
import { Save, X } from 'lucide-react';
import ConfirmDialog from './ConfirmDialog';
import HelperUserSearch from './HelperUserSearch';
import HelperPhotoUpload from './HelperPhotoUpload';
import './HelperEditDialog.css';

const DESCRIPTION_MAX = 120;

function clampDescription(value) {
  return value.slice(0, DESCRIPTION_MAX);
}

// Accept any reasonable URL shape from the admin and store it as a valid
// `https://` URL. Matches the convention used in ProfileForm.jsx and the
// RichTextEditor link dialog, and matches what the Firestore rules expect.
function normalizeUrl(value, { allowProjectPath = false } = {}) {
  const trimmed = (value || '').trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed.replace(/^http:\/\//i, 'https://');
  }
  if (allowProjectPath && trimmed.startsWith('/')) {
    return trimmed;
  }
  return `https://${trimmed}`;
}

function emptyDraft() {
  return {
    name: '',
    profileSlug: '',
    website: '',
    photoURL: '',
    description: '',
  };
}

function draftFromHelper(helper) {
  if (!helper) return emptyDraft();
  return {
    name: helper.name ?? '',
    profileSlug: helper.profileSlug ?? '',
    website: helper.website ?? '',
    photoURL: helper.photoURL ?? '',
    description: helper.description ?? '',
  };
}

// Admin dialog: name + optional profile link / website / photo + short
// description. Caps the description at 120 chars so we can enforce the
// spec on the Trello ticket even if a future helper is hand-edited with
// a longer string in the admin UI.
export default function HelperEditDialog({ open, mode, initialName, helper, onSave, onClose }) {
  const [draft, setDraft] = useState(emptyDraft());
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setDraft(draftFromHelper(helper ?? { name: initialName }));
  }, [open, helper, initialName]);

  if (!open) return null;

  const descriptionLength = draft.description.length;
  const isCreate = mode === 'create';
  const title = isCreate ? 'Neuen Helfer anlegen' : 'Helfer bearbeiten';

  function updateField(field, value) {
    setDraft((prev) => ({ ...prev, [field]: value }));
    setError(null);
  }

  function applyUserSnapshot(user) {
    if (!user || !user.username) return;
    setDraft((prev) => {
      const next = { ...prev };
      if (user.displayName) next.name = user.displayName;
      if (user.slug) next.profileSlug = `/${user.slug}`;
      if (user.photoURL) next.photoURL = user.photoURL;
      return next;
    });
  }

  function isDirty() {
    if (isCreate) {
      return Object.values(draft).some((v) => String(v).trim().length > 0);
    }
    const original = draftFromHelper(helper);
    return ['name', 'profileSlug', 'website', 'photoURL', 'description'].some(
      (field) => (draft[field] ?? '') !== (original[field] ?? '')
    );
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (submitting) return;
    const trimmedName = draft.name.trim();
    if (!trimmedName) {
      setError('Bitte gib einen Namen an.');
      return;
    }
    setSubmitting(true);
    try {
      await onSave({
        name: trimmedName,
        profileSlug: draft.profileSlug.trim() || null,
        website: normalizeUrl(draft.website),
        photoURL: normalizeUrl(draft.photoURL, { allowProjectPath: true }),
        description: clampDescription(draft.description).trim() || null,
      });
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
      className="helper-edit-dialog-backdrop"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleCloseRequest();
      }}
    >
      <div
        className="helper-edit-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="helper-edit-dialog-title"
        data-testid="helper-edit-dialog"
      >
        <header className="helper-edit-dialog-header">
          <h2 id="helper-edit-dialog-title" className="helper-edit-dialog-title">
            {title}
          </h2>
          <button
            type="button"
            className="helper-edit-dialog-close"
            onClick={handleCloseRequest}
            aria-label="Schließen"
            disabled={submitting}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        <form className="helper-edit-dialog-form" onSubmit={handleSubmit}>
          {isCreate && (
            <div className="helper-edit-dialog-field" data-testid="helper-edit-user-search-field">
              <span className="helper-edit-dialog-label">Aus Benutzerkonto übernehmen</span>
              <HelperUserSearch disabled={submitting} onSelect={applyUserSnapshot} />
              <span className="helper-edit-dialog-hint">
                Optional. Benutzername eingeben — Name, Profil-Link und Foto werden automatisch
                ausgefüllt, falls das Konto ein Profilfoto hat.
              </span>
            </div>
          )}

          <label className="helper-edit-dialog-field">
            <span className="helper-edit-dialog-label">Name *</span>
            <input
              type="text"
              value={draft.name}
              onChange={(e) => updateField('name', e.target.value)}
              maxLength={80}
              required
              autoFocus
              disabled={submitting}
              data-testid="helper-edit-name"
            />
          </label>

          <label className="helper-edit-dialog-field">
            <span className="helper-edit-dialog-label">Profil-Link</span>
            <input
              type="text"
              value={draft.profileSlug}
              onChange={(e) => updateField('profileSlug', e.target.value)}
              placeholder="/peter"
              maxLength={120}
              disabled={submitting}
              data-testid="helper-edit-profile-slug"
            />
            <span className="helper-edit-dialog-hint">
              Optional. Pfad innerhalb der Website, z.B. <code>/peter</code>.
            </span>
          </label>

          <label className="helper-edit-dialog-field">
            <span className="helper-edit-dialog-label">Website</span>
            <input
              type="text"
              inputMode="url"
              autoComplete="url"
              value={draft.website}
              onChange={(e) => updateField('website', e.target.value)}
              placeholder="z.B. petermathis.at oder https://…"
              maxLength={300}
              disabled={submitting}
              data-testid="helper-edit-website"
            />
          </label>

          <div className="helper-edit-dialog-field">
            <span className="helper-edit-dialog-label">Foto</span>
            <HelperPhotoUpload
              photoURL={draft.photoURL}
              onUploaded={(url) => updateField('photoURL', url)}
              onRemoved={() => updateField('photoURL', '')}
              disabled={submitting}
            />
            <label className="helper-edit-dialog-photo-url">
              <span className="helper-edit-dialog-photo-url-label">Oder URL eintragen</span>
              <input
                type="text"
                value={draft.photoURL}
                onChange={(e) => updateField('photoURL', e.target.value)}
                placeholder="/peter.jpg oder https://…"
                maxLength={500}
                disabled={submitting}
                data-testid="helper-edit-photo"
              />
            </label>
          </div>

          <label className="helper-edit-dialog-field">
            <span className="helper-edit-dialog-label">
              Kurze Beschreibung (max. {DESCRIPTION_MAX} Zeichen)
            </span>
            <textarea
              value={draft.description}
              onChange={(e) => updateField('description', clampDescription(e.target.value))}
              rows={3}
              maxLength={DESCRIPTION_MAX}
              disabled={submitting}
              data-testid="helper-edit-description"
            />
            <span className="helper-edit-dialog-hint" data-testid="helper-edit-description-count">
              {descriptionLength}/{DESCRIPTION_MAX} Zeichen
            </span>
          </label>

          {error && (
            <p className="helper-edit-dialog-error" role="alert" data-testid="helper-edit-error">
              {error}
            </p>
          )}

          <div className="helper-edit-dialog-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleCloseRequest}
              disabled={submitting}
              data-testid="helper-edit-cancel"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={submitting || !draft.name.trim()}
              data-testid="helper-edit-save"
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
