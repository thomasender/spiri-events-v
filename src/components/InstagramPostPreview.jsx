import { useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import FocalPointPicker from './FocalPointPicker';
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

export const PREVIEW_MODE_CAROUSEL = 'carousel';
export const PREVIEW_MODE_POST = 'post';

/**
 * Toggle between the weekly-carousel slide (event text over the photo) and the
 * plain feed post (the photo only).
 */
export function InstagramPreviewModeToggle({ mode, onChange }) {
  const options = [
    { value: PREVIEW_MODE_CAROUSEL, label: 'Karussell (mit Text)' },
    { value: PREVIEW_MODE_POST, label: 'Nur Beitrag' },
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

/** Hint and disclaimer shown under the preview. */
export function InstagramPreviewNotes() {
  return (
    <div className="instagram-preview-notes" data-testid="instagram-preview-notes">
      <p className="instagram-image-picker-hint">
        Ungefähre Vorschau. Beim Wochen-Karussell liegt der Text des Events über dem Foto. Enthält
        dein Foto selbst Text (z.B. ein Flyer), kann das unruhig wirken. Wähle dann einen Ausschnitt
        ohne Text.
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
        {mode === PREVIEW_MODE_CAROUSEL && <InstagramPreviewOverlay event={event} />}
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
    <div className="instagram-post-preview" data-testid="instagram-crop-editor">
      <div className="instagram-image-picker-zoom">
        <label htmlFor="admin-instagram-zoom">Hineinzoomen</label>
        <input
          id="admin-instagram-zoom"
          type="range"
          min={MIN_INSTAGRAM_ZOOM}
          max={MAX_INSTAGRAM_ZOOM}
          step={0.05}
          value={zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
          data-testid="admin-instagram-zoom"
        />
        <output htmlFor="admin-instagram-zoom">{Math.round(zoom * 100)} %</output>
      </div>
      <FocalPointPicker
        imageUrl={imageUrl}
        value={focalPoint}
        onChange={setFocalPoint}
        cropAspect={INSTAGRAM_CROP_ASPECT}
        zoom={zoom}
        onZoomChange={setZoom}
        minZoom={MIN_INSTAGRAM_ZOOM}
        maxZoom={MAX_INSTAGRAM_ZOOM}
        ariaLabel="Bildausschnitt für Instagram festlegen"
        testId="admin-instagram-focal-picker"
        info="Tippe oder ziehe auf das Foto, um den wichtigsten Bereich zu wählen, und zoome bei Bedarf hinein."
        previewControls={<InstagramPreviewModeToggle mode={mode} onChange={setMode} />}
        previewOverlay={
          mode === PREVIEW_MODE_CAROUSEL && <InstagramPreviewOverlay event={previewEvent} />
        }
      />
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
