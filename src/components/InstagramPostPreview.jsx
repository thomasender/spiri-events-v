import { useState } from 'react';
import { Eye } from 'lucide-react';

/** "2026-10-12" -> "12.10.2026"; anything else is passed through. */
export function formatPreviewDate(date) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date ?? '');
  return m ? `${m[3]}.${m[2]}.${m[1]}` : (date ?? '');
}

function CropTile({ imageUrl, focalPoint, zoom, children }) {
  const pos = `${focalPoint.x * 100}% ${focalPoint.y * 100}%`;
  return (
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
      {children}
    </div>
  );
}

/**
 * Approximate preview of the Instagram post: the single feed post (the chosen
 * 4:5 crop, no text) and a weekly-carousel slide (same crop, dark gradient and
 * the event text on top, as functions/src/instagram/instagramImage.ts draws
 * it). Client-side CSS approximation; the real image is rendered server-side.
 */
export default function InstagramPostPreview({ imageUrl, focalPoint, zoom = 1, event = {} }) {
  const [open, setOpen] = useState(false);
  if (!imageUrl) return null;
  const point = focalPoint ?? { x: 0.5, y: 0.5 };
  const info = [formatPreviewDate(event.date), event.time, event.place].filter(Boolean);

  return (
    <div className="instagram-post-preview" data-testid="instagram-post-preview">
      <button
        type="button"
        className="btn btn-secondary"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        data-testid="instagram-post-preview-toggle"
      >
        <Eye size={16} aria-hidden="true" />
        <span>{open ? 'Vorschau ausblenden' : 'Vorschau des Instagram-Beitrags'}</span>
      </button>
      {open && (
        <>
          <div className="instagram-post-preview-tiles">
            <figure>
              <CropTile imageUrl={imageUrl} focalPoint={point} zoom={zoom} />
              <figcaption>Einzelner Beitrag</figcaption>
            </figure>
            <figure>
              <CropTile imageUrl={imageUrl} focalPoint={point} zoom={zoom}>
                <div
                  className="instagram-post-preview-overlay"
                  data-testid="instagram-preview-overlay"
                >
                  {event.category && (
                    <span className="instagram-post-preview-chip">{event.category}</span>
                  )}
                  <div className="instagram-post-preview-text">
                    <strong>{event.title || 'Titel des Events'}</strong>
                    {info.map((line) => (
                      <span key={line}>{line}</span>
                    ))}
                  </div>
                </div>
              </CropTile>
              <figcaption>Wochen-Karussell</figcaption>
            </figure>
          </div>
          <p className="instagram-image-picker-hint">
            Ungefähre Vorschau. Beim Wochen-Karussell liegt der Text des Events über dem Foto. Wenn
            dein Foto selbst Text enthält (z.B. ein Flyer), kann das unruhig wirken. Wähle dann
            einen Ausschnitt ohne Text.
          </p>
        </>
      )}
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
