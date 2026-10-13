import { useState } from 'react';

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
 * Review aid on the event page: admins see the Instagram post preview for
 * events in review (pending) whose organizer enabled the Instagram post.
 * Uses the chosen Instagram image, falling back to the cover photo.
 */
export function AdminInstagramPreview({ event, isAdmin }) {
  if (!isAdmin || event?.status !== 'pending' || event.instagramConsent !== true) return null;
  const chosen = event.instagramImage;
  return (
    <InstagramPostPreview
      imageUrl={chosen?.url || event.imageUrl}
      focalPoint={chosen?.focalPoint}
      zoom={chosen?.zoom}
      event={{
        title: event.title,
        category: event.category,
        date: event.date,
        time: event.time,
        place: event.isOnline ? 'Online' : event.place,
      }}
    />
  );
}
