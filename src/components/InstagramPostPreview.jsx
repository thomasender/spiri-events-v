import { useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import CropViewport from './CropViewport';
import {
  INSTAGRAM_CROP_ASPECT,
  MAX_INSTAGRAM_ZOOM,
  MIN_INSTAGRAM_ZOOM,
  clampInstagramZoom,
} from '../utils/instagramImageChoice';
import { DEFAULT_FOCAL_POINT, normalizeFocalPoint } from '../lib/eventImage';

/** "2026-10-12" -> "12.10.2026"; anything else is passed through. */
export function formatPreviewDate(date) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date ?? '');
  return m ? `${m[3]}.${m[2]}.${m[1]}` : (date ?? '');
}

/** Organizer display name from `{ name }` or `{ firstName, lastName }`. */
export function formatPreviewOrganizer(organizer) {
  if (!organizer || typeof organizer !== 'object') return '';
  const name = typeof organizer.name === 'string' ? organizer.name.trim() : '';
  if (name) return name;
  return [organizer.firstName, organizer.lastName]
    .map((v) => (typeof v === 'string' ? v.trim() : ''))
    .filter(Boolean)
    .join(' ');
}

export const PREVIEW_MODE_CAROUSEL = 'carousel';
export const PREVIEW_MODE_POST = 'post';

/**
 * Toggle between the weekly-carousel slide (event text over the photo) and the
 * single feed post (only title and organizer over the photo).
 */
