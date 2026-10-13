import { useState } from 'react';
import './InstagramConsentField.css';
import { normalizeInstagramHandle } from '../utils/instagramHandle';

export const INSTAGRAM_ACCOUNT = '@tribevorarlberg';

/**
 * Opt-in checkbox for posting an event on the Instagram channel and tagging
 * the organizer. Controlled; the parent owns the value. `instagramHandle` is
 * the event creator's profile handle; `forOrganizer` marks an edit of someone
 * else's event (admin), which words the hint for the organizer.
 */
export default function InstagramConsentField({
  checked,
  onChange,
  instagramHandle,
  handleOverride,
  onHandleOverrideChange,
  forOrganizer = false,
}) {
  const profileHandle = normalizeInstagramHandle(instagramHandle);
  const overrideHandle = normalizeInstagramHandle(handleOverride);
  const handle = overrideHandle || profileHandle;
  const canEdit = typeof onHandleOverrideChange === 'function';
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  const startEdit = () => {
    setDraft(handle || '');
    setEditing(true);
  };
  const finishEdit = () => {
    const trimmed = draft.trim();
    // Valid input becomes the override, empty resets to the profile handle,
    // invalid input is discarded.
    if (!trimmed) onHandleOverrideChange('');
    else if (normalizeInstagramHandle(trimmed)) onHandleOverrideChange(trimmed);
    setEditing(false);
  };
  const draftInvalid = draft.trim() !== '' && !normalizeInstagramHandle(draft);

  const editButton = canEdit && (
    <button
      type="button"
      className="instagram-consent-handle-edit"
      onClick={startEdit}
      aria-label="Bearbeiten"
      title="Bearbeiten"
      data-testid="instagram-handle-edit"
    >
      ✎
    </button>
  );

  const handleControl = editing ? (
    <input
      type="text"
      className="instagram-consent-handle-input"
      value={draft}
      autoFocus
      size={Math.max(draft.length, 8)}
      maxLength={31}
      aria-label="Instagram-Name für dieses Event"
      aria-invalid={draftInvalid}
      data-testid="instagram-handle-input"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={finishEdit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          finishEdit();
        } else if (e.key === 'Escape') {
          setEditing(false);
        }
      }}
    />
  ) : (
    <>
      <span data-testid="instagram-handle-text">{handle}</span>
      {editButton}
    </>
  );
  return (
    <div className="form-group instagram-consent" data-testid="instagram-consent">
      <label className="checkbox-label checkbox-label--block" htmlFor="instagramConsent">
        <input
          id="instagramConsent"
          type="checkbox"
          checked={Boolean(checked)}
          onChange={(e) => onChange(e.target.checked)}
          data-testid="instagram-consent-checkbox"
        />
        <span>
          Mein Event darf auf dem Instagram-Kanal {INSTAGRAM_ACCOUNT} veröffentlicht werden. Mein
          Instagram-Profil darf dabei markiert und als Co-Autor (Collab) zum Beitrag eingeladen
          werden.
        </span>
      </label>
      <p className="instagram-consent-hint" data-testid="instagram-consent-hint">
        {forOrganizer ? (
          // Someone else's event (admin edit): the handle is the creator's,
          // never the editor's. The creator's handle may be private, then the
          // server reads it from their profile when posting.
          <>
            Zum Markieren und Einladen verwenden wir{' '}
            {overrideHandle
              ? 'diesen Instagram-Namen'
              : 'den Instagram-Namen aus dem Profil des Veranstalters'}{' '}
            {handle || editing ? <>({handleControl})</> : <>(falls eingetragen) {editButton}</>}.
          </>
        ) : handle || editing ? (
          <>
            Zum Markieren und Einladen verwenden wir{' '}
            {overrideHandle ? 'diesen Instagram-Namen' : 'deinen Instagram-Namen aus deinem Profil'}{' '}
            ({handleControl}). Du musst die Collab-Einladung in Instagram noch annehmen.
          </>
        ) : (
          <>
            Tipp: Trage in deinem Profil deinen Instagram-Namen ein, dann können wir dich markieren
            und als Co-Autor einladen. {editButton}
          </>
        )}
      </p>
    </div>
  );
}
