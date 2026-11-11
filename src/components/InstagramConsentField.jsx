import { useState } from 'react';
import './InstagramConsentField.css';
import {
  MAX_EXTRA_HANDLES,
  normalizeExtraHandles,
  normalizeInstagramHandle,
} from '../utils/instagramHandle';
import { useRegionInstagramAccount } from '../hooks/useRegion';

/**
 * Opt-in checkbox for posting an event on the Instagram channel and tagging
 * the organizer. Controlled; the parent owns the value. `instagramHandle` is
 * the event creator's profile handle; `forOrganizer` marks an edit of someone
 * else's event (admin), which words the hint for the organizer. `regionId` is
 * the event's region: its Instagram name is shown, or none when it has no name.
 */
export default function InstagramConsentField({
  checked,
  onChange,
  instagramHandle,
  handleOverride,
  onHandleOverrideChange,
  extraHandles,
  onExtraHandlesChange,
  forOrganizer = false,
  regionId,
}) {
  const channel = useRegionInstagramAccount(regionId);
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

  // Further names to tag (max. 2), only offered while consent is given.
  const canAddExtra = typeof onExtraHandlesChange === 'function' && Boolean(checked);
  const extras = normalizeExtraHandles(extraHandles, handle);
  const [addingExtra, setAddingExtra] = useState(false);
  const [extraDraft, setExtraDraft] = useState('');
  const finishAddExtra = () => {
    const trimmed = extraDraft.trim();
    // Invalid input is discarded; duplicates and the main name are ignored.
    if (normalizeInstagramHandle(trimmed)) {
      onExtraHandlesChange(normalizeExtraHandles([...extras, trimmed], handle));
    }
    setExtraDraft('');
    setAddingExtra(false);
  };
  const extraInvalid = extraDraft.trim() !== '' && !normalizeInstagramHandle(extraDraft);

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
          Mein Event darf auf{' '}
          {channel ? `dem Instagram-Kanal ${channel}` : 'unserem Instagram-Kanal'} veröffentlicht
          werden. Mein Instagram-Profil darf dabei markiert und als Co-Autor (Collab) zum Beitrag
          eingeladen werden.
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
      {canAddExtra && (extras.length > 0 || extras.length < MAX_EXTRA_HANDLES) && (
        <div className="instagram-consent-hint instagram-consent-extra">
          {extras.length > 0 && (
            <ul className="instagram-consent-extra-list" data-testid="instagram-extra-list">
              {extras.map((extra) => (
                <li key={extra}>
                  {extra}
                  <button
                    type="button"
                    className="instagram-consent-handle-edit"
                    aria-label={`${extra} entfernen`}
                    title="Entfernen"
                    data-testid="instagram-extra-remove"
                    onClick={() => onExtraHandlesChange(extras.filter((h) => h !== extra))}
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
          {extras.length < MAX_EXTRA_HANDLES &&
            (addingExtra ? (
              <input
                type="text"
                className="instagram-consent-handle-input"
                value={extraDraft}
                autoFocus
                size={Math.max(extraDraft.length, 8)}
                maxLength={31}
                aria-label="Weiterer Instagram-Name"
                aria-invalid={extraInvalid}
                data-testid="instagram-extra-input"
                onChange={(e) => setExtraDraft(e.target.value)}
                onBlur={finishAddExtra}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    finishAddExtra();
                  } else if (e.key === 'Escape') {
                    setExtraDraft('');
                    setAddingExtra(false);
                  }
                }}
              />
            ) : (
              <button
                type="button"
                className="instagram-consent-extra-add"
                data-testid="instagram-extra-add"
                onClick={() => setAddingExtra(true)}
              >
                + weiteren Instagram-Namen hinzufügen
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