export function InstagramPreviewModeToggle({ mode, onChange }) {
  const options = [
    { value: PREVIEW_MODE_CAROUSEL, label: 'Karussell (mit Text)' },
    { value: PREVIEW_MODE_POST, label: 'Einzelbeitrag' },
  ];
  return (
    <div
      className="instagram-preview-mode"
      role="group"
      aria-label="Vorschau-Ansicht"
      data-testid="instagram-preview-mode"
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className={`instagram-preview-mode-btn${mode === o.value ? ' is-active' : ''}`}
          aria-pressed={mode === o.value}
          onClick={() => onChange(o.value)}
          data-testid={`instagram-preview-mode-${o.value}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Dark gradient and the event text, as the weekly-carousel slide draws it. */
export function InstagramPreviewOverlay({ event = {} }) {
  const info = [formatPreviewDate(event.date), event.time, event.place].filter(Boolean);
  return (
    <div className="instagram-post-preview-overlay" data-testid="instagram-preview-overlay">
      {event.category && <span className="instagram-post-preview-chip">{event.category}</span>}
      <div className="instagram-post-preview-text">
        <strong>{event.title || 'Titel des Events'}</strong>
        {info.map((line) => (
          <span key={line}>{line}</span>
        ))}
      </div>
    </div>
  );
}

/** Single feed post: only the event title and the organizer's name. */
export function InstagramPreviewPostOverlay({ event = {} }) {
  return (
    <div
      className="instagram-post-preview-overlay instagram-post-preview-overlay--post"
      data-testid="instagram-preview-post-overlay"
    >
      <div className="instagram-post-preview-text">
        <strong>{event.title || 'Titel des Events'}</strong>
        {event.organizer && <span>{event.organizer}</span>}
      </div>
    </div>
  );
}

/** The overlay matching the selected preview mode. */
export function InstagramPreviewModeOverlay({ mode, event }) {
  return mode === PREVIEW_MODE_CAROUSEL ? (
    <InstagramPreviewOverlay event={event} />
  ) : (
    <InstagramPreviewPostOverlay event={event} />
  );
}

/** Hint and disclaimer shown under the preview. */
export function InstagramPreviewNotes() {
  return (
    <div className="instagram-preview-notes" data-testid="instagram-preview-notes">
      <p className="instagram-image-picker-hint">
        Ungefähre Vorschau. Beim Wochen-Karussell liegt der Text des Events über dem Foto, beim
        Einzelbeitrag nur der Titel und der Name des Veranstalters. Enthält dein Foto selbst Text
        (z.B. ein Flyer), kann das unruhig wirken. Wähle dann einen Ausschnitt ohne Text.
      </p>
      <p className="instagram-image-picker-hint" data-testid="instagram-preview-disclaimer">
        Wir behalten uns vor, den Beitrag nicht zu posten, wenn das Foto nicht passt (z.B. wenn nur
        ein Flyer verwendet wird).
      </p>
    </div>
  );
}

/**
 * Standalone approximate preview of the Instagram post (used as the admin
 * review aid; the organizer sees the same preview inside the crop picker).
 * Client-side CSS approximation; the real image is rendered server-side.
 */
export default function InstagramPostPreview({ imageUrl, focalPoint, zoom = 1, event = {} }) {
  const [mode, setMode] = useState(PREVIEW_MODE_CAROUSEL);
  if (!imageUrl) return null;
  const point = focalPoint ?? { x: 0.5, y: 0.5 };
  const pos = `${point.x * 100}% ${point.y * 100}%`;

  return (
    <div className="instagram-post-preview" data-testid="instagram-post-preview">
      <InstagramPreviewModeToggle mode={mode} onChange={setMode} />
      <div className="instagram-post-preview-tile">
        <img
          src={imageUrl}
          alt=""
          draggable={false}
          style={{
            objectPosition: pos,
            ...(zoom > 1 ? { transform: `scale(${zoom})`, transformOrigin: pos } : {}),
          }}
        />
        <InstagramPreviewModeOverlay mode={mode} event={event} />
      </div>
      <InstagramPreviewNotes />
    </div>
  );
}

/**
 * Admin editor for the Instagram crop (focal point + zoom), same controls as
 * the organizer has in the edit form. Saves to the event's `instagramImage`.
 */
function AdminInstagramCropEditor({ event, imageUrl, initial, previewEvent, onSaved, onCancel }) {
  const [focalPoint, setFocalPoint] = useState(
    normalizeFocalPoint(initial?.focalPoint) ?? { ...DEFAULT_FOCAL_POINT }
  );
  const [zoom, setZoom] = useState(clampInstagramZoom(initial?.zoom ?? 1));
  const [mode, setMode] = useState(PREVIEW_MODE_CAROUSEL);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const initialPoint = normalizeFocalPoint(initial?.focalPoint) ?? DEFAULT_FOCAL_POINT;
  const dirty =
    Math.abs(focalPoint.x - initialPoint.x) > 1e-4 ||
    Math.abs(focalPoint.y - initialPoint.y) > 1e-4 ||
    Math.abs(zoom - clampInstagramZoom(initial?.zoom ?? 1)) > 1e-4;

  const save = async () => {
    setSaving(true);
    setError('');
    const instagramImage = { url: imageUrl, focalPoint, zoom: clampInstagramZoom(zoom) };
    try {
      await updateDoc(doc(db, 'events', event.id), { instagramImage });
      onSaved(instagramImage);
    } catch {
      setError('Der Ausschnitt konnte nicht gespeichert werden. Bitte versuche es erneut.');
      setSaving(false);
    }
  };

  return (
    <div
      className="instagram-post-preview instagram-post-preview--editing"
      data-testid="instagram-crop-editor"
    >
      <InstagramPreviewModeToggle mode={mode} onChange={setMode} />
      <CropViewport
        imageUrl={imageUrl}
        aspect={INSTAGRAM_CROP_ASPECT}
        focalPoint={focalPoint}
        onFocalPointChange={setFocalPoint}
        zoom={zoom}
        onZoomChange={setZoom}
        minZoom={MIN_INSTAGRAM_ZOOM}
        maxZoom={MAX_INSTAGRAM_ZOOM}
        zoomTestId="admin-instagram-zoom"
        ariaLabel="Bildausschnitt für Instagram verschieben"
        testId="admin-instagram-viewport"
      >
        <InstagramPreviewModeOverlay mode={mode} event={previewEvent} />
      </CropViewport>
      {dirty && !error && (
        <p className="instagram-image-picker-hint" data-testid="admin-instagram-crop-unsaved">
          Ausschnitt noch nicht gespeichert.
        </p>
      )}
      {error && (
        <p className="error-text" data-testid="admin-instagram-crop-error">
          {error}
        </p>
      )}
      <div className="instagram-image-picker-upload">
        <button
          type="button"
          className="btn btn-primary"
          onClick={save}
          disabled={saving}
          data-testid="admin-instagram-crop-save"
        >
          {saving ? 'Speichern…' : 'Ausschnitt speichern'}
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={onCancel}
          disabled={saving}
          data-testid="admin-instagram-crop-cancel"
        >
          Abbrechen
        </button>
      </div>
    </div>
  );
}

/**
 * Review aid on the event page: admins see the Instagram post preview for
 * events in review (pending) whose organizer enabled the Instagram post, and
 * can adjust the crop (move, zoom) right there.
 * Uses the chosen Instagram image, falling back to the cover photo.
 */
export function AdminInstagramPreview({ event, isAdmin, onCropSaved }) {
  const [editing, setEditing] = useState(false);
  if (!isAdmin || event?.status !== 'pending' || event.instagramConsent !== true) return null;
  const chosen = event.instagramImage;
  const imageUrl = chosen?.url || event.imageUrl;
  const previewEvent = {
    title: event.title,
    category: event.category,
    date: event.date,
    time: event.time,
    place: event.isOnline ? 'Online' : event.place,
    organizer: formatPreviewOrganizer(event.organizer),
  };

  if (editing && imageUrl) {
    return (
      <AdminInstagramCropEditor
        event={event}
        imageUrl={imageUrl}
        initial={chosen}
        previewEvent={previewEvent}
        onSaved={(instagramImage) => {
          onCropSaved?.(instagramImage);
          setEditing(false);
        }}
        onCancel={() => setEditing(false)}
      />
    );
  }

  return (
    <>
      <InstagramPostPreview
        imageUrl={imageUrl}
        focalPoint={chosen?.focalPoint}
        zoom={chosen?.zoom}
        event={previewEvent}
      />
      {imageUrl && (
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => setEditing(true)}
          data-testid="admin-instagram-crop-edit"
        >
          Bildausschnitt bearbeiten
        </button>
      )}
    </>
  );
}
